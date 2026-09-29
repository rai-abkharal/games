# Interstitial audit and ad-break flow

## Live audit before changes (2026-09-29)

The public `https://games.raiabdullah.tech/api/ads/config` endpoint returned:

| Setting | Value |
| --- | --- |
| Interstitial enabled | `false` |
| Interstitial unit | `ca-app-pub-3940256099942544/1033173712` (Google sample) |
| Default interval | 15 minutes |
| Swipe interval | 24 |
| Level-complete / game-over triggers | Both disabled |
| Cooldown | 1,000,000 seconds |
| Banner unit | `ca-app-pub-7756444099802746/4303665873` (production-format ID) |
| Rewarded unit | `ca-app-pub-3940256099942544/5224354917` (Google sample) |
| Remote App ID | `ca-app-pub-3940256099942544~3347511713` (Google sample) |

These are the returned settings, not proof of AdMob ownership, approval, fill, or real-device delivery. Nothing was changed on the live server or in Admin.

### Admin wiring and IDs

The Admin Ads tab reads/saves `/v1/admin/ads-config`. Backend persistence is `ads_config.json` alongside the catalogue. The app reads `/api/ads/config` on the canonical HTTPS host, normalizes the result, caches it on disk, and refreshes about every 30 seconds in the foreground. Offline it keeps the cached settings, so a remote edit cannot take effect until the app reconnects. Global and per-game enable switches and intervals participate in the due decision.

The app uses Admin unit IDs directly in both debug and release. Its own fallback unit IDs are empty, not invented production IDs. Release rejects known Google sample units. Backend/Admin defaults still contain sample IDs. Therefore the currently disabled/sample-ID interstitial configuration cannot display an interstitial in a release APK. The live rewarded sample also prevents release rewarded loading; the existing instant hint reward fallback remains unchanged.

The Android SDK App ID is compiled from `react-apk/app.json`: `ca-app-pub-7756444099802746~2218584705`. Fetching the remote App ID does **not** change it. The remote sample App ID and compiled production App ID differ. Updating a compiled SDK App ID requires a rebuild; IDs should be checked against the actual AdMob app. The iOS entry is a sample App ID and needs separate production setup if iOS is shipped.

### Previous showing/loading behavior and defects

Previously, a loaded ad showed immediately when the timer, swipe, level-win, game-over, or Settings trigger qualified. The feed suspended gameplay while `fullScreenAdShowing` was true and resumed immediately on CLOSED. There was no countdown or close delay. Interstitial preloads were deferred during active gameplay to protect the renderer. Without a loaded creative, the request became pending rather than blocking play. The SDK OPENED event recorded an impression and reset the persisted interval anchor.

Fixed in this change:

- SDK ERROR could leave the full-screen pause flag set; only a rejected show promise recovered it.
- AppState active could resume ad analytics before the ad actually closed.
- Admin unit replacement could dispose the close/error listeners of an already-showing interstitial.
- An event-only pending request could be lost when LOADED called the timing check without retaining that event.
- Level-win counts reset before an ad successfully opened, and the first displayed game counted as a swipe.
- Unchanged config refreshes incremented the banner remount key, causing unnecessary banner requests.
- The feed's stable-list signature omitted `useCustomInterval`, so toggling only that Admin setting could leave stale per-game rules.
- Async startup/config work could continue after shutdown, and synchronous interstitial SDK throws were unhandled.
- Normal bridge resume could auto-restart a game flagged game-over; ad-specific resume now suppresses that automatic restart.

Existing limitations/concerns not changed:

- Timing policy intentionally caps event cooldown at the effective timer interval, and the timer path does not require cooldown. The live 1,000,000-second cooldown therefore does not suppress the 15-minute timer once interstitials are enabled. Admin should use sensible intended values.
- Backend Admin save accepts raw configuration instead of validating the exported ads schema, and writes are not atomic. Malformed values are partly normalized by the app but should be validated server-side in separate work.
- No app-owned consent/UMP or test-device configuration was found. Debug does not automatically replace production IDs with test IDs. Test only with sample units or an AdMob-registered test device; do not test/click live ads.
- Loaded creative age is not tracked. Long-session stale-ad/no-fill diagnostics should be verified on-device.
- The existing rewarded ERROR handler can dispose a showing ad without settling a pending hint request. Rewarded behavior was deliberately not rewritten in this interstitial-only task.
- Game pause uses the existing engine/bridge/frame-gate contract. A game's own wall-clock timers or callbacks that ignore that contract need game-specific validation; no broad timer or game-code rewrite was made.

Google recommends interstitials at natural transition points and avoiding unexpected interruptions. The requested countdown improves the pause transition but does not make any arbitrary mid-game placement compliant. See [Google interstitial guidance](https://developers.google.com/admob/android/interstitial) and [SDK display/event documentation](https://docs.page/invertase/react-native-google-mobile-ads/displaying-ads).

## New flow

Ready ad becomes due → synchronously pause existing game pages → show **Ad Break / 3** → **2** → **1** → request SDK presentation → await **CLOSED** → keep paused with **Resuming your game…** for two seconds → clear the ad hold.

The overlay sits above the existing app tree; it is not a navigation screen, WebView, or native Modal. Touches are intercepted, and app back navigation is blocked during countdown/return delay. The SDK ad owns its own native close controls. No WebView reload, saved-progress replay, or forced restart is performed on ad resume. Feed focus and AppState still gate resume: Settings/background games remain suspended even after the ad hold ends.

No ready ad means no countdown or forced pause while waiting for network fill. Existing active-play preload deferral remains. Duplicate triggers share one flow. Show rejection, synchronous throws, and SDK ERROR release the pause via the return delay and retain a 30-second retry backoff. SDK `show()` resolving is not treated as closure. Admin changes cannot tear down active presentation callbacks. Countdown backgrounding cancels presentation and retries from three in the foreground; a close while backgrounded waits for two foreground seconds before releasing the hold.

## Verify on device

1. Build a new `react-apk` APK. No changes to backend, Admin settings, native root project, downloads, game assets, game rules, or APK version were made.
2. For testing, use a sample interstitial unit in a debug build, or register the device as an AdMob test device before using production units. The current live configuration is disabled; no real ad delivery was exercised in this audit.
3. Check timer/swipe/level/game-over triggers, countdown, input isolation, SDK close, and the full two-second return delay. Verify the same game session, score, board and level remain.
4. Check no fill/offline, show failure, rapid triggers, Admin disable/unit rotation, Home/background during countdown/ad/return, Settings navigation, and changing sound preference.
5. Validate custom engine timers, audio and frame times across an ad. Automated tests verify lifecycle and scripts, not every game's runtime behavior or AdMob fill.

Verification completed locally: all 22 Jest suites / 192 tests passed, `npm run typecheck` passed, and Metro generated the Android release JavaScript bundle successfully. No APK was installed and no live ad was shown. The React review kept countdown subscriptions in the overlay and preserved the existing navigation/WebView tree.

## Swipe trigger switch and subsequent live settings check (2026-09-29)

Admin Ads now has a separate **Swipe-triggered ads ON/OFF** switch (`swipeAdEnabled`). It defaults to OFF, including existing saved/cached configurations without this field. Save Ads Configuration persists it. Turning it OFF disables swipe counting, clears a swipe-only pending request and cancels a swipe-only countdown. It never cancels a timer/event countdown or tears down SDK listeners for an already-showing ad. The numeric swipe frequency is retained; turning ON starts a fresh count. Global/per-game interstitial enable switches, timer intervals and cooldown policy are unchanged. No additional WebView, network timer, or background workload was introduced; the React review kept the switch controlled and accessible.

The subsequent read-only public endpoint check returned these updated settings:

| Ad or trigger | Live setting / behavior |
| --- | --- |
| Banner | Enabled; appears when loaded, not on an app-owned minute timer |
| Interstitial timer | Enabled; default 1 minute since the last SDK OPENED event, then the existing three-second countdown when a creative is ready |
| Swipe | Frequency 3; new switch absent on the live server, so the updated app treats it as OFF |
| Level completion / game over | Both OFF |
| Rewarded hint | Requested by the user/game, not scheduled by the interstitial timer |
| Cooldown | 180 seconds configured, but capped at the effective timer interval for event triggers; it does not enforce a three-minute timer gap |

Per-game custom intervals/disable settings still override the default timer. Due checks run about every two seconds while active. Missing creatives, active-play preload deferral and background/ineligible games may delay presentation. The persisted timestamp is wall-clock based and survives restarts; it is not an active-play stopwatch.

The live interstitial and rewarded IDs remain Google's samples, which release APKs reject. A production interstitial unit must be saved in Admin before real release interstitial delivery can work. IDs and live server settings were not modified in this task.

Deploy the updated backend and Admin build and rebuild/install `react-apk` to use the new switch end-to-end. Old APKs do not understand this field. The new APK safely defaults swipe ads OFF even if the backend has not yet been deployed. This change does not alter the separate root Android app.

Switch verification: all 22 app Jest suites / 200 tests passed, app TypeScript checks passed, Admin and backend builds passed, and the focused backend integration test confirmed Admin save/read and public configuration ON/OFF plus legacy OFF defaults. No real-device ad delivery or browser interaction was exercised.
