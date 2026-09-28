package com.swipeplay.app.bundles

import org.junit.Assert.*
import org.junit.Test

class GameTransferPolicyTest {
  private fun rate(playing: Boolean, metered: Boolean, priority: Int): Long =
    GameTransferPolicy.rate(playing, metered, priority, 192, 512, 128, 256)

  @Test fun backgroundWorkIsLimitedDuringPlayEvenOnWifiAndForSelectedBundles() {
    assertEquals(512L, rate(true, false, 0))
    assertEquals(512L, rate(true, false, 1))
    assertEquals(192L, rate(true, false, 3))
    assertEquals(0L, rate(false, false, 3))
  }

  @Test fun cellularLimitsApplyEvenWhenGameplayIsIdle() {
    assertEquals(256L, rate(true, true, 1))
    assertEquals(128L, rate(true, true, 3))
    assertEquals(128L, rate(false, true, 3))
  }

  @Test fun foregroundRequestsHoldBackgroundWorkUntilAllRequestsAndQuietPeriodFinish() {
    var clock = 0L
    val gate = ForegroundAssetGate { clock }
    var interruptions = 0
    gate.onForegroundStart = { interruptions++ }
    assertFalse(gate.isBusy())
    gate.begin()
    gate.begin()
    assertTrue(gate.isBusy())
    assertEquals(2, interruptions)
    gate.end()
    clock = 1000
    assertTrue(gate.isBusy())
    gate.end()
    clock = 1499
    assertTrue(gate.isBusy())
    clock = 1500
    assertFalse(gate.isBusy())
  }
}
