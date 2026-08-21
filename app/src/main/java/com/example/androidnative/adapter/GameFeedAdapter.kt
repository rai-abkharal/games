package com.example.androidnative.adapter

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.recyclerview.widget.RecyclerView
import com.example.androidnative.bridge.GameBridgeListener
import com.example.androidnative.bridge.NativeGameBridge
import com.example.androidnative.cache.GameCacheManager
import com.example.androidnative.databinding.ItemGamePageBinding
import com.example.androidnative.model.GameItem

class GameFeedAdapter(
    private val context: Context,
    private val cacheManager: GameCacheManager,
    private val bridgeListener: GameBridgeListener
) : RecyclerView.Adapter<GameFeedAdapter.GameViewHolder>() {

    private val games = mutableListOf<GameItem>()
    private var isSoundMuted = false
    private var currentSelectedPosition = 0
    private val activeWebViews = mutableMapOf<Int, WebView>()

    fun setGames(newGames: List<GameItem>) {
        games.clear()
        games.addAll(newGames)
        notifyDataSetChanged()
    }

    fun getGame(position: Int): GameItem? {
        return if (position in 0 until games.size) games[position] else null
    }

    fun setSoundMuted(muted: Boolean) {
        isSoundMuted = muted
        for ((pos, webView) in activeWebViews) {
            val shouldEnable = !isSoundMuted && (pos == currentSelectedPosition)
            webView.evaluateJavascript(
                """
                (function() {
                    if (window.GameBridge) window.GameBridge.setSoundEnabled($shouldEnable);
                    if (window.__PHASER_GAME__ && window.__PHASER_GAME__.sound) {
                        window.__PHASER_GAME__.sound.mute = ${!shouldEnable};
                    }
                })();
                """.trimIndent(),
                null
            )
        }
    }

    fun restartCurrentGame(position: Int) {
        val webView = activeWebViews[position]
        webView?.evaluateJavascript(
            "if (window.GameBridge) window.GameBridge.restart();",
            null
        )
    }

    fun grantRewardToCurrentGame(position: Int, rewardType: String) {
        val webView = activeWebViews[position]
        webView?.evaluateJavascript(
            """
            (function() {
                window.postMessage({ type: 'REWARD_GRANTED', action: '$rewardType' }, '*');
                if (window.GameBridge && typeof window.GameBridge.onRewardGranted === 'function') {
                    window.GameBridge.onRewardGranted('$rewardType');
                }
            })();
            """.trimIndent(),
            null
        )
    }

    fun sendSavedStateToGame(position: Int, level: Int, coins: Int, highScore: Int) {
        val webView = activeWebViews[position]
        webView?.evaluateJavascript(
            """
            (function() {
                window.postMessage({ type: 'LOAD_SAVED_STATE', payload: { level: $level, coins: $coins, highScore: $highScore } }, '*');
                if (window.GameBridge && typeof window.GameBridge.loadSavedState === 'function') {
                    window.GameBridge.loadSavedState({ level: $level, coins: $coins, highScore: $highScore });
                }
            })();
            """.trimIndent(),
            null
        )
    }

    fun handlePageSelected(position: Int) {
        currentSelectedPosition = position
        for ((pos, webView) in activeWebViews) {
            val isActive = (pos == position)
            val shouldPlaySound = isActive && !isSoundMuted
            
            if (isActive) {
                try { webView.onResume() } catch (_: Exception) {}
                webView.evaluateJavascript(buildGameResumeScript(shouldPlaySound), null)
            } else {
                try { webView.onPause() } catch (_: Exception) {}
                webView.evaluateJavascript(buildGamePauseScript(), null)
            }
        }
    }

    fun pauseAll() {
        for (webView in activeWebViews.values) {
            try { webView.onPause() } catch (_: Exception) {}
            webView.evaluateJavascript(buildGamePauseScript(), null)
        }
    }

    fun resumeCurrent() {
        handlePageSelected(currentSelectedPosition)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): GameViewHolder {
        val binding = ItemGamePageBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return GameViewHolder(binding)
    }

    override fun onBindViewHolder(holder: GameViewHolder, position: Int) {
        holder.bind(games[position], position)
    }

    override fun onViewRecycled(holder: GameViewHolder) {
        super.onViewRecycled(holder)
        val pos = holder.bindingAdapterPosition
        if (pos != RecyclerView.NO_POSITION) {
            activeWebViews.remove(pos)
        }
        holder.cleanup()
    }

    override fun getItemCount(): Int = games.size

    inner class GameViewHolder(private val binding: ItemGamePageBinding) :
        RecyclerView.ViewHolder(binding.root) {

        @SuppressLint("SetJavaScriptEnabled", "ClickableViewAccessibility")
        fun bind(game: GameItem, position: Int) {
            activeWebViews[position] = binding.webView
            binding.placeholderContainer.visibility = View.VISIBLE
            binding.placeholderContainer.alpha = 1.0f
            binding.tvPlaceholderTitle.text = game.title
            binding.tvPlaceholderCategory.text = "${game.category.uppercase()} • 120 FPS ENGINE"

            val webView = binding.webView
            webView.setBackgroundColor(Color.parseColor("#070D1E"))
            webView.isVerticalScrollBarEnabled = false
            webView.isHorizontalScrollBarEnabled = false
            webView.overScrollMode = View.OVER_SCROLL_NEVER

            val settings = webView.settings
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            settings.allowFileAccess = true
            settings.databaseEnabled = true
            settings.useWideViewPort = true
            settings.loadWithOverviewMode = true
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                settings.offscreenPreRaster = true
            }
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                settings.safeBrowsingEnabled = false
            }
            @Suppress("DEPRECATION")
            settings.setRenderPriority(WebSettings.RenderPriority.HIGH)

            val bridge = NativeGameBridge(context, bridgeListener)
            webView.addJavascriptInterface(bridge, "FlutterGameBridge")
            webView.addJavascriptInterface(bridge, "NativeBridge")
            webView.webChromeClient = WebChromeClient()

            webView.setOnTouchListener { v, event ->
                val zones = game.touchZones
                if (zones.isNullOrEmpty()) {
                    v.parent?.requestDisallowInterceptTouchEvent(false)
                    return@setOnTouchListener false
                }

                val viewWidth = v.width.toFloat()
                val viewHeight = v.height.toFloat()
                if (viewWidth <= 0 || viewHeight <= 0) return@setOnTouchListener false

                val normX = event.x / viewWidth
                val normY = event.y / viewHeight

                val isInsideBlockedZone = zones.any { zone ->
                    normX >= zone.x && normX <= (zone.x + zone.width) &&
                    normY >= zone.y && normY <= (zone.y + zone.height)
                }

                when (event.actionMasked) {
                    android.view.MotionEvent.ACTION_DOWN, android.view.MotionEvent.ACTION_MOVE -> {
                        if (isInsideBlockedZone) {
                            v.parent?.requestDisallowInterceptTouchEvent(true)
                        } else {
                            v.parent?.requestDisallowInterceptTouchEvent(false)
                        }
                    }
                    android.view.MotionEvent.ACTION_UP, android.view.MotionEvent.ACTION_CANCEL -> {
                        v.parent?.requestDisallowInterceptTouchEvent(false)
                    }
                }
                false
            }

            webView.webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView?,
                    request: WebResourceRequest?
                ): WebResourceResponse? {
                    val url = request?.url?.toString() ?: return null
                    return cacheManager.interceptRequest(url)
                }

                override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                    super.onPageStarted(view, url, favicon)
                    // Early Global AudioContext & rAF Interception
                    view?.evaluateJavascript(
                        """
                        (function() {
                            if (!window.__ALL_AUDIO_CONTEXTS__) {
                                window.__ALL_AUDIO_CONTEXTS__ = [];
                                var OrigCtx = window.AudioContext || window.webkitAudioContext;
                                if (OrigCtx) {
                                    var HookedCtx = function() {
                                        var ctx = new OrigCtx();
                                        window.__ALL_AUDIO_CONTEXTS__.push(ctx);
                                        return ctx;
                                    };
                                    HookedCtx.prototype = OrigCtx.prototype;
                                    window.AudioContext = HookedCtx;
                                    window.webkitAudioContext = HookedCtx;
                                }
                            }
                        })();
                        """.trimIndent(),
                        null
                    )
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    
                    // Instant reveal for 10KB micro-engines
                    binding.placeholderContainer.animate()
                        .alpha(0f)
                        .setDuration(120)
                        .withEndAction {
                            binding.placeholderContainer.visibility = View.GONE
                        }
                        .start()

                    val targetPos = if (bindingAdapterPosition != RecyclerView.NO_POSITION) bindingAdapterPosition else position
                    val isCurrent = (targetPos == currentSelectedPosition)

                    if (isCurrent) {
                        // Current active page: Resume & Unmute & Wake Up
                        view?.evaluateJavascript(buildGameResumeScript(!isSoundMuted), null)
                    } else {
                        // Offscreen preloaded page: PAUSE & SLEEP IMMEDIATELY!
                        try { view?.onPause() } catch (_: Exception) {}
                        view?.evaluateJavascript(buildGamePauseScript(), null)
                    }
                }
            }

            val cacheBustUrl = if (game.entryUrl.contains("?")) {
                "${game.entryUrl}&v=${game.version}&t=${game.updatedAt?.hashCode() ?: game.sha256?.take(8) ?: System.currentTimeMillis()}"
            } else {
                "${game.entryUrl}?v=${game.version}&t=${game.updatedAt?.hashCode() ?: game.sha256?.take(8) ?: System.currentTimeMillis()}"
            }
            webView.loadUrl(cacheBustUrl)
        }

        fun cleanup() {
            try {
                binding.webView.evaluateJavascript(
                    "if (window.__PHASER_GAME__ && window.__PHASER_GAME__.destroy) { window.__PHASER_GAME__.destroy(true); }",
                    null
                )
                binding.webView.loadUrl("about:blank")
            } catch (_: Exception) {}
        }
    }

    companion object {
        fun buildGamePauseScript(): String {
            return """
            (function() {
                window.__GAME_ACTIVE__ = false;

                // 1. Dispatch Visibility & Blur Events
                try {
                    Object.defineProperty(document, 'hidden', { value: true, writable: true, configurable: true });
                    Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true, configurable: true });
                    document.dispatchEvent(new Event('visibilitychange'));
                    window.dispatchEvent(new Event('blur'));
                    if (window.onblur) window.onblur();
                } catch(e) {}

                // 2. Global CSS Animation & Transition Freeze (0 GPU / CPU load)
                try {
                    var styleEl = document.getElementById('__freeze_css_style__');
                    if (!styleEl) {
                        styleEl = document.createElement('style');
                        styleEl.id = '__freeze_css_style__';
                        document.head.appendChild(styleEl);
                    }
                    styleEl.textContent = '* { animation-play-state: paused !important; -webkit-animation-play-state: paused !important; transition: none !important; }';
                } catch(e) {}

                // 3. Phaser 3 Total Engine, Loop, Tweens, Anims & Physics Freeze
                try {
                    if (window.__PHASER_GAME__) {
                        if (window.__PHASER_GAME__.loop) window.__PHASER_GAME__.loop.sleep();
                        if (window.__PHASER_GAME__.sound) {
                            window.__PHASER_GAME__.sound.mute = true;
                            if (window.__PHASER_GAME__.sound.context && typeof window.__PHASER_GAME__.sound.context.suspend === 'function') {
                                window.__PHASER_GAME__.sound.context.suspend();
                            }
                        }
                        if (window.__PHASER_GAME__.scene && window.__PHASER_GAME__.scene.scenes) {
                            window.__PHASER_GAME__.scene.scenes.forEach(function(s) {
                                if (s.scene && typeof s.scene.pause === 'function') s.scene.pause();
                                if (s.tweens && typeof s.tweens.pauseAll === 'function') s.tweens.pauseAll();
                                if (s.anims && typeof s.anims.pauseAll === 'function') s.anims.pauseAll();
                                if (s.time && s.time.paused !== undefined) s.time.paused = true;
                                if (s.physics && s.physics.world && typeof s.physics.world.pause === 'function') s.physics.world.pause();
                            });
                        }
                    }
                } catch(e) {}

                // 4. PixiJS Ticker Stop
                try {
                    if (window.PIXI && window.PIXI.Ticker && window.PIXI.Ticker.shared) {
                        window.PIXI.Ticker.shared.stop();
                    }
                } catch(e) {}

                // 5. Universal AudioContext Nuclear Silence (Catches all AudioContexts)
                try {
                    if (window.__ALL_AUDIO_CONTEXTS__) {
                        window.__ALL_AUDIO_CONTEXTS__.forEach(function(ctx) {
                            if (ctx && typeof ctx.suspend === 'function' && ctx.state === 'running') {
                                ctx.suspend();
                            }
                        });
                    }
                    var media = document.querySelectorAll('audio, video');
                    for (var i = 0; i < media.length; i++) {
                        media[i].pause();
                        media[i].muted = true;
                    }
                    if (window.Howler && typeof window.Howler.mute === 'function') window.Howler.mute(true);
                    if (window.audioCtx && typeof window.audioCtx.suspend === 'function') window.audioCtx.suspend();
                    if (window.soundCtx && typeof window.soundCtx.suspend === 'function') window.soundCtx.suspend();
                    if (window.audioContext && typeof window.audioContext.suspend === 'function') window.audioContext.suspend();
                    if (window.SoundFx && window.SoundFx.ctx && typeof window.SoundFx.ctx.suspend === 'function') window.SoundFx.ctx.suspend();
                } catch(e) {}

                // 6. GameBridge onPause Hook
                try {
                    if (window.GameBridge) {
                        if (typeof window.GameBridge.setSoundEnabled === 'function') window.GameBridge.setSoundEnabled(false);
                        if (typeof window.GameBridge.pause === 'function') window.GameBridge.pause();
                        if (typeof window.GameBridge.onPause === 'function') window.GameBridge.onPause();
                    }
                } catch(e) {}
            })();
            """.trimIndent()
        }

        fun buildGameResumeScript(shouldPlaySound: Boolean): String {
            return """
            (function() {
                window.__GAME_ACTIVE__ = true;

                // 1. Dispatch Visibility & Focus Events
                try {
                    Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true });
                    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true, configurable: true });
                    document.dispatchEvent(new Event('visibilitychange'));
                    window.dispatchEvent(new Event('focus'));
                    if (window.onfocus) window.onfocus();
                } catch(e) {}

                // 2. Remove CSS Freeze Style (Resume fluid animations)
                try {
                    var styleEl = document.getElementById('__freeze_css_style__');
                    if (styleEl && styleEl.parentNode) {
                        styleEl.parentNode.removeChild(styleEl);
                    }
                } catch(e) {}

                // 3. Phaser 3 Engine, Loop, Tweens, Anims & Physics Wake
                try {
                    if (window.__PHASER_GAME__) {
                        if (window.__PHASER_GAME__.loop) window.__PHASER_GAME__.loop.wake();
                        if (window.__PHASER_GAME__.sound) {
                            window.__PHASER_GAME__.sound.mute = ${!shouldPlaySound};
                            if ($shouldPlaySound && window.__PHASER_GAME__.sound.context && window.__PHASER_GAME__.sound.context.state === 'suspended') {
                                window.__PHASER_GAME__.sound.context.resume();
                            }
                        }
                        if (window.__PHASER_GAME__.scene && window.__PHASER_GAME__.scene.scenes) {
                            window.__PHASER_GAME__.scene.scenes.forEach(function(s) {
                                if (s.scene && typeof s.scene.resume === 'function') s.scene.resume();
                                if (s.tweens && typeof s.tweens.resumeAll === 'function') s.tweens.resumeAll();
                                if (s.anims && typeof s.anims.resumeAll === 'function') s.anims.resumeAll();
                                if (s.time && s.time.paused !== undefined) s.time.paused = false;
                                if (s.physics && s.physics.world && typeof s.physics.world.resume === 'function') s.physics.world.resume();
                            });
                        }
                    }
                } catch(e) {}

                // 4. PixiJS Ticker Resume
                try {
                    if (window.PIXI && window.PIXI.Ticker && window.PIXI.Ticker.shared) {
                        window.PIXI.Ticker.shared.start();
                    }
                } catch(e) {}

                // 5. Universal AudioContext Resume
                try {
                    if ($shouldPlaySound) {
                        if (window.__ALL_AUDIO_CONTEXTS__) {
                            window.__ALL_AUDIO_CONTEXTS__.forEach(function(ctx) {
                                if (ctx && typeof ctx.resume === 'function' && ctx.state === 'suspended') {
                                    ctx.resume();
                                }
                            });
                        }
                        var media = document.querySelectorAll('audio, video');
                        for (var i = 0; i < media.length; i++) {
                            media[i].muted = false;
                        }
                        if (window.Howler && typeof window.Howler.mute === 'function') window.Howler.mute(false);
                        if (window.audioCtx && window.audioCtx.state === 'suspended') window.audioCtx.resume();
                        if (window.soundCtx && window.soundCtx.state === 'suspended') window.soundCtx.resume();
                        if (window.audioContext && window.audioContext.state === 'suspended') window.audioContext.resume();
                        if (window.SoundFx && window.SoundFx.ctx && window.SoundFx.ctx.state === 'suspended') window.SoundFx.ctx.resume();
                    }
                } catch(e) {}

                // 6. GameBridge onResume Hook & Fresh Restart if crashed during preload
                try {
                    if (window.GameBridge) {
                        if (typeof window.GameBridge.setSoundEnabled === 'function') {
                            window.GameBridge.setSoundEnabled($shouldPlaySound);
                        }
                        if (typeof window.GameBridge.resume === 'function') window.GameBridge.resume();
                        if (typeof window.GameBridge.onResume === 'function') window.GameBridge.onResume();

                        if (window.__NEEDS_FRESH_START__ === true || window.__GAME_OVER_TRIGGERED__ === true) {
                            window.__NEEDS_FRESH_START__ = false;
                            window.__GAME_OVER_TRIGGERED__ = false;
                            if (typeof window.GameBridge.restart === 'function') {
                                window.GameBridge.restart();
                            }
                        }
                    }
                } catch(e) {}
            })();
            """.trimIndent()
        }
    }
}
