package com.example.androidnative.bridge

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.webkit.JavascriptInterface
import org.json.JSONObject

interface GameBridgeListener {
    fun onGameStarted()
    fun onGameOver(score: Int, stats: String)
    fun onGameCompleted(score: Int, level: Int)
    fun onSetSwipeEnabled(enabled: Boolean)
}

class NativeGameBridge(
    private val context: Context,
    private val listener: GameBridgeListener? = null
) {
    private val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
        vibratorManager?.defaultVibrator
    } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }

    @JavascriptInterface
    fun postMessage(jsonString: String) {
        handleIncomingMessage(jsonString)
    }

    @JavascriptInterface
    fun ready() {
        // Game ready
    }

    @JavascriptInterface
    fun gameStarted() {
        listener?.onGameStarted()
    }

    @JavascriptInterface
    fun gameOver(score: Int) {
        listener?.onGameOver(score, "")
    }

    @JavascriptInterface
    fun setSwipeEnabled(enabled: Boolean) {
        listener?.onSetSwipeEnabled(enabled)
    }

    @JavascriptInterface
    fun haptic(type: String) {
        triggerHaptic(type)
    }

    private fun handleIncomingMessage(raw: String) {
        try {
            val obj = JSONObject(raw)
            val action = obj.optString("action")
            val payload = obj.optJSONObject("payload")

            when (action) {
                "ready" -> {}
                "gameStarted" -> listener?.onGameStarted()
                "gameOver" -> {
                    val score = payload?.optInt("score") ?: 0
                    listener?.onGameOver(score, payload?.toString() ?: "")
                }
                "completed" -> {
                    val score = payload?.optInt("score") ?: 0
                    val level = payload?.optInt("level") ?: 1
                    listener?.onGameCompleted(score, level)
                }
                "setSwipeEnabled" -> {
                    val enabled = payload?.optBoolean("enabled", true) ?: true
                    listener?.onSetSwipeEnabled(enabled)
                }
                "haptic" -> {
                    val type = payload?.optString("type") ?: "light"
                    triggerHaptic(type)
                }
            }
        } catch (_: Exception) {}
    }

    private fun triggerHaptic(type: String) {
        if (vibrator == null || !vibrator.hasVibrator()) return
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val effect = when (type) {
                    "heavy" -> VibrationEffect.createOneShot(35, VibrationEffect.DEFAULT_AMPLITUDE)
                    "medium" -> VibrationEffect.createOneShot(20, VibrationEffect.DEFAULT_AMPLITUDE)
                    "success" -> VibrationEffect.createWaveform(longArrayOf(0, 15, 50, 25), -1)
                    "error" -> VibrationEffect.createWaveform(longArrayOf(0, 30, 40, 30), -1)
                    else -> VibrationEffect.createOneShot(10, VibrationEffect.DEFAULT_AMPLITUDE)
                }
                vibrator.vibrate(effect)
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(20)
            }
        } catch (_: Exception) {}
    }
}
