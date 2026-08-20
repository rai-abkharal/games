package com.example.androidnative.manager

import android.content.Context
import android.content.SharedPreferences
import java.util.UUID

class PlayerProgressManager(context: Context) {

    private val prefs: SharedPreferences = context.getSharedPreferences("minigames_player_progress", Context.MODE_PRIVATE)

    // Player Identity
    var playerId: String
        get() {
            var id = prefs.getString("player_id", null)
            if (id == null) {
                id = "Guest_" + UUID.randomUUID().toString().substring(0, 5).uppercase()
                prefs.edit().putString("player_id", id).apply()
            }
            return id
        }
        set(value) = prefs.edit().putString("player_id", value).apply()

    var isGuest: Boolean
        get() = prefs.getBoolean("is_guest", true)
        set(value) = prefs.edit().putBoolean("is_guest", value).apply()

    var playerEmail: String?
        get() = prefs.getString("player_email", null)
        set(value) = prefs.edit().putString("player_email", value).apply()

    // Global Coins Wallet
    var totalCoins: Int
        get() = prefs.getInt("total_coins", 100) // 100 starter welcome coins!
        private set(value) = prefs.edit().putInt("total_coins", value).apply()

    fun addCoins(amount: Int): Int {
        val updated = totalCoins + amount
        totalCoins = updated
        return updated
    }

    fun spendCoins(amount: Int): Boolean {
        if (totalCoins >= amount) {
            totalCoins -= amount
            return true
        }
        return false
    }

    // Per-Game High Scores
    fun getHighScore(gameId: String): Int {
        return prefs.getInt("high_score_$gameId", 0)
    }

    fun saveHighScore(gameId: String, score: Int): Boolean {
        val current = getHighScore(gameId)
        if (score > current) {
            prefs.edit().putInt("high_score_$gameId", score).apply()
            return true
        }
        return false
    }

    // Per-Game Level Progression
    fun getSavedLevel(gameId: String): Int {
        return prefs.getInt("saved_level_$gameId", 1)
    }

    fun saveLevel(gameId: String, level: Int) {
        val current = getSavedLevel(gameId)
        if (level > current) {
            prefs.edit().putInt("saved_level_$gameId", level).apply()
        }
    }

    // Favorites Management
    fun getFavoriteGameIds(): Set<String> {
        return prefs.getStringSet("favorite_game_ids", emptySet()) ?: emptySet()
    }

    fun isFavorite(gameId: String): Boolean {
        return getFavoriteGameIds().contains(gameId)
    }

    fun toggleFavorite(gameId: String): Boolean {
        val current = getFavoriteGameIds().toMutableSet()
        val isFav: Boolean
        if (current.contains(gameId)) {
            current.remove(gameId)
            isFav = false
        } else {
            current.add(gameId)
            isFav = true
        }
        prefs.edit().putStringSet("favorite_game_ids", current).apply()
        return isFav
    }
}
