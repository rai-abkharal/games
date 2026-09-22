package com.swipeplay.app.bundles

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest

/**
 * The on-device game store.
 *
 * Layout under `filesDir/gamebundles/`:
 *
 *   index.json                       active build per game, last-played, server port,
 *                                    and the loopback path token
 *   <gameId>/<buildId>/...           an activated build, exactly as the server serves it
 *   <gameId>/.staging-<buildId>/...  a build still downloading (`.part` files live here)
 *
 * Two rules make this safe to read while it is being written:
 *
 *  - a build is only ever *activated* by renaming its staging directory into
 *    place, so a directory under `<gameId>/<buildId>` is either complete and
 *    hash-verified or does not exist;
 *  - the index names the active build, so a half-renamed or orphaned directory
 *    is never served.
 *
 * `filesDir` rather than `cacheDir` on purpose: this is the durable copy of a
 * game, and the OS must not be free to delete it to reclaim space.
 */
class GameBundleStore(context: Context) {

  private val root = File(context.filesDir, "gamebundles")
  private val indexFile = File(root, "index.json")
  private val lock = Any()

  /** gameId -> active buildId. */
  private val active = HashMap<String, String>()

  /** gameId -> epoch millis, for least-recently-used eviction. */
  private val lastPlayed = HashMap<String, Long>()

  /** Remembered so the loopback origin stays the same across launches. */
  var preferredPort: Int = 0
    private set

  /**
   * Remembered so the *path* a game is served from stays the same across
   * launches too. That is what lets the WebView's HTTP cache — and with it
   * V8's compiled-code cache for a multi-megabyte engine bundle — survive a
   * relaunch; a token that rotated per process changed every URL, so both
   * caches were thrown away on every cold start. It is still an unguessable
   * secret that keeps other apps on the device out of the store, and it is not
   * part of the origin, so per-game `localStorage` is unaffected either way.
   */
  var pathToken: String = ""
    private set

  /**
   * `usedBytes()` walks the whole store, and the downloader asked for it twice
   * per job (once through `evictTo`, once directly). With a few thousand files
   * that is thousands of stat() calls on the thread a foreground bundle is
   * waiting on, for a number that only changes when this class writes a file.
   * So it is computed once and invalidated on every mutation.
   */
  @Volatile private var cachedUsedBytes: Long = -1L

  init {
    root.mkdirs()
    readIndex()
    if (pathToken.length != TOKEN_LENGTH) {
      pathToken = newToken()
      synchronized(lock) { writeIndex() }
    }
  }

  fun rootDir(): File = root

  fun buildDir(gameId: String, buildId: String): File = File(root, "$gameId/$buildId")

  fun stagingDir(gameId: String, buildId: String): File = File(root, "$gameId/.staging-$buildId")

  fun activeBuild(gameId: String): String? = synchronized(lock) { active[gameId] }

  fun isActive(gameId: String, buildId: String): Boolean =
    synchronized(lock) { active[gameId] == buildId }

  fun activeBuilds(): Map<String, String> = synchronized(lock) { HashMap(active) }

  /**
   * Publishes a fully downloaded build. The old directory is only removed after
   * the new one is in place and the index has been written, so a crash at any
   * point leaves a playable game behind.
   */
  fun activate(gameId: String, buildId: String, staging: File): Boolean {
    val target = buildDir(gameId, buildId)
    synchronized(lock) {
      target.parentFile?.mkdirs()
      if (target.exists() && target != staging) target.deleteRecursively()
      if (staging != target && !staging.renameTo(target)) return false
      val previous = active[gameId]
      active[gameId] = buildId
      cachedUsedBytes = -1L
      writeIndex()
      if (previous != null && previous != buildId) {
        File(root, "$gameId/$previous").deleteRecursively()
      }
      return true
    }
  }

  fun markPlayed(gameId: String) {
    synchronized(lock) {
      lastPlayed[gameId] = System.currentTimeMillis()
      writeIndex()
    }
  }

  fun rememberPort(port: Int) {
    synchronized(lock) {
      if (preferredPort == port) return
      preferredPort = port
      writeIndex()
    }
  }

  /** Total bytes held under the store, staging directories included. */
  fun usedBytes(): Long {
    val cached = cachedUsedBytes
    if (cached >= 0) return cached
    val measured = directorySize(root)
    cachedUsedBytes = measured
    return measured
  }

  /**
   * Called as a bundle lands so the cached total tracks a download in progress
   * without re-walking the store for every file.
   */
  fun addUsedBytes(delta: Long) {
    val cached = cachedUsedBytes
    if (cached >= 0) cachedUsedBytes = cached + delta
  }

  fun invalidateUsedBytes() {
    cachedUsedBytes = -1L
  }

  /** Free space on the volume the store lives on. */
  fun freeBytes(): Long = try {
    root.usableSpace
  } catch (_: Exception) {
    Long.MAX_VALUE
  }

  /**
   * Reads a build's files so the kernel holds them in its page cache. The
   * WebView is about to parse exactly these bytes, and on the slow flash a
   * budget phone ships with, pulling a 4 MB engine bundle off disk is a real
   * part of the gap between "the file is on disk" and "the game is on screen".
   * Runs on a background thread and costs nothing but IO the page load was
   * going to pay for a moment later anyway.
   */
  fun warm(gameId: String, buildId: String): Boolean {
    val dir = buildDir(gameId, buildId)
    if (!dir.isDirectory) return false
    val buffer = ByteArray(256 * 1024)
    var warmed = false
    for (file in dir.walkTopDown()) {
      if (!file.isFile) continue
      // Builds here are a handful of files (2-7 across this catalogue); the cap
      // only stops a pathological upload from pinning the whole page cache.
      if (file.length() > MAX_WARM_FILE_BYTES) continue
      try {
        file.inputStream().use { input ->
          @Suppress("ControlFlowWithEmptyBody")
          while (input.read(buffer) > 0) { /* into the page cache, not our heap */ }
        }
        warmed = true
      } catch (_: Exception) {
        // A file that cannot be read is the downloader's problem, not warming's.
      }
    }
    return warmed
  }

  /**
   * Drops games the catalogue no longer lists, plus stale staging directories
   * for builds nobody is waiting on any more.
   */
  fun purgeUnknown(knownGameIds: Set<String>, wantedBuilds: Map<String, String>) {
    synchronized(lock) {
      val children = root.listFiles() ?: return
      var indexChanged = false
      for (child in children) {
        if (!child.isDirectory) continue
        val gameId = child.name
        val keepActive = active[gameId]
        val keepWanted = wantedBuilds[gameId]
        for (buildDir in child.listFiles() ?: emptyArray()) {
          if (!buildDir.isDirectory) continue
          val name = buildDir.name
          if (name.startsWith(".staging-")) {
            // Keep only the staging area for the build we still intend to fetch,
            // so an abandoned partial download cannot occupy space forever.
            if (keepWanted != null && name.removePrefix(".staging-") != keepWanted) {
              buildDir.deleteRecursively()
            }
            continue
          }
          // Never delete an active playable build. Only prune superseded builds.
          if (keepActive != null && name != keepActive) {
            buildDir.deleteRecursively()
          }
        }
      }
      cachedUsedBytes = -1L
      if (indexChanged) writeIndex()
    }
  }

  /**
   * Frees space down to [budgetBytes] by dropping whole games, least recently
   * played first. Never touches anything in [pinned].
   */
  fun evictTo(budgetBytes: Long, pinned: Set<String>) {
    synchronized(lock) {
      var used = usedBytes()
      if (used <= budgetBytes) return
      val candidates = active.keys
        .filter { !pinned.contains(it) }
        .sortedBy { lastPlayed[it] ?: 0L }
      var indexChanged = false
      for (gameId in candidates) {
        if (used <= budgetBytes) break
        val dir = File(root, gameId)
        val size = directorySize(dir)
        if (!dir.deleteRecursively()) continue
        used -= size
        active.remove(gameId)
        lastPlayed.remove(gameId)
        indexChanged = true
      }
      cachedUsedBytes = used
      if (indexChanged) writeIndex()
    }
  }

  /** Verifies that the active build still has its entry document on disk. */
  fun verifyActive(gameId: String, entry: String): Boolean {
    val buildId = activeBuild(gameId) ?: return false
    val file = File(buildDir(gameId, buildId), entry)
    if (file.isFile && file.length() > 0) return true
    synchronized(lock) {
      active.remove(gameId)
      cachedUsedBytes = -1L
      writeIndex()
    }
    return false
  }

  private fun readIndex() {
    if (!indexFile.isFile) return
    try {
      val json = JSONObject(indexFile.readText())
      preferredPort = json.optInt("port", 0)
      pathToken = json.optString("token", "")
      val builds = json.optJSONObject("active")
      if (builds != null) {
        for (key in builds.keys()) {
          val value = builds.optString(key, "")
          // Only trust an index entry the filesystem still backs up.
          if (value.isNotEmpty() && File(root, "$key/$value").isDirectory) {
            active[key] = value
          }
        }
      }
      val played = json.optJSONObject("lastPlayed")
      if (played != null) {
        for (key in played.keys()) lastPlayed[key] = played.optLong(key, 0L)
      }
    } catch (_: Exception) {
      // A damaged index only costs re-downloads, never a crash: start clean.
      active.clear()
      lastPlayed.clear()
      pathToken = ""
    }
  }

  private fun writeIndex() {
    try {
      val activeJson = JSONObject()
      for ((gameId, buildId) in active) activeJson.put(gameId, buildId)
      val playedJson = JSONObject()
      for ((gameId, at) in lastPlayed) playedJson.put(gameId, at)
      val json = JSONObject()
      json.put("schema", 1)
      json.put("port", preferredPort)
      json.put("token", pathToken)
      json.put("active", activeJson)
      json.put("lastPlayed", playedJson)
      val temporary = File(root, "index.json.tmp")
      temporary.writeText(json.toString())
      if (!temporary.renameTo(indexFile)) {
        indexFile.writeText(json.toString())
        temporary.delete()
      }
    } catch (_: Exception) {
      // Losing the index costs re-downloads on the next launch, nothing more.
    }
  }

  companion object {
    private const val TOKEN_LENGTH = 24
    private const val MAX_WARM_FILE_BYTES = 16L * 1024 * 1024

    private fun newToken(): String = buildString {
      val alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
      val random = java.security.SecureRandom()
      repeat(TOKEN_LENGTH) { append(alphabet[random.nextInt(alphabet.length)]) }
    }

    fun directorySize(dir: File): Long {
      if (!dir.exists()) return 0L
      if (dir.isFile) return dir.length()
      var total = 0L
      val stack = ArrayDeque<File>()
      stack.addLast(dir)
      while (stack.isNotEmpty()) {
        val current = stack.removeLast()
        for (child in current.listFiles() ?: emptyArray()) {
          if (child.isDirectory) stack.addLast(child) else total += child.length()
        }
      }
      return total
    }

    fun sha256Of(file: File): String {
      val digest = MessageDigest.getInstance("SHA-256")
      file.inputStream().use { input ->
        val buffer = ByteArray(64 * 1024)
        while (true) {
          val read = input.read(buffer)
          if (read <= 0) break
          digest.update(buffer, 0, read)
        }
      }
      return digest.digest().joinToString("") { "%02x".format(it) }
    }

    /** Rejects anything that could escape the build directory. */
    fun isSafeRelativePath(path: String): Boolean {
      if (path.isEmpty() || path.length > 512) return false
      if (path.startsWith("/") || path.contains("\\")) return false
      if (path.contains("//")) return false
      for (segment in path.split("/")) {
        if (segment.isEmpty() || segment == "." || segment == "..") return false
      }
      return true
    }
  }
}
