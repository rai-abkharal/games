package com.swipeplay.app

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
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

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "SwipePlay"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
