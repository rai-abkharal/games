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

    fun handlePageSelected(position: Int) {
        currentSelectedPosition = position
        for ((pos, webView) in activeWebViews) {
            val isActive = (pos == position)
            val shouldPlaySound = isActive && !isSoundMuted
            
            webView.evaluateJavascript(
                """
                (function() {
                    window.__GAME_ACTIVE__ = $isActive;
                    window.dispatchEvent(new Event(${if (isActive) "'focus'" else "'blur'"}));

                    if (window.GameBridge) {
                        if (typeof window.GameBridge.setSoundEnabled === 'function') {
                            window.GameBridge.setSoundEnabled($shouldPlaySound);
                        }
                        if ($isActive) {
                            if (typeof window.GameBridge.resume === 'function') window.GameBridge.resume();
                            if (typeof window.GameBridge.onResume === 'function') window.GameBridge.onResume();
                        } else {
                            if (typeof window.GameBridge.pause === 'function') window.GameBridge.pause();
                            if (typeof window.GameBridge.onPause === 'function') window.GameBridge.onPause();
                        }
                    }

                    if (window.__PHASER_GAME__) {
                        if (window.__PHASER_GAME__.loop) {
                            if ($isActive) window.__PHASER_GAME__.loop.wake();
                            else window.__PHASER_GAME__.loop.sleep();
                        }
                        if (window.__PHASER_GAME__.sound) {
                            window.__PHASER_GAME__.sound.mute = ${!shouldPlaySound};
                            if ($isActive && window.__PHASER_GAME__.sound.context && window.__PHASER_GAME__.sound.context.state === 'suspended') {
                                window.__PHASER_GAME__.sound.context.resume();
                            }
                        }
                    }

                    if (window.SoundFx && window.SoundFx.ctx) {
                        if ($isActive) {
                            if (window.SoundFx.ctx.state === 'suspended') window.SoundFx.ctx.resume();
                        } else {
                            if (window.SoundFx.ctx.state === 'running') window.SoundFx.ctx.suspend();
                        }
                    }
                })();
                """.trimIndent(),
                null
            )
        }
    }

    fun pauseAll() {
        for (webView in activeWebViews.values) {
            webView.evaluateJavascript(
                """
                (function() {
                    window.__GAME_ACTIVE__ = false;
                    window.dispatchEvent(new Event('blur'));
                    if (window.GameBridge) {
                        if (typeof window.GameBridge.setSoundEnabled === 'function') window.GameBridge.setSoundEnabled(false);
                        if (typeof window.GameBridge.pause === 'function') window.GameBridge.pause();
                        if (typeof window.GameBridge.onPause === 'function') window.GameBridge.onPause();
                    }
                    if (window.__PHASER_GAME__) {
                        if (window.__PHASER_GAME__.loop) window.__PHASER_GAME__.loop.sleep();
                        if (window.__PHASER_GAME__.sound) window.__PHASER_GAME__.sound.mute = true;
                    }
                    if (window.SoundFx && window.SoundFx.ctx && window.SoundFx.ctx.state === 'running') {
                        window.SoundFx.ctx.suspend();
                    }
                })();
                """.trimIndent(),
                null
            )
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

            var isIntentionalPageSwipe = false

            webView.setOnTouchListener { v, event ->
                val density = context.resources.displayMetrics.density
                val topHeaderZone = 85 * density
                val bottomZone = v.height - (65 * density)

                when (event.actionMasked) {
                    android.view.MotionEvent.ACTION_DOWN -> {
                        isIntentionalPageSwipe = (event.y < topHeaderZone || event.y > bottomZone)
                        if (!isIntentionalPageSwipe) {
                            // Touch inside active gameplay zone: Disallow ViewPager2 from stealing touch
                            v.parent?.requestDisallowInterceptTouchEvent(true)
                        } else {
                            // Touch in top header / bottom bar: Allow natural ViewPager2 page scroll
                            v.parent?.requestDisallowInterceptTouchEvent(false)
                        }
                    }
                    android.view.MotionEvent.ACTION_MOVE -> {
                        if (isIntentionalPageSwipe) {
                            v.parent?.requestDisallowInterceptTouchEvent(false)
                        } else {
                            v.parent?.requestDisallowInterceptTouchEvent(true)
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
                        view?.evaluateJavascript(
                            """
                            (function() {
                                if (window.GameBridge) {
                                    window.GameBridge.setSoundEnabled(${!isSoundMuted});
                                    window.GameBridge.resume();
                                }
                                if (window.__PHASER_GAME__) {
                                    if (window.__PHASER_GAME__.loop) window.__PHASER_GAME__.loop.wake();
                                    if (window.__PHASER_GAME__.sound) {
                                        window.__PHASER_GAME__.sound.mute = $isSoundMuted;
                                        if (window.__PHASER_GAME__.sound.context && window.__PHASER_GAME__.sound.context.state === 'suspended') {
                                            window.__PHASER_GAME__.sound.context.resume();
                                        }
                                    }
                                }
                                if (window.SoundFx && window.SoundFx.ctx && window.SoundFx.ctx.state === 'suspended') {
                                    window.SoundFx.ctx.resume();
                                }
                            })();
                            """.trimIndent(),
                            null
                        )
                    } else {
                        // Offscreen preloaded page: PAUSE & SLEEP IMMEDIATELY!
                        view?.evaluateJavascript(
                            """
                            (function() {
                                if (window.GameBridge) {
                                    window.GameBridge.setSoundEnabled(false);
                                    window.GameBridge.pause();
                                }
                                if (window.__PHASER_GAME__) {
                                    if (window.__PHASER_GAME__.loop) window.__PHASER_GAME__.loop.sleep();
                                    if (window.__PHASER_GAME__.sound) window.__PHASER_GAME__.sound.mute = true;
                                }
                            })();
                            """.trimIndent(),
                            null
                        )
                    }
                }
            }

            webView.loadUrl(game.entryUrl)
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
}
