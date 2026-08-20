package com.example.androidnative

import android.content.Context
import android.content.SharedPreferences
import android.content.res.ColorStateList
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.viewpager2.widget.ViewPager2
import com.example.androidnative.adapter.GameFeedAdapter
import com.example.androidnative.bridge.GameBridgeListener
import com.example.androidnative.cache.GameCacheManager
import com.example.androidnative.databinding.ActivityMainBinding
import com.example.androidnative.databinding.DialogGameOverBinding
import com.example.androidnative.databinding.DialogHintRewardBinding
import com.example.androidnative.databinding.DialogSettingsBinding
import com.example.androidnative.databinding.DialogSplashAuthBinding
import com.example.androidnative.manager.PlayerProgressManager
import com.example.androidnative.model.GameItem
import com.example.androidnative.repository.GameRepository
import com.example.androidnative.theme.AppTheme
import com.example.androidnative.theme.ThemeManager
import com.google.android.material.bottomsheet.BottomSheetDialog
import kotlinx.coroutines.launch

enum class FeedTab {
    ALL,
    TRENDING,
    FAVORITES
}

class MainActivity : AppCompatActivity(), GameBridgeListener {

    private lateinit var binding: ActivityMainBinding
    private lateinit var cacheManager: GameCacheManager
    private lateinit var repository: GameRepository
    private lateinit var adapter: GameFeedAdapter
    private lateinit var progressManager: PlayerProgressManager
    private lateinit var themeManager: ThemeManager
    private lateinit var prefs: SharedPreferences

    private var isMuted = false
    private var isVibrationEnabled = true
    private var currentTab = FeedTab.ALL
    private var fullGameList: List<GameItem> = emptyList()
    private var displayedGameList: List<GameItem> = emptyList()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        volumeControlStream = android.media.AudioManager.STREAM_MUSIC
        prefs = getSharedPreferences("minigames_user_prefs", Context.MODE_PRIVATE)
        isMuted = prefs.getBoolean("is_sound_muted", false)
        isVibrationEnabled = prefs.getBoolean("is_vibration_enabled", true)

        progressManager = PlayerProgressManager(this)
        themeManager = ThemeManager(this)
        cacheManager = GameCacheManager(this)
        repository = GameRepository(this)

        // Lock window to highest hardware refresh rate (90Hz / 120Hz / 144Hz)
        try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
                val display = this.display
                val modes = display?.supportedModes
                val maxMode = modes?.maxByOrNull { it.refreshRate }
                if (maxMode != null) {
                    val params = window.attributes
                    params.preferredDisplayModeId = maxMode.modeId
                    window.attributes = params
                }
            } else if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                val params = window.attributes
                params.preferredRefreshRate = 120f
                window.attributes = params
            }
        } catch (_: Exception) {}

        applyTheme()
        setupViewPager()
        setupInGameHud()
        setupBottomNav()
        loadCatalog()

        // Check if first launch for Splash / Onboarding
        if (!prefs.getBoolean("has_onboarded", false)) {
            showSplashAuthDialog()
        }
    }

    private fun applyTheme() {
        val colors = themeManager.getColors()

        binding.rootLayout.setBackgroundColor(colors.bgColor)
        binding.tvPlayerName.setTextColor(colors.textColorPrimary)
        binding.tvGameTitle.setTextColor(colors.textColorPrimary)
        binding.tvGameMeta.setTextColor(colors.textColorSecondary)

        // Seamless Banner Ad Container matching theme
        val bannerDrawable = GradientDrawable().apply {
            cornerRadius = 24f
            setColor(colors.bannerBg)
        }
        binding.bannerAdContainer.background = bannerDrawable

        // Bottom Navigation Bar background
        val navDrawable = GradientDrawable().apply {
            cornerRadius = 56f
            setColor(colors.navBg)
            setStroke(2, if (colors.isDark) android.graphics.Color.parseColor("#334155") else android.graphics.Color.parseColor("#E2E8F0"))
        }
        binding.bottomNavBar.background = navDrawable

        updateNavTabVisuals()
        updateHudButtonsTheme()
        updateCoinsDisplay()
    }

    private fun setupViewPager() {
        adapter = GameFeedAdapter(this, cacheManager, this)
        adapter.setSoundMuted(isMuted)

        binding.viewPager.apply {
            orientation = ViewPager2.ORIENTATION_VERTICAL
            adapter = this@MainActivity.adapter
            offscreenPageLimit = 1

            registerOnPageChangeCallback(object : ViewPager2.OnPageChangeCallback() {
                override fun onPageSelected(position: Int) {
                    super.onPageSelected(position)
                    this@MainActivity.adapter.handlePageSelected(position)
                    updateTopBarForGame(position)
                    
                    val game = this@MainActivity.adapter.getGame(position)
                    if (game != null) {
                        val savedLevel = progressManager.getSavedLevel(game.id)
                        val highScore = progressManager.getHighScore(game.id)
                        this@MainActivity.adapter.sendSavedStateToGame(position, savedLevel, progressManager.totalCoins, highScore)
                    }

                    // Predictive background pre-download
                    cacheManager.preloadUpcomingGames(position, displayedGameList, lifecycleScope)
                }
            })
        }
    }

    private fun setupInGameHud() {
        updateSoundIcon()

        // 1. Favorite Button
        binding.btnFavorite.setOnClickListener {
            val currentPos = binding.viewPager.currentItem
            val game = adapter.getGame(currentPos) ?: return@setOnClickListener
            val isFav = progressManager.toggleFavorite(game.id)
            updateFavoriteButton(isFav)
            val msg = if (isFav) "❤️ Added \"${game.title}\" to Favorites!" else "Removed from Favorites"
            Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()

            if (currentTab == FeedTab.FAVORITES) {
                filterGamesByTab(FeedTab.FAVORITES)
            }
        }

        // 2. Hint / Rewarded Ad Button
        binding.btnHint.setOnClickListener {
            showHintRewardDialog("game_hint")
        }

        // 3. Sound Toggle Button
        binding.btnSound.setOnClickListener {
            isMuted = !isMuted
            prefs.edit().putBoolean("is_sound_muted", isMuted).apply()
            adapter.setSoundMuted(isMuted)
            updateSoundIcon()
        }

        // 4. Restart Button
        binding.btnRestart.setOnClickListener {
            val currentPos = binding.viewPager.currentItem
            adapter.restartCurrentGame(currentPos)
        }
    }

    private fun setupBottomNav() {
        binding.navAllGames.setOnClickListener {
            filterGamesByTab(FeedTab.ALL)
        }

        binding.navTrending.setOnClickListener {
            filterGamesByTab(FeedTab.TRENDING)
        }

        binding.navFavorites.setOnClickListener {
            filterGamesByTab(FeedTab.FAVORITES)
        }

        binding.navSettings.setOnClickListener {
            showSettingsDialog()
        }
    }

    private fun filterGamesByTab(tab: FeedTab) {
        currentTab = tab
        updateNavTabVisuals()

        displayedGameList = when (tab) {
            FeedTab.ALL -> fullGameList
            FeedTab.TRENDING -> fullGameList.sortedByDescending { it.feedOrder }
            FeedTab.FAVORITES -> {
                val favIds = progressManager.getFavoriteGameIds()
                val favs = fullGameList.filter { favIds.contains(it.id) }
                if (favs.isEmpty()) {
                    Toast.makeText(this, "⭐ Tap the Heart ❤️ on any game to add it to Favorites!", Toast.LENGTH_LONG).show()
                }
                favs
            }
        }

        adapter.setGames(displayedGameList)
        if (displayedGameList.isNotEmpty()) {
            binding.viewPager.setCurrentItem(0, false)
            updateTopBarForGame(0)
        }
    }

    private fun updateNavTabVisuals() {
        val colors = themeManager.getColors()
        val activeColor = colors.accentColor
        val inactiveColor = if (colors.isDark) android.graphics.Color.parseColor("#64748B") else android.graphics.Color.parseColor("#94A3B8")

        binding.ivNavAll.imageTintList = ColorStateList.valueOf(if (currentTab == FeedTab.ALL) activeColor else inactiveColor)
        binding.tvNavAll.setTextColor(if (currentTab == FeedTab.ALL) activeColor else inactiveColor)

        binding.ivNavTrending.imageTintList = ColorStateList.valueOf(if (currentTab == FeedTab.TRENDING) activeColor else inactiveColor)
        binding.tvNavTrending.setTextColor(if (currentTab == FeedTab.TRENDING) activeColor else inactiveColor)

        binding.ivNavFav.imageTintList = ColorStateList.valueOf(if (currentTab == FeedTab.FAVORITES) activeColor else inactiveColor)
        binding.tvNavFav.setTextColor(if (currentTab == FeedTab.FAVORITES) activeColor else inactiveColor)
    }

    private fun updateHudButtonsTheme() {
        val colors = themeManager.getColors()
        val btnTint = if (colors.isDark) android.graphics.Color.parseColor("#F8FAFC") else android.graphics.Color.parseColor("#0F172A")
        
        binding.btnSound.imageTintList = ColorStateList.valueOf(btnTint)
        binding.btnRestart.imageTintList = ColorStateList.valueOf(btnTint)
    }

    private fun updateSoundIcon() {
        if (isMuted) {
            binding.btnSound.setImageResource(android.R.drawable.ic_lock_silent_mode)
            binding.btnSound.setColorFilter(getColor(android.R.color.holo_red_dark))
        } else {
            binding.btnSound.setImageResource(android.R.drawable.ic_lock_silent_mode_off)
            val colors = themeManager.getColors()
            binding.btnSound.setColorFilter(if (colors.isDark) android.graphics.Color.WHITE else android.graphics.Color.BLACK)
        }
    }

    private fun updateFavoriteButton(isFavorite: Boolean) {
        if (isFavorite) {
            binding.btnFavorite.setImageResource(R.drawable.ic_heart_filled)
            binding.btnFavorite.imageTintList = null
        } else {
            binding.btnFavorite.setImageResource(R.drawable.ic_heart)
            val colors = themeManager.getColors()
            val tint = if (colors.isDark) android.graphics.Color.parseColor("#94A3B8") else android.graphics.Color.parseColor("#64748B")
            binding.btnFavorite.imageTintList = ColorStateList.valueOf(tint)
        }
    }

    private fun updateCoinsDisplay() {
        binding.tvPlayerName.text = progressManager.playerId
        binding.tvTotalCoins.text = "🪙 ${progressManager.totalCoins}"
    }

    private fun updateTopBarForGame(position: Int) {
        val game = adapter.getGame(position) ?: return
        binding.tvGameTitle.text = game.title
        binding.tvGameMeta.text = "${position + 1} of ${displayedGameList.size} • ${game.category}"

        updateFavoriteButton(progressManager.isFavorite(game.id))
        updateCoinsDisplay()

        val highScore = progressManager.getHighScore(game.id)
        if (highScore > 0) {
            binding.tvHighScore.visibility = View.VISIBLE
            binding.tvHighScore.text = "🏆 $highScore"
        } else {
            binding.tvHighScore.visibility = View.GONE
        }
    }

    private fun loadCatalog() {
        binding.progressBar.visibility = View.VISIBLE
        lifecycleScope.launch {
            fullGameList = repository.fetchCatalog()
            binding.progressBar.visibility = View.GONE
            filterGamesByTab(FeedTab.ALL)
            if (displayedGameList.isNotEmpty()) {
                updateTopBarForGame(0)
                cacheManager.preloadUpcomingGames(0, displayedGameList, lifecycleScope)
            }
        }
    }

    private fun showSplashAuthDialog() {
        val dialog = BottomSheetDialog(this)
        val dialogBinding = DialogSplashAuthBinding.inflate(layoutInflater)
        dialog.setContentView(dialogBinding.root)
        dialog.setCancelable(false)

        dialogBinding.btnPlayAsGuest.setOnClickListener {
            prefs.edit().putBoolean("has_onboarded", true).apply()
            progressManager.isGuest = true
            updateCoinsDisplay()
            dialog.dismiss()
            Toast.makeText(this, "Welcome ${progressManager.playerId}! Enjoy 120 FPS games.", Toast.LENGTH_SHORT).show()
        }

        dialogBinding.btnLoginSync.setOnClickListener {
            prefs.edit().putBoolean("has_onboarded", true).apply()
            progressManager.isGuest = false
            updateCoinsDisplay()
            dialog.dismiss()
            Toast.makeText(this, "Logged in as ${progressManager.playerId}. Progress is backed up!", Toast.LENGTH_SHORT).show()
        }

        dialog.show()
    }

    private fun showSettingsDialog() {
        val dialog = BottomSheetDialog(this)
        val dialogBinding = DialogSettingsBinding.inflate(layoutInflater)
        dialog.setContentView(dialogBinding.root)

        dialogBinding.tvAccountId.text = "Account: ${progressManager.playerId} (${if (progressManager.isGuest) "Guest" else "Synced"})"
        dialogBinding.switchSound.isChecked = !isMuted
        dialogBinding.switchVibration.isChecked = isVibrationEnabled

        dialogBinding.switchSound.setOnCheckedChangeListener { _, isChecked ->
            isMuted = !isChecked
            prefs.edit().putBoolean("is_sound_muted", isMuted).apply()
            adapter.setSoundMuted(isMuted)
            updateSoundIcon()
        }

        dialogBinding.switchVibration.setOnCheckedChangeListener { _, isChecked ->
            isVibrationEnabled = isChecked
            prefs.edit().putBoolean("is_vibration_enabled", isVibrationEnabled).apply()
        }

        // Theme Switchers
        dialogBinding.cardThemeWhite.setOnClickListener {
            themeManager.currentTheme = AppTheme.PURE_WHITE
            applyTheme()
            dialog.dismiss()
        }

        dialogBinding.cardThemeOffWhite.setOnClickListener {
            themeManager.currentTheme = AppTheme.OFF_WHITE
            applyTheme()
            dialog.dismiss()
        }

        dialogBinding.cardThemeDark.setOnClickListener {
            themeManager.currentTheme = AppTheme.MIDNIGHT_DARK
            applyTheme()
            dialog.dismiss()
        }

        dialogBinding.btnClearCache.setOnClickListener {
            cacheManager.clearAllCache()
            Toast.makeText(this, "Offline game cache cleared successfully!", Toast.LENGTH_SHORT).show()
            dialog.dismiss()
        }

        dialog.show()
    }

    private fun showHintRewardDialog(action: String) {
        val dialog = BottomSheetDialog(this)
        val dialogBinding = DialogHintRewardBinding.inflate(layoutInflater)
        dialog.setContentView(dialogBinding.root)

        dialogBinding.btnWatchAd.setOnClickListener {
            dialog.dismiss()
            // Simulate AdMob Rewarded Video completion
            val earnedCoins = 50
            progressManager.addCoins(earnedCoins)
            updateCoinsDisplay()

            val currentPos = binding.viewPager.currentItem
            adapter.grantRewardToCurrentGame(currentPos, action)

            Toast.makeText(this, "🎉 Reward Granted! +$earnedCoins 🪙 Coins & Hint Unlocked!", Toast.LENGTH_LONG).show()
        }

        dialogBinding.btnCancelReward.setOnClickListener {
            dialog.dismiss()
        }

        dialog.show()
    }

    // Bridge Event Callbacks
    override fun onGameStarted() {}

    override fun onGameOver(score: Int, stats: String) {
        runOnUiThread {
            val currentPos = binding.viewPager.currentItem
            val game = adapter.getGame(currentPos)
            if (game != null) {
                progressManager.saveHighScore(game.id, score)
                progressManager.addCoins(score / 10) // 1 coin per 10 points!
                updateTopBarForGame(currentPos)
            }
            showGameOverDialog(score)
        }
    }

    override fun onGameCompleted(score: Int, level: Int) {
        runOnUiThread {
            val currentPos = binding.viewPager.currentItem
            val game = adapter.getGame(currentPos)
            if (game != null) {
                progressManager.saveHighScore(game.id, score)
                progressManager.saveLevel(game.id, level + 1)
                progressManager.addCoins(50) // 50 coins on level completion!
                updateTopBarForGame(currentPos)
            }
            showGameOverDialog(score)
        }
    }

    override fun onCoinsEarned(amount: Int) {
        runOnUiThread {
            progressManager.addCoins(amount)
            updateCoinsDisplay()
            Toast.makeText(this, "+$amount 🪙 Coins Earned!", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onRequestHint(action: String) {
        runOnUiThread {
            showHintRewardDialog(action)
        }
    }

    override fun onSaveLevelState(level: Int) {
        val currentPos = binding.viewPager.currentItem
        val game = adapter.getGame(currentPos) ?: return
        progressManager.saveLevel(game.id, level)
    }

    override fun onRequestRewardedAd(rewardType: String) {
        runOnUiThread {
            showHintRewardDialog(rewardType)
        }
    }

    override fun onSetSwipeEnabled(enabled: Boolean) {
        runOnUiThread {
            binding.viewPager.isUserInputEnabled = enabled
        }
    }

    private fun showGameOverDialog(score: Int) {
        val currentPos = binding.viewPager.currentItem
        val game = adapter.getGame(currentPos) ?: return

        val dialog = BottomSheetDialog(this)
        val dialogBinding = DialogGameOverBinding.inflate(layoutInflater)
        dialog.setContentView(dialogBinding.root)

        val best = progressManager.getHighScore(game.id)
        dialogBinding.tvGameOverScore.text = "$score PTS"
        dialogBinding.tvGameOverHighScore.text = "Best: $best PTS"

        dialogBinding.btnPlayAgain.setOnClickListener {
            dialog.dismiss()
            adapter.restartCurrentGame(currentPos)
        }

        dialogBinding.btnNextGame.setOnClickListener {
            dialog.dismiss()
            if (currentPos + 1 < displayedGameList.size) {
                binding.viewPager.setCurrentItem(currentPos + 1, true)
            }
        }

        dialog.show()
    }

    override fun onPause() {
        super.onPause()
        adapter.pauseAll()
    }

    override fun onResume() {
        super.onResume()
        adapter.resumeCurrent()
        updateCoinsDisplay()
    }
}