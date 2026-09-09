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
        val isAbandoned = (eventName == "game_exit" && (durationSeconds ?: 0L) < 10L)
        val exitReason = extraParams?.get("exit_reason") as? String

        scope.launch {
            try {
                val paramsJson = JSONObject().apply {
                    put("game_id", gameId)
                    put("gameId", gameId)
                    put("game_title", gameTitle)
                    put("gameTitle", gameTitle)
                    if (durationSeconds != null) {
                        put("duration_seconds", durationSeconds)
                        put("durationSeconds", durationSeconds)
                    }
                    if (score != null) put("score", score)
                    if (level != null) put("level", level)
                    if (exitReason != null) {
                        put("exit_reason", exitReason)
                        put("exitReason", exitReason)
                    }
                    put("is_abandoned", isAbandoned)
                    put("isAbandoned", isAbandoned)
                    extraParams?.forEach { (k, v) -> put(k, v) }
                }

                val payload = JSONObject().apply {
                    put("clientId", clientId)
                    put("client_id", clientId)
                    put("eventName", eventName)
                    put("event_name", eventName)
                    put("gameId", gameId)
                    put("game_id", gameId)
                    put("gameTitle", gameTitle)
                    put("game_title", gameTitle)
                    if (durationSeconds != null) {
                        put("durationSeconds", durationSeconds)
                        put("duration_seconds", durationSeconds)
                    }
                    if (score != null) put("score", score)
                    if (level != null) put("level", level)
                    if (exitReason != null) {
                        put("exitReason", exitReason)
                        put("exit_reason", exitReason)
                    }
                    put("isAbandoned", isAbandoned)
                    put("is_abandoned", isAbandoned)
                    put("params", paramsJson)
                    put("timestampMs", System.currentTimeMillis())
                }

                val requestBody = payload.toString().toRequestBody(jsonMediaType)

                val candidateBases = listOf(
                    GameRepository.getActiveBaseUrl(context),
                    GameRepository.BASE_URL,
                    "http://${GameRepository.PRIMARY_HOST}:3000",
                    "http://${GameRepository.PRIMARY_HOST}",
                    "http://10.0.2.2:3000"
                ).distinct()

                var sent = false
                for (base in candidateBases) {
                    try {
                        val endpoint = "$base/api/analytics/event"
                        val request = Request.Builder()
                            .url(endpoint)
                            .post(requestBody)
                            .build()

                        httpClient.newCall(request).execute().use { response ->
                            if (response.isSuccessful) {
                                Log.i(TAG, "✓ Analytics [$eventName] recorded successfully via $endpoint (HTTP ${response.code})")
                                GameRepository.updateActiveBaseUrl(context, base)
                                sent = true
                                return@use
                            } else {
                                Log.w(TAG, "Analytics event [$eventName] at $endpoint returned HTTP ${response.code}")
                            }
                        }
                        if (sent) break
                    } catch (netEx: Exception) {
                        Log.d(TAG, "Candidate endpoint $base failed: ${netEx.message}")
                    }
                }

                if (!sent) {
                    Log.w(TAG, "Could not reach any analytics candidate endpoint for event: $eventName")
                }
            } catch (e: Exception) {
                Log.w(TAG, "Failed to build or dispatch analytics event $eventName: ${e.message}")
            }
        }
    }

    companion object {
        private const val TAG = "GameAnalyticsManager"
    }
}
