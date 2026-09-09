# Ads and Admin analytics review — 2026-09-09

## Confirmed production causes

1. `/api/ads/config` returned `interstitialEnabled: false` while
   `defaultIntervalMinutes` was 1. The Android master guard returned before any
   display. A working banner is a different ad format and does not prove an
   interstitial is enabled or loaded. With the user's approval, only the global
   interstitial switch was enabled; the one-minute interval was preserved.
2. The Admin analytics router was mounted after the game router. Its fail-closed
   game policy rejected `/analytics/summary` before the analytics handler ran.
   An authenticated production request returned 404, "Unknown administrative
   operation". SQLite already contained 257 starts, 244 exits, 199 duration
   events and 4 completions at inspection time. Data collection was working.
3. The Admin UI ignored non-success responses and rendered missing data as zero.
   It also fetched once at mount, not continuously. The fix routes analytics
   before game operations, retains the outer session/permission/CSRF boundary,
   reports request errors, and refreshes the visible analytics tab every 15s.

## Android timing defects corrected

- Remote ad settings were fetched only during Activity creation. Changes made
  while playing stayed stale. Global settings now refresh on resume and every
  30s while foregrounded. Per-game catalog settings refresh alongside them;
  ad-only edits update metadata without reloading the WebView.
- An expired saved last-show time was reset to app startup, postponing an
  already-due ad. Valid previous timestamps now survive reopening. In-process
  timing uses the monotonic clock; invalid/future saved timestamps are clamped.
- The clock was reset on both display and dismissal, adding the ad's duration
  to the next interval. It now resets only on actual display.
- Event callbacks could bypass cooldown. Events now respect cooldown; a larger
  cooldown cannot postpone the configured time-based interval.
- Missing foreground and full-screen guards could attempt presentation while
  paused or reuse an ad already being shown. Ads are consumed before `show()`;
  foreground/full-screen guards apply to timer and callbacks alike.
- Load/show failure retries are limited to one attempt per 30s. Failed loads
  and shows do not count as successful displays.
- Duplicate starts from catalog selection/reset no longer reset the current
  analytics session. Interstitial/rewarded overlays pause gameplay duration
  instead of counting as new gameplay sessions. The SDK impression callback
  emits `ad_impression`, now exposed in the Admin summary.

## Complete flow and required values

Admin save → authenticated PUT `/v1/admin/ads-config` → JSON file beside the
runtime catalog → public GET `/api/ads/config` → Android main-thread settings
application/cache → one-second scheduler → enabled-game and foreground checks
→ preloaded AdMob interstitial → `show()` → actual-display timestamp reset →
`onAdImpression` → POST `/api/analytics/event` → SQLite → authenticated Admin
analytics summary → dashboard refresh.

Per-game saves use `/v1/admin/games/:id/ads`; Android obtains `ads` through
`/api/games`. `ads.enabled=false` blocks that game. Otherwise ads are allowed;
`useCustomInterval=true` selects that game's `intervalMinutes`, or the global
`defaultIntervalMinutes` applies. No level-completed, lost, restarted or swipe
enabled state is required for interval eligibility.

One minute means eligible after 60 seconds; five minutes after 300 seconds,
checked within about one second while foregrounded. The first interval starts
on first launch; later intervals start at the actual display callback.
Background time counts, but presentation waits until the app is foregrounded.
SDK loading, network failure, disabled games and backgrounding can delay actual
display: exact wall-clock presentation cannot be guaranteed. Swipe/level/game
over settings are separate optional earlier triggers, subject to cooldown;
turning these off does not disable the timer.

The global master switch must be ON. A loaded **interstitial** is required;
a banner does not fulfill it. Debug APKs intentionally use Google test unit IDs.
The AdMob application ID is compiled into the Android manifest; changing its
Admin field does not rewrite an installed APK. Unit-ID overrides apply only to
non-debug builds.

## Analytics timing and limits

No GA4/Firebase credentials, debug mode or minimum play duration are needed for
the Admin database. `game_start` is sent when selecting/starting a session.
Completion and loss counters require the corresponding native bridge callback;
not every game necessarily emits one. Duration is recorded when swiping away
or backgrounding, not continuously while the same session remains open. Exits
under 10 seconds are marked abandoned. Durations are whole seconds.

Required ingestion fields are `clientId`, `gameId`, and a supported `eventName`.
Successful HTTP ingestion writes SQLite before returning success. The Admin
summary reads that database immediately, and the visible UI refreshes within
15 seconds or on manual Refresh. The "today" range uses server-local midnight.
Google Analytics reporting delay is unrelated to this Admin page.

The client tries its active API base and fallback addresses immediately. Events
that fail all candidates are logged and dropped: there is no durable offline
outbox. Previously dropped events cannot be recovered by this fix. Historical
duplicate counts are left intact. GA4 remains unconfigured, as requested.

Android source changes require installing the new APK. A server deployment
alone cannot replace timing logic inside an already-installed Android app.
