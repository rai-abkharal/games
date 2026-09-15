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
  private val server = LocalGameServer(store)
  private val downloader = GameBundleDownloader(store, this)

  /** gameId -> entry path of the activated build, so URLs can be rebuilt cheaply. */
  private val entries = HashMap<String, String>()
  private val entriesLock = Any()

  /** The wanted-build set the store was last pruned against. */
  @Volatile private var lastPurgeFingerprint: String? = null

  override fun getName(): String = NAME

  override fun invalidate() {
    downloader.stop()
    server.stop()
    super.invalidate()
  }

  /**
   * Starts the loopback origin and reports everything already on disk, so the
   * feed can render the first game from local files without waiting for any
   * network round trip.
   */
  @ReactMethod
  fun start(promise: Promise) {
    try {
      val started = server.start()
      val result = Arguments.createMap()
      result.putBoolean("available", started)
      result.putInt("port", server.port)
      val ready = Arguments.createArray()
      if (started) {
        for ((gameId, buildId) in store.activeBuilds()) {
          val entry = resolveEntry(gameId, buildId) ?: continue
          if (!store.verifyActive(gameId, entry)) continue
          ready.pushMap(describe(gameId, buildId, entry))
        }
      }
      result.putArray("ready", ready)
      downloader.start()
      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject("start_failed", error.message, error)
    }
  }

  /**
   * Replaces the download wish-list, highest priority first. Games already
   * stored at the requested build are skipped, which is what makes a relaunch
   * free: local `gameId + buildId` matching the server means no request at all.
   */
  @ReactMethod
  fun sync(requests: ReadableArray) {
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
      known.add(gameId)
      wanted[gameId] = buildId
      if (store.isActive(gameId, buildId)) continue
      jobs.add(GameBundleDownloader.Job(gameId, version, buildId, bundleUrl))
    }
    // Only prune against a wish-list that actually described the catalogue; an
    // empty sync (a filtered feed, a failed refresh) must not wipe the store.
    // The feed re-syncs on every swipe to re-score priorities, so the prune —
    // which walks the whole store directory — runs only when the set of wanted
    // builds actually changed, not on every gesture.
    if (known.isNotEmpty()) {
      val fingerprint = wanted.entries.sortedBy { it.key }
        .joinToString(",") { "${it.key}=${it.value}" }
      if (fingerprint != lastPurgeFingerprint) {
        lastPurgeFingerprint = fingerprint
        store.purgeUnknown(known, wanted)
      }
    }
    downloader.submit(jobs)
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
    if (policy.hasKey("storageBudgetBytes")) {
      downloader.storageBudgetBytes = policy.getDouble("storageBudgetBytes").toLong()
    }
  }

  @ReactMethod
  fun markPlayed(gameId: String) {
    store.markPlayed(gameId)
  }

  @ReactMethod
  fun getStatus(promise: Promise) {
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

  // NativeEventEmitter requires these to exist on the module it is given.
  @ReactMethod
  fun addListener(eventName: String) = Unit

  @ReactMethod
  fun removeListeners(count: Double) = Unit

  /* ------------------------------------------------------------------ */
  /* Downloader callbacks                                                */
  /* ------------------------------------------------------------------ */

  override fun onBundleReady(gameId: String, buildId: String, entry: String) {
    synchronized(entriesLock) { entries[gameId] = entry }
    emit("GameBundleReady", describe(gameId, buildId, entry))
  }

  override fun onBundleProgress(gameId: String, buildId: String, bytesDone: Long, bytesTotal: Long) {
    val payload = Arguments.createMap()
    payload.putString("gameId", gameId)
    payload.putString("buildId", buildId)
    payload.putDouble("bytesDone", bytesDone.toDouble())
    payload.putDouble("bytesTotal", bytesTotal.toDouble())
    emit("GameBundleProgress", payload)
  }

  override fun onBundleFailed(gameId: String, buildId: String, reason: String) {
    val payload = Arguments.createMap()
    payload.putString("gameId", gameId)
    payload.putString("buildId", buildId)
    payload.putString("reason", reason)
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
