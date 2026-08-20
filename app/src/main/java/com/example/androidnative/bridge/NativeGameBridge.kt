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
    fun onCoinsEarned(amount: Int)
    fun onRequestHint(action: String)
    fun onSaveLevelState(level: Int)
    fun onRequestRewardedAd(rewardType: String)
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

    private var vibrationEnabled: Boolean = true

    fun setVibrationEnabled(enabled: Boolean) {
        this.vibrationEnabled = enabled
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

    @JavascriptInterface
    fun earnCoins(amount: Int) {
        listener?.onCoinsEarned(amount)
    }

    @JavascriptInterface
    fun requestHint(action: String) {
        listener?.onRequestHint(action)
    }

    @JavascriptInterface
    fun saveLevelState(level: Int) {
        listener?.onSaveLevelState(level)
    }

    @JavascriptInterface
    fun showRewardedAd(type: String) {
        listener?.onRequestRewardedAd(type)
    }

    private fun handleIncomingMessage(raw: String) {
        try {
            val obj = JSONObject(raw)
            val action = obj.optString("action", obj.optString("type"))
            val payload = obj.optJSONObject("payload")

            when (action) {
                "ready" -> {}
                "gameStarted" -> listener?.onGameStarted()
                "gameOver" -> {
                    val score = payload?.optInt("score", obj.optInt("score", 0)) ?: 0
                    listener?.onGameOver(score, payload?.toString() ?: "")
                }
                "completed" -> {
                    val score = payload?.optInt("score", 0) ?: 0
                    val level = payload?.optInt("level", 1) ?: 1
                    listener?.onGameCompleted(score, level)
                }
                "setSwipeEnabled" -> {
                    val enabled = payload?.optBoolean("enabled", true) ?: true
                    listener?.onSetSwipeEnabled(enabled)
                }
                "haptic" -> {
                    val type = payload?.optString("type", "light") ?: "light"
                    triggerHaptic(type)
                }
                "earnCoins", "COINS_EARNED" -> {
                    val coins = payload?.optInt("amount", obj.optInt("amount", 10)) ?: 10
                    listener?.onCoinsEarned(coins)
                }
                "requestHint", "REQUEST_HINT" -> {
                    val hintAction = payload?.optString("action", "hint") ?: "hint"
                    listener?.onRequestHint(hintAction)
                }
                "saveLevelState", "SAVE_LEVEL" -> {
                    val level = payload?.optInt("level", obj.optInt("level", 1)) ?: 1
                    listener?.onSaveLevelState(level)
                }
                "showRewardedAd", "SHOW_REWARDED_AD" -> {
                    val rewardType = payload?.optString("type", "hint") ?: "hint"
                    listener?.onRequestRewardedAd(rewardType)
                }
            }
        } catch (_: Exception) {}
    }

    private fun triggerHaptic(type: String) {
        if (!vibrationEnabled || vibrator == null || !vibrator.hasVibrator()) return
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
