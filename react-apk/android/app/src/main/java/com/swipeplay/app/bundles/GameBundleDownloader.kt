package com.swipeplay.app.bundles

import android.os.Process
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.io.InterruptedIOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.LinkedBlockingDeque
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Downloads game bundles to disk, off every thread the player can feel.
 *
 * Design rules, in priority order:
 *
 *  1. **Nothing here runs at normal priority.** The worker thread is pinned to
 *     THREAD_PRIORITY_BACKGROUND, which puts it in Android's background cgroup
 *     and caps it at a small share of CPU. A game rendering at 120 Hz outranks
 *     it by construction, not by politeness.
 *  2. **Bytes never enter JavaScript.** Responses stream straight from the
 *     socket into a `.part` file 64 KB at a time, so a 30 MB bundle costs 64 KB
 *     of heap, not 30 MB — and nothing crosses the bridge but progress counts.
 *  3. **A build is atomic.** Files land in a staging directory; the build is
 *     published by a single directory rename, and only after every file has
 *     matched its manifest hash. An interrupted or corrupt update leaves the
 *     previous build exactly as it was.
 *  4. **Work is resumable.** A `.part` file is resumed with a Range request
 *     rather than restarted, so swiping mid-download costs nothing.
 *  5. **One host connection while a game is running**, and a byte-rate ceiling
 *     on top, both lifted when the player is idle.
 */
class GameBundleDownloader(
  private val store: GameBundleStore,
  private val listener: Listener,
) {

  interface Listener {
    fun onBundleReady(gameId: String, buildId: String, entry: String)
    fun onBundleProgress(gameId: String, buildId: String, bytesDone: Long, bytesTotal: Long)
    fun onBundleFailed(gameId: String, buildId: String, reason: String)
  }

  data class Job(
    val gameId: String,
    val version: String,
    val buildId: String,
    val bundleUrl: String,
  )

  private val queue = LinkedBlockingDeque<Job>()
  private val queued = LinkedHashMap<String, Job>()
  private val queueLock = Any()

  /**
   * "gameId|buildId" -> earliest retry time. The feed re-submits its wish-list
   * on every swipe, so without this a build that cannot be fetched (a 404, a
   * corrupt file, a dead host) would be retried on every gesture forever.
   */
  private val failedUntil = HashMap<String, Long>()
  private val backoffMs = 30_000L
  private val running = AtomicBoolean(false)
  private val playing = AtomicBoolean(false)
  private var paused = false
  private val pauseLock = Object()
  private var worker: Thread? = null
  @Volatile private var currentJob: Job? = null
  @Volatile private var currentCancelled = false

  /** Bytes per second allowed while a game is on screen. Unlimited when idle. */
  @Volatile var playingRateBytesPerSecond: Long = 400 * 1024

  /** Stop expanding the store past this. The whole catalogue is far smaller. */
  @Volatile var storageBudgetBytes: Long = 250L * 1024 * 1024

  /**
   * Plain HttpURLConnection rather than the app's OkHttp instance. Two reasons:
   * it shares no connection pool or dispatcher with the catalogue, ads and
   * analytics traffic, so a slow bundle can never queue in front of them; and
   * it needs no dependency beyond the platform, which on Android is an OkHttp
   * engine underneath regardless.
   */
  private fun open(url: String): HttpURLConnection {
    val connection = URL(url).openConnection() as HttpURLConnection
    connection.connectTimeout = 20_000
    connection.readTimeout = 60_000
    connection.instanceFollowRedirects = true
    connection.useCaches = false
    return connection
  }

  fun setPlaying(value: Boolean) {
    playing.set(value)
    // Not a pause: downloads continue during play, just slowly and one at a
    // time. Stopping entirely would mean a player who never reaches a game
    // over never fills their library.
    synchronized(pauseLock) { pauseLock.notifyAll() }
  }

  fun setPaused(value: Boolean) {
    synchronized(pauseLock) {
      paused = value
      if (!value) pauseLock.notifyAll()
    }
    if (value) currentCancelled = true
  }

  /**
   * Replaces the wish-list, in priority order. A job already in flight keeps
   * running when it is still wanted — a direction change re-scores the queue
   * rather than throwing away partial work.
   */
  fun submit(jobs: List<Job>) {
    synchronized(queueLock) {
      queued.clear()
      queue.clear()
      val now = System.currentTimeMillis()
      for (job in jobs) {
        if (store.isActive(job.gameId, job.buildId)) continue
        val retryAt = failedUntil["${job.gameId}|${job.buildId}"]
        if (retryAt != null && retryAt > now) continue
        val key = job.gameId
        if (queued.containsKey(key)) continue
        queued[key] = job
        queue.addLast(job)
      }
      val inFlight = currentJob
      if (inFlight != null && queued[inFlight.gameId]?.buildId != inFlight.buildId) {
        // The build being fetched is no longer wanted (a newer one landed, or
        // the game left the catalogue). Its .part file stays for a later resume.
        currentCancelled = true
      }
    }
    start()
  }

  fun start() {
    if (!running.compareAndSet(false, true)) {
      synchronized(pauseLock) { pauseLock.notifyAll() }
      return
    }
    val thread = Thread({ loop() }, "game-bundle-downloader")
    thread.isDaemon = true
    worker = thread
    thread.start()
  }

  fun stop() {
    running.set(false)
    currentCancelled = true
    synchronized(pauseLock) { pauseLock.notifyAll() }
    worker?.interrupt()
    worker = null
  }

  private fun loop() {
    Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND)
    while (running.get()) {
      try {
        awaitResume()
        if (!running.get()) return
        val job = queue.pollFirst(5, TimeUnit.SECONDS) ?: continue
        synchronized(queueLock) {
          if (queued[job.gameId]?.buildId != job.buildId) return@synchronized
          currentJob = job
          currentCancelled = false
        }
        if (currentJob !== job) continue
        try {
          process(job)
        } catch (error: Exception) {
          if (!currentCancelled) {
            fail(job.gameId, job.buildId, error.message ?: "download failed")
          }
        } finally {
          synchronized(queueLock) {
            if (currentJob === job) currentJob = null
          }
        }
      } catch (_: InterruptedException) {
        return
      } catch (_: Exception) {
        // The worker must outlive any single failure.
      }
    }
  }

  /** Records a retry back-off for this exact build, then reports the failure. */
  private fun fail(gameId: String, buildId: String, reason: String) {
    synchronized(queueLock) {
      failedUntil["$gameId|$buildId"] = System.currentTimeMillis() + backoffMs
    }
    listener.onBundleFailed(gameId, buildId, reason)
  }

  private fun awaitResume() {
    synchronized(pauseLock) {
      while (paused && running.get()) pauseLock.wait(1000)
    }
  }

  private fun process(job: Job) {
    // A null manifest always earns a back-off, including the malformed-JSON
    // paths inside fetchManifest that report nothing: without one, the feed's
    // per-swipe re-submit would retry a broken build on every gesture.
    val manifest = fetchManifest(job) ?: run {
      fail(job.gameId, job.buildId, "manifest unavailable")
      return
    }
    val files = manifest.files
    if (files.isEmpty()) {
      fail(job.gameId, job.buildId, "empty manifest")
      return
    }

    // Budget check before writing anything: better to skip a game than to fill
    // the device and take the rest of the library down with it.
    store.evictTo(storageBudgetBytes, setOf(job.gameId))
    if (store.usedBytes() + manifest.totalBytes > storageBudgetBytes) {
      fail(job.gameId, job.buildId, "storage budget reached")
      return
    }

    val staging = store.stagingDir(job.gameId, manifest.buildId)
    staging.mkdirs()
    val base = job.bundleUrl.replace(Regex("[^/]*$"), "")
    var done = 0L

    for (file in files) {
      if (!running.get() || currentCancelled) return
      awaitResume()
      if (!GameBundleStore.isSafeRelativePath(file.path)) {
        fail(job.gameId, job.buildId, "unsafe path in manifest")
        return
      }
      val target = File(staging, file.path)
      if (target.isFile && target.length() == file.bytes &&
        GameBundleStore.sha256Of(target) == file.sha256
      ) {
        // Already fetched by an earlier, interrupted attempt at this build.
        done += file.bytes
        listener.onBundleProgress(job.gameId, manifest.buildId, done, manifest.totalBytes)
        continue
      }
      target.parentFile?.mkdirs()
      val part = File(target.parentFile, "${target.name}.part")
      // `?b=` lets the CDN/server cache the exact build forever; the hash check
      // below means a wrong answer can never be activated regardless.
      val url = base + encodePath(file.path) + "?b=" + manifest.buildId
      val fetched = downloadFile(url, part, file, job, manifest.buildId, done, manifest.totalBytes)
      if (!fetched) return
      if (!part.renameTo(target)) {
        fail(job.gameId, job.buildId, "could not place ${file.path}")
        return
      }
      done += file.bytes
      listener.onBundleProgress(job.gameId, manifest.buildId, done, manifest.totalBytes)
    }

    if (!running.get() || currentCancelled) return
    if (!store.activate(job.gameId, manifest.buildId, staging)) {
      fail(job.gameId, job.buildId, "activation failed")
      return
    }
    synchronized(queueLock) {
      if (queued[job.gameId]?.buildId == manifest.buildId) queued.remove(job.gameId)
      failedUntil.remove("${job.gameId}|${manifest.buildId}")
    }
    listener.onBundleReady(job.gameId, manifest.buildId, manifest.entry)
  }

  /**
   * Streams one file into [part], resuming from whatever is already there, and
   * verifies the finished file against the manifest hash. A mismatch deletes
   * the file so the next attempt starts clean rather than resuming garbage.
   */
  private fun downloadFile(
    url: String,
    part: File,
    file: ManifestFile,
    job: Job,
    buildId: String,
    baseDone: Long,
    total: Long,
  ): Boolean {
    var existing = if (part.isFile) part.length() else 0L
    if (existing > file.bytes) {
      part.delete()
      existing = 0L
    }
    if (existing == file.bytes) {
      // Fully downloaded by an earlier attempt but never renamed; the caller
      // verifies the hash straight after this returns.
      return verifyPart(part, file, job, buildId)
    }

    val connection = open(url)
    if (existing > 0) {
      connection.setRequestProperty("Range", "bytes=$existing-")
      // A ranged response must not be content-encoded, or the offsets tracked
      // here would refer to compressed bytes and the hash would never match.
      connection.setRequestProperty("Accept-Encoding", "identity")
    }

    try {
      val code = try {
        connection.responseCode
      } catch (error: IOException) {
        if (currentCancelled) return false
        throw error
      }

      var append = existing > 0
      if (code == HttpURLConnection.HTTP_OK && existing > 0) {
        // Server ignored the range: start over rather than append to a prefix
        // the response does not continue from.
        part.delete()
        existing = 0L
        append = false
      } else if (code != HttpURLConnection.HTTP_OK && code != HttpURLConnection.HTTP_PARTIAL) {
        fail(job.gameId, buildId, "HTTP $code for ${file.path}")
        return false
      }

      var written = existing
      var reportedAt = System.currentTimeMillis()
      val limiter = RateLimiter()

      try {
        java.io.FileOutputStream(part, append).use { output ->
          connection.inputStream.use { input ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
              if (!running.get() || currentCancelled) return false
              awaitResume()
              val read = input.read(buffer)
              if (read <= 0) break
              output.write(buffer, 0, read)
              written += read
              limiter.consume(read.toLong())
              val now = System.currentTimeMillis()
              if (now - reportedAt >= 500) {
                reportedAt = now
                listener.onBundleProgress(job.gameId, buildId, baseDone + written, total)
              }
            }
            output.flush()
            // Durable before the rename: a power loss must not leave a file the
            // index believes is complete but the filesystem never wrote.
            output.fd.sync()
          }
        }
      } catch (_: InterruptedIOException) {
        return false
      } catch (error: IOException) {
        if (currentCancelled) return false
        throw error
      }

      if (written != file.bytes) {
        // Truncated: the .part stays on disk so the next attempt resumes.
        fail(job.gameId, buildId, "short read for ${file.path}")
        return false
      }
      return verifyPart(part, file, job, buildId)
    } finally {
      connection.disconnect()
    }
  }

  private fun verifyPart(part: File, file: ManifestFile, job: Job, buildId: String): Boolean {
    val digest = GameBundleStore.sha256Of(part)
    if (!digest.equals(file.sha256, ignoreCase = true)) {
      // Resuming from corrupt bytes would never converge, so start clean.
      part.delete()
      fail(job.gameId, buildId, "hash mismatch for ${file.path}")
      return false
    }
    return true
  }

  private fun fetchManifest(job: Job): Manifest? {
    val connection = open(job.bundleUrl)
    connection.setRequestProperty("Accept", "application/json")
    try {
      val code = connection.responseCode
      if (code !in 200..299) {
        fail(job.gameId, job.buildId, "manifest HTTP $code")
        return null
      }
      // The manifest is metadata, not game content: kilobytes, and the one
      // thing that has to be held whole in order to be parsed at all.
      val length = connection.getHeaderFieldLong("Content-Length", -1L)
      if (length > MAX_MANIFEST_BYTES) {
        fail(job.gameId, job.buildId, "manifest too large")
        return null
      }
      val text = connection.inputStream.use { input ->
        val output = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(32 * 1024)
        while (true) {
          val read = input.read(buffer)
          if (read <= 0) break
          output.write(buffer, 0, read)
          if (output.size() > MAX_MANIFEST_BYTES) {
            fail(job.gameId, job.buildId, "manifest too large")
            return null
          }
        }
        output.toString("UTF-8")
      }
      val json = JSONObject(text)
      val entries = json.optJSONArray("files") ?: return null
      val files = ArrayList<ManifestFile>(entries.length())
      for (i in 0 until entries.length()) {
        val item = entries.optJSONObject(i) ?: continue
        val path = item.optString("path", "")
        val sha = item.optString("sha256", "")
        val bytes = item.optLong("bytes", -1L)
        if (path.isEmpty() || sha.isEmpty() || bytes < 0) continue
        files.add(ManifestFile(path, bytes, sha))
      }
      val buildId = json.optString("buildId", job.buildId)
      if (buildId.isEmpty()) return null
      return Manifest(
        buildId = buildId,
        entry = json.optString("entry", "index.html"),
        totalBytes = json.optLong("totalBytes", files.sumOf { it.bytes }),
        files = files,
      )
    } finally {
      connection.disconnect()
    }
  }

  private fun encodePath(path: String): String =
    path.split("/").joinToString("/") { segment ->
      java.net.URLEncoder.encode(segment, "UTF-8").replace("+", "%20")
    }

  /** Token bucket, applied only while a game is on screen. */
  private inner class RateLimiter {
    private var windowStart = System.currentTimeMillis()
    private var windowBytes = 0L

    fun consume(bytes: Long) {
      if (!playing.get()) {
        windowBytes = 0
        windowStart = System.currentTimeMillis()
        return
      }
      val limit = playingRateBytesPerSecond
      if (limit <= 0) return
      windowBytes += bytes
      val now = System.currentTimeMillis()
      val elapsed = now - windowStart
      if (elapsed >= 1000) {
        windowStart = now
        windowBytes = 0
        return
      }
      if (windowBytes >= limit) {
        val sleepFor = 1000 - elapsed
        if (sleepFor > 0) {
          try {
            Thread.sleep(sleepFor)
          } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
          }
        }
        windowStart = System.currentTimeMillis()
        windowBytes = 0
      }
    }
  }

  private data class ManifestFile(val path: String, val bytes: Long, val sha256: String)

  private companion object {
    /** A manifest is metadata; anything this large is a bug or an attack. */
    private const val MAX_MANIFEST_BYTES = 8L * 1024 * 1024
  }

  private data class Manifest(
    val buildId: String,
    val entry: String,
    val totalBytes: Long,
    val files: List<ManifestFile>,
  )
}
