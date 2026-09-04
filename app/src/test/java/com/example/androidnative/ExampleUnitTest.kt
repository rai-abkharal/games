package com.example.androidnative

import com.example.androidnative.model.GameCatalog
import com.google.gson.Gson
import org.junit.Test

import org.junit.Assert.*

/**
 * Example local unit test, which will execute on the development machine (host).
 *
 * See [testing documentation](http://d.android.com/tools/testing).
 */
class ExampleUnitTest {
    @Test
    fun addition_isCorrect() {
        assertEquals(4, 2 + 2)
    }

    @Test
    fun catalog_acceptsLegacyFeaturesArrayWithoutDroppingGames() {
        val json = """
            {
              "version": 1,
              "updatedAt": "2026-09-04T00:00:00.000Z",
              "games": [
                {
                  "id": "legacy-game",
                  "title": "Legacy Game",
                  "version": "1.0.0",
                  "entryUrl": "http://example.test/game/index.html",
                  "features": ["offline-capable", "touch-support"]
                },
                {
                  "id": "modern-game",
                  "title": "Modern Game",
                  "version": "1.0.0",
                  "entryUrl": "http://example.test/modern/index.html",
                  "features": {"sound": true, "vibration": false}
                }
              ]
            }
        """.trimIndent()

        val catalog = Gson().fromJson(json, GameCatalog::class.java)

        assertEquals(2, catalog.games.size)
        assertTrue(catalog.games[0].features?.isJsonArray == true)
        assertTrue(catalog.games[1].features?.isJsonObject == true)
    }
}
