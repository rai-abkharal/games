package com.example.androidnative.cache

import android.content.Context
import android.net.Uri
import android.webkit.WebResourceResponse
import com.example.androidnative.model.GameItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileInputStream
import java.util.concurrent.ConcurrentHashMap
import java.util.regex.Pattern

class GameCacheManager(private val context: Context) {

    private val client = OkHttpClient()
    private val tempCacheDir = File(context.cacheDir, "game_cache")
    private val offlineStorageDir = File(context.filesDir, "offline_games")
    private val downloadedGames = ConcurrentHashMap<String, Boolean>()
    private val cacheMetaPrefs = context.getSharedPreferences("game_cache_meta_prefs", Context.MODE_PRIVATE)

    init {
        if (!tempCacheDir.exists()) tempCacheDir.mkdirs()
        if (!offlineStorageDir.exists()) offlineStorageDir.mkdirs()
        refreshDownloadedStatus()
    }

    fun refreshDownloadedStatus() {
        downloadedGames.clear()
        scanDir(offlineStorageDir)
        scanDir(tempCacheDir)
    }

    private fun scanDir(baseDir: File) {
        val games = baseDir.listFiles() ?: return
        for (gameDir in games) {
            if (gameDir.isDirectory) {
                val versions = gameDir.listFiles() ?: continue
                for (vDir in versions) {
                    if (vDir.isDirectory) {
                        val indexHtml = File(vDir, "index.html")
                        if (indexHtml.exists() && indexHtml.length() > 0) {
                            downloadedGames["${gameDir.name}_${vDir.name}"] = true
                        }
                    }
                }
            }
        }
    }

    fun invalidateGameCache(gameId: String) {
        try {
            val f1 = File(offlineStorageDir, gameId)
            if (f1.exists()) f1.deleteRecursively()
            val f2 = File(tempCacheDir, gameId)
            if (f2.exists()) f2.deleteRecursively()

            val keysToRemove = downloadedGames.keys().toList().filter { it.startsWith("${gameId}_") }
            for (k in keysToRemove) downloadedGames.remove(k)

            memoryCache.evictAll()

            cacheMetaPrefs.edit()
                .remove("sha_$gameId")
                .remove("version_$gameId")
                .remove("updated_$gameId")
                .apply()
        } catch (_: Exception) {}
    }

    /**
     * Automatic synchronization: Compares remote catalog SHA256 & updatedAt with local cache.
     * If Admin Panel updated a game, this purges the old cache immediately!
     */
    fun syncCatalogUpdates(games: List<GameItem>) {
        val editor = cacheMetaPrefs.edit()
        for (game in games) {
            val cachedSha = cacheMetaPrefs.getString("sha_${game.id}", null)
            val cachedVer = cacheMetaPrefs.getString("version_${game.id}", null)
            val cachedUpdated = cacheMetaPrefs.getString("updated_${game.id}", null)

            val remoteSha = game.sha256
            val remoteVer = game.version
            val remoteUpdated = game.updatedAt

            val isUpdated = (remoteSha != null && cachedSha != null && remoteSha != cachedSha) ||
                            (cachedVer != null && remoteVer != cachedVer) ||
                            (remoteUpdated != null && cachedUpdated != null && remoteUpdated != cachedUpdated)

            if (isUpdated) {
                // Game updated on server! Purge stale cache immediately
                invalidateGameCache(game.id)
            }

            if (remoteSha != null) editor.putString("sha_${game.id}", remoteSha)
            editor.putString("version_${game.id}", remoteVer)
            if (remoteUpdated != null) editor.putString("updated_${game.id}", remoteUpdated)
        }
        editor.apply()
    }

    fun isGameCached(gameId: String, version: String): Boolean {
        val key = "${gameId}_$version"
        if (downloadedGames[key] == true) return true
        val inOffline = File(offlineStorageDir, "$gameId/$version/index.html").exists()
        val inTemp = File(tempCacheDir, "$gameId/$version/index.html").exists()
        val cached = inOffline || inTemp
        if (cached) downloadedGames[key] = true
        return cached
    }

    fun isGameCached(game: GameItem): Boolean {
        // Automatic Server Update Detection: Check if remote SHA-256 or version changed
        val cachedSha = cacheMetaPrefs.getString("sha_${game.id}", null)
        val cachedVer = cacheMetaPrefs.getString("version_${game.id}", null)

        if (game.sha256 != null && cachedSha != null && game.sha256 != cachedSha) {
            // Server has a new update! Invalidate old disk cache
            invalidateGameCache(game.id)
            return false
        }
        if (cachedVer != null && game.version != cachedVer) {
            invalidateGameCache(game.id)
            return false
        }

        return isGameCached(game.id, game.version)
    }

    fun isGameDownloadedOffline(gameId: String, version: String): Boolean {
        return File(offlineStorageDir, "$gameId/$version/index.html").exists()
    }

    /**
     * Lazy on-demand preload: Gently pre-caches ONLY the immediate next game (N+1)
     * after current game is active, avoiding any initial network congestion.
     */
    fun preloadUpcomingGames(currentIndex: Int, catalog: List<GameItem>, scope: kotlinx.coroutines.CoroutineScope) {
        if (catalog.isEmpty()) return
        val nextIndex = currentIndex + 1
        if (nextIndex in catalog.indices) {
            val game = catalog[nextIndex]
            if (!isGameCached(game)) {
                scope.launch(Dispatchers.IO) {
                    try {
                        kotlinx.coroutines.delay(1500)
                        downloadGame(game)
                    } catch (_: Exception) {}
                }
            }
        }
    }

    fun getLocalFile(gameId: String, version: String, relativePath: String): File? {
        val normalized = relativePath.trimStart('/')
        // 1. Check permanent offline storage first
        val offlineFile = File(offlineStorageDir, "$gameId/$version/$normalized")
        if (offlineFile.exists()) return offlineFile

        // 2. Check temporary session cache
        val tempFile = File(tempCacheDir, "$gameId/$version/$normalized")
        return if (tempFile.exists()) tempFile else null
    }

    private val memoryCache = object : android.util.LruCache<String, ByteArray>(24 * 1024 * 1024) {
        override fun sizeOf(key: String, value: ByteArray): Int = value.size
    }

    fun interceptRequest(url: String): WebResourceResponse? {
        try {
            val uri = Uri.parse(url)
            val path = uri.path ?: return null
            val segments = path.split("/").filter { it.isNotEmpty() }

            // 1. Check if intercepting shared libraries (e.g. /shared/phaser.min.js)
            if (segments.size >= 2 && segments[0] == "shared") {
                val fileName = segments.subList(1, segments.size).joinToString("/")
                val cacheKey = "shared/$fileName"
                var data = memoryCache.get(cacheKey)
                if (data == null) {
                    val sharedOffline = File(offlineStorageDir, "shared/$fileName")
                    val sharedTemp = File(tempCacheDir, "shared/$fileName")
                    val targetFile = if (sharedOffline.exists()) sharedOffline else if (sharedTemp.exists()) sharedTemp else null
                    if (targetFile != null && targetFile.exists()) {
                        data = targetFile.readBytes()
                        memoryCache.put(cacheKey, data)
                    }
                }
                if (data != null) {
                    val mimeType = getMimeType(fileName)
                    val headers = mapOf(
                        "Access-Control-Allow-Origin" to "*",
                        "Access-Control-Allow-Methods" to "GET, OPTIONS",
                        "Cache-Control" to "public, max-age=31536000, immutable"
                    )
                    return WebResourceResponse(
                        mimeType,
                        "UTF-8",
                        200,
                        "OK",
                        headers,
                        java.io.ByteArrayInputStream(data)
                    )
                }
            }

            // 2. Intercept individual games
            if (segments.size >= 3 && segments[0] == "games") {
                val gameId = segments[1]
                val version = segments[2]
                val relativePath = if (segments.size > 3) {
                    segments.subList(3, segments.size).joinToString("/")
                } else {
                    "index.html"
                }

                val cacheKey = "$gameId/$version/$relativePath"
                var data = memoryCache.get(cacheKey)
                
                if (data == null) {
                    val localFile = getLocalFile(gameId, version, relativePath)
                    if (localFile != null && localFile.exists()) {
                        data = localFile.readBytes()
                        memoryCache.put(cacheKey, data)
                    }
                }

                if (data != null) {
                    val mimeType = getMimeType(relativePath)
                    val encoding = if (mimeType.startsWith("text/") || mimeType.contains("javascript") || mimeType.contains("json")) "UTF-8" else null
                    val headers = mapOf(
                        "Access-Control-Allow-Origin" to "*",
                        "Access-Control-Allow-Methods" to "GET, OPTIONS",
                        "Cache-Control" to "public, max-age=31536000"
                    )
                    return WebResourceResponse(
                        mimeType,
                        encoding,
                        200,
                        "OK",
                        headers,
                        java.io.ByteArrayInputStream(data)
                    )
                }
            }
        } catch (_: Exception) {}
        return null
    }

    private fun getMimeType(path: String): String {
        return when {
            path.endsWith(".html") -> "text/html"
            path.endsWith(".js") || path.endsWith(".mjs") -> "application/javascript"
            path.endsWith(".css") -> "text/css"
            path.endsWith(".json") -> "application/json"
            path.endsWith(".png") -> "image/png"
            path.endsWith(".jpg") || path.endsWith(".jpeg") -> "image/jpeg"
            path.endsWith(".webp") -> "image/webp"
            path.endsWith(".svg") -> "image/svg+xml"
            path.endsWith(".mp3") -> "audio/mpeg"
            path.endsWith(".ogg") || path.endsWith(".oga") -> "audio/ogg"
            path.endsWith(".wav") -> "audio/wav"
            path.endsWith(".woff2") -> "font/woff2"
            path.endsWith(".woff") -> "font/woff"
            path.endsWith(".ttf") -> "font/ttf"
            else -> "application/octet-stream"
        }
    }

    suspend fun downloadGame(
        game: GameItem,
        isExplicitOffline: Boolean = false,
        onProgress: (Float) -> Unit = {}
    ): Boolean = withContext(Dispatchers.IO) {
        try {
            onProgress(0.1f)
            val baseDir = if (isExplicitOffline) offlineStorageDir else tempCacheDir
            val targetDir = File(baseDir, "${game.id}/${game.version}")
            if (targetDir.exists()) {
                targetDir.deleteRecursively()
            }
            targetDir.mkdirs()

            // 1. Download index.html
            val req = Request.Builder().url(game.entryUrl).build()
            val res = client.newCall(req).execute()
            if (!res.isSuccessful) return@withContext false

            val htmlContent = res.body?.string() ?: return@withContext false
            val indexFile = File(targetDir, "index.html")
            indexFile.writeText(htmlContent)
            onProgress(0.5f)

            // 2. Extract and download referenced assets (e.g. ./assets/index-xxx.js)
            val scriptPattern = Pattern.compile("<script[^>]+src=\"([^\"]+)\"")
            val matcher = scriptPattern.matcher(htmlContent)
            val baseUri = Uri.parse(game.entryUrl)

            while (matcher.find()) {
                var src = matcher.group(1) ?: continue
                if (src.startsWith("/shared/")) {
                    val sharedFileName = src.removePrefix("/shared/")
                    val sharedTargetFile = File(baseDir, "shared/$sharedFileName")
                    if (!sharedTargetFile.exists()) {
                        sharedTargetFile.parentFile?.mkdirs()
                        val sharedAssetUrl = "${baseUri.scheme}://${baseUri.authority}/shared/$sharedFileName"
                        val assetReq = Request.Builder().url(sharedAssetUrl).build()
                        val assetRes = client.newCall(assetReq).execute()
                        if (assetRes.isSuccessful) {
                            assetRes.body?.byteStream()?.use { input ->
                                sharedTargetFile.outputStream().use { output ->
                                    input.copyTo(output)
                                }
                            }
                        }
                    }
                } else if (!src.startsWith("http")) {
                    val assetUrl = resolveUri(baseUri, src)
                    src = src.removePrefix("./")
                    val assetFile = File(targetDir, src)
                    assetFile.parentFile?.mkdirs()

                    val assetReq = Request.Builder().url(assetUrl).build()
                    val assetRes = client.newCall(assetReq).execute()
                    if (assetRes.isSuccessful) {
                        assetRes.body?.byteStream()?.use { input ->
                            assetFile.outputStream().use { output ->
                                input.copyTo(output)
                            }
                        }
                    }
                }
            }

            downloadedGames["${game.id}_${game.version}"] = true
            if (game.sha256 != null) {
                cacheMetaPrefs.edit().putString("sha_${game.id}", game.sha256).apply()
            }
            cacheMetaPrefs.edit().putString("version_${game.id}", game.version).apply()
            onProgress(1.0f)
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun resolveUri(base: Uri, relative: String): String {
        val baseStr = base.toString()
        val lastSlash = baseStr.lastIndexOf('/')
        return if (lastSlash != -1) {
            baseStr.substring(0, lastSlash + 1) + relative.removePrefix("./")
        } else {
            "$baseStr/$relative"
        }
    }

    /**
     * Clears temporary session cache when app closes, freeing memory
     * while preserving explicitly downloaded offline games.
     */
    fun clearTempCache() {
        memoryCache.evictAll()
        if (tempCacheDir.exists()) {
            tempCacheDir.deleteRecursively()
            tempCacheDir.mkdirs()
        }
        refreshDownloadedStatus()
    }

    fun clearAllCache() {
        memoryCache.evictAll()
        if (tempCacheDir.exists()) {
            tempCacheDir.deleteRecursively()
            tempCacheDir.mkdirs()
        }
        if (offlineStorageDir.exists()) {
            offlineStorageDir.deleteRecursively()
            offlineStorageDir.mkdirs()
        }
        downloadedGames.clear()
    }
}
