package com.example.androidnative

import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.viewpager2.widget.ViewPager2
import android.view.animation.DecelerateInterpolator
import com.example.androidnative.adapter.GameFeedAdapter
import com.example.androidnative.bridge.GameBridgeListener
import com.example.androidnative.cache.GameCacheManager
import com.example.androidnative.databinding.ActivityMainBinding
import com.example.androidnative.databinding.DialogGameOverBinding
import com.example.androidnative.manager.GameAnalyticsManager
import com.example.androidnative.manager.PlayerProgressManager
import com.example.androidnative.model.GameItem
import com.example.androidnative.repository.GameRepository
import com.example.androidnative.theme.ThemeManager
import com.google.android.gms.ads.AdError
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.AdSize
import com.google.android.gms.ads.AdView
import com.google.android.gms.ads.FullScreenContentCallback
import com.google.android.gms.ads.LoadAdError
import com.google.android.gms.ads.MobileAds
import com.google.android.gms.ads.interstitial.InterstitialAd
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback
import com.google.android.gms.ads.rewarded.RewardedAd
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback
import com.google.android.material.bottomsheet.BottomSheetDialog
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit

enum class FeedTab {
    ALL,
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
    private lateinit var analyticsManager: GameAnalyticsManager

    private var currentTab = FeedTab.ALL
    private var fullGameList: List<GameItem> = emptyList()
    private var displayedGameList: List<GameItem> = emptyList()
    private var catalogRefreshJob: Job? = null
    private var lastCatalogRefreshAtMs = 0L

    // Bottom Bar Animation & 5-Second Inactivity State
    private var isBottomBarVisible = true
    private val bottomBarHandler = Handler(Looper.getMainLooper())
    private val autoHideBottomBarRunnable = Runnable {
        toggleBottomBar(false, animate = true)
    }

    // Ads State & Remote Configuration
    private var adView: AdView? = null
    private var interstitialAd: InterstitialAd? = null
    private var isInterstitialLoading = false
    private var rewardedAd: RewardedAd? = null
    private var swipeCount = 0
    private var lastAdShowTimeMs = 0L

    private var bannerEnabled = true
    private var interstitialEnabled = true
    private var swipeInterval = 10
    private var levelCompleteAd = true
    private var levelWinInterval = 2
    private var levelWinCount = 0
    private var gameOverAdEnabled = true
    private var cooldownSeconds = 60
    private var defaultIntervalMinutes = 5
    private var isAdDue = false
    private var bannerUnitId = "ca-app-pub-3940256099942544/6300978111" // Google Test Banner
    private var interstitialUnitId = "ca-app-pub-3940256099942544/1033173712" // Google Test Interstitial
    private var rewardedUnitId = "ca-app-pub-3940256099942544/5224354917" // Google Test Rewarded

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        volumeControlStream = android.media.AudioManager.STREAM_MUSIC
        prefs = getSharedPreferences("minigames_user_prefs", Context.MODE_PRIVATE)

        progressManager = PlayerProgressManager(this)
        themeManager = ThemeManager(this)
        cacheManager = GameCacheManager(this)
        repository = GameRepository(this)
        analyticsManager = GameAnalyticsManager(this)

        // Restore configured ad interval and timestamp from persistent storage
        defaultIntervalMinutes = prefs.getInt("remote_default_interval_minutes", 5)
        val savedAdTime = prefs.getLong("last_interstitial_show_time", 0L)
        val startupNow = System.currentTimeMillis()
        lastAdShowTimeMs = if (savedAdTime > 0L && (startupNow - savedAdTime) < (defaultIntervalMinutes * 60 * 1000L)) {
            savedAdTime
        } else {
            startupNow
        }
        prefs.edit().putLong("last_interstitial_show_time", lastAdShowTimeMs).apply()

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

        // Initialize Google Mobile Ads SDK
        MobileAds.initialize(this) {}

        applyTheme()
        setupViewPager()
        setupLikeControl()
        setupBottomNav()
        loadCatalog()
        fetchRemoteAdsConfig()
        startSmartAdCheckTimer()

        // Initially display the bottom bar and auto-hide after 5 seconds of inactivity
        binding.rootLayout.post {
            toggleBottomBar(true, animate = false)
        }
    }

    private fun applyTheme() {
        val colors = themeManager.getColors()

        binding.rootLayout.setBackgroundColor(colors.bgColor)
        // The HUD floats above active games, so its labels stay crisp over both
        // light and dark game scenes instead of inheriting a page background.
        binding.tvPlayerName.setTextColor(Color.parseColor("#F8FAFC"))
        binding.tvGameTitle.setTextColor(Color.parseColor("#F8FAFC"))
        binding.tvGameMeta.setTextColor(Color.parseColor("#BFDBFE"))

        // Seamless Banner Ad Container matching theme
        val bannerDrawable = GradientDrawable().apply {
            cornerRadius = 16f
            setColor(Color.argb(
                if (colors.isDark) 82 else 64,
                Color.red(colors.bannerBg),
                Color.green(colors.bannerBg),
                Color.blue(colors.bannerBg)
            ))
            setStroke(1, Color.argb(110, 191, 227, 255))
        }
        binding.bannerAdContainer.background = bannerDrawable

        binding.topBar.setBackgroundResource(
            if (colors.isDark) R.drawable.bg_top_bar_glass_dark else R.drawable.bg_top_bar_glass
        )

        // The game continues below this translucent floating dock.
        binding.bottomNavBar.setBackgroundResource(
            if (colors.isDark) R.drawable.bg_nav_bar_dark else R.drawable.bg_nav_bar
        )

        updateNavTabVisuals()
        if (::adapter.isInitialized) {
            adapter.getGame(binding.viewPager.currentItem)?.let { game ->
                updateFavoriteButton(progressManager.isFavorite(game.id))
            }
        }
        updateCoinsDisplay()
    }

    private fun setupViewPager() {
        adapter = GameFeedAdapter(this, cacheManager, this)
        val isMuted = prefs.getBoolean("is_sound_muted", false)
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

                    // Ensure bottom bar is visible when switching games and reset 5-second timer
                    toggleBottomBar(true, animate = true)

                    val game = this@MainActivity.adapter.getGame(position)
                    if (game != null) {
                        progressManager.lastPlayedGameId = game.id
                        analyticsManager.onGameStart(game.id, game.title)

                        val savedLevel = progressManager.getSavedLevel(game.id)
                        val highScore = progressManager.getHighScore(game.id)
                        this@MainActivity.adapter.sendSavedStateToGame(position, savedLevel, progressManager.totalCoins, highScore)
                    }

                    // Swipe Count Tracking & Smart Ad Timing
                    swipeCount++
                    checkAndShowInterstitialAd(specificGame = game)

                    // Predictive background pre-download
                    cacheManager.preloadUpcomingGames(position, displayedGameList, lifecycleScope)
                }
            })
        }
    }

    private fun setupLikeControl() {
        // The Like control lives inside the floating bottom dock.
        binding.navLike.setOnClickListener {
            resetAutoHideTimer()
            val currentPos = binding.viewPager.currentItem
            val game = this@MainActivity.adapter.getGame(currentPos) ?: return@setOnClickListener
            val isFav = progressManager.toggleFavorite(game.id)
            updateFavoriteButton(isFav)
            val msg = if (isFav) "❤️ Added \"${game.title}\" to Favorites!" else "Removed from Favorites"
            Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()

            if (currentTab == FeedTab.FAVORITES) {
                filterGamesByTab(FeedTab.FAVORITES)
            }
        }
    }

    private fun setupBottomNav() {
        binding.navAllGames.setOnClickListener {
            resetAutoHideTimer()
            filterGamesByTab(FeedTab.ALL)
        }

        binding.navFavorites.setOnClickListener {
            resetAutoHideTimer()
            filterGamesByTab(FeedTab.FAVORITES)
        }

        binding.navSettings.setOnClickListener {
            resetAutoHideTimer()
            checkAndShowInterstitialAd()
            startActivity(Intent(this, SettingsActivity::class.java))
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
        }

        binding.bottomBarToggleHandle.setOnClickListener {
            toggleBottomBar(!isBottomBarVisible, animate = true)
        }
    }

    private fun filterGamesByTab(tab: FeedTab, preferredGameId: String? = null) {
        currentTab = tab
        updateNavTabVisuals()

        displayedGameList = when (tab) {
            FeedTab.ALL -> fullGameList
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
            val savedLastId = progressManager.lastPlayedGameId
            val targetGameId = preferredGameId ?: savedLastId
            val targetActualIndex = targetGameId
                ?.let { id -> displayedGameList.indexOfFirst { it.id == id } }
                ?.takeIf { it >= 0 }
                ?: 0

            val initialVirtualPos = adapter.getInitialVirtualPosition(targetActualIndex)
            binding.viewPager.setCurrentItem(initialVirtualPos, false)
            updateTopBarForGame(initialVirtualPos)

            // Register initial game session in analytics immediately on load
            adapter.getGame(initialVirtualPos)?.let { initialGame ->
                progressManager.lastPlayedGameId = initialGame.id
                analyticsManager.onGameStart(initialGame.id, initialGame.title)
            }
        }
    }

    private fun updateNavTabVisuals() {
        val colors = themeManager.getColors()
        val activeColor = colors.accentColor
        val inactiveColor = if (colors.isDark) Color.parseColor("#BFDBFE") else Color.parseColor("#D6E9FF")

        binding.ivNavAll.imageTintList = ColorStateList.valueOf(if (currentTab == FeedTab.ALL) activeColor else inactiveColor)
        binding.tvNavAll.setTextColor(if (currentTab == FeedTab.ALL) activeColor else inactiveColor)

        binding.ivNavFav.imageTintList = ColorStateList.valueOf(if (currentTab == FeedTab.FAVORITES) activeColor else inactiveColor)
        binding.tvNavFav.setTextColor(if (currentTab == FeedTab.FAVORITES) activeColor else inactiveColor)

        binding.ivNavSettings.imageTintList = ColorStateList.valueOf(inactiveColor)
        binding.tvNavSettings.setTextColor(inactiveColor)
    }

    private fun updateFavoriteButton(isFavorite: Boolean) {
        if (isFavorite) {
            binding.btnFavorite.setImageResource(R.drawable.ic_heart_filled)
            binding.btnFavorite.imageTintList = null
            binding.tvNavLike.setTextColor(Color.parseColor("#EF4444"))
        } else {
            binding.btnFavorite.setImageResource(R.drawable.ic_heart)
            val colors = themeManager.getColors()
            val tint = if (colors.isDark) Color.parseColor("#BFDBFE") else Color.parseColor("#D6E9FF")
            binding.btnFavorite.imageTintList = ColorStateList.valueOf(tint)
            binding.tvNavLike.setTextColor(tint)
        }
    }

    private fun updateCoinsDisplay() {
        binding.tvPlayerName.text = progressManager.playerId
        binding.tvTotalCoins.text = "🪙 ${progressManager.totalCoins}"
    }

    private fun updateTopBarForGame(position: Int) {
        val game = this@MainActivity.adapter.getGame(position) ?: return
        val actualIndex = this@MainActivity.adapter.getActualIndex(position)
        val actualCount = this@MainActivity.adapter.getActualCount()
        binding.tvGameTitle.text = game.title
        binding.tvGameMeta.text = "${actualIndex + 1} of $actualCount • ${game.category}"

        updateFavoriteButton(progressManager.isFavorite(game.id))
        updateCoinsDisplay()

        // High Score
        val highScore = progressManager.getHighScore(game.id)
        if (highScore > 0) {
            binding.tvHighScore.visibility = View.VISIBLE
            binding.tvHighScore.text = "🏆 $highScore"
        } else {
            binding.tvHighScore.visibility = View.GONE
        }
    }

    private fun loadCatalog() {
        // 1. Instant Zero-Latency Render from persistent local storage
        val cached = repository.getCachedCatalog()
        if (cached != null && cached.isNotEmpty()) {
            fullGameList = cached
            filterGamesByTab(currentTab)
            binding.progressBar.visibility = View.GONE
            updateTopBarForGame(binding.viewPager.currentItem)
        } else {
            binding.progressBar.visibility = View.VISIBLE
        }

        // 2. Background Live Server Fetch (Updates catalog and syncs any new/updated games)
        refreshCatalogFromServer(force = true)
    }

    private fun refreshCatalogFromServer(force: Boolean = false) {
        val now = System.currentTimeMillis()
        if (!force && now - lastCatalogRefreshAtMs < 30_000L) return
        if (catalogRefreshJob?.isActive == true) return

        lastCatalogRefreshAtMs = now
        catalogRefreshJob = lifecycleScope.launch {
            val currentGameId = adapter.getGame(binding.viewPager.currentItem)?.id
            val liveCatalog = repository.fetchCatalog()
            binding.progressBar.visibility = View.GONE
            if (liveCatalog.isNotEmpty() && liveCatalog != fullGameList) {
                fullGameList = liveCatalog
                filterGamesByTab(currentTab, currentGameId)
            }
        }
    }

    // Remote Ads Configuration & AdMob Loaders
    private fun fetchRemoteAdsConfig() {
        lifecycleScope.launch(Dispatchers.IO) {
            val candidateBases = listOf(
                GameRepository.getActiveBaseUrl(this@MainActivity),
                GameRepository.BASE_URL,
                "http://${GameRepository.PRIMARY_HOST}:3000",
                "http://${GameRepository.PRIMARY_HOST}",
                "http://10.0.2.2:3000"
            ).distinct()

            for (base in candidateBases) {
                try {
                    val client = OkHttpClient.Builder().connectTimeout(4, TimeUnit.SECONDS).build()
                    val request = Request.Builder().url("$base/api/ads/config").build()
                    val response = client.newCall(request).execute()
                    if (response.isSuccessful) {
                        val body = response.body?.string()
                        if (body != null) {
                            val json = JSONObject(body)
                            bannerEnabled = json.optBoolean("bannerEnabled", true)
                            interstitialEnabled = json.optBoolean("interstitialEnabled", true)
                            swipeInterval = json.optInt("swipeInterval", 10)
                            levelCompleteAd = json.optBoolean("levelCompleteAd", true)
                            levelWinInterval = json.optInt("levelWinInterval", 2)
                            gameOverAdEnabled = json.optBoolean("gameOverAdEnabled", true)
                            cooldownSeconds = json.optInt("cooldownSeconds", 60)
                            defaultIntervalMinutes = json.optInt("defaultIntervalMinutes", 5)
                            prefs.edit().putInt("remote_default_interval_minutes", defaultIntervalMinutes).apply()

                            // For Debug builds, always preserve official Google test ad unit IDs
                            val isDebuggable = (applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0
                            if (!isDebuggable) {
                                bannerUnitId = json.optString("bannerUnitId", bannerUnitId)
                                interstitialUnitId = json.optString("interstitialUnitId", interstitialUnitId)
                                rewardedUnitId = json.optString("rewardedUnitId", rewardedUnitId)
                            }
                            break
                        }
                    }
                } catch (_: Exception) {}
            }

            withContext(Dispatchers.Main) {
                if (bannerEnabled) {
                    setupAdMobBanner()
                }
                loadInterstitialAd()
                loadRewardedAd()
            }
        }
    }

    private fun startSmartAdCheckTimer() {
        lifecycleScope.launch {
            while (isActive) {
                delay(5_000L) // 5-second check so configured intervals trigger promptly
                val now = System.currentTimeMillis()
                val currentPos = binding.viewPager.currentItem
                val game = adapter.getGame(currentPos)
                if (game != null && game.ads?.enabled == false) {
                    continue
                }

                val minIntervalMinutes = if (game?.ads?.useCustomInterval == true) {
                    game.ads.intervalMinutes
                } else {
                    defaultIntervalMinutes
                }
                val intervalMs = Math.max(15_000L, minIntervalMinutes * 60 * 1000L)
                val effectiveCooldownMs = Math.min(cooldownSeconds * 1000L, intervalMs / 2)
                val timeSinceLastAd = now - lastAdShowTimeMs

                if (timeSinceLastAd >= intervalMs && timeSinceLastAd >= effectiveCooldownMs) {
                    Log.d("MainActivity", "Ad interval due ($minIntervalMinutes min reached). Displaying interstitial ad...")
                    isAdDue = true
                    withContext(Dispatchers.Main) {
                        checkAndShowInterstitialAd(specificGame = game, forceShowIfDue = true)
                    }
                }
            }
        }
    }

    private fun setupAdMobBanner() {
        try {
            binding.bannerAdContainer.removeAllViews()
            adView = AdView(this).apply {
                setAdSize(AdSize.BANNER)
                adUnitId = bannerUnitId
            }
            binding.bannerAdContainer.addView(adView)
            val adRequest = AdRequest.Builder().build()
            adView?.loadAd(adRequest)
        } catch (_: Exception) {}
    }

    private fun recordAdShown() {
        lastAdShowTimeMs = System.currentTimeMillis()
        prefs.edit().putLong("last_interstitial_show_time", lastAdShowTimeMs).apply()
        swipeCount = 0
        isAdDue = false
    }

    private fun loadInterstitialAd() {
        if (isInterstitialLoading || interstitialAd != null) return
        isInterstitialLoading = true

        val adRequest = AdRequest.Builder().build()
        InterstitialAd.load(
            this,
            interstitialUnitId,
            adRequest,
            object : InterstitialAdLoadCallback() {
                override fun onAdLoaded(ad: InterstitialAd) {
                    interstitialAd = ad
                    isInterstitialLoading = false
                    Log.d("MainActivity", "Interstitial ad loaded successfully")
                    ad.fullScreenContentCallback = object : FullScreenContentCallback() {
                        override fun onAdDismissedFullScreenContent() {
                            Log.d("MainActivity", "Interstitial ad dismissed by user")
                            interstitialAd = null
                            recordAdShown()
                            loadInterstitialAd()
                        }

                        override fun onAdFailedToShowFullScreenContent(adError: AdError) {
                            Log.w("MainActivity", "Interstitial ad failed to show: ${adError.message}")
                            interstitialAd = null
                            isAdDue = false
                            loadInterstitialAd()
                        }

                        override fun onAdShowedFullScreenContent() {
                            Log.d("MainActivity", "Interstitial ad displayed on screen")
                            recordAdShown()
                        }
                    }

                    // If an ad was already due and waiting for this download, show it immediately!
                    if (isAdDue) {
                        val currentPos = binding.viewPager.currentItem
                        val game = adapter.getGame(currentPos)
                        if (game?.ads?.enabled != false) {
                            runOnUiThread {
                                checkAndShowInterstitialAd(specificGame = game, forceShowIfDue = true)
                            }
                        }
                    }
                }

                override fun onAdFailedToLoad(error: LoadAdError) {
                    interstitialAd = null
                    isInterstitialLoading = false
                    Log.w("MainActivity", "Interstitial ad failed to load: ${error.message} (code ${error.code})")
                }
            }
        )
    }

    private fun checkAndShowInterstitialAd(
        specificGame: GameItem? = null,
        forceShowIfDue: Boolean = false
    ) {
        if (!interstitialEnabled) return

        val currentPos = binding.viewPager.currentItem
        val game = specificGame ?: adapter.getGame(currentPos)

        // Per-game check: If ads are disabled for this game, do NOT show
        if (game != null && game.ads?.enabled == false) {
            return
        }

        val now = System.currentTimeMillis()
        val minIntervalMinutes = if (game?.ads?.useCustomInterval == true) {
            game.ads.intervalMinutes
        } else {
            defaultIntervalMinutes
        }

        val intervalMs = Math.max(15_000L, minIntervalMinutes * 60 * 1000L)
        val effectiveCooldownMs = Math.min(cooldownSeconds * 1000L, intervalMs / 2)
        val timeSinceLastAd = now - lastAdShowTimeMs
        val isTimeDue = timeSinceLastAd >= intervalMs
        val isSwipeDue = swipeCount >= swipeInterval

        if (forceShowIfDue || isTimeDue || isSwipeDue || isAdDue) {
            if (!forceShowIfDue && lastAdShowTimeMs > 0L && timeSinceLastAd < effectiveCooldownMs) {
                return
            }

            if (interstitialAd != null) {
                Log.d("MainActivity", "Showing interstitial ad on screen (game=${game?.title}, interval=${minIntervalMinutes}m)")
                isAdDue = false
                interstitialAd?.show(this)
            } else {
                Log.d("MainActivity", "Interstitial ad is due but not yet ready in memory; requesting preload")
                isAdDue = true
                loadInterstitialAd()
            }
        }
    }

    private fun loadRewardedAd() {
        val adRequest = AdRequest.Builder().build()
        RewardedAd.load(
            this,
            rewardedUnitId,
            adRequest,
            object : RewardedAdLoadCallback() {
                override fun onAdLoaded(ad: RewardedAd) {
                    rewardedAd = ad
                }
                override fun onAdFailedToLoad(error: LoadAdError) {
                    rewardedAd = null
                }
            }
        )
    }

    private fun showRewardedAdForHint(action: String) {
        if (rewardedAd != null) {
            rewardedAd?.show(this) { _ ->
                // Reward Granted
                val earnedCoins = 50
                progressManager.addCoins(earnedCoins)
                updateCoinsDisplay()

                val currentPos = binding.viewPager.currentItem
                adapter.grantRewardToCurrentGame(currentPos, action)

                Toast.makeText(this, "🎉 Hint Unlocked & +$earnedCoins 🪙 Coins Granted!", Toast.LENGTH_LONG).show()
                loadRewardedAd()
            }
        } else {
            // Instant fallback reward if ad is still loading
            val earnedCoins = 50
            progressManager.addCoins(earnedCoins)
            updateCoinsDisplay()

            val currentPos = binding.viewPager.currentItem
            adapter.grantRewardToCurrentGame(currentPos, action)

            Toast.makeText(this, "💡 Hint Unlocked! +$earnedCoins 🪙 Coins Granted!", Toast.LENGTH_SHORT).show()
            loadRewardedAd()
        }
    }

    // Auto-Hide Schedule & Inactivity Reset
    private fun scheduleAutoHideBottomBar(delayMs: Long = 5000L) {
        bottomBarHandler.removeCallbacks(autoHideBottomBarRunnable)
        bottomBarHandler.postDelayed(autoHideBottomBarRunnable, delayMs)
    }

    private fun resetAutoHideTimer() {
        if (isBottomBarVisible) {
            scheduleAutoHideBottomBar(5000L)
        }
    }

    // Bottom Bar Hide/Show Animation without Layout Reflow (Zero WebView shift)
    private fun toggleBottomBar(visible: Boolean, animate: Boolean = true) {
        isBottomBarVisible = visible
        if (visible) {
            scheduleAutoHideBottomBar(5000L)
        } else {
            bottomBarHandler.removeCallbacks(autoHideBottomBarRunnable)
        }

        val density = resources.displayMetrics.density
        val barHeight = binding.bottomNavBar.height.toFloat().takeIf { it > 0 } ?: (56f * density)
        val targetBarY = if (visible) 0f else (barHeight + 40f)
        val targetHandleY = if (visible) -(barHeight + 6f) else 0f
        val handleIcon = if (visible) "⌄" else "⌃"

        binding.tvToggleHandleIcon.text = handleIcon

        if (animate) {
            binding.bottomNavBar.animate()
                .translationY(targetBarY)
                .setDuration(260)
                .setInterpolator(DecelerateInterpolator())
                .start()

            binding.bottomBarToggleHandle.animate()
                .translationY(targetHandleY)
                .setDuration(260)
                .setInterpolator(DecelerateInterpolator())
                .start()
        } else {
            binding.bottomNavBar.translationY = targetBarY
            binding.bottomBarToggleHandle.translationY = targetHandleY
        }
    }

    // Bridge Event Callbacks
    override fun onGameStarted() {
        runOnUiThread {
            // Reset 5-second inactivity timer on game start so the controls stay visible initially
            resetAutoHideTimer()
        }
    }

    override fun onGameOver(score: Int, stats: String) {
        runOnUiThread {
            val currentPos = binding.viewPager.currentItem
            val game = this@MainActivity.adapter.getGame(currentPos)
            if (game != null) {
                analyticsManager.onGameOver(game.id, game.title, score, stats)
                progressManager.saveHighScore(game.id, score)
                val earnedCoins = if (score > 0) Math.max(score / 10, 5) else 2
                progressManager.addCoins(earnedCoins)
                updateCoinsDisplay()
                updateTopBarForGame(currentPos)
                Toast.makeText(this, "+$earnedCoins 🪙 Coins Earned for $score PTS!", Toast.LENGTH_SHORT).show()
            }

            // Restore bottom bar on game over
            toggleBottomBar(true)

            if (gameOverAdEnabled || isAdDue) {
                checkAndShowInterstitialAd(forceShowIfDue = true)
            }
        }
    }

    override fun onGameCompleted(score: Int, level: Int) {
        runOnUiThread {
            val currentPos = binding.viewPager.currentItem
            val game = this@MainActivity.adapter.getGame(currentPos)
            if (game != null) {
                analyticsManager.onGameCompleted(game.id, game.title, score, level)
                progressManager.saveHighScore(game.id, score)
                progressManager.saveLevel(game.id, level + 1)
                val earnedCoins = 50 + (if (score > 0) score / 10 else 0)
                progressManager.addCoins(earnedCoins)
                updateCoinsDisplay()
                updateTopBarForGame(currentPos)
                Toast.makeText(this, "🎉 Level Clear! +$earnedCoins 🪙 Coins Earned!", Toast.LENGTH_SHORT).show()
            }

            // Restore bottom bar on level complete
            toggleBottomBar(true)

            levelWinCount++
            val winThresholdMet = levelCompleteAd && levelWinCount >= levelWinInterval
            if (winThresholdMet || isAdDue) {
                checkAndShowInterstitialAd(forceShowIfDue = true)
                levelWinCount = 0
            }
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
            showRewardedAdForHint(action)
        }
    }

    override fun onSaveLevelState(level: Int) {
        val currentPos = binding.viewPager.currentItem
        val game = this@MainActivity.adapter.getGame(currentPos) ?: return
        progressManager.saveLevel(game.id, level)
    }

    override fun onRequestRewardedAd(rewardType: String) {
        runOnUiThread {
            showRewardedAdForHint(rewardType)
        }
    }

    override fun onSetSwipeEnabled(enabled: Boolean) {
        runOnUiThread {
            binding.viewPager.isUserInputEnabled = enabled
        }
    }

    override fun onPause() {
        super.onPause()
        adView?.pause()
        adapter.pauseAll()
        val currentPos = binding.viewPager.currentItem
        adapter.getGame(currentPos)?.let { game ->
            analyticsManager.onGameExit(game.id, game.title, exitReason = "app_paused")
        }
    }

    override fun onResume() {
        super.onResume()
        adView?.resume()
        applyTheme()
        val isMuted = prefs.getBoolean("is_sound_muted", false)
        adapter.setSoundMuted(isMuted)
        adapter.resumeCurrent()
        updateCoinsDisplay()
        refreshCatalogFromServer()

        val currentPos = binding.viewPager.currentItem
        adapter.getGame(currentPos)?.let { game ->
            analyticsManager.onGameStart(game.id, game.title)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        bottomBarHandler.removeCallbacks(autoHideBottomBarRunnable)
        adView?.destroy()
    }
}
