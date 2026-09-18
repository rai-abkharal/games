# Farmer Pedro deployed web build

This package contains the publicly deployed, minified browser build of **Farmer Pedro**. It is not necessarily the developer's original source project and does not include unminified authoring files, editor metadata, or source maps.

## Build identity

| Item | Finding |
|---|---|
| Game | Farmer Pedro |
| Game build | `MyGame` version 1.0.0; framework version 2.0.0 |
| Main game framework | Impact-style `ig.*` module/entity runtime, bundled and customized by MarketJS |
| 3D engine | Babylon.js 5.14.1, bundled inside `game/game.js` |
| Animation helper | Tween.js-compatible `TWEEN` runtime, bundled |
| Audio | Howler-based player, bundled |
| Original entry | `game/index.html` (preserved deployed entry; not the offline launcher) |
| Offline entry | `index.html` |
| Main gameplay bundle | `game/game.js` |
| Hosted revision captured | `63v5iijlu6p9o` |

## Directory map

- `index.html` — direct `file://` entry. It supplies the original canvas DOM, loads the offline resource layer and platform adapter, then starts the game.
- `game/` — runnable deployed build. `game.js` has only the loading-layer changes described below.
- `assets/` — a second, organized copy of all original media and required Babylon decoder files for inspection.
- `source-reference/` — captured GameSnacks outer HTML, hosted game entry HTML, and the untouched deployed `original-game.js` bundle.
- `embedded-resources.js` — Base64 resource table plus fetch/XMLHttpRequest compatibility layer.
- `offline-adapter.js` — local GameSnacks-compatible API.
- `file-manifest.json` and `checksums.sha256` — sizes and SHA-256 integrity data.
- `verify-files.py` — standard-library verification script; it is not needed to play.

## Startup flow

1. `index.html` establishes `game/` as the document base.
2. `embedded-resources.js` registers all 117 media/decoder resources and supplies offline `fetch()` and `XMLHttpRequest` responses.
3. `offline-adapter.js` creates the local `GameSnacks` API and storage facade.
4. `game/game.js` initializes the bundled Impact-style runtime, Babylon.js, audio, input, entities, and loaders.
5. `ig.main()` starts `MyGame` through `ig.SplashLoader`.
6. The loader reads `media/babylon/scene.babylon`, then imports `farmer/farmer.glb` and `island.glb`.
7. The flow moves through three code-defined scenes: `LevelOpening`, `LevelHome`, and `LevelGame`.

## Important modules and classes

Because `game/game.js` is minified, modules are registered as strings rather than separate files.

| Module/class | Responsibility |
|---|---|
| `game.main` / `MyGame` | Session setup, flow control, progression, saving and reset logic |
| `game.mjs-game` / `MJSGame` | Shared MarketJS game shell and UI lifecycle |
| `babylon.wgl` | Babylon engine, scene, cameras, rendering, model loading and resize behavior |
| `babylon.config` | Models, upgrade rates, crop groups, economy values, stores and map prices |
| `babylon.harvester` / `ig.Harvester` | Vehicle movement, steering, cargo, collision movement and camera following |
| `babylon.map-control` / `ig.MapControl` | Fields, crop replacement, stores, map unlocking, bridges and RV encounters |
| `babylon.field` / `ig.Field` | Crop growth/harvest behavior |
| `babylon.price-tag` / `ig.PriceTag` | Unlock costs and map purchase interactions |
| `babylon.rv` / `ig.RV` | Rewarded-ad encounter; offline result is always unavailable/not rewarded |
| `game.entities.controls.home` | Main menu and start/settings buttons |
| `game.entities.controls.game` | In-game UI, pause/resume, restart and level completion |
| `plugins.gamesnacks` | Original platform wrapper, satisfied locally by `offline-adapter.js` |
| `plugins.io.storage-manager` | SecureLS-backed session persistence |
| `plugins.audio.*` | Howler sound loading, music/SFX state and visibility muting |

## Gameplay loop

The player drives a harvester through crop fields. Harvested crops are added to cargo, carried to stores, converted into cash, and used to unlock map sections and buy five upgrade families. Completing the island objective advances the numerical level, scales costs by 1.5, resets level inventory/maps, and substitutes the next crop group.

The bundle defines five crop sets:

1. corn, tomato, carrot
2. potato, cabbage, eggplant
3. mushroom, garlic, cucumber
4. onion, chili, broccoli
5. lettuce, pepper, pumpkin

These are configuration-based progression sets, not five separate scene files. The flow itself has three code-defined scene states (`Opening`, `Home`, `Game`).

## Controls

- W or Up Arrow: drive forward.
- S or Down Arrow: reverse.
- A/D or Left/Right Arrow: steer the direction arrow.
- Mouse/touch: UI buttons and the virtual control layer.
- Mouse wheel: adjusts the 3D camera distance.
- Fullscreen button: browser fullscreen when supported; some browsers restrict fullscreen for local files.

The input manager also contains generic space, enter, multitouch and gamepad bindings, although the primary harvesting controls are keyboard and touch.

## Physics and collision system

Babylon.js performs 3D movement and collision checks. `ig.Harvester` enables collisions on the vehicle, assigns a 4.5-unit ellipsoid, computes target velocity from the steering angle, smooths velocity with vector interpolation, and calls `mesh.moveWithCollisions()`. Map collision meshes are selected by names containing `Coll`. Additional rectangle/bridge tests constrain the harvester to active islands and bridges. Crop, particle and UI entities use the Impact-style update loop around the Babylon render scene.

## Levels and generation

- There are no external level JSON files.
- `babylon.config.levels` contains five crop substitution sets.
- Map geometry is in `scene.babylon` and `island.glb`; transform nodes named `Map1` through `Map7` are enabled as the player purchases them.
- Prices, starting inventory and unlocked maps are rebuilt for each numerical level.
- The progression integer can continue beyond the first sets, but the deployed crop table contains five explicit groups; modifications beyond that should handle the table bounds.

## Score, currency and progression

- Cash and crops live in `sessionData.data.items`.
- Map unlock costs live in `sessionData.data.priceTags`.
- Level cost scaling uses `costRate = 1.5`.
- Upgrade families are `tractorSpeed`, `tractorSize`, `maxLoad`, `cropQuality`, and `storeEfficiency`.
- Maximum configured upgrade levels are 10, 5, 10, 10 and 10 respectively.
- GameSnacks score updates are stored locally by the adapter; online leaderboards are disabled.

## Saving and LocalStorage keys

The game serializes its session through bundled SecureLS (AES mode plus compression metadata) and the GameSnacks storage facade. The game-specific hashed key is `sodo002`. The adapter scopes keys with `farmer-pedro-offline:` to avoid colliding with other local games.

Important effective keys include:

- `farmer-pedro-offline:sodo002` — encrypted/compressed game session.
- `farmer-pedro-offline:_secure__ls__metadata` — SecureLS key metadata.
- `farmer-pedro-offline:last-completed-level` — adapter callback record.
- `farmer-pedro-offline:last-score` — last platform score update.
- `farmer-pedro-offline:last-game-over` — last game-over timestamp.

The session object contains `sfx`, `bgm`, `showFarmer`, `cashEarned`, `level`, the five upgrade levels, `data.items`, `data.priceTags`, and unlocked `maps`.

## UI flow

`LevelOpening` shows the MarketJS splash, `LevelHome` shows the title/play/settings/fullscreen UI, and `LevelGame` spawns the HUD, pause control, upgrade control, touch control, status bar and game world. Pause/settings/confirmation/reward/result screens are Impact-style canvas entities; the Babylon GUI layer supplies labels attached to 3D meshes.

## Audio

The package includes one looping BGM track, two opening sounds and seven gameplay SFX (button, unlock, complete, counting, register, message and harvester). Howler loads them from the embedded resource table. The adapter exposes global audio state and the game preserves separate BGM and SFX preferences.

## Offline platform adapter

`offline-adapter.js` supports first-frame/ready notifications, pause/resume subscriptions, audio state, score records, level completion, game over and local storage. It safely disables ads, analytics, cloud saves, accounts, online leaderboards, sharing and tracking. For every ad request it reports `notReady`; rewarded ads invoke dismissal and never invoke `adViewed`, so no offline reward is granted.

## Changes made for direct `file://` use

1. Embedded all 117 runtime media and decoder resources in `embedded-resources.js`.
2. Replaced network-backed fetch/XMLHttpRequest resource reads with an in-memory resolver supporting text, JSON, Blob and ArrayBuffer responses.
3. Redirected Babylon's three Draco URLs from `preview.babylonjs.com` to packaged files.
4. Set the Draco decoder worker count to zero. This avoids a `file://` worker/importScripts restriction while keeping the original decoder and compressed models.
5. Replaced the live GameSnacks SDK with `offline-adapter.js`.
6. Removed service-worker dependence from the offline entry.
7. Added a startup error panel so unsupported WebGL or another fatal error is shown instead of an unexplained black screen.

The untouched deployed bundle remains at `source-reference/original-game.js` for comparison.

## Files to edit

- Gameplay/economy/progression: search `game/game.js` for `ig['module']('babylon.config')` and `game.main`. Keep a backup; the bundle is minified.
- Harvester movement/camera: `babylon.harvester` inside `game/game.js`.
- Maps/fields/stores: `babylon.map-control` and related `babylon.*` modules in `game/game.js`.
- UI/text: `game.entities.*`, `_STRINGS`, and `_SETTINGS` inside `game/game.js`.
- Platform behavior: `offline-adapter.js`.
- Offline loading behavior: the loader portion after the resource table in `embedded-resources.js`. If an asset changes, regenerate its Base64 entry as well as the inspectable copies.
- 3D scene/models: `game/media/babylon/`; edit with tools that preserve Babylon/GLB structure and Draco requirements.

## Verification boundary

Packaging checks parse all JSON, validate GLB structure and required Draco extensions, compare all embedded bytes with their disk copies, check media signatures, compile-check JavaScript, compile the WebAssembly decoder, verify referenced assets and checksums, and test ZIP integrity. The available controlled browser blocked `file://` navigation, and its live GameSnacks page lacked WebGL, so visual gameplay, touch behavior and one full level could not be executed in that environment. See `TEST-RESULTS.txt` for the exact result.
