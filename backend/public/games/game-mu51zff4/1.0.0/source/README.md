# Passenger Parking

A playable portrait browser game built with TypeScript and Babylon.js. Tap an arrow-marked vehicle to free it from the yard. It follows its heading, enters a boarding bay, and collects passengers of its color. Full vehicles leave. Clear all vehicles and passengers to advance.

## Play the downloaded ZIP

Extract the ZIP and open its **top-level `index.html`** in Chrome, Edge, Firefox or Safari. This is a self-contained build: its code, level data, styles and UI artwork are embedded, so no server, installation or internet connection is required. The `source/` directory contains the editable TypeScript project; its developer `index.html` uses the development server below.

On mobile, the hosted link is the easiest way to play. Some phone file-manager previews do not allow JavaScript or WebGL; open the file in a full browser where supported. Offline and hosted progress are stored separately by the browser.

## Run the editable source

Requires Node.js 22 or newer and pnpm.

```sh
pnpm install
pnpm dev
```

Open the displayed network address on a phone connected to the same Wi-Fi. The published private Sites link can be opened away from that network while signed in to the owning account. Portrait orientation gives the largest play area. Progress and settings are saved on the current browser/device.

```sh
pnpm build
pnpm build:offline
pnpm test
```

The production output is `dist/`. Host that directory on any static HTTPS host. The game has no runtime CDN dependencies, advertisements, accounts of its own, or paid purchases. Free recovery and extra bays work locally; the reference's video-style button does not show an actual advertisement.

## Implementation

- Fifty deterministic playable level files in `public/levels.json`, including a removal witness and balanced passenger demand for every level.
- The first two arrangements follow the reference silhouettes. Level 4 uses the manually mapped thirty-vehicle reference arrangement, with small clearances adjusted for the reconstructed meshes. Other campaign arrangements are newly constructed extensions, not original extracted level files.
- Three fixed reusable vehicle archetypes in `src/scene.ts`: compact car, medium minibus and long bus. Paint, cabin, inset windows, wheels, bumpers, lights, roof hatch and roof arrow are modeled in actual 3D geometry. All color variants reuse the same archetype construction and proportions.
- Kinematic movement and swept oriented-rectangle blocking. This parking puzzle does not use an unconstrained rigid-body physics engine.
- A finite circulating passenger loop, feeder admission, seat reservations, running passengers and capacity counters.
- Atomic bay reservations, blocked feedback, smoke, confetti, tutorial guidance, pause, settings, levels, VIP, Arrange, Bus Changer, win and recovery.
- Capacities use multiples of four. Connected same-color passengers leave as a single continuous stream up to the bus's free capacity: a connected group of twelve starts together, with a short stagger between individuals rather than repeated four-person batches. The counter decreases as each person arrives. Waiting passengers remain behind a clear setback on each feeder; contiguous vacant rows receive a continuous animated stream from the correct road.
- At most one extra spot can be opened per level, including recovery. The player chooses which of the three available positions to unlock.
- Full vehicles celebrate in their own bay for 1.5 seconds with localized confetti, then drive away. A short engine sound plays when a yard vehicle starts its trip.
- The 3D canvas fills the entire visible browser viewport with no side letterboxing or frame shadow. The camera extends the scenery to suit the screen aspect ratio, while the reference 592 × 1280 puzzle and HUD stay proportionate inside notch/home-indicator safe areas. Resizing, rotation and browser-bar changes share the same camera, UI and touch-coordinate mapping.
- Shared materials, instanced repeated meshes, thin-instanced passengers, smooth vehicle bevels, detailed wheels, window highlights and capped soft translucent exhaust. Rendering follows device pixel density up to 3x, capped at 3.2 million pixels; there is no automatic blurry low-resolution mode. Pause contains Sound, Music, Continue and Restart.

## Fidelity boundaries

This is a working reconstruction, not a verified 100% copy of the original game. The videos do not contain recoverable source meshes, original physics code, isolated audio, exact camera metadata or the full fifty-level campaign. Vehicle geometry, motion tuning and SFX are reconstructed. Medium capacity uses the provisional 24-seat mapping; short cars use 16 and long buses 40.

The victory screen now uses original styled text with a gold “Great Job!” heading and animated stars. The old victory and coin screenshot artwork has been removed. All three unlocked booster buttons use crisp inline vector drawings: the orange VIP car with twin fan pods, yellow Arrange bus with passengers, and gold Bus Changer arrows. No screenshot crops or rectangular image backgrounds are rendered in these controls.

VIP unlocks at Level 4 and permits two successful dispatches per level attempt. Arrange unlocks at Level 8 and exchanges circulating passenger colors with waiting road passenger colors once per attempt, even when no bus is boarding. Bus Changer unlocks at Level 13 and moves all remaining yard vehicles to a validated alternate layout once per attempt, with a short transition. Vehicles already boarding remain at their stands. These counters are enforced by the simulation and cannot refill through button taps, pause or recovery; starting a new level attempt resets them. Paid-style recovery is implemented using earned in-game coins; the Free option is genuinely free. Generated audio is lightweight Web Audio synthesis, not the original sound recordings. Optional music is a newly synthesized loop and defaults off. The overall audio gain is increased from 0.4 to 0.8, with compression to control overlapping peaks.

After Level 10, passenger demand increases on every level. Every second level adds a vehicle; intervening levels replace one 16-seat car with a 24-seat minibus. The yard grows from 31 vehicles at Level 10 to 51 at Level 50, and the color palette grows from five to eight. Levels 11–29 interleave demand from three upcoming vehicles; Levels 30–50 interleave four. Queues preserve complete same-color rows, and connected passengers still board as a single continuous stream.

Parking arrangements are packed toward their center with small body clearances. Each accepted movement preserves the complete legal departure order. Later yards use aligned headings to fit more vehicles with fewer wasted gaps; model proportions remain fixed and later vehicles no longer shrink. This compaction also applies to early levels and all Bus Changer alternatives. Rising demand, more vehicles and more mixed colors create the difficulty ramp; strictly increasing human difficulty still requires player feedback. Automated validation proves solvability, collision separation and color balance, not subjective difficulty.

## Validation

The automated suite checks all fifty layouts, full completion without boosters, color-wise capacity balance, non-overlap, actual swept blocking, duplicate reservations, pause, recovery conservation, connected twelve-person departures, continuous feeder admission, single extra-spot limits, color-conserving Arrange, booster use limits, the 1.5-second celebration hold and completion after all 38 unlocked Bus Changer layouts. Browser checks cover high-DPI off-center touch selection, continuous boarding, queue-to-circle clearance on both road configurations, pause/resume, the chosen extra spot, local confetti lifetime, text-only victory → Next, two VIP uses with rejection of the third, one passenger exchange, one Bus Changer use, no page errors and portrait/landscape fitting. The standalone file was also tested with networking disabled and a real touch dispatch. It uses a desktop browser emulating phone dimensions, not physical iOS/Android hardware; no physical-device 60 fps claim is made.

## Editing levels

`src/logic.ts` constructs layouts; `src/reference-layout.ts` contains the mapped Level 4 reference. Re-export after changing construction:

```sh
node --experimental-transform-types scripts/export-levels.ts
```

The exporter requires Node.js 24 for the native TypeScript transform flag. Alternatively run `pnpm exec tsx scripts/export-levels.ts`. The game itself loads pre-exported JSON, so phones do not run layout search. Development-only `?level=4` and `window.__game` support inspection; both entry points are removed from the production build's behavior.

## Bus Changer layouts

`public/vehicle-shuffles.json` contains one validated alternate arrangement for every level from 13 to 50. The same vehicle identities, models, scales, colors and capacities are preserved. The original removal witness remains legal, including when some vehicles have already left the yard. Re-export after changing campaign geometry with `pnpm exec tsx scripts/export-shuffles.ts` (or the same native Node.js 24 transform option used for level export).

## Responsive completion screen

The victory overlay is mounted outside the scaled gameplay HUD and covers the entire visible game viewport. Its content adapts to both screen width and height, respects notch/home-indicator safe areas and keeps Next at least 48 CSS pixels tall. Verified at twelve portrait/landscape sizes, including resizing while the panel is open, normal Next progression and the Level 50 All clear action. Browser emulation was used; physical phone hardware was not tested.
