# How Car Circle works

**Custom build update:** the active code is now in source/game.js. Ads and analytics integration, the top-right slow-down/skip control, and the keyboard-arrow tutorial were removed. Car rewards are claimed directly. The line-number table below describes the archived original/game.js for study; search function names in source/game.js for the current implementation.

This game uses plain JavaScript, the browser's **Canvas 2D API**, HTML/CSS overlays, and Web Audio. No external game engine is required by the captured build.

## Startup and frame loop

1. `fetchGameData()` loads levels, car definitions and color palettes.
2. `initGame()` restores progress, builds the car menu, loads car images, and selects a level.
3. `setupLevel()` loads a preset when one exists, otherwise calls `generateProceduralLevel()`.
4. `requestAnimationFrame` calls `loop()`, which updates simulation and draws the scene.
5. Mouse, touch and keyboard input call `handleInput()` and `launchCar()`.

The offline adapter redirects the existing relative fetches and dynamically assigned image sources to embedded Blob URLs. Static tutorial images are embedded data URLs. The gameplay code itself remains unchanged.

## Gameplay model

Cars queue on the entry road. Each input launches one car toward the looping track. Track cars advance by distance along geometric road segments. Cars transition between states such as `queue`, `entering_straight`, `track`, and exit/crash states. Collision checks can switch the overall game state to `gameover`; the game also models impact impulses, visual damage and sparks. Completing the queue triggers the finish sequence and progression.

Overall states include `menu`, `playing`, `gameover`, `levelcomplete`, and `carreward`. HTML overlays supply car selection, unlock rewards, slow-down/skip actions and tutorials; the road, cars, central level number and effects are rendered on canvas.

## Data files

**levels.json** contains **46 preset entries**, with nonconsecutive level IDs up to 192. This does **not** mean there are only 46 or 192 playable levels: missing IDs use seeded procedural generation, and setup has no fixed final-level check.

A level string has these pipe-separated fields:

`label | track-shape index | spacing pattern | reverse flag | initial car colors | queued car colors | speed | optional palette ID`

The first field is a label; the loader reads configuration from field 2 onward. Color lists are comma-separated indices. Patterns include `even`, `2_clusters`, `3_clusters`, and `4_clusters`. Preset speed is clamped in the loader. Example level 1 starts with an empty loop and six queued cars.

**cars.json** defines nine additional designs, plus the code's default car (10 total). Values are `unlock level | image scale | displayed price`. Prices are part of the reward presentation; they are not evidence of a real payment integration.

**palettes.json** defines nine alternate color sets. Values start with a level threshold followed by hexadecimal colors. Default colors also exist in the source.

**Images:** car1.png through car9.png are top views; car0side.png through car9side.png are side views. The default top-view car is drawn in code. hand.png and arrow.png are tutorial art.

**Sounds:** note, move, flash, hit, end, and exit are WebM audio files. Web Audio handles decoding, playback, pitch, spatial positioning and reverb.

## Where to study or edit

Line numbers refer to original/game.js. Search by function name after making edits.

| System | Starting point |
|---|---|
| Language strings | `translations`, near line 24 |
| Audio loading and playback | near line 94 |
| Road geometry and track selection | `decorateTrackDef`, line 318; `selectTrack`, line 492 |
| Palettes | near line 576 |
| Car image preparation | near line 797 |
| Skin data and save/load | near line 999 |
| Offline reward fallback | `playRewardedAd`, line 1218 |
| Car selection tiles | `buildSkinTiles`, line 1298 |
| Unlock panel | `showCarRewardScreen`, line 1563 |
| Level progress storage | `saveLevel`, line 1695 |
| Car creation and queue | `createCarObj`, line 1911 |
| Launch behavior | `launchCar`, line 2063 |
| Completion | `triggerLevelComplete`, line 2097 |
| Simulation and collisions | `update`, line 2143 |
| Car drawing | `drawCar`, line 2908 |
| Lighting | near line 3127 |
| Scene draw and frame loop | `draw`, line 3486; `loop`, line 3538 |
| Preset parsing | `loadLevelFromString`, line 3629 |
| Procedural levels | `generateProceduralLevel`, line 3741 |
| Level setup | `setupLevel`, line 3968 |
| Controls | `handleInput`, line 4029 |
| Startup | `initGame`, line 4217; `fetchGameData`, line 4254 |

The original source also includes developer keyboard shortcuts: hold **D** and use left/right arrows to change levels; D plus a digit selects a palette. These can help inspect later content, but changing levels also changes saved progress.

Browser save keys include `neonOvalDashLevel`, `neonOvalDashCars`, and `neonOvalDashRewardAB`. The current build forces reward variant A using `AB_FORCE_GROUP`.
