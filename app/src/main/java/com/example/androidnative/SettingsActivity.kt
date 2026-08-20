package com.example.androidnative

import android.content.Context
import android.content.SharedPreferences
import android.graphics.Color
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.example.androidnative.cache.GameCacheManager
import com.example.androidnative.databinding.ActivitySettingsBinding
import com.example.androidnative.manager.PlayerProgressManager
import com.example.androidnative.theme.AppTheme
import com.example.androidnative.theme.ThemeManager

class SettingsActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySettingsBinding
    private lateinit var themeManager: ThemeManager
    private lateinit var progressManager: PlayerProgressManager
    private lateinit var prefs: SharedPreferences
    private lateinit var cacheManager: GameCacheManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySettingsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        prefs = getSharedPreferences("minigames_user_prefs", Context.MODE_PRIVATE)
        themeManager = ThemeManager(this)
        progressManager = PlayerProgressManager(this)
        cacheManager = GameCacheManager(this)

        setupToolbar()
        applyTheme()
        populateData()
        setupListeners()
    }

    private fun setupToolbar() {
        binding.btnBack.setOnClickListener {
            finish()
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
        }
    }

    private fun applyTheme() {
        val colors = themeManager.getColors()

        binding.settingsRoot.setBackgroundColor(colors.bgColor)
        binding.tvToolbarTitle.setTextColor(colors.textColorPrimary)
        binding.tvSoundLabel.setTextColor(colors.textColorPrimary)
        binding.tvVibLabel.setTextColor(colors.textColorPrimary)
        binding.tvPlayerIdDisplay.setTextColor(colors.textColorPrimary)

        // Cards background
        binding.cardAudio.setBackgroundColor(colors.cardBg)
        binding.cardProfile.setBackgroundColor(colors.cardBg)
        binding.cardThemeWhite.setBackgroundColor(colors.cardBg)
        binding.cardThemeOffWhite.setBackgroundColor(colors.cardBg)
        binding.cardThemeDark.setBackgroundColor(colors.cardBg)

        // Highlight active theme
        val activeBorder = colors.accentColor
        when (themeManager.currentTheme) {
            AppTheme.PURE_WHITE -> highlightThemeCard(binding.cardThemeWhite, activeBorder)
            AppTheme.OFF_WHITE -> highlightThemeCard(binding.cardThemeOffWhite, activeBorder)
            AppTheme.MIDNIGHT_DARK -> highlightThemeCard(binding.cardThemeDark, activeBorder)
        }

        binding.btnBack.setColorFilter(if (colors.isDark) Color.WHITE else Color.parseColor("#0F172A"))
    }

    private fun highlightThemeCard(view: android.view.View, color: Int) {
        val drawable = android.graphics.drawable.GradientDrawable().apply {
            cornerRadius = 28f
            setStroke(4, color)
            setColor(themeManager.getColors().cardBg)
        }
        view.background = drawable
    }

    private fun populateData() {
        val isMuted = prefs.getBoolean("is_sound_muted", false)
        val isVibration = prefs.getBoolean("is_vibration_enabled", true)

        binding.switchSound.isChecked = !isMuted
        binding.switchVibration.isChecked = isVibration

        binding.tvPlayerIdDisplay.text = "Player ID: ${progressManager.playerId} (${if (progressManager.isGuest) "Guest" else "Synced"})"
        binding.tvCoinsDisplay.text = "🪙 Total Wallet: ${progressManager.totalCoins} Coins"
    }

    private fun setupListeners() {
        binding.switchSound.setOnCheckedChangeListener { _, isChecked ->
            prefs.edit().putBoolean("is_sound_muted", !isChecked).apply()
        }

        binding.switchVibration.setOnCheckedChangeListener { _, isChecked ->
            prefs.edit().putBoolean("is_vibration_enabled", isChecked).apply()
        }

        // Theme Click Listeners
        binding.cardThemeWhite.setOnClickListener {
            themeManager.currentTheme = AppTheme.PURE_WHITE
            applyTheme()
            Toast.makeText(this, "☀️ Pure White Theme Activated", Toast.LENGTH_SHORT).show()
        }

        binding.cardThemeOffWhite.setOnClickListener {
            themeManager.currentTheme = AppTheme.OFF_WHITE
            applyTheme()
            Toast.makeText(this, "🍦 Soft Warm Theme Activated", Toast.LENGTH_SHORT).show()
        }

        binding.cardThemeDark.setOnClickListener {
            themeManager.currentTheme = AppTheme.MIDNIGHT_DARK
            applyTheme()
            Toast.makeText(this, "🌙 Midnight Dark Theme Activated", Toast.LENGTH_SHORT).show()
        }

        binding.btnClearCache.setOnClickListener {
            cacheManager.clearAllCache()
            Toast.makeText(this, "✅ Offline game cache cleared!", Toast.LENGTH_SHORT).show()
        }
    }
}
