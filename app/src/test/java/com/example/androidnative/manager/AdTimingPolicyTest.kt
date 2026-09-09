package com.example.androidnative.manager

import org.junit.Assert.*
import org.junit.Test

class AdTimingPolicyTest {
    @Test fun oneMinuteDoesNotNeedAnyGameEvent() {
        assertFalse(AdTimingPolicy.isDue(59_999, 1, 60, false))
        assertTrue(AdTimingPolicy.isDue(60_000, 1, 60, false))
    }
    @Test fun fiveMinutesAndCustomIntervalsAreRespected() {
        assertFalse(AdTimingPolicy.isDue(60_000, 5, 60, false))
        assertTrue(AdTimingPolicy.isDue(300_000, 5, 60, false))
    }
    @Test fun cooldownCannotPostponeTheConfiguredInterval() {
        assertTrue(AdTimingPolicy.isDue(60_000, 1, 600, false))
        assertFalse(AdTimingPolicy.isDue(1_000, 1, 60, true))
    }
    @Test fun reopeningDoesNotResetAnOverdueAd() {
        assertEquals(1_000L, AdTimingPolicy.restoredAnchor(1_000, 700_000))
        assertEquals(700_000L, AdTimingPolicy.restoredAnchor(900_000, 700_000))
        assertEquals(700_000L, AdTimingPolicy.restoredAnchor(0, 700_000))
    }
}
