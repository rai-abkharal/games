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
        return isGameCached(game.id, game.version)
    }

    fun isGameDownloadedOffline(gameId: String, version: String): Boolean {
        return File(offlineStorageDir, "$gameId/$version/index.html").exists()
    }

    /**
     * Predictive background download: silently downloads current, next, and next+1 games
     * so that user swiping lands on 100% locally cached games (0.01ms load time).
     */
    fun preloadUpcomingGames(currentIndex: Int, catalog: List<GameItem>, scope: kotlinx.coroutines.CoroutineScope) {
        if (catalog.isEmpty()) return
        val indicesToPreload = listOf(currentIndex, currentIndex + 1, currentIndex + 2, currentIndex - 1)
            .filter { it in catalog.indices }

        for (idx in indicesToPreload) {
            val game = catalog[idx]
            if (!isGameCached(game)) {
                scope.launch(Dispatchers.IO) {
                    downloadGame(game)
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

    fun interceptRequest(url: String): WebResourceResponse? {
        try {
            val uri = Uri.parse(url)
            val path = uri.path ?: return null

            // Example path: /games/tap-cannon/1.1.0/assets/index-xxx.js
            val segments = path.split("/").filter { it.isNotEmpty() }
            if (segments.size >= 3 && segments[0] == "games") {
                val gameId = segments[1]
                val version = segments[2]
                val relativePath = if (segments.size > 3) {
                    segments.subList(3, segments.size).joinToString("/")
                } else {
                    "index.html"
                }

                val localFile = getLocalFile(gameId, version, relativePath)
                if (localFile != null && localFile.exists()) {
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
                        FileInputStream(localFile)
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
                if (!src.startsWith("http")) {
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
        if (tempCacheDir.exists()) {
            tempCacheDir.deleteRecursively()
            tempCacheDir.mkdirs()
        }
        refreshDownloadedStatus()
    }

    fun clearAllCache() {
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
