package com.example.androidnative.repository

import android.content.Context
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
    private val client = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    companion object {
        const val BASE_URL = "http://162.243.197.241:3000"
        const val CATALOG_ENDPOINT = "$BASE_URL/api/games"
    }

    suspend fun fetchCatalog(): List<GameItem> = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder().url(CATALOG_ENDPOINT).build()
            val response = client.newCall(request).execute()
            if (response.isSuccessful) {
                val json = response.body?.string()
                if (!json.isNullOrEmpty()) {
                    val catalog = gson.fromJson(json, GameCatalog::class.java)
                    if (catalog.games.isNotEmpty()) {
                        saveCachedCatalogJson(json)
                        return@withContext catalog.games
                    }
                }
            }
        } catch (_: Exception) {}

        // Fallback to locally cached catalog
        val cached = getCachedCatalogJson()
        if (!cached.isNullOrEmpty()) {
            try {
                val catalog = gson.fromJson(cached, GameCatalog::class.java)
                if (catalog.games.isNotEmpty()) return@withContext catalog.games
            } catch (_: Exception) {}
        }

        // Fallback to default catalog
        return@withContext defaultCatalog()
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
            GameItem("tap-cannon", "Tap Cannon", "1.1.0", "$BASE_URL/games/tap-cannon/1.1.0/index.html", "$BASE_URL/thumbnails/tap-cannon.webp", 1497861, category = "Arcade", description = "Tap to blast moving targets!"),
            GameItem("color-match", "Color Match", "1.1.0", "$BASE_URL/games/color-match/1.1.0/index.html", "$BASE_URL/thumbnails/color-match.webp", 1496125, category = "Puzzle", description = "Match rapid color pulses!"),
            GameItem("stack-tower", "Stack Tower", "1.1.0", "$BASE_URL/games/stack-tower/1.1.0/index.html", "$BASE_URL/thumbnails/stack-tower.webp", 1496762, category = "Arcade", description = "Stack blocks as high as you can!"),
            GameItem("lane-dodge", "Lane Dodge", "1.1.0", "$BASE_URL/games/lane-dodge/1.1.0/index.html", "$BASE_URL/thumbnails/lane-dodge.webp", 1496637, category = "Arcade", description = "Dodge traffic in 3 intense lanes!"),
            GameItem("memory-flip", "Memory Flip", "1.1.0", "$BASE_URL/games/memory-flip/1.1.0/index.html", "$BASE_URL/thumbnails/memory-flip.webp", 1496405, category = "Brain", description = "Flip and match twin cards!"),
            GameItem("fruit-catch", "Fruit Catch", "1.1.0", "$BASE_URL/games/fruit-catch/1.1.0/index.html", "$BASE_URL/thumbnails/fruit-catch.webp", 1496347, category = "Arcade", description = "Catch ripe fruits, avoid bombs!"),
            GameItem("tiny-archer", "Tiny Archer", "1.1.0", "$BASE_URL/games/tiny-archer/1.1.0/index.html", "$BASE_URL/thumbnails/tiny-archer.webp", 1497586, category = "Action", description = "Shoot bullseyes before time runs out!"),
            GameItem("pipe-connect", "Pipe Connect", "1.1.0", "$BASE_URL/games/pipe-connect/1.1.0/index.html", "$BASE_URL/thumbnails/pipe-connect.webp", 1496852, category = "Puzzle", description = "Rotate pipes to create a flow!"),
            GameItem("one-tap-runner", "One-Tap Runner", "1.1.0", "$BASE_URL/games/one-tap-runner/1.1.0/index.html", "$BASE_URL/thumbnails/one-tap-runner.webp", 1496171, category = "Arcade", description = "Jump over spikes with precision!"),
            GameItem("merge-dots", "Merge Dots", "1.1.0", "$BASE_URL/games/merge-dots/1.1.0/index.html", "$BASE_URL/thumbnails/merge-dots.webp", 1496700, category = "Puzzle", description = "Slide and merge numbers to 2048!")
        )
    }
}
