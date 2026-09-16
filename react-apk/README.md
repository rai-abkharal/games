# Swipe Play — React Native client

A production-quality React Native + TypeScript client for the Swipe Play
mini-game platform. It talks to the **same live backend** as the existing
Android native app (`../app`), plays the **same HTML5 games**, honours the
**same Admin Panel configuration** (names, visibility, order, per-game ad
rules, remote ad config) and reproduces the native app's **vertical swipe
feed, glass header, floating dock, ads and analytics** — while remaining a
completely independent code base.

> The existing Android native application in `../app` is untouched. This
> project lives entirely inside `react-apk/`, has its own package id
> (`com.swipeplay.app`), its own Gradle/Xcode projects and its own
> dependencies.

---

## Contents

1. [Requirements](#requirements)
2. [Installation](#installation)
3. [Running on Android](#running-on-android)
4. [Running on iOS](#running-on-ios)
5. [Environment configuration](#environment-configuration)
6. [Project architecture](#project-architecture)
7. [Backend / API flow](#backend--api-flow)
8. [The game feed](#the-game-feed)
9. [Game loading and lifecycle](#game-loading-and-lifecycle)
10. [Ads](#ads)
11. [Analytics](#analytics)
12. [Building APKs](#building-apks)
13. [Tests and quality gates](#tests-and-quality-gates)
14. [Native parity notes](#native-parity-notes)
15. [Known limitations](#known-limitations)

---

## Requirements

| Tool | Version used |
|---|---|
| Node.js | ≥ 22.11 (24.x used) |
| npm | 11.x |
| JDK | 17 (Zulu 17; set `JAVA_HOME` to it — Gradle 9 / AGP need 17+) |
| Android SDK | platform `android-37`, build-tools `36.0.0`, NDK `27.0.12077973`, CMake `3.22.1` |
| React Native | 0.87.1 (New Architecture, Hermes) |
| Xcode (iOS only) | 16+ with CocoaPods |

The Android SDK location is read from `android/local.properties`
(`sdk.dir=…`) or `ANDROID_HOME`.

If your SDK has different build-tools/NDK versions installed, change the two
pins at the top of `android/build.gradle` (`buildToolsVersion`, `ndkVersion`)
— they were pinned to already-installed versions to avoid multi-GB downloads.

## Installation

```bash
cd react-apk
npm install
```

## Running on Android

Start an emulator (or plug in a device with USB debugging), then:

```bash
npm run android
```

This builds the debug APK, installs it and starts Metro. The debug build
always uses Google's **test** AdMob unit ids, exactly like the native app's
debuggable builds.

To produce a **self-contained debug APK** that runs without Metro:

```bash
npm run android:debug-apk
# → android/app/build/outputs/apk/debug/app-debug.apk
```

This bundles the JavaScript (`--dev true`, so `__DEV__` stays on and test ad
units are used) into `android/app/src/main/assets/index.android.bundle`,
then runs `assembleDebug`. The bundle and the copied image assets are
git-ignored. At runtime the debug ReactHost still tries Metro first and falls
back to the embedded bundle when no packager answers.

## Running on iOS

```bash
cd ios && bundle install && bundle exec pod install && cd ..
npm run ios
```

The iOS project (`ios/SwipePlay.xcworkspace` after `pod install`) is fully
configured: portrait-only, `GADApplicationIdentifier`, `SKAdNetworkItems`,
and App Transport Security exceptions for the plain-HTTP backend (see
[Known limitations](#known-limitations)).

## Environment configuration

All configuration is centralised in **`src/config/env.ts`** and is
*mobile-safe by design* — it only contains public values:

| Constant | Purpose |
|---|---|
| `DEFAULT_BASE_URL` | `http://162.243.197.241:3000` — the live host the native app uses |
| `CANDIDATE_BASE_URLS` | Fallback hosts tried in order (`:3000`, `:80`, `:8080`; `10.0.2.2` only in `__DEV__`) |
| `API_PATHS` | `/api/games`, `/api/ads/config`, `/api/analytics/event` |
| `NETWORK` | Timeouts and refresh throttles (catalogue 30 s, ads config 30 s, game load 20 s) |
| `ADMOB_DEFAULTS` | Google's public **test** ids — the compiled-in fallback |
| `GAMEPLAY` | Starter coins, hint reward |
| `FEED` | Feed tuning: warm/prefetch gates, prefetch budget, swipe slop/threshold/fling, settle time, dock auto-hide |

Development vs production is driven by React Native's `__DEV__` flag:

* **Debug builds** add emulator loopback hosts to the candidate list, keep
  test ad units regardless of what the server sends, and enable WebView
  remote debugging (`chrome://inspect`).
* **Release builds** use production ad units from `/api/ads/config`.

No secrets exist in the app. The GA4 API secret and admin credentials live
only on the backend; the app never calls Google Analytics directly — it posts
to `/api/analytics/event` and the server forwards to GA4.

To point the app at another backend, change `DEFAULT_BASE_URL` /
`CANDIDATE_BASE_URLS`, update `android/app/src/main/res/xml/network_security_config.xml`
if it is still plain HTTP, and rebuild.

## Project architecture

```
react-apk/
├── App.tsx                    Boot: hydrate stores, start ads, splash overlay, navigator + toast
├── index.js                   RN entry
├── app.json                   App name + react-native-google-mobile-ads app ids
├── android/                   Independent Android project (com.swipeplay.app)
├── ios/                       Independent iOS project (SwipePlay)
├── __tests__/                 Jest unit tests for the pure logic
└── src/
    ├── api/
    │   ├── http.ts            fetch + timeout + abort, multi-host fallback, active base URL
    │   ├── catalogApi.ts      GET /api/games → sanitised, URL-normalised, sorted games
    │   ├── adsApi.ts          GET /api/ads/config → range-checked AdsRemoteConfig
    │   └── analyticsApi.ts    POST /api/analytics/event (native-compatible payload)
    ├── components/
    │   ├── feed/
    │   │   ├── GamePager.tsx  Vertical one-page-per-swipe pager (PanResponder + native-driver transform)
    │   │   ├── GamePage.tsx   One feed page: slot-driven WebView lifecycle, placeholder, error/retry
    │   │   ├── FeedHeader.tsx The native glass top bar (banner slot, name, coins, title, meta, best)
    │   │   ├── FeedDock.tsx   Floating glass dock: All Games / Like / Favorites / Settings + ⌃⌄ handle
    │   │   └── NavIcons.tsx   Tintable gamepad / heart / star / gear drawn without an icon library
    │   ├── Splash.tsx         activity_splash.xml as a 1200 ms overlay
    │   ├── AdBanner.tsx       Admin-controlled banner inside the header's fixed 50 dp slot
    │   ├── StateViews.tsx     Loading / message / offline views
    │   └── Toast.tsx
    ├── feed/
    │   ├── preloadPlanner.ts  Pure slot rules: active / ahead / behind / far, prefetch order, retain window
    │   └── pagerGesture.ts    Pure gesture rules: touch zones, slop + dominant axis, drag offset, settle target
    ├── screens/
    │   ├── FeedScreen.tsx     MainActivity: header + pager + dock, load gating, bridge handling, ads, analytics
    │   └── SettingsScreen.tsx Sound, vibration, theme, profile, cache refresh
    ├── navigation/            Native stack (Feed → Settings), typed params
    ├── services/
    │   ├── gameBridge.ts      Injected bootstrap (bridge globals, AudioContext hook, frame gate) + host→game scripts
    │   ├── gameBundles.ts    JS half of the on-device store: wish-list, priorities, ready/progress state
    │   ├── adManager.ts       AdMob orchestration (remote config, interstitial, rewarded)
    │   ├── adTimingPolicy.ts  Port of native AdTimingPolicy
    │   ├── analytics.ts       Firebase/GA4 taxonomy + backend pipeline with bounded offline queue
    │   └── storage.ts         AsyncStorage JSON helpers with coalesced writes
    ├── store/
    │   ├── catalogStore.ts    zustand: games, status, cache-first refresh
    │   ├── playerStore.ts     zustand: coins, high scores, levels, favourites, settings
    │   └── toastStore.ts
    ├── hooks/                 useAppStateChange, useIsOffline
    ├── theme/                 The three native palettes, HUD colours, glass surface tokens
    ├── types/                 Catalogue + bridge types (match backend GameSchema)
    └── utils/                 URL normalisation / cache-busting, misc helpers
```

**State management:** two small [zustand](https://github.com/pmndrs/zustand)
stores. Components subscribe to individual fields (`useStore(s => s.field)`),
so a coin change re-renders the coins pill, not the pager. Persistence is
in-memory first with debounced writes to AsyncStorage; nothing on a hot path
touches disk.

## Backend / API flow

The backend is the existing Node/Express service in `../backend`. Endpoints
used (all public, all identical to the native client):

| Endpoint | Method | Used for |
|---|---|---|
| `/api/games` | GET | Catalogue of **published** games, sorted by Admin Panel feed order. Includes admin-edited titles (`title`), thumbnails, entry URLs, `touchZones`, `features`, per-game `ads` |
| `/api/ads/config` | GET | Remote ad configuration from the Admin Panel "Ads & Monetization" page |
| `/api/analytics/event` | POST | Gameplay/ad events; server stores them and forwards to GA4 |

Request behaviour (`src/api/http.ts`):

* Each request has a hard timeout (AbortController) and can be cancelled.
* Hosts are tried in order; the first that answers becomes the *active base
  URL*, is persisted, and is used to normalise asset URLs (`localhost`,
  `10.0.2.2`, `games.example.com` → active host — same rule as
  `GameRepository.normalizeGameUrls`).
* The catalogue request carries a cache-buster and `Cache-Control: no-cache`.

Catalogue lifecycle (`src/store/catalogStore.ts`):

1. **Boot:** the last catalogue is read from storage and the feed renders immediately.
2. A network refresh runs in parallel and replaces it when it succeeds.
3. Refreshes are throttled to 30 s, de-duplicated (one in flight), and
   triggered on feed focus, app foreground, and "Try again".
4. A failed refresh never discards existing data.
5. The feed compares a content signature (ids, versions, titles, ad rules,
   touch zones) and keeps the previous list object when nothing relevant
   changed, so a refresh never remounts or reloads a running game
   (`MainActivity.refreshCatalogFromServer` does the same comparison).

Malformed entries (missing id/entryUrl, non-published status, duplicate ids)
are dropped individually so a single bad record cannot break the app.

## The game feed

The app opens straight into the feed, like `MainActivity`:

```
┌──────────────────────────────────────┐
│ status bar (theme background)        │
│ ┌──────────────────────────────────┐ │  glass top bar, bottom corners 20 dp,
│ │ [ banner slot 50 dp ]            │ │  padding 10/16/4, elevation 20
│ │ Guest_ABC  🪙 120      Title     │ │  name 13 sp • coins pill • title 14 sp right
│ │                    1 of 43 • Arc │ │  meta 11 sp • 🏆 best pill
│ └──────────────────────────────────┘ │
│                                      │
│           vertical pager             │  one game per page, swipe up/down
│         (WebView per live page)      │
│                                      │
│              ( ⌃ / ⌄ )               │  56×24 handle pill
│ ╭──────────────────────────────────╮ │  floating glass dock 56 dp, radius 30,
│ │ 🎮 All   ♡ Like   ★ Favs   ⚙ Set │ │  8 dp side margins, auto-hides after 5 s
│ ╰──────────────────────────────────╯ │
└──────────────────────────────────────┘
```

* **Header** (`FeedHeader`) reproduces `activity_main.xml`'s `topBar`: the
  `bg_top_bar_glass` / `_dark` layer-list (translucent navy fill, 1 dp light
  border, inner "sheen"), fixed 50 dp banner slot when banners are enabled,
  player name + amber coins pill, right-aligned title with "n of N • Category",
  and the gold high-score pill. The pager sits **below** the header, exactly
  as the native `ViewPager2` is constrained below `topBar`.
* **Dock** (`FeedDock`) reproduces `bottomNavBar` + `bottomBarToggleHandle`:
  `bg_nav_bar` colours, four equal tabs (icon + 11 sp bold label), accent tint
  for the active tab, `#D6E9FF`/`#BFDBFE` inactive tint, red filled heart when
  the current game is a favourite. It floats over the game, slides out after
  5 s of inactivity (260 ms decelerate, native-driver transform, no layout
  change under the WebView) and comes back on page change, game over, level
  clear, or a tap on the handle — `MainActivity.toggleBottomBar`.
* **Pager** (`GamePager`) is the React Native counterpart of the vertical
  `ViewPager2`: one page per swipe, 280 ms settle, the destination reported
  the moment the finger lifts (`onPageSelected` timing), resistance past the
  ends. It is a PanResponder on the pages' ancestor, so:
  * taps and small drags reach the game untouched;
  * a drag becomes a page swipe only past a 12 px slop **and** when it is more
    vertical than horizontal (RecyclerView's dominant-axis rule), so games
    that drag sideways keep their gesture;
  * a touch that starts inside one of the game's `touchZones` is never taken
    (the equivalent of `requestDisallowInterceptTouchEvent(true)`);
  * a game can turn swiping off/on with `setSwipeEnabled`;
  * when the pager does claim a drag, Android's JS-responder mechanism cancels
    the touch inside the WebView, exactly like a ViewPager2 intercept.
* **Tabs**: All Games / Favorites re-filter the feed while staying on the
  current game when it is still present (`filterGamesByTab`). Like toggles the
  current game's favourite flag. Settings opens `SettingsScreen` (an
  interstitial check runs first, like the native app).
* **Splash**: `activity_splash.xml` is shown as an overlay for 1200 ms while
  the feed already boots underneath, so the first game is frequently running
  by the time the splash fades.

## Game loading and lifecycle

Games are self-contained HTML5 bundles served by the backend at
`entryUrl` (`/games/<id>/<version>/index.html`). They were written against a
host bridge (`FlutterGameBridge.postMessage({action,payload})`, and for some
uploads direct `NativeBridge.method()` calls). Each live page reproduces that
contract inside `react-native-webview`, configured like `GameFeedAdapter`'s
WebView (JS + DOM storage, autoplay media, mixed content, default HTTP cache,
hardware layer, no scrollbars/overscroll).

### Slots (`src/feed/preloadPlanner.ts`)

The native feed keeps `ViewPager2.offscreenPageLimit = 1`: the current page
plus one on each side own WebViews. The React feed reproduces that with
explicit slots derived from the current index and the direction of travel:

| Slot | Which page | WebView | What happens |
|---|---|---|---|
| **active** | current | yes | created as soon as the pager rests on it; runs at full speed; receives saved state + resume script |
| **ahead** | current + direction | yes, gated | created only once the active game has finished loading (+600 ms) or after a 3.5 s fallback; loads, renders its first ~90 frames, then is frozen |
| **behind** | current − direction | kept if it exists | never starts a load; a frozen WebView is retained so swiping back is instant |
| **far** | everything else | no | WebView torn down (engine destroy script, then unmount); nearby far pages render only the placeholder |

So at most three WebViews exist, usually two while browsing forward, and the
active game is always the first to get the CPU, GPU and network:

```
launch:            [ 1 active ] [ 2 warm ] [ 3, 4, 5 HTML in memory ] [ 6+ nothing ]
swipe to 2:        [ 1 frozen, kept ] [ 2 active ] [ 3 warm ] [ 4, 5, 6 HTML ] …
swipe to 3:        [ 1 destroyed ] [ 2 frozen, kept ] [ 3 active ] [ 4 warm ] [ 5, 6, 7 HTML ]
swipe back to 2:   [ 1 warm ] [ 2 active ] [ 3 frozen, kept ] [ 4 destroyed ]
```

### Downloading and the on-device store

Games are stored on the device by a native module
(`android/.../app/bundles/`) and served back to the WebView from a loopback
HTTP origin. JavaScript never holds a game document: it hands down a
wish-list of `{gameId, buildId, bundleUrl, priority}` and gets back status
events plus a `http://127.0.0.1:<port>/<token>/<gameId>/<buildId>/<entry>`
URL, so a 30 MB game costs the JS heap exactly what an 8 KB one does.

**Priority is the player's position in the feed**, recomputed on every settled
swipe (`FeedScreen` -> `syncBundles`):

| Tier | Which game | Queue | Rate ceiling |
|---|---|---|---|
| `current` | the page on screen | first | none, on any connection |
| `next` | one swipe away | second | 2 MB/s while playing, 600 KB/s metered |
| `near` | the +2/+3 lookahead | after those | 400 KB/s while playing, 150 KB/s metered |
| `rest` | the remaining catalogue | last | same as `near` |

Nothing is limited at all when no game is running on an unmetered link, and
the whole catalogue is never fetched up front — it is simply queued behind
everything closer to the player.

**The job in flight is re-scored with the queue.** A bundle that started three
swipes ago and has since fallen a whole tier is *preempted*: the transfer
stops, its `.part` file stays on disk, and it resumes from that byte when it
comes back round. A bundle past 90 % is left alone, because the reconnect a
restart costs is worth more than the seconds a newcomer would gain. This is
what stops a distant download from holding up the game about to be opened.

**Cache-first, always.** A build already stored at the `buildId` the catalogue
advertises is never requested again — a relaunch against an unchanged
catalogue issues no network requests at all. Downloads are resumable
(`Range`), atomic (staged, hash-verified per file, published by one directory
rename) and backed off exponentially per build on failure (30 s doubling to
30 min, cleared the moment that build activates).

**Storage is not rationed the way it used to be.** The budget is 1 GB rather
than 250 MB, with a hard floor that never takes the device below 512 MB free.
An evicted game is a game that has to be downloaded again, which is the one
thing the store exists to prevent, and the whole catalogue is well under a
tenth of the budget.

**Two things happen after the bytes land**, both aimed at the gap between
"the file is on disk" and "the game is on screen":

* the build is read through the kernel page cache when it is within the
  lookahead, so the WebView's first read comes from memory rather than flash;
* the loopback server answers with
  `Cache-Control: public, max-age=31536000, immutable` and a path token that
  is stable across launches. A URL there names a `buildId`, and a `buildId`
  is a content hash, so the bytes behind it cannot change. What this actually
  buys is V8's compiled-code cache — keyed by resource URL — which is what
  makes the *second* open of a game with a megabyte-plus engine bundle skip a
  full parse and compile.

### Pausing background pages (`src/services/gameBridge.ts`)

`WebView.onPause()` — which the native adapter uses to stop offscreen pages
rendering — has no React Native equivalent, and only two of the games expose
an engine handle (`__PHASER_GAME__`) the native pause script can put to
sleep. The injected bootstrap therefore installs a **frame gate** around
`requestAnimationFrame`: while a page is in the background every rAF request
is parked instead of scheduled, so *any* game loop stops, whatever engine it
uses. The pause script still does everything the native one does (visibility
+ blur events, CSS animation freeze, Phaser/PIXI sleep, AudioContext and
media suspend, `GameBridge.pause`), then closes the gate; the resume script
opens it and releases the parked callbacks. A page that has just finished
loading offscreen gets 90 frames of grace before the gate closes, so its
title screen is already painted when the player swipes to it.

### Load states and failures

* Placeholder identical to `item_game_page.xml` (dark surface, 88 dp circle
  with 🎮, title, "CATEGORY • 120 FPS ENGINE", 4 dp indeterminate line) fades
  out in 120 ms when the page finishes loading.
* The placeholder says what the wait is *for*: `Downloading 47%` from the
  real byte counts while a bundle is in flight, `Starting…` once the WebView
  has the document, and nothing at all for a game already on the device —
  there is no download to narrate. Progress lands four times a second and is
  subscribed to by that one line of text, by game id, so neither the page nor
  the feed re-renders on a tick.
* Every load attempt reports its own stages (`game_load`: WebView creation,
  HTML to DOMContentLoaded, engine to `window.load`, first painted frame,
  total), so "the big games are slow" can be answered with which stage is
  slow rather than an assumption about bundle size.
* 20 s hard timeout, HTTP errors on the entry URL, network errors and renderer
  crashes (`onRenderProcessGone`) show an error view with Retry. A page that
  failed while it was being prepared retries once automatically when the
  player reaches it.
* Bridge messages are routed with the sender's game id and ignored unless
  they come from the page on screen, so a preloaded game can never award
  coins, trigger ads or disable swiping for the live one.
* Rapid swiping: destinations are chosen on release, the settle animation
  runs on the UI thread, and a *new* WebView is only created once the pager
  is at rest — so flicking through several pages shows placeholders and
  creates no WebViews for the pages flown past.
* App background → every live page is frozen; foreground → only the active
  page resumes (`MainActivity.onPause/onResume`). Opening Settings pauses the
  active game and returning resumes it.

## Ads

Google AdMob via `react-native-google-mobile-ads` (the native app uses the
Google Mobile Ads SDK directly). `src/services/adManager.ts` ports the
orchestration from `MainActivity`:

* **Remote config** from `/api/ads/config`, cached in storage, re-read every
  30 s while the app is foregrounded: `bannerEnabled`, `interstitialEnabled`,
  `swipeInterval`, `defaultIntervalMinutes`, `cooldownSeconds`,
  `levelCompleteAd`, `levelWinInterval`, `gameOverAdEnabled`, unit ids.
* **Interstitials** are preloaded; failures back off for 30 s. An ad is due
  when `AdTimingPolicy.isDue(elapsed, minutes, cooldown, eventDue)` says so —
  identical logic to the native class (see `__tests__/adTimingPolicy.test.ts`).
  Triggers: every page change counts as a swipe; game over; level win
  threshold; opening Settings.
* **Per-game overrides** (`game.ads` from the catalogue): `enabled=false`
  suppresses ads for that game; `useCustomInterval` swaps in
  `intervalMinutes`.
* **Rewarded** ads back the in-game hint request. If no ad is ready the
  reward is granted instantly (+50 coins), as in the native app.
* **Banner** in the header's fixed 50 dp slot when `bannerEnabled` (the
  native `bannerAdContainer`), invisible until an ad actually fills.
* The last-shown timestamp is persisted so intervals survive restarts; ad
  time is excluded from analytics play time; the interstitial listener set is
  torn down and rebuilt per ad so there are never duplicate listeners.
* Debug builds always use test unit ids.

## Analytics

Two pipelines run side by side: **Firebase / GA4** (the product analytics) and
the **backend ingest endpoint** (`POST /api/analytics/event`, which
`src/services/analytics.ts` ports from `GameAnalyticsManager`). The lifecycle
events go to both; everything else is Firebase-only. Rules kept from native:
a duplicate `game_start` for the active game is ignored, switching games
emits `game_exit` with `exit_reason=swiped_away`, backgrounding emits
`app_paused` unless an ad is showing, and sessions under 10 s are
`is_abandoned`.

### Event taxonomy

| Event | When | Beyond the shared identity |
|---|---|---|
| `game_impression` | a game is reached in the feed, once per game per session | `feed_position` |
| `game_select` | the same moment, in GA4's recommended shape | `item_id`, `item_name`, `content_type` |
| `game_start` | a game becomes the page on screen | `play_count`, `attempt_number` |
| `game_load` | a load attempt settles | `outcome`, `source`, `webview_ms`, `html_ms`, `engine_ms`, `first_frame_ms`, `total_ms` |
| `game_download` | a bundle finishes or gives up | `outcome`, `bytes`, `duration_ms`, `kbps` |
| `level_start` / `level_end` | level boundaries | `level_number`, `success`, `result` |
| `game_complete` / `game_fail` | win / loss | `score`, `level`, `duration_seconds`, `result` |
| `game_exit` | swiped away, backgrounded, navigated | `exit_reason`, `abandoned`, `duration_seconds` |
| `game_action` | hints, coins, favourites, diagnostics | `action_name`, `action_value` |
| `ad_impression` | a full-screen ad is shown | `ad_format` |
| `screen_view` | navigation | `screen_name`, `screen_class` |

Every game event carries the same identity, attached centrally so no call site
can forget it: **`game_id`, `game_name`, `game_version`, `category`,
`session_id`, `event_ts`**. `game_name` is resolved from the live catalogue,
so an Admin Panel rename shows up without a client release.

`game_load` is deliberately one event rather than the five it could be
(`load_start`/`load_complete`/`load_error`/`game_ready`/`first_frame`): GA4
reports on events, and "where did the time go" should be one row, not a join
across four. `game_download` likewise reports the finished transfer —
per-percent progress events would be the loudest thing in the property and
would say nothing the byte count and duration do not.

### Reliability

* **Nothing is silently swallowed.** Every Firebase promise is awaited and its
  rejection reported (once per distinct failure, in development); a Firebase
  that cannot initialise at all is surfaced through `analyticsHealth()`
  instead of turning into "no events, and no reason given".
* **GA4's limits are enforced before the SDK sees the event**, because the
  SDK's own answer to breaking them is to drop the parameter without a word,
  in release, where nobody is watching: 40-char event and parameter names, a
  100-char value cap, 25 parameters. Booleans are normalised to `1`/`0` —
  GA4 has no boolean type and a raw one arrives unusable.
* **No duplicates by construction.** `game_start` is ignored while the same
  game is already active; `game_impression` is once per game per session;
  `game_load` is keyed by `gameId:buildId:attempt`, so a WebView remount or a
  replayed effect cannot report one load twice. Firebase's own automatic
  screen reporting is turned **off** in `firebase.json` — the app logs its own
  semantic `screen_view`, and leaving both on produced two per navigation.
* **No custom queue for Firebase.** The SDK already persists and retries
  events across launches and offline periods; the bounded 50-event persisted
  queue in this file is for the *backend* pipeline only. Nothing in analytics
  can throw into UI code.

### Release configuration

* `android/app/google-services.json` must carry the same `package_name` as
  `applicationId` in `android/app/build.gradle` (`com.sogeitest`). A mismatch
  is the single most common cause of "analytics works in debug, not release";
  the Google Services Gradle plugin fails the build on it, so a build that
  succeeds has already proved this.
* `firebase.json` at the project root makes collection explicit rather than
  relying on defaults, and disables automatic screen reporting. The
  `@react-native-firebase/app` Gradle plugin turns it into manifest metadata
  at build time.
* `proguard-rules.pro` keeps Firebase, the Measurement SDK, the
  react-native-firebase modules and this app's own bridge modules. They are
  inert while `enableProguardInReleaseBuilds` is false — which it is — and
  exist so that turning shrinking on cannot quietly take analytics with it.
  R8 breaks Firebase invisibly: the app runs, events are logged, nothing
  arrives.
* Nothing in the code gates events on `__DEV__`. Debug and release send the
  same events; only the development-time warnings differ.

### Registering custom dimensions

`game_id`, `game_name`, `game_version`, `category`, `session_id`, `outcome`,
`source`, `exit_reason`, `result` and `action_name` are **event-scoped custom
dimensions**, and `total_ms`, `engine_ms`, `first_frame_ms`, `duration_ms`,
`bytes`, `score` and `duration_seconds` are **custom metrics**. Until they are
registered in *GA4 -> Admin -> Custom definitions* they arrive correctly but
cannot be used in any standard report — they show as `(not set)`. Registration
is not retroactive, so do it before the data you care about is collected.
(BigQuery export and DebugView show them regardless.)

### Verifying a release build

Settings -> tap the **Profile** heading five times reveals a Diagnostics card.
It is deliberately not behind `__DEV__`, because the questions it answers only
matter in a release build, where DebugView and logcat are not part of the
picture: whether Firebase initialised, the app's session id, whether the
on-device store is serving and how much is stored. **Send analytics ping**
logs a `game_action` with `action_name=analytics_ping` and a six-digit
`action_value` shown on screen — search for that value in GA4 Realtime to
confirm the production pipeline end to end.

## Building APKs

```bash
npm run android:debug-apk        # self-contained debug APK (see Running on Android)
cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```

or `npm run android:release`. Release builds bundle the JS with Hermes
bytecode. The release signing config currently uses the debug keystore so the
build succeeds out of the box — **replace it before shipping**: create a
keystore, put the credentials in `~/.gradle/gradle.properties`, and point
`signingConfigs.release` in `android/app/build.gradle` at them.

AAB: `cd android && ./gradlew bundleRelease` (or `npm run android:bundle`)
→ `android/app/build/outputs/bundle/release/app-release.aab`. ABIs included:
`armeabi-v7a`, `arm64-v8a`, `x86_64` (`reactNativeArchitectures` in
`android/gradle.properties`).

On Windows call `.\gradlew.bat` explicitly; a machine with
`NoDefaultCurrentDirectoryInExePath=1` will not find `gradlew.bat` from a
bare command name.

## Tests and quality gates

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # jest
```

Jest covers the pure logic: slot planning and prefetch order, pager gesture
rules (touch zones, slop/dominant axis, drag offset, settle target), the
prefetcher (priority, size caps, back-off, LRU budget, offline), the injected
scripts (frame gate, bridge globals), ad timing, bridge message parsing, URL
rules and API normalisation.

## Native parity notes

* **Feed, not grid.** The native app has no catalogue grid; it opens into the
  swipe feed with All/Favorites tabs in the dock. The React app now does the
  same (the earlier grid + single-player screens were removed).
* **Header/dock colours** are the native `#AARRGGBB` drawables converted to
  `rgba()` (`src/theme/themes.ts` → `GLASS`), on the same three palettes from
  `ThemeManager`. Android has no cheap real-time blur behind a live WebView
  and the native app does not blur either — both use translucent fills with a
  light border and inner sheen.
* **Icons** are drawn with views and monochrome glyphs instead of the vector
  drawables, so they tint like the originals without an icon dependency.
* **Wrap-around.** The native pager loops (`LOOP_FACTOR = 1000`). The React
  pager loops too once the feed has three or more games (pages live on an
  unbounded virtual strip, so wrapping never re-bases the translation); with
  one or two games the ends resist instead.
* **Swipe interception.** ViewPager2 intercepts natively; the React pager
  decides in JS from touch events. Because taps and the first pixels of every
  drag still reach the WebView, and the decision uses the same slop and
  dominant-axis rule, gameplay input is unaffected; the only observable
  difference is that the claim happens a frame later.
* **Banner slot.** Native always reserves 50 dp for the banner container;
  the React header reserves it only while banners are enabled.

## Known limitations

* **No offline gameplay cache.** The native app intercepts WebView requests
  and serves game files from disk. `react-native-webview` has no
  `shouldInterceptRequest` hook, so games need connectivity (prefetched HTML
  helps the next games load, but is not a persistent cache). The catalogue
  itself is available offline.
* **Plain-HTTP backend.** Cleartext is allowed on Android via
  `network_security_config.xml` and on iOS via `NSAllowsArbitraryLoads`.
  Move the backend behind HTTPS and tighten both before store submission.
* **Release signing** uses the debug keystore until a production keystore is
  configured.
* **iOS** is configured but was not built or run in this environment (no
  macOS/Xcode available). The pager gesture is Android-first: the
  JS-responder interception that cancels the WebView touch is an Android
  mechanism, and iOS was not exercised.
