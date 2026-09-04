package com.example.androidnative.repository

import android.content.Context
import android.util.Log
import com.example.androidnative.model.GameCatalog
import com.example.androidnative.model.GameItem
import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

class GameRepository(private val context: Context) {

    private val gson = Gson()
    private val cacheManager = com.example.androidnative.cache.GameCacheManager(context)
    private val client = OkHttpClient.Builder()
        .connectTimeout(4, TimeUnit.SECONDS)
        .readTimeout(8, TimeUnit.SECONDS)
        .build()

    companion object {
        private const val TAG = "GameRepository"
        const val PRIMARY_HOST = "162.243.197.241"
        const val BASE_URL = "http://$PRIMARY_HOST:3000"

        val CANDIDATE_ENDPOINTS = listOf(
            "http://$PRIMARY_HOST:3000/api/games",
            "http://$PRIMARY_HOST/api/games",
            "http://$PRIMARY_HOST:8080/api/games",
            "http://10.0.2.2:3000/api/games",
            "http://10.0.2.2:8080/api/games"
        )
    }

    fun getCachedCatalog(): List<GameItem>? {
        val cached = getCachedCatalogJson()
        if (!cached.isNullOrEmpty()) {
            try {
                val catalog = gson.fromJson(cached, GameCatalog::class.java)
                if (catalog.games.isNotEmpty()) {
                    return catalog.games.map { normalizeGameUrls(it, BASE_URL) }
                        .sortedBy { it.feedOrder }
                }
            } catch (error: Exception) {
                Log.w(TAG, "Ignoring invalid cached game catalogue", error)
            }
        }
        return null
    }

    suspend fun fetchCatalog(): List<GameItem> = withContext(Dispatchers.IO) {
        // 1. Try candidate endpoints on live server
        for (endpoint in CANDIDATE_ENDPOINTS) {
            try {
                val urlWithBuster = if (endpoint.contains("?")) {
                    "$endpoint&_t=${System.currentTimeMillis()}"
                } else {
                    "$endpoint?_t=${System.currentTimeMillis()}"
                }
                val request = Request.Builder()
                    .url(urlWithBuster)
                    .cacheControl(okhttp3.CacheControl.FORCE_NETWORK)
                    .build()
                val response = client.newCall(request).execute()
                if (response.isSuccessful) {
                    val json = response.body?.string()
                    if (!json.isNullOrEmpty()) {
                        val catalog = gson.fromJson(json, GameCatalog::class.java)
                        if (catalog.games.isNotEmpty()) {
                            val activeBase = endpoint.substringBefore("/api/games")
                            val normalized = catalog.games.map { normalizeGameUrls(it, activeBase) }
                                .sortedBy { it.feedOrder }

                            saveCachedCatalogJson(gson.toJson(GameCatalog(catalog.version, catalog.updatedAt, normalized)))
                            cacheManager.syncCatalogUpdates(normalized)
                            return@withContext normalized
                        }
                    }
                }
            } catch (error: Exception) {
                Log.w(TAG, "Catalogue fetch failed for $endpoint", error)
            }
        }

        // 2. Fallback to locally cached catalog
        val cached = getCachedCatalog()
        if (cached != null && cached.isNotEmpty()) {
            cacheManager.syncCatalogUpdates(cached)
            return@withContext cached
        }

        // 3. Fallback to default catalog
        val defaults = defaultCatalog()
        cacheManager.syncCatalogUpdates(defaults)
        return@withContext defaults
    }

    private fun normalizeGameUrls(game: GameItem, activeBaseUrl: String): GameItem {
        fun fixUrl(url: String): String {
            if (url.isEmpty()) return url
            if (url.startsWith("/")) return "$activeBaseUrl$url"
            try {
                val uri = android.net.Uri.parse(url)
                val host = uri.host
                if (host == "localhost" || host == "127.0.0.1" || host == "10.0.2.2" || host == "games.example.com") {
                    val pathAndQuery = if (uri.encodedQuery != null) "${uri.path}?${uri.encodedQuery}" else uri.path ?: ""
                    return "$activeBaseUrl$pathAndQuery"
                }
            } catch (_: Exception) {}
            return url
        }

        return game.copy(
            entryUrl = fixUrl(game.entryUrl),
            thumbnailUrl = fixUrl(game.thumbnailUrl),
            manifestUrl = fixUrl(game.manifestUrl)
        )
    }

    private fun saveCachedCatalogJson(json: String) {
        val prefs = context.getSharedPreferences("game_catalog_prefs", Context.MODE_PRIVATE)
        prefs.edit().putString("cached_catalog_json", json).apply()
    }

    private fun getCachedCatalogJson(): String? {
        val prefs = context.getSharedPreferences("game_catalog_prefs", Context.MODE_PRIVATE)
        return prefs.getString("cached_catalog_json", null)
    }

    private fun defaultCatalog(): List<GameItem> {
        return listOf(
            GameItem("tap-cannon", "Tap Cannon", "1.1.0", "$BASE_URL/games/tap-cannon/1.1.0/index.html", "$BASE_URL/thumbnails/tap-cannon.webp", 9667, category = "Arcade", description = "Tap to blast moving targets!"),
            GameItem("color-match", "Color Match", "1.1.0", "$BASE_URL/games/color-match/1.1.0/index.html", "$BASE_URL/thumbnails/color-match.webp", 8772, category = "Puzzle", description = "Match rapid color pulses!"),
            GameItem("stack-tower", "Stack Tower", "1.1.0", "$BASE_URL/games/stack-tower/1.1.0/index.html", "$BASE_URL/thumbnails/stack-tower.webp", 8216, category = "Casual", description = "Stack blocks as high as you can!"),
            GameItem("lane-dodge", "Lane Dodge", "1.1.0", "$BASE_URL/games/lane-dodge/1.1.0/index.html", "$BASE_URL/thumbnails/lane-dodge.webp", 9975, category = "Arcade", description = "Dodge traffic in 3 intense lanes!"),
            GameItem("memory-flip", "Memory Flip", "1.1.0", "$BASE_URL/games/memory-flip/1.1.0/index.html", "$BASE_URL/thumbnails/memory-flip.webp", 9586, category = "Puzzle", description = "Flip and match twin cards!"),
            GameItem("fruit-catch", "Fruit Catch", "1.1.0", "$BASE_URL/games/fruit-catch/1.1.0/index.html", "$BASE_URL/thumbnails/fruit-catch.webp", 9131, category = "Arcade", description = "Catch ripe fruits, avoid bombs!"),
            GameItem("tiny-archer", "Tiny Archer", "1.1.0", "$BASE_URL/games/tiny-archer/1.1.0/index.html", "$BASE_URL/thumbnails/tiny-archer.webp", 11314, category = "Action", description = "Shoot bullseyes before time runs out!"),
            GameItem("pipe-connect", "Pipe Connect", "1.1.0", "$BASE_URL/games/pipe-connect/1.1.0/index.html", "$BASE_URL/thumbnails/pipe-connect.webp", 11095, category = "Puzzle", description = "Rotate pipes to create a flow!"),
            GameItem("one-tap-runner", "One-Tap Runner", "1.1.0", "$BASE_URL/games/one-tap-runner/1.1.0/index.html", "$BASE_URL/thumbnails/one-tap-runner.webp", 9509, category = "Runner", description = "Jump over spikes with precision!"),
            GameItem("merge-dots", "Merge Dots", "1.1.0", "$BASE_URL/games/merge-dots/1.1.0/index.html", "$BASE_URL/thumbnails/merge-dots.webp", 11851, category = "Puzzle", description = "Slide and merge numbers to 2048!"),
            GameItem("fruit-frenzy", "Fruit Frenzy", "1.0.0", "$BASE_URL/games/fruit-frenzy/1.0.0/index.html", "$BASE_URL/thumbnails/fruit-frenzy.webp", 11072, category = "Arcade", description = "Fast fruit-catching & slicing frenzy!"),
            GameItem("neon-switch", "Neon Switch", "1.0.0", "$BASE_URL/games/neon-switch/1.0.0/index.html", "$BASE_URL/thumbnails/neon-switch.webp", 8749, category = "Arcade", description = "Switch lanes and dodge neon orbs!"),
            GameItem("sky-pop", "Sky Pop", "1.0.0", "$BASE_URL/games/sky-pop/1.0.0/index.html", "$BASE_URL/thumbnails/sky-pop.webp", 8161, category = "Arcade", description = "Fly through sky gates and build high scores!"),
            GameItem("crown-arena", "Crown Arena", "1.1.0", "$BASE_URL/games/crown-arena/1.1.0/index.html", "$BASE_URL/thumbnails/crown-arena.webp", 51332, category = "Arcade", description = "Capture and hold the golden crown in 2D arena battle!"),
            GameItem("cyber-blade", "Cyber Blade", "1.0.0", "$BASE_URL/games/cyber-blade/1.0.0/index.html", "$BASE_URL/thumbnails/cyber-blade.webp", 12007, category = "Action", description = "High-speed neon blade slicing and precision reflex challenge."),
            GameItem("jetpack-surge", "Jetpack Surge", "1.0.0", "$BASE_URL/games/jetpack-surge/1.0.0/index.html", "$BASE_URL/thumbnails/jetpack-surge.webp", 10886, category = "Arcade", description = "High-velocity jetpack booster through electric sky barriers."),
            GameItem("quantum-maze", "Quantum Maze", "1.0.0", "$BASE_URL/games/quantum-maze/1.0.0/index.html", "$BASE_URL/thumbnails/quantum-maze.webp", 15356, category = "Puzzle", description = "Multi-level cyber maze quest with in-game hints!"),
            GameItem("water-sort", "Water Sort 3D", "1.0.0", "$BASE_URL/games/water-sort/1.0.0/index.html", "$BASE_URL/thumbnails/water-sort.webp", 79000, category = "Puzzle", description = "AAA 3D Liquid Sorting Puzzle with fluid physics."),
            GameItem("endless-racer", "Endless Racer", "1.0.0", "$BASE_URL/games/endless-racer/1.0.0/index.html", "$BASE_URL/thumbnails/endless-racer.webp", 84000, category = "Arcade", description = "Weave through three lanes of traffic and scoop up coins.")
        )
    }
}
