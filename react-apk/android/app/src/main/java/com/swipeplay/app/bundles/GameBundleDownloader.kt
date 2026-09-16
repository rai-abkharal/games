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
 *  5. **Rate ceilings apply to speculation, never to the game in hand.** The
 *     bundle for the game on screen always runs at full link speed — storing it
 *     is the entire point, and a 30 MB build behind a 400 KB/s ceiling would
 *     need over a minute of play to become local. The game one swipe away is
 *     treated almost as urgently, because it is the one the player is about to
 *     open; only genuinely distant games yield hard.
 *  6. **The queue is re-scored, and the job in flight is re-scored with it.**
 *     A wish-list arrives on every swipe. Letting whatever started first run to
 *     completion meant a game seven pages away could hold up the one under the
 *     player's thumb, so a job that has fallen behind a materially more urgent
 *     one is preempted. Its `.part` file stays, so the work is paused, not
 *     thrown away, and resumes with a Range request when it comes back round.
 */
class GameBundleDownloader(
  private val store: GameBundleStore,
  private val listener: Listener,
) {

  interface Listener {
    fun onBundleReady(gameId: String, buildId: String, entry: String, bytes: Long, elapsedMs: Long)
    fun onBundleStarted(gameId: String, buildId: String, bytesTotal: Long, bytesDone: Long)
    fun onBundleProgress(gameId: String, buildId: String, bytesDone: Long, bytesTotal: Long)
    fun onBundleFailed(gameId: String, buildId: String, reason: String, retryInMs: Long)
  }

  data class Job(
    val gameId: String,
    val version: String,
    val buildId: String,
    val bundleUrl: String,
    /**
     * How close this game is to the player, from the feed's point of view:
     * [PRIORITY_CURRENT] the page on screen, [PRIORITY_NEXT] the one page a
     * swipe away, [PRIORITY_NEAR] the short lookahead behind it, and
     * [PRIORITY_REST] everything else in the catalogue. It decides both the
     * order jobs run in and whether a rate ceiling applies to them.
     */
    val priority: Int = PRIORITY_REST,
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

  /**
   * "gameId|buildId" -> consecutive failures, which doubles the wait each time.
   * A transient failure (the network dropped mid-swipe) still retries within
   * half a minute; a build that is genuinely broken backs off towards
   * [MAX_BACKOFF_MS] instead of being re-attempted every thirty seconds for as
   * long as the app is open. Cleared the moment the build activates, so nothing
   * is ever marked failed permanently.
   */
  private val failureCounts = HashMap<String, Int>()
  private val running = AtomicBoolean(false)
  private val playing = AtomicBoolean(false)
  private var paused = false
  private val pauseLock = Object()
  private var worker: Thread? = null
  @Volatile private var currentJob: Job? = null
  @Volatile private var currentCancelled = false
  /** 0..1 through the bundle in flight, so a near-finished job is not preempted. */
  @Volatile private var currentFraction = 0.0

  /**
   * Ceilings for *speculative* bundles only — the game the player is actually
   * on is never limited (see RateLimiter). Zero means no limit.
   */
  @Volatile var playingRateBytesPerSecond: Long = 400 * 1024
  @Volatile var meteredRateBytesPerSecond: Long = 150 * 1024

  /**
   * The ceiling for the game one swipe away while another is being played, on
   * an unmetered link. Deliberately several times [playingRateBytesPerSecond]:
   * this is the bundle whose absence the player is about to *see*, and at
   * 400 KB/s a 4.5 MB build needs eleven seconds of continuous play to land —
   * longer than plenty of sessions on a single game. It is still a ceiling
   * rather than nothing, so the running game keeps radio and CPU headroom.
   */
  @Volatile var nextRateBytesPerSecond: Long = 2 * 1024 * 1024

  /** Cellular equivalent of the above: generous for +1, stingy for the rest. */
  @Volatile var meteredNextRateBytesPerSecond: Long = 600 * 1024

  /** Cellular or otherwise expensive link, as reported by NetInfo through JS. */
  private val metered = AtomicBoolean(false)

  fun setMetered(value: Boolean) {
    metered.set(value)
  }

  /**
   * Stop expanding the store past this.
   *
   * Raised from 250 MB: storage is the cheapest resource in this system and an
   * evicted game is a game that has to be downloaded again, which is the one
   * thing the store exists to prevent. The real guard is [MIN_FREE_BYTES]
   * below — the store never takes the device's last few hundred megabytes,
   * whatever this says.
   */
  @Volatile var storageBudgetBytes: Long = 1024L * 1024 * 1024

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
   * Replaces the wish-list, in priority order — the caller passes the games it
   * wants most first, each tagged with how close it is to the player.
   *
   * The job already in flight is re-scored along with everything else. It keeps
   * running while it is still among the most urgent work; it is preempted when
   * the swipe that produced this wish-list put something materially closer to
   * the player at the head of the queue. Preemption only stops the transfer —
   * the `.part` file stays exactly where it is, so coming back to that game
   * resumes from the byte it reached rather than starting over.
   */
  fun submit(jobs: List<Job>) {
    synchronized(queueLock) {
      queued.clear()
      queue.clear()
      val now = System.currentTimeMillis()
      // Stable sort by priority: within a tier the caller's order is the feed's
      // own "nearest first" ordering and is preserved.
      for (job in jobs.sortedBy { it.priority }) {
        if (store.isActive(job.gameId, job.buildId)) continue
        val retryAt = failedUntil[key(job.gameId, job.buildId)]
        if (retryAt != null && retryAt > now) continue
        if (queued.containsKey(job.gameId)) continue
        queued[job.gameId] = job
        queue.addLast(job)
      }
      val inFlight = currentJob
      if (inFlight != null) {
        val wanted = queued[inFlight.gameId]
        if (wanted?.buildId != inFlight.buildId) {
          // The build being fetched is no longer wanted (a newer one landed, or
          // the game left the catalogue). Its .part stays for a later resume.
          currentCancelled = true
        } else if (shouldPreempt(wanted.priority)) {
          // Stop the transfer only. The job is already sitting in the rebuilt
          // queue at its new rank, and its `.part` file is untouched, so this
          // pauses the work rather than discarding it.
          currentCancelled = true
        }
      }
    }
    start()
  }

  /**
   * Should the job in flight, now scored [inFlightPriority], give way?
   *
   * Two guards keep this from thrashing. The replacement has to be at least a
   * whole tier more urgent, so a re-score that only shuffles distant games
   * changes nothing; and a bundle that is nearly finished is left alone, since
   * abandoning it within a second of completion costs a reconnect and gains the
   * newcomer almost no time.
   */
  private fun shouldPreempt(inFlightPriority: Int): Boolean {
    if (currentFraction >= NEARLY_DONE_FRACTION) return false
    val head = queue.peekFirst() ?: return false
    if (head.gameId == currentJob?.gameId) return false
    return head.priority < inFlightPriority
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
          currentFraction = 0.0
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
            if (currentJob === job) {
              currentJob = null
              currentFraction = 0.0
            }
          }
        }
      } catch (_: InterruptedException) {
        return
      } catch (_: Exception) {
        // The worker must outlive any single failure.
      }
    }
  }

  /**
   * Records a retry back-off for this exact build, then reports the failure.
   * The wait doubles per consecutive failure up to [MAX_BACKOFF_MS], so a build
   * the server cannot serve stops being hammered without ever being written off
   * — the next activation of that build clears the count entirely.
   */
  private fun fail(gameId: String, buildId: String, reason: String) {
    val retryInMs: Long
    synchronized(queueLock) {
      val id = key(gameId, buildId)
      val failures = (failureCounts[id] ?: 0) + 1
      failureCounts[id] = failures
      val backoff = minOf(BASE_BACKOFF_MS shl minOf(failures - 1, BACKOFF_SHIFT_CAP), MAX_BACKOFF_MS)
      retryInMs = backoff
      failedUntil[id] = System.currentTimeMillis() + backoff
    }
    listener.onBundleFailed(gameId, buildId, reason, retryInMs)
  }

  private fun key(gameId: String, buildId: String) = "$gameId|$buildId"

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
    // the device and take the rest of the library down with it. The budget is
    // generous now, so the binding constraint is usually free space, not it.
    store.evictTo(storageBudgetBytes, setOf(job.gameId))
    val headroom = store.freeBytes() - MIN_FREE_BYTES
    if (store.usedBytes() + manifest.totalBytes > storageBudgetBytes ||
      manifest.totalBytes > headroom
    ) {
      fail(job.gameId, job.buildId, "storage budget reached")
      return
    }

    val staging = store.stagingDir(job.gameId, manifest.buildId)
    staging.mkdirs()
    val base = job.bundleUrl.replace(Regex("[^/]*$"), "")
    var done = 0L
    val startedAt = System.currentTimeMillis()

    // Announce the size before the first byte, so the feed can show a real
    // percentage from the start rather than an indeterminate spinner that only
    // becomes meaningful once the first progress tick lands.
    listener.onBundleStarted(
      job.gameId,
      manifest.buildId,
      manifest.totalBytes,
      alreadyOnDisk(staging, files),
    )

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
        report(job, manifest, done)
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
      report(job, manifest, done)
    }

    if (!running.get() || currentCancelled) return
    if (!store.activate(job.gameId, manifest.buildId, staging)) {
      fail(job.gameId, job.buildId, "activation failed")
      return
    }
    synchronized(queueLock) {
      if (queued[job.gameId]?.buildId == manifest.buildId) queued.remove(job.gameId)
      val id = key(job.gameId, manifest.buildId)
      failedUntil.remove(id)
      failureCounts.remove(id)
    }
    // The player is a swipe or two from this game and its bytes are already in
    // hand; pulling them through the page cache now means the WebView's first
    // read comes from memory. Only worth doing for the short lookahead —
    // warming the whole catalogue would just evict itself.
    if (job.priority <= PRIORITY_NEAR) store.warm(job.gameId, manifest.buildId)
    listener.onBundleReady(
      job.gameId,
      manifest.buildId,
      manifest.entry,
      manifest.totalBytes,
      System.currentTimeMillis() - startedAt,
    )
  }

  /** Publishes progress and keeps the preemption guard's fraction current. */
  private fun report(job: Job, manifest: Manifest, done: Long) {
    currentFraction = if (manifest.totalBytes > 0) done.toDouble() / manifest.totalBytes else 0.0
    listener.onBundleProgress(job.gameId, manifest.buildId, done, manifest.totalBytes)
  }

  /** Bytes an earlier, interrupted attempt already left in the staging area. */
  private fun alreadyOnDisk(staging: File, files: List<ManifestFile>): Long {
    var total = 0L
    for (file in files) {
      val target = File(staging, file.path)
      if (target.isFile) {
        total += minOf(target.length(), file.bytes)
        continue
      }
      val part = File(target.parentFile, target.name + ".part")
      if (part.isFile) total += minOf(part.length(), file.bytes)
    }
    return total
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
      val limiter = RateLimiter(job.priority)

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
              if (now - reportedAt >= PROGRESS_INTERVAL_MS) {
                reportedAt = now
                val soFar = baseDone + written
                currentFraction = if (total > 0) soFar.toDouble() / total else 0.0
                listener.onBundleProgress(job.gameId, buildId, soFar, total)
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

  /**
   * Token bucket for *speculative* downloads only.
   *
   * The ceiling exists so that fetching games the player has not asked for
   * cannot steal bandwidth from the game they are looking at. It has no
   * business applying to that game's own bundle: the whole reason to store a
   * game is to make its next open instant, and a 30 MB build metered at
   * 400 KB/s would need over a minute of continuous play to get there. So the
   * foreground bundle is exempt, and on an unmetered connection nothing is
   * limited at all.
   */
  private inner class RateLimiter(private val priority: Int) {
    private var windowStart = System.currentTimeMillis()
    private var windowBytes = 0L

    fun consume(bytes: Long) {
      // The game the player is on is never limited, on any connection.
      if (priority <= PRIORITY_CURRENT) {
        reset()
        return
      }
      // Nothing is running, so there are no frames to protect: the only reason
      // left to hold back is the player's data plan.
      if (!playing.get() && !metered.get()) {
        reset()
        return
      }
      val isNext = priority <= PRIORITY_NEXT
      val limit = when {
        // Cellular: stay modest, because the cost here is the player's data
        // plan rather than their frame rate — but the game they are about to
        // swipe to still gets a far higher ceiling than a distant one.
        metered.get() -> if (isNext) meteredNextRateBytesPerSecond else meteredRateBytesPerSecond
        // Unmetered with a game running: the next game is the one whose absence
        // the player is about to see, so it takes what it needs while the rest
        // of the catalogue trickles.
        isNext -> nextRateBytesPerSecond
        else -> playingRateBytesPerSecond
      }
      if (limit <= 0) {
        reset()
        return
      }
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

    private fun reset() {
      windowBytes = 0
      windowStart = System.currentTimeMillis()
    }
  }

  private data class ManifestFile(val path: String, val bytes: Long, val sha256: String)

  companion object {
    /** The page on screen. Never rate-limited, always first in the queue. */
    const val PRIORITY_CURRENT = 0
    /** One swipe away. Preloaded aggressively; this is the one about to be seen. */
    const val PRIORITY_NEXT = 1
    /** The short lookahead behind that (+2, +3). Preloaded when there is room. */
    const val PRIORITY_NEAR = 2
    /** The rest of the catalogue. Filled in whenever nothing better is waiting. */
    const val PRIORITY_REST = 3

    /** A manifest is metadata; anything this large is a bug or an attack. */
    private const val MAX_MANIFEST_BYTES = 8L * 1024 * 1024

    /** Never take the device below this, whatever the configured budget says. */
    private const val MIN_FREE_BYTES = 512L * 1024 * 1024

    private const val BASE_BACKOFF_MS = 30_000L
    private const val MAX_BACKOFF_MS = 30L * 60_000L
    /** 30 s << 6 is already past the half-hour cap; the shift just avoids overflow. */
    private const val BACKOFF_SHIFT_CAP = 6

    /**
     * A bundle this far along is left to finish rather than preempted: the
     * reconnect a restart costs is worth more than the seconds the newcomer
     * would gain.
     */
    private const val NEARLY_DONE_FRACTION = 0.9

    /**
     * Progress crosses the bridge at 4 Hz. Fast enough that a percentage reads
     * as live, slow enough that it can never flood the bridge the feed uses for
     * touch — and only one bundle is ever in flight.
     */
    private const val PROGRESS_INTERVAL_MS = 250L
  }

  private data class Manifest(
    val buildId: String,
    val entry: String,
    val totalBytes: Long,
    val files: List<ManifestFile>,
  )
}
