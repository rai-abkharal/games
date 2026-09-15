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
 *   index.json                       active build per game, last-played, server port
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

  init {
    root.mkdirs()
    readIndex()
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
  fun usedBytes(): Long = directorySize(root)

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
        if (!knownGameIds.contains(gameId)) {
          child.deleteRecursively()
          if (active.remove(gameId) != null) indexChanged = true
          lastPlayed.remove(gameId)
          continue
        }
        val keepActive = active[gameId]
        val keepWanted = wantedBuilds[gameId]
        for (buildDir in child.listFiles() ?: emptyArray()) {
          if (!buildDir.isDirectory) continue
          val name = buildDir.name
          if (name.startsWith(".staging-")) {
            // Keep only the staging area for the build we still intend to fetch,
            // so an abandoned partial download cannot occupy space forever.
            if (name.removePrefix(".staging-") != keepWanted) buildDir.deleteRecursively()
            continue
          }
          if (name != keepActive) buildDir.deleteRecursively()
        }
      }
      if (indexChanged) writeIndex()
    }
  }

  /**
   * Frees space down to [budgetBytes] by dropping whole games, least recently
   * played first. Never touches anything in [pinned].
   */
  fun evictTo(budgetBytes: Long, pinned: Set<String>) {
    synchronized(lock) {
      var used = directorySize(root)
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
      writeIndex()
    }
    return false
  }

  private fun readIndex() {
    if (!indexFile.isFile) return
    try {
      val json = JSONObject(indexFile.readText())
      preferredPort = json.optInt("port", 0)
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
