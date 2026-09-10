/**
 * Straight port of the native AdTimingPolicy so both clients make identical
 * "is an interstitial due?" decisions from the same Admin Panel settings.
 */
import { clamp } from '../utils/misc';

export function restoredAnchor(savedMs: number, nowMs: number): number {
  return savedMs >= 1 && savedMs <= nowMs ? savedMs : nowMs;
}

export function intervalMs(minutes: number): number {
  return clamp(minutes, 1, 1440) * 60_000;
}

/**
 * @param elapsedMs      time since the last interstitial was shown
 * @param minutes        effective interval (per-game override or remote default)
 * @param cooldownSeconds minimum spacing enforced for event-triggered ads
 * @param eventDue       a swipe/level/game-over trigger fired
 */
export function isAdDue(
  elapsedMs: number,
  minutes: number,
  cooldownSeconds: number,
  eventDue: boolean,
): boolean {
  const interval = intervalMs(minutes);
  if (elapsedMs >= interval) return true;
  const cooldown = Math.min(Math.max(cooldownSeconds, 0) * 1000, interval);
  return eventDue && elapsedMs >= cooldown;
}
