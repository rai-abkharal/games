package com.example.androidnative

import android.content.Context
import android.content.SharedPreferences
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
import com.example.androidnative.databinding.DialogDownloadManagerBinding
import com.example.androidnative.model.GameItem
import com.example.androidnative.repository.GameRepository
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity(), GameBridgeListener {

    private lateinit var binding: ActivityMainBinding
    private lateinit var cacheManager: GameCacheManager
    private lateinit var repository: GameRepository
    private lateinit var adapter: GameFeedAdapter
    private lateinit var prefs: SharedPreferences

    private var isMuted = false
    private var currentGameList: List<GameItem> = emptyList()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        volumeControlStream = android.media.AudioManager.STREAM_MUSIC
        prefs = getSharedPreferences("minigames_user_prefs", Context.MODE_PRIVATE)
        isMuted = prefs.getBoolean("is_sound_muted", false)
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

        setupViewPager()
        setupTopBar()
        loadCatalog()
        checkFirstLaunchMode()
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
                    // Trigger predictive background pre-download for upcoming games
                    cacheManager.preloadUpcomingGames(position, currentGameList, lifecycleScope)
                }
            })
        }
    }

    private fun setupTopBar() {
        updateSoundIcon()

        binding.btnSound.setOnClickListener {
            isMuted = !isMuted
            prefs.edit().putBoolean("is_sound_muted", isMuted).apply()
            adapter.setSoundMuted(isMuted)
            updateSoundIcon()
        }

        binding.btnRestart.setOnClickListener {
            val currentPos = binding.viewPager.currentItem
            adapter.restartCurrentGame(currentPos)
        }

        binding.btnDownload.setOnClickListener {
            showDownloadManagerSheet()
        }
    }

    private fun updateSoundIcon() {
        if (isMuted) {
            binding.btnSound.setImageResource(android.R.drawable.ic_lock_silent_mode)
            binding.btnSound.setColorFilter(getColor(android.R.color.holo_red_dark))
        } else {
            binding.btnSound.setImageResource(android.R.drawable.ic_lock_silent_mode_off)
            binding.btnSound.setColorFilter(getColor(android.R.color.black))
        }
    }

    private fun updateTopBarForGame(position: Int) {
        val game = adapter.getGame(position) ?: return
        binding.tvGameTitle.text = game.title
        binding.tvGameMeta.text = "${position + 1} of ${currentGameList.size} • ${game.category}"

        val highScore = prefs.getInt("high_score_${game.id}", 0)
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
            currentGameList = repository.fetchCatalog()
            binding.progressBar.visibility = View.GONE
            adapter.setGames(currentGameList)
            if (currentGameList.isNotEmpty()) {
                updateTopBarForGame(0)
                // Preload starting games (0, 1, 2) immediately on app startup
                cacheManager.preloadUpcomingGames(0, currentGameList, lifecycleScope)
            }
        }
    }

    private fun checkFirstLaunchMode() {
        val hasSelected = prefs.getBoolean("has_selected_mode", false)
        if (!hasSelected) {
            MaterialAlertDialogBuilder(this)
                .setTitle("⚡ How do you want to play?")
                .setMessage("Option 1: ⚡ Offline Download Mode (Locked 120 FPS, 0ms latency)\n\nOption 2: 🌐 Online Stream Mode (Saves space, instant play)")
                .setPositiveButton("Download All (120 FPS)") { _, _ ->
                    prefs.edit().putBoolean("has_selected_mode", true).apply()
                    startBatchDownload()
                }
                .setNegativeButton("Online Stream") { _, _ ->
                    prefs.edit().putBoolean("has_selected_mode", true).apply()
                }
                .setCancelable(false)
                .show()
        }
    }

    private fun showDownloadManagerSheet() {
        val sheet = BottomSheetDialog(this)
        val sheetBinding = DialogDownloadManagerBinding.inflate(layoutInflater)
        sheet.setContentView(sheetBinding.root)

        sheetBinding.btnDownloadAll.setOnClickListener {
            sheetBinding.pbBatchProgress.visibility = View.VISIBLE
            sheetBinding.tvBatchStatus.visibility = View.VISIBLE
            sheetBinding.btnDownloadAll.isEnabled = false

            lifecycleScope.launch {
                for (i in currentGameList.indices) {
                    val game = currentGameList[i]
                    sheetBinding.tvBatchStatus.text = "Downloading ${game.title} (${i + 1}/${currentGameList.size})..."
                    cacheManager.downloadGame(game) { p ->
                        val overall = (((i + p) / currentGameList.size) * 100).toInt()
                        sheetBinding.pbBatchProgress.progress = overall
                    }
                }
                sheetBinding.tvBatchStatus.text = "✅ All 10 games ready for 120 FPS offline play!"
                sheetBinding.pbBatchProgress.progress = 100
                sheetBinding.btnDownloadAll.isEnabled = true
                Toast.makeText(this@MainActivity, "All games downloaded offline!", Toast.LENGTH_SHORT).show()
            }
        }

        sheetBinding.btnClearStorage.setOnClickListener {
            cacheManager.clearAllCache()
            Toast.makeText(this, "Downloaded cache cleared.", Toast.LENGTH_SHORT).show()
            sheet.dismiss()
        }

        sheet.show()
    }

    private fun startBatchDownload() {
        lifecycleScope.launch {
            for (game in currentGameList) {
                cacheManager.downloadGame(game)
            }
            Toast.makeText(this@MainActivity, "Games cached for ultra-smooth play!", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onGameStarted() {
        // Game started
    }

    override fun onGameOver(score: Int, stats: String) {
        runOnUiThread {
            showGameOverDialog(score)
        }
    }

    override fun onGameCompleted(score: Int, level: Int) {
        runOnUiThread {
            showGameOverDialog(score)
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

        val currentBest = prefs.getInt("high_score_${game.id}", 0)
        if (score > currentBest) {
            prefs.edit().putInt("high_score_${game.id}", score).apply()
            updateTopBarForGame(currentPos)
        }

        val dialog = BottomSheetDialog(this)
        val dialogBinding = DialogGameOverBinding.inflate(layoutInflater)
        dialog.setContentView(dialogBinding.root)

        dialogBinding.tvGameOverScore.text = "$score PTS"
        val best = maxOf(score, currentBest)
        dialogBinding.tvGameOverHighScore.text = "Best: $best PTS"

        dialogBinding.btnPlayAgain.setOnClickListener {
            dialog.dismiss()
            adapter.restartCurrentGame(currentPos)
        }

        dialogBinding.btnNextGame.setOnClickListener {
            dialog.dismiss()
            if (currentPos + 1 < currentGameList.size) {
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
    }
}