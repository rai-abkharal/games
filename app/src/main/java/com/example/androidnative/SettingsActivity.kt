package com.example.androidnative

import android.content.Context
import android.content.SharedPreferences
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.View
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
        val closeSettings = {
            finish()
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
        }
        binding.btnBack.setOnClickListener { closeSettings() }
        binding.btnDoneTop.setOnClickListener { closeSettings() }
        binding.btnConfirmDone.setOnClickListener { closeSettings() }
    }

    private fun applyTheme() {
        val colors = themeManager.getColors()
        val density = resources.displayMetrics.density

        // Root Background
        binding.settingsRoot.setBackgroundColor(colors.bgColor)

        // Text Colors
        binding.tvToolbarTitle.setTextColor(colors.textColorPrimary)
        binding.tvToolbarSubtitle.setTextColor(colors.textColorSecondary)
        binding.tvProfileHeader.setTextColor(colors.textColorSecondary)
        binding.tvAudioHeader.setTextColor(colors.textColorSecondary)
        binding.tvThemeHeader.setTextColor(colors.textColorSecondary)
        binding.tvStorageHeader.setTextColor(colors.textColorSecondary)

        binding.tvPlayerIdDisplay.setTextColor(colors.textColorPrimary)
        binding.tvCoinsHint.setTextColor(colors.textColorSecondary)

        binding.tvSoundLabel.setTextColor(colors.textColorPrimary)
        binding.tvSoundSub.setTextColor(colors.textColorSecondary)
        binding.tvVibLabel.setTextColor(colors.textColorPrimary)
        binding.tvVibSub.setTextColor(colors.textColorSecondary)

        binding.tvStorageTitle.setTextColor(colors.textColorPrimary)
        binding.tvStorageSub.setTextColor(colors.textColorSecondary)

        binding.tvThemeWhite.setTextColor(colors.textColorPrimary)
        binding.tvThemeWarm.setTextColor(colors.textColorPrimary)
        binding.tvThemeDark.setTextColor(colors.textColorPrimary)

        // Dividers & Borders
        val dividerColor = if (colors.isDark) Color.parseColor("#1E293B") else Color.parseColor("#E2E8F0")
        val cardBorderColor = if (colors.isDark) Color.parseColor("#334155") else Color.parseColor("#E2E8F0")
        binding.divProfile.setBackgroundColor(dividerColor)
        binding.divAudio.setBackgroundColor(dividerColor)

        // Rounded Cards with preserved corner radii
        styleCard(binding.cardProfile, colors.cardBg, cardBorderColor, 16f, 1)
        styleCard(binding.cardAudio, colors.cardBg, cardBorderColor, 16f, 1)
        styleCard(binding.cardStorage, colors.cardBg, cardBorderColor, 16f, 1)

        // Back Button & Done Top Button
        val backBg = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(if (colors.isDark) Color.parseColor("#1E293B") else Color.parseColor("#F1F5F9"))
            setStroke((1 * density).toInt(), cardBorderColor)
        }
        binding.btnBack.background = backBg
        binding.btnBack.setColorFilter(if (colors.isDark) Color.WHITE else Color.parseColor("#0F172A"))

        val doneTopBg = GradientDrawable().apply {
            cornerRadius = 16f * density
            setColor(if (colors.isDark) Color.parseColor("#1E293B") else Color.parseColor("#EEF2FF"))
            setStroke((1 * density).toInt(), if (colors.isDark) Color.parseColor("#334155") else Color.parseColor("#C7D2FE"))
        }
        binding.btnDoneTop.background = doneTopBg
        binding.btnDoneTop.setTextColor(colors.accentColor)

        // Primary Confirm Button
        val primaryBtnBg = GradientDrawable().apply {
            cornerRadius = 16f * density
            setColor(colors.accentColor)
        }
        binding.btnConfirmDone.background = primaryBtnBg

        // Clear Cache Danger Button
        val dangerBtnBg = GradientDrawable().apply {
            cornerRadius = 14f * density
            setColor(if (colors.isDark) Color.parseColor("#3B1717") else Color.parseColor("#FEF2F2"))
            setStroke((1 * density).toInt(), if (colors.isDark) Color.parseColor("#7F1D1D") else Color.parseColor("#FECACA"))
        }
        binding.btnClearCache.background = dangerBtnBg
        binding.btnClearCache.setTextColor(if (colors.isDark) Color.parseColor("#FCA5A5") else Color.parseColor("#DC2626"))

        // Status badge pill
        val statusBadgeBg = GradientDrawable().apply {
            cornerRadius = 10f * density
            setColor(if (colors.isDark) Color.parseColor("#1E293B") else Color.parseColor("#F1F5F9"))
            setStroke((1 * density).toInt(), if (colors.isDark) Color.parseColor("#334155") else Color.parseColor("#CBD5E1"))
        }
        binding.tvStatusBadge.background = statusBadgeBg

        // Switch thumb & track tinting
        val switchThumbColor = ColorStateList(
            arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf()),
            intArrayOf(colors.accentColor, if (colors.isDark) Color.parseColor("#64748B") else Color.parseColor("#CBD5E1"))
        )
        binding.switchSound.thumbTintList = switchThumbColor
        binding.switchVibration.thumbTintList = switchThumbColor

        // Theme Cards Highlighting
        updateThemeCardVisuals(colors.cardBg, cardBorderColor, colors.accentColor)
    }

    private fun styleCard(view: View, bgColor: Int, borderColor: Int, radiusDp: Float, strokeWidthDp: Int) {
        val density = resources.displayMetrics.density
        val drawable = GradientDrawable().apply {
            cornerRadius = radiusDp * density
            setColor(bgColor)
            if (strokeWidthDp > 0) {
                setStroke((strokeWidthDp * density).toInt(), borderColor)
            }
        }
        view.background = drawable
    }

    private fun updateThemeCardVisuals(cardBg: Int, normalBorder: Int, accentColor: Int) {
        val density = resources.displayMetrics.density
        val current = themeManager.currentTheme

        val setupThemeCard = { card: View, checkView: View, isSelected: Boolean ->
            val strokeColor = if (isSelected) accentColor else normalBorder
            val strokeWidth = if (isSelected) (2.5f * density).toInt() else (1f * density).toInt()
            val drawable = GradientDrawable().apply {
                cornerRadius = 16f * density
                setColor(cardBg)
                setStroke(strokeWidth, strokeColor)
            }
            card.background = drawable
            checkView.visibility = if (isSelected) View.VISIBLE else View.GONE
            if (isSelected) {
                val checkBg = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(accentColor)
                }
                checkView.background = checkBg
            }
        }

        setupThemeCard(binding.cardThemeWhite, binding.ivCheckWhite, current == AppTheme.PURE_WHITE)
        setupThemeCard(binding.cardThemeOffWhite, binding.ivCheckOffWhite, current == AppTheme.OFF_WHITE)
        setupThemeCard(binding.cardThemeDark, binding.ivCheckDark, current == AppTheme.MIDNIGHT_DARK)
    }

    private fun populateData() {
        val isMuted = prefs.getBoolean("is_sound_muted", false)
        val isVibration = prefs.getBoolean("is_vibration_enabled", true)

        binding.switchSound.isChecked = !isMuted
        binding.switchVibration.isChecked = isVibration

        val isGuest = progressManager.isGuest
        binding.tvPlayerIdDisplay.text = "Player: ${progressManager.playerId}"
        binding.tvStatusBadge.text = if (isGuest) "⚡ Guest Session" else "✓ Account Synced"
        binding.tvCoinsDisplay.text = "🪙 ${progressManager.totalCoins} Coins"
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
            if (themeManager.currentTheme != AppTheme.PURE_WHITE) {
                themeManager.currentTheme = AppTheme.PURE_WHITE
                applyTheme()
                Toast.makeText(this, "☀️ Pure White Theme Activated", Toast.LENGTH_SHORT).show()
            }
        }

        binding.cardThemeOffWhite.setOnClickListener {
            if (themeManager.currentTheme != AppTheme.OFF_WHITE) {
                themeManager.currentTheme = AppTheme.OFF_WHITE
                applyTheme()
                Toast.makeText(this, "🍦 Soft Warm Theme Activated", Toast.LENGTH_SHORT).show()
            }
        }

        binding.cardThemeDark.setOnClickListener {
            if (themeManager.currentTheme != AppTheme.MIDNIGHT_DARK) {
                themeManager.currentTheme = AppTheme.MIDNIGHT_DARK
                applyTheme()
                Toast.makeText(this, "🌙 Midnight Dark Theme Activated", Toast.LENGTH_SHORT).show()
            }
        }

        binding.btnClearCache.setOnClickListener {
            cacheManager.clearAllCache()
            Toast.makeText(this, "✅ Offline game cache cleared!", Toast.LENGTH_SHORT).show()
        }
    }
}
