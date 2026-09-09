package com.example.androidnative.manager

import android.content.Context
import android.content.SharedPreferences
import android.os.SystemClock
import android.util.Log
import com.example.androidnative.repository.GameRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.TimeUnit

class GameAnalyticsManager(private val context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("minigames_analytics", Context.MODE_PRIVATE)

    private val scope = CoroutineScope(Dispatchers.IO)
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(4, TimeUnit.SECONDS)
        .readTimeout(6, TimeUnit.SECONDS)
        .build()

    private var activeGameId: String? = null
    private var activeGameTitle: String? = null
    private var gameStartTimeMs: Long = 0L

    val clientId: String
        get() {
            var cid = prefs.getString("ga_client_id", null)
            if (cid.isNullOrBlank()) {
                cid = UUID.randomUUID().toString()
                prefs.edit().putString("ga_client_id", cid).apply()
            }
            return cid
        }

    fun onGameStart(gameId: String, title: String) {
        if (activeGameId != null && activeGameId != gameId) {
            onGameExit(activeGameId!!, activeGameTitle ?: "", exitReason = "swiped_away")
        }

        activeGameId = gameId
        activeGameTitle = title
        gameStartTimeMs = SystemClock.elapsedRealtime()

        val plays = prefs.getInt("plays_$gameId", 0) + 1
        prefs.edit().putInt("plays_$gameId", plays).apply()

        sendEvent(
            eventName = "game_start",
            gameId = gameId,
            gameTitle = title
        )
    }

    fun onGameOver(gameId: String, title: String, score: Int, stats: String = "") {
        val durationSec = computeDurationSeconds()
        sendEvent(
            eventName = "game_over",
            gameId = gameId,
            gameTitle = title,
            score = score,
            durationSeconds = durationSec,
            extraParams = if (stats.isNotBlank()) mapOf("stats" to stats) else null
        )
    }

    fun onGameCompleted(gameId: String, title: String, score: Int, level: Int) {
        val durationSec = computeDurationSeconds()
        sendEvent(
            eventName = "game_completed",
            gameId = gameId,
            gameTitle = title,
            score = score,
            level = level,
            durationSeconds = durationSec
        )
    }

    fun onGameExit(gameId: String, title: String, exitReason: String = "navigated") {
        if (activeGameId == gameId) {
            val durationSec = computeDurationSeconds()

            val prevDuration = prefs.getLong("duration_sec_$gameId", 0L)
            prefs.edit().putLong("duration_sec_$gameId", prevDuration + durationSec).apply()

            sendEvent(
                eventName = "game_exit",
                gameId = gameId,
                gameTitle = title,
                durationSeconds = durationSec,
                extraParams = mapOf("exit_reason" to exitReason)
            )

            sendEvent(
                eventName = "game_session_duration",
                gameId = gameId,
                gameTitle = title,
                durationSeconds = durationSec
            )

            activeGameId = null
            activeGameTitle = null
            gameStartTimeMs = 0L
        }
    }

    private fun computeDurationSeconds(): Long {
        if (gameStartTimeMs <= 0L) return 0L
        val elapsedMs = SystemClock.elapsedRealtime() - gameStartTimeMs
        return Math.max(0L, elapsedMs / 1000L)
    }

    private fun sendEvent(
        eventName: String,
        gameId: String,
        gameTitle: String,
        durationSeconds: Long? = null,
        score: Int? = null,
        level: Int? = null,
        extraParams: Map<String, Any>? = null
    ) {
        scope.launch {
            try {
                val paramsJson = JSONObject().apply {
                    put("game_id", gameId)
                    put("game_title", gameTitle)
                    if (durationSeconds != null) put("duration_seconds", durationSeconds)
                    if (score != null) put("score", score)
                    if (level != null) put("level", level)
                    extraParams?.forEach { (k, v) -> put(k, v) }
                }

                val payload = JSONObject().apply {
                    put("client_id", clientId)
                    put("event_name", eventName)
                    put("params", paramsJson)
                }

                val requestBody = payload.toString().toRequestBody(jsonMediaType)
                val request = Request.Builder()
                    .url("${GameRepository.BASE_URL}/api/analytics/event")
                    .post(requestBody)
                    .build()

                httpClient.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) {
                        Log.w(TAG, "Analytics event $eventName failed with HTTP ${response.code}")
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Failed to send analytics event $eventName: ${e.message}")
            }
        }
    }

    companion object {
        private const val TAG = "GameAnalyticsManager"
    }
}
