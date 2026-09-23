package com.swipeplay.app.bundles

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import android.os.Process
import java.io.File
import org.json.JSONArray
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * The JavaScript-facing edge of the on-device game store.
 *
 * What deliberately does *not* cross this bridge: game files. JavaScript hands
 * over a wish-list of `{gameId, version, buildId, bundleUrl}` and receives back
 * status events and a `http://127.0.0.1:...` URL. Every byte of every bundle
 * travels socket → disk on a background thread and is never materialised in the
 * JS heap, which is the whole point of moving this off the prefetcher.
 */
class GameBundleModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), GameBundleDownloader.Listener {

  private val store = GameBundleStore(reactContext.applicationContext)
  private val tutorialRoot = File(reactContext.filesDir, "tutorial-games")
  private val server = LocalGameServer(store, tutorialRoot)
  private val downloader = GameBundleDownloader(store, this)

  /** gameId -> entry path of the activated build, so URLs can be rebuilt cheaply. */
  private val entries = HashMap<String, String>()
  private val entriesLock = Any()

  /** The wanted-build set the store was last pruned against. */
  @Volatile private var lastPurgeFingerprint: String? = null

  override fun getName(): String = NAME

  /**
   * Every method below that touches the filesystem runs here rather than on
   * whichever thread the bridge happened to call it on. Binding a socket,
   * walking the store or resolving entry documents is disk work, and the
   * interop layer's choice of caller thread is not something to depend on —
   * a single-threaded executor makes the answer irrelevant and also serialises
   * these operations against each other.
   */
  private val io: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
    Thread({
      Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND)
      runnable.run()
    }, "game-bundle-io").apply { isDaemon = true }
  }

  override fun invalidate() {
    downloader.stop()
    server.stop()
    io.shutdownNow()
    super.invalidate()
  }

  /**
   * Starts the loopback origin and reports everything already on disk, so the
   * feed can render the first game from local files without waiting for any
   * network round trip.
   */
  @ReactMethod
  fun start(promise: Promise) {
    io.execute {
      try {
        val started = server.start()
        val result = Arguments.createMap()
        result.putBoolean("available", started)
        result.putInt("port", server.port)
        val ready = Arguments.createArray()
        if (started) {
          unpackBundledGames()
          for ((gameId, buildId) in store.activeBuilds()) {
            val entry = resolveEntry(gameId, buildId) ?: continue
            if (!store.verifyActive(gameId, entry)) continue
            ready.pushMap(describe(gameId, buildId, entry))
          }
          // Pre-warm the first bundled game in the page cache
          val firstGameId = "game-mudsy3a8"
          val firstBuild = store.activeBuild(firstGameId)
          if (firstBuild != null) {
            store.warm(firstGameId, firstBuild)
          }
        }
        result.putArray("ready", ready)
        val tutorials = Arguments.createArray()
        if (started) {
          val manifest = reactContext.assets.open("tutorial-games/manifest.json")
            .bufferedReader().use { JSONArray(it.readText()) }
          for (i in 0 until manifest.length()) {
            val item = manifest.getJSONObject(i)
            val gameId = item.getString("gameId")
            val buildId = item.getString("buildId")
            val entry = File(File(tutorialRoot, buildId), "index.html")
            if (!entry.isFile || entry.length() != item.getLong("bytes")) {
              entry.parentFile?.mkdirs()
              reactContext.assets.open("tutorial-games/$gameId.html").use { input ->
                entry.outputStream().use { output -> input.copyTo(output) }
              }
            }
            val descriptor = describe(gameId, buildId, "index.html")
            descriptor.putString("url", server.entryUrl("__tutorial", buildId, "index.html"))
            descriptor.putDouble("bytes", entry.length().toDouble())
            tutorials.pushMap(descriptor)
          }
        }
        result.putArray("tutorials", tutorials)
        downloader.start()
        promise.resolve(result)
      } catch (error: Exception) {
        promise.reject("start_failed", error.message, error)
      }
    }
  }

  /**
   * Unpacks pre-bundled APK games into the on-device store on first launch.
   * Runs on the IO executor and skips any build already verified on disk.
   */
  private fun unpackBundledGames() {
    try {
      val assetList = reactContext.assets.list("bundled-games") ?: return
      if (!assetList.contains("manifest.json")) return
      val manifest = reactContext.assets.open("bundled-games/manifest.json")
        .bufferedReader().use { JSONArray(it.readText()) }

      for (i in 0 until manifest.length()) {
        val item = manifest.getJSONObject(i)
        val gameId = item.getString("gameId")
        val buildId = item.getString("buildId")
        val entry = item.optString("entry", "index.html")
        val buildDir = store.buildDir(gameId, buildId)
        val entryFile = File(buildDir, entry)

        // If the store already has this exact active build and entry exists, skip
        if (store.isActive(gameId, buildId) && entryFile.isFile && entryFile.length() > 0) {
          continue
        }

        val staging = store.stagingDir(gameId, buildId)
        staging.mkdirs()

        val filesArray = item.optJSONArray("files")
        if (filesArray != null) {
          for (j in 0 until filesArray.length()) {
            val relPath = filesArray.getString(j)
            val destFile = File(staging, relPath)
            destFile.parentFile?.mkdirs()
            reactContext.assets.open("bundled-games/$gameId/$relPath").use { input ->
              destFile.outputStream().use { output -> input.copyTo(output) }
            }
          }
        }

        // Atomically activate this build into the store
        store.activate(gameId, buildId, staging)
      }
    } catch (e: Exception) {
      android.util.Log.w("GameBundles", "Bundled games unpack skipped: ${e.message}")
    }
  }

  /**
   * Replaces the download wish-list, highest priority first. Each entry carries
   * how close its game is to the player (`priority`: 0 = on screen, 1 = one
   * swipe away, 2 = the short lookahead, 3 = the rest of the catalogue), which
   * decides both queue order and whether a rate ceiling applies.
   *
   * Games already stored at the requested build are skipped, which is what
   * makes a relaunch free: local `gameId + buildId` matching the server means
   * no request at all.
   */
  @ReactMethod
  fun sync(requests: ReadableArray) {
    // The ReadableArray is only valid for the duration of this call, so it is
    // copied into plain jobs here and everything else happens on the executor.
    val jobs = ArrayList<GameBundleDownloader.Job>(requests.size())
    val known = HashSet<String>()
    val wanted = HashMap<String, String>()
    for (i in 0 until requests.size()) {
      val item = requests.getMap(i) ?: continue
      val gameId = item.getString("gameId") ?: continue
      val buildId = item.getString("buildId") ?: continue
      val bundleUrl = item.getString("bundleUrl") ?: continue
      val version = item.getString("version") ?: ""
      if (gameId.isEmpty() || buildId.isEmpty() || bundleUrl.isEmpty()) continue
      // Never re-download APK bundled games
      if (GameBundleStore.BUNDLED_GAME_IDS.contains(gameId)) continue
      // `foreground` is still honoured so a JS bundle from before priorities
      // existed keeps working: it simply means "on screen".
      val priority = when {
        item.hasKey("priority") -> item.getInt("priority")
          .coerceIn(GameBundleDownloader.PRIORITY_CURRENT, GameBundleDownloader.PRIORITY_REST)
        item.hasKey("foreground") && item.getBoolean("foreground") ->
          GameBundleDownloader.PRIORITY_CURRENT
        else -> GameBundleDownloader.PRIORITY_REST
      }
      known.add(gameId)
      wanted[gameId] = buildId
      jobs.add(GameBundleDownloader.Job(gameId, version, buildId, bundleUrl, priority))
    }

    io.execute {
      // Only prune against a wish-list that actually described the catalogue;
      // an empty sync (a filtered feed, a failed refresh) must not wipe the
      // store. The feed re-syncs on every swipe to re-score priorities, so the
      // prune — which walks the whole store directory — runs only when the set
      // of wanted builds actually changed, not on every gesture.
      if (known.isNotEmpty()) {
        val fingerprint = wanted.entries.sortedBy { it.key }
          .joinToString(",") { "${it.key}=${it.value}" }
        if (fingerprint != lastPurgeFingerprint) {
          lastPurgeFingerprint = fingerprint
          store.purgeUnknown(known, wanted)
        }
      }
      // isActive() reads the store, so the already-have filter belongs here too.
      downloader.submit(jobs.filter { !store.isActive(it.gameId, it.buildId) })
    }
  }

  /** Mirrors the feed's play state: see GameBundleDownloader for what it changes. */
  @ReactMethod
  fun setPlaying(playing: Boolean) {
    downloader.setPlaying(playing)
  }

  /** Hard stop, used while the app is backgrounded or offline. */
  @ReactMethod
  fun setPaused(paused: Boolean) {
    downloader.setPaused(paused)
  }

  @ReactMethod
  fun setPolicy(policy: ReadableMap) {
    if (policy.hasKey("playingRateBytesPerSecond")) {
      downloader.playingRateBytesPerSecond = policy.getDouble("playingRateBytesPerSecond").toLong()
    }
    if (policy.hasKey("meteredRateBytesPerSecond")) {
      downloader.meteredRateBytesPerSecond = policy.getDouble("meteredRateBytesPerSecond").toLong()
    }
    if (policy.hasKey("nextRateBytesPerSecond")) {
      downloader.nextRateBytesPerSecond = policy.getDouble("nextRateBytesPerSecond").toLong()
    }
    if (policy.hasKey("meteredNextRateBytesPerSecond")) {
      downloader.meteredNextRateBytesPerSecond =
        policy.getDouble("meteredNextRateBytesPerSecond").toLong()
    }
    if (policy.hasKey("storageBudgetBytes")) {
      downloader.storageBudgetBytes = policy.getDouble("storageBudgetBytes").toLong()
    }
    if (policy.hasKey("metered")) {
      downloader.setMetered(policy.getBoolean("metered"))
    }
  }

  /**
   * Pulls a stored build through the kernel page cache so the WebView's first
   * read of it comes from memory. Called for the game one swipe away, on the
   * IO thread, and silently does nothing when that build is not stored.
   */
  @ReactMethod
  fun warm(gameId: String) {
    io.execute {
      val buildId = store.activeBuild(gameId) ?: return@execute
      store.warm(gameId, buildId)
    }
  }

  @ReactMethod
  fun markPlayed(gameId: String) {
    // Writes the store index; never on the caller's thread.
    io.execute { store.markPlayed(gameId) }
  }

  @ReactMethod
  fun getStatus(promise: Promise) {
    io.execute {
      try {
        val result = Arguments.createMap()
        result.putBoolean("available", server.isRunning())
        result.putInt("port", server.port)
        result.putDouble("usedBytes", store.usedBytes().toDouble())
        val ready = Arguments.createArray()
        for ((gameId, buildId) in store.activeBuilds()) {
          val entry = resolveEntry(gameId, buildId) ?: continue
          ready.pushMap(describe(gameId, buildId, entry))
        }
        result.putArray("ready", ready)
        promise.resolve(result)
      } catch (error: Exception) {
        promise.reject("status_failed", error.message, error)
      }
    }
  }

  // NativeEventEmitter requires these to exist on the module it is given.
  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Double) = Unit

  /* ------------------------------------------------------------------ */
  /* Downloader callbacks                                                */
  /* ------------------------------------------------------------------ */

  override fun onBundleReady(
    gameId: String,
    buildId: String,
    entry: String,
    bytes: Long,
    elapsedMs: Long,
  ) {
    synchronized(entriesLock) { entries[gameId] = entry }
    val payload = describe(gameId, buildId, entry)
    // Carried so the feed can report a download's real cost to analytics
    // without timing it from JavaScript, where a busy bridge would skew it.
    payload.putDouble("bytes", bytes.toDouble())
    payload.putDouble("elapsedMs", elapsedMs.toDouble())
    emit("GameBundleReady", payload)
  }

  override fun onBundleStarted(gameId: String, buildId: String, bytesTotal: Long, bytesDone: Long) {
    val payload = Arguments.createMap()
    payload.putString("gameId", gameId)
    payload.putString("buildId", buildId)
    payload.putDouble("bytesDone", bytesDone.toDouble())
    payload.putDouble("bytesTotal", bytesTotal.toDouble())
    emit("GameBundleStarted", payload)
  }

  override fun onBundleProgress(gameId: String, buildId: String, bytesDone: Long, bytesTotal: Long) {
    val payload = Arguments.createMap()
    payload.putString("gameId", gameId)
    payload.putString("buildId", buildId)
    payload.putDouble("bytesDone", bytesDone.toDouble())
    payload.putDouble("bytesTotal", bytesTotal.toDouble())
    emit("GameBundleProgress", payload)
  }

  override fun onBundleFailed(gameId: String, buildId: String, reason: String, retryInMs: Long) {
    val payload = Arguments.createMap()
    payload.putString("gameId", gameId)
    payload.putString("buildId", buildId)
    payload.putString("reason", reason)
    payload.putDouble("retryInMs", retryInMs.toDouble())
    emit("GameBundleFailed", payload)
  }

  /* ------------------------------------------------------------------ */

  private fun describe(gameId: String, buildId: String, entry: String): WritableMap {
    val payload = Arguments.createMap()
    payload.putString("gameId", gameId)
    payload.putString("buildId", buildId)
    payload.putString("entry", entry)
    payload.putString("url", server.entryUrl(gameId, buildId, entry))
    return payload
  }

  /**
   * The entry path of an activated build. Read from the build's own manifest
   * copy when it is there, otherwise the conventional `index.html`.
   */
  private fun resolveEntry(gameId: String, buildId: String): String? {
    synchronized(entriesLock) { entries[gameId]?.let { return it } }
    val dir = store.buildDir(gameId, buildId)
    if (!dir.isDirectory) return null
    val candidate = java.io.File(dir, "index.html")
    val entry = if (candidate.isFile) {
      "index.html"
    } else {
      // Rare: a build whose entry document sits in a subdirectory.
      dir.walkTopDown().maxDepth(3).firstOrNull { it.isFile && it.name == "index.html" }
        ?.relativeTo(dir)?.path?.replace('\\', '/')
    }
    if (entry != null) synchronized(entriesLock) { entries[gameId] = entry }
    return entry
  }

  private fun emit(event: String, payload: WritableMap) {
    try {
      if (!reactContext.hasActiveReactInstance()) return
      reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(event, payload)
    } catch (_: Exception) {
      // A store that cannot report progress still works; the feed picks the
      // bundle up from getStatus() on the next sync.
    }
  }

  companion object {
    const val NAME = "GameBundles"
  }
}
