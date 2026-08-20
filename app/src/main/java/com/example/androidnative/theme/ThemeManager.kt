package com.example.androidnative.theme

import android.content.Context
import android.content.SharedPreferences
import android.graphics.Color

enum class AppTheme(val id: String, val displayName: String) {
    PURE_WHITE("pure_white", "Pure White"),
    OFF_WHITE("off_white", "Soft Warm (Off-White)"),
    MIDNIGHT_DARK("midnight_dark", "Midnight Dark")
}

data class ThemeColors(
    val bgColor: Int,
    val cardBg: Int,
    val textColorPrimary: Int,
    val textColorSecondary: Int,
    val accentColor: Int,
    val navBg: Int,
    val bannerBg: Int,
    val isDark: Boolean
)

class ThemeManager(context: Context) {

    private val prefs: SharedPreferences = context.getSharedPreferences("minigames_theme_prefs", Context.MODE_PRIVATE)

    var currentTheme: AppTheme
        get() {
            val savedId = prefs.getString("selected_theme_id", AppTheme.PURE_WHITE.id)
            return AppTheme.values().find { it.id == savedId } ?: AppTheme.PURE_WHITE
        }
        set(value) = prefs.edit().putString("selected_theme_id", value.id).apply()

    fun getColors(): ThemeColors {
        return when (currentTheme) {
            AppTheme.PURE_WHITE -> ThemeColors(
                bgColor = Color.parseColor("#FFFFFF"),
                cardBg = Color.parseColor("#F8FAFC"),
                textColorPrimary = Color.parseColor("#0F172A"),
                textColorSecondary = Color.parseColor("#64748B"),
                accentColor = Color.parseColor("#6366F1"),
                navBg = Color.parseColor("#FFFFFF"),
                bannerBg = Color.parseColor("#F1F5F9"),
                isDark = false
            )
            AppTheme.OFF_WHITE -> ThemeColors(
                bgColor = Color.parseColor("#F8F6F0"),
                cardBg = Color.parseColor("#EFECE6"),
                textColorPrimary = Color.parseColor("#1E293B"),
                textColorSecondary = Color.parseColor("#475569"),
                accentColor = Color.parseColor("#D97706"),
                navBg = Color.parseColor("#F8F6F0"),
                bannerBg = Color.parseColor("#EAE6DE"),
                isDark = false
            )
            AppTheme.MIDNIGHT_DARK -> ThemeColors(
                bgColor = Color.parseColor("#0F172A"),
                cardBg = Color.parseColor("#1E293B"),
                textColorPrimary = Color.parseColor("#F8FAFC"),
                textColorSecondary = Color.parseColor("#94A3B8"),
                accentColor = Color.parseColor("#38BDF8"),
                navBg = Color.parseColor("#0B1120"),
                bannerBg = Color.parseColor("#1E293B"),
                isDark = true
            )
        }
    }
}
