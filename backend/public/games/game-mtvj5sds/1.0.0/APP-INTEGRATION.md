# Food Hunt

A TypeScript ant collection game with Babylon.js 3D rendering and a Phaser Canvas interface. Fifty different authored pixel pictures, progressively larger palettes up to nine colors, five active slots, three queues, cube-carrying workers, speed boost, saved level progress, settings, audio and a low-capability Canvas fallback.

## Play the downloaded ZIP

Extract the ZIP fully before opening files.

- **Mobile Build ZIP:** open `index.html` in Chrome, Edge, Firefox or Safari.
- **Source ZIP:** open `food-hunt/PLAY.html` to play the included compiled game. The source `index.html` shows a link to this playable copy when opened directly.
- The playable HTML includes all 50 levels, images, libraries and sounds. No install, internet connection or local server is needed for this copy.
- On a phone, use **Open with → browser**, rather than the file manager's HTML preview. Some phone file viewers cannot execute games; in that case serve the build from a web host and open its web address.

## Play and development

Install Node.js 20.19+ or 22.12+, then use `pnpm install` and `pnpm dev`. Open the printed address in a browser. On a phone connected to the same network, use the computer's printed Network address. A deployed HTTPS address works independently of the development computer.

`pnpm build` creates a self-contained, directly playable `dist/index.html`, also suitable for static web hosting and subfolders. Copy that file to `PLAY.html` when sharing the source ZIP. The Vite configuration embeds level data, PNGs and WAVs, then inlines the compiled classic script and styles to support file URLs. `pnpm validate` checks all 50 level palettes, capacity conservation, concurrent collection at 3×, pause/recall behavior, enclosed-hole accessibility and final delivery. It also refreshes the precomputed batches in the level data. Keep those data updates with the source revision.

## Controls

- Tap the front batch in one of the three queues to send it to a free slot.
- Ants collect matching reachable cubes and carry them to the nest.
- Tap 3× for a 10-second boost. It then recharges for 120 active-play seconds. The countdown does not speed up with the ants, and changing/restarting a level cannot bypass the cooldown.
- When the last queued batch moves into the white active slots (all three queues are now empty), the normal pace immediately switches from 1× to 2×. Picture completion percentage does not trigger this bonus. A manual boost overrides this with 3×, never 6×.
- Tap the top-left gear for sound, restart and keep playing. The settings panel no longer includes vibration testing or picture selection. Tap the level title to select an unlocked picture. Completed levels are saved on this browser.
- If all active colors are blocked, recall unused ants or restart.
- A short 55 ms vibration accompanies nest entry on supporting browsers; clustered arrivals are limited to one pulse per 100 ms. Unsupported browsers quietly skip it.
- Completion uses a colorful purple/yellow/turquoise card, a thumbnail of the completed puzzle, bouncy text, sparkling stars and two-sided confetti fountains followed by a falling shower. Particles and animation handlers are cleaned up when the panel closes. The old Food Hunt artwork, hearts, coins and three bottom milestone buttons remain removed.

## Difficulty after level 10

Levels 1–10 keep their original container order. Levels 11–50 change only batch order: all pictures, cell colors, batch sizes, speeds, sounds and UI remain the same. The queue generator prioritizes future colors with few or no exposed cubes. Those batches occupy white slots until other colors open a route; their ants resume automatically when matching cubes become reachable.

The queue pressure target rises from one early interior batch in levels 11–20, to two in 21–35, to three in 36–50. The selection window expands from 6 to 24 future batches across the campaign. Actual waiting depends on each unchanged picture's geometry. Each accepted reorder has a five-slot solution, and all 50 final queues pass the real concurrent ant simulation without recall. Careless choices can still fill the slots and require the existing recall action.

Queues are precomputed into the offline build, so this generation adds no work during ordinary mobile gameplay. `scripts/difficulty-check.ts` verifies the original artwork fingerprints and batch quantities, the unchanged first ten queues, increasing difficulty targets, and an enclosed red center waiting and resuming after the boundary opens.

## Matte colors and rounded containers

The shared nine-color palette is more saturated across cubes, ants, carried pieces and containers. Babylon materials have zero specular reflection. Containers use solid colored bevels, side walls, a recessed base and contact shadows for matte depth, without a glossy stripe. Only the three selectable front queue containers have a white outline; the six waiting behind them keep their plain colored edges. Every waiting container stays fully opaque; only its number is dimmed to 52%. Active-slot numbers remain fully visible.

The rounded Fredoka variable font is embedded in the playable HTML and loaded before the interface is drawn, so it works offline and does not depend on fonts installed on the phone. The font comes from [Google Fonts](https://github.com/google/fonts/tree/main/ofl/fredoka); its SIL Open Font License is included in the source, playable HTML and ZIP.

## Mobile design

One WebGL scene plus one transparent Phaser Canvas HUD; shared cube, ant-body, leg and cargo geometry; pooled workers; a cap on concurrent workers; native device-pixel rendering without automatic resolution downgrades; and precomputed level queues. The compact 576×1120 layout fills the available phone width with safe-area padding. The top controls sit 16 logical pixels higher. The grid sits 60 logical pixels higher than the original reference placement, nest 116 higher and active slots 128 higher. Queue centers use x=188/288/388 and y=850/954/1058, leaving clear horizontal and vertical gaps while keeping all nine containers on screen. Tall screens retain normal proportions and extend the wood below; short screens compress vertical spacing with the same transform for the 3D world, UI and hit targets. ResizeObserver tracks the embedded game container, including app resizes without a window resize. Babylon and Phaser render at device-pixel resolution. UI text and generated card/thumbnail textures use higher-resolution backing surfaces. The Canvas fallback also uses a device-pixel canvas and a higher-resolution board cache. Rendering more pixels uses more GPU work; low-end-device FPS and the actual embedding app still need on-device verification. Supplied screenshot regions retain their original source detail. A Canvas fallback retains gameplay if WebGL initialization fails. Sound unlocks after a gesture. Progress saving tolerates unavailable browser storage.

No claim is made that every phone/browser has been physically tested. Browser/device QA and measured frame-rate profiling are still needed for a device-certified release.

## App embedding and haptics

Upload the NEW `index.html` from the Mobile Build ZIP, replace the previous file and invalidate any app/server HTML cache. Load this URL directly in a full-size WebView. An API returning the URL does not change rendering quality; a host that places a small WebView/iframe inside a CSS transform, uses a screenshot/video of the game, or forces desktop viewport sizing can still blur it. Give the host page a device-width viewport and the frame its real available width/height. Keep WebGL/hardware acceleration available. Game code cannot override an app's native compositor or a host's rendering settings.

Browser vibration exposes pulse duration, not motor amplitude. The longer 55 ms pulse makes nest entry more noticeable; a compatible native bridge now receives the heavy style. One-argument existing native bridges still work but need their app handler updated to honor intensity.

Nest entry sends 55 ms at most once per 100 ms. The settings vibration-test button has been removed. An accepted API request does not verify physical hardware movement. Browsers need prior user interaction, and browser support plus device vibration settings vary. See [MDN vibrate](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate).

For an app with no working browser vibration API, the app developer must provide one of these opt-in native bridges. The ZIP includes the game-side hooks; it does not install native app code:

- `window.FoodHuntNative.haptic(milliseconds, 'heavy')`: the Android WebView/host bridge or injected JavaScript adapter requests a heavy native haptic. Returning `false`, throwing, or rejecting falls back to browser vibration. A Promise resolving `false` also falls back.
- iOS WKWebView: register a `WKScriptMessageHandler` named `foodHuntHaptics`. The game posts `{ type: 'nest-entry', style: 'heavy', duration: 55 }`; the native handler performs a heavy haptic. No handler means the game tries browser vibration.

For Android, a native handler can call `webView.post { webView.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY) }`, respecting system haptic preferences. See [Android haptic feedback](https://developer.android.com/develop/ui/views/haptics/haptic-feedback). Wire the bridge only into trusted game content. Flutter/React Native hosts can inject the same `FoodHuntNative.haptic` adapter and route it to their app's haptic implementation. Exact app integration is pending the user's platform details.

## Reference fidelity

The table, tray, nest and moved settings cog reuse supplied screenshot regions; the old footer is replaced with wood. The first three pixel masks were digitized from the supplied video frames. The cat includes the planned cream accent to maintain four colors. Remaining objects use original deterministic pixel masks matching the supplied campaign briefs. Babylon.js creates raised cubes and articulated cartoon ants; these are recreated models, not recovered original meshes.

Walking audio is completely removed: there are no walking voices, movement audio callbacks or walking samples in the playable build. Pickup now uses the supplied `universfield-bubble-pop-293342.mp3`, preserved as `pickup-source.mp3`, decoded to PCM and trimmed only at its silent edges for immediate feedback. It plays at 32% volume when a cube is collected. Pickups within 65 ms are grouped into one pop to prevent loud overlapping bursts. The first pickup always plays immediately. Nest/delivery and the other UI sounds keep their existing assignments. All active sounds are embedded for offline use. Other animations and short synthesized SFX are approximations. The original sound stems, exact font, motion curves and queue algorithm were unavailable. The recall dialog is a usability addition. The revised boost, instant last-batch acceleration and text-only completion follow the user's later customization request. This is not a certified pixel-perfect or audio-identical copy.

## Files

- `src/model.ts`: board frontier, reservations, queues, worker simulation and completion.
- `src/renderer.ts`: instanced Babylon.js scene and articulated ants.
- `src/fallback.ts`: lightweight Canvas game renderer.
- `src/main.ts`: Phaser HUD, effects, sound, menus and progression.
- `src/display.ts`: responsive viewport and physical-pixel sizing.
- `scripts/mobile-check.ts`: viewport, touch-coordinate and native/browser haptic checks.
- `src/feedback.ts`: timed boost, cooldown, instant finish speed and safe haptic feedback.
- `src/celebration.ts`: mobile-friendly completion card and bounded confetti animation.
- `public/assets/levels.json`: 50 authored masks and precomputed batches.
- `scripts/validate.ts`: complete gameplay simulation checks.
- `scripts/feedback-check.ts`: speed timing, pause/restart behavior, nest feedback and representative full-level simulations.
- `validation-results.json`: results of the latest simulation run.

The source package excludes local dependencies, access credentials and the hosting service's private identifier.
