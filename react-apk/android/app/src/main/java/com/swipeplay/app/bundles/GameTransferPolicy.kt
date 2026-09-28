package com.swipeplay.app.bundles

import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

/** Foreground streams always outrank speculative network/disk work. */
class ForegroundAssetGate(private val now: () -> Long = { System.nanoTime() / 1_000_000 }) {
  private val active = AtomicInteger(0)
  private val quietUntil = AtomicLong(0)
  @Volatile var onForegroundStart: (() -> Unit)? = null

  fun begin() {
    active.incrementAndGet()
    onForegroundStart?.invoke()
  }

  fun end() {
    quietUntil.accumulateAndGet(now() + 500) { previous, next -> maxOf(previous, next) }
    active.decrementAndGet()
  }

  fun isBusy(): Boolean = active.get() > 0 || now() < quietUntil.get()
}

object GameTransferPolicy {
  const val MAX_STARTUP_FILES = 24
  const val MAX_STARTUP_BYTES = 6L * 1024 * 1024

  /** Applies on Wi-Fi too. Being on a background thread isn't a bandwidth cap. */
  fun rate(playing: Boolean, metered: Boolean, priority: Int,
    playingRate: Long, nextRate: Long, cellularRate: Long, cellularNextRate: Long): Long {
    val next = priority <= 1
    val wifi = if (!playing) 0L else if (next) nextRate else playingRate
    val cellular = if (!metered) 0L else if (next) cellularNextRate else cellularRate
    return when {
      wifi <= 0 -> cellular
      cellular <= 0 -> wifi
      else -> minOf(wifi, cellular)
    }
  }
}
