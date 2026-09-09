package com.example.androidnative.manager

/** Interval eligibility is independent of level state and swipe callbacks. */
object AdTimingPolicy {
    fun restoredAnchor(saved: Long, now: Long): Long =
        if (saved in 1..now) saved else now

    fun intervalMs(minutes: Int): Long = minutes.coerceIn(1, 1440) * 60_000L

    fun isDue(elapsedMs: Long, minutes: Int, cooldownSeconds: Int, eventDue: Boolean): Boolean {
        val interval = intervalMs(minutes)
        if (elapsedMs >= interval) return true
        val cooldown = (cooldownSeconds.coerceAtLeast(0) * 1000L).coerceAtMost(interval)
        return eventDue && elapsedMs >= cooldown
    }
}
