package com.swipeplay.app

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    // Pass null to prevent react-native-screens IllegalStateException on activity recreation
    super.onCreate(null)
    hideSystemBars()
    // Lock window to highest hardware refresh rate (90Hz / 120Hz / 144Hz) matching native benchmark
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
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) {
      hideSystemBars()
    }
  }

  private fun hideSystemBars() {
    try {
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
        window.insetsController?.let { controller ->
          controller.systemBarsBehavior =
              android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
          controller.hide(android.view.WindowInsets.Type.navigationBars())
        }
      } else {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
          android.view.View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            or android.view.View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            or android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        )
      }
    } catch (_: Exception) {}
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "SwipePlay"

  override fun onPause() {
    super.onPause()
    try {
      window?.decorView?.let { decor ->
        pauseAllWebViews(decor)
      }
    } catch (_: Exception) {}
  }

  override fun onResume() {
    super.onResume()
    try {
      window?.decorView?.let { decor ->
        resumeAllWebViews(decor)
      }
    } catch (_: Exception) {}
  }

  private fun pauseAllWebViews(view: android.view.View) {
    if (view is android.webkit.WebView) {
      try {
        view.onPause()
        view.pauseTimers()
      } catch (_: Exception) {}
    } else if (view is android.view.ViewGroup) {
      for (i in 0 until view.childCount) {
        pauseAllWebViews(view.getChildAt(i))
      }
    }
  }

  private fun resumeAllWebViews(view: android.view.View) {
    if (view is android.webkit.WebView) {
      try {
        view.resumeTimers()
        view.onResume()
      } catch (_: Exception) {}
    } else if (view is android.view.ViewGroup) {
      for (i in 0 until view.childCount) {
        resumeAllWebViews(view.getChildAt(i))
      }
    }
  }

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
