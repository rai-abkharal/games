# Nut & Bolt Sort

A hex-nut sorting puzzle built the same way as the other newer titles in this
repo: one self-contained `index.html`, vanilla JS + Canvas 2D, `engine: canvas2d`,
zero runtime dependencies and zero external asset files.

## Mechanic

Nuts are stacked on threaded bolts. Tap a bolt to lift its whole top run of
matching nuts, then tap another bolt to drive them down onto it. A landing is
legal only when the target post is unlocked, has room, and its top nut is the
same colour (or the post is bare). Illegal taps never animate: the held nuts
settle back with a shake, a buzz and a reason.

Each move plays as four synchronised phases driven from one 0..1 progress value,
so motion and sound never drift apart:

| phase | progress | motion | sound |
|---|---|---|---|
| unscrew | 0.00 - 0.24 | rise off the post, spin counter-clockwise | ratchet, pitch falling |
| travel | 0.24 - 0.62 | arc across to the target post | - |
| screw | 0.62 - 0.92 | drive down the thread, spin clockwise | ratchet, pitch rising |
| settle | 0.92 - 1.00 | squash and recover | metallic seat thunk + sparks |

## Progression

| levels | bolt length | colours | guidance | extras |
|---|---|---|---|---|
| 1 | 4 | 1 | pointing finger, one taught move | boosters locked |
| 2 | 4 | 2 | tick / cross over every post | boosters locked |
| 3 - 6 | 4 | 3 - 4 | none | locked side socket, 2 undos, 2 spare bolts |
| 7 - 12 | 4 | 5 - 6 | none | hidden question-mark nuts appear |
| 13 - 24 | 5 | 6 - 7 | none | more hidden nuts |
| 25+ | 6 | 8 | none | longest bolts |
| every 10th | 3 | +1 colour | none | staggered special board |

Levels 1 and 2 are hand authored so the tutorial beats land exactly. Everything
from level 3 is generated.

## Solvable levels

Boards are built by scrambling backwards from the solved state. That alone is not
a guarantee here, because the player must always move a *whole* run while the
scramble may move part of one, which strands roughly 1 board in 150. Every
candidate is therefore checked by `LevelGenerator.verify()`, a bounded
cost-bucket search that never discards nodes - so an emptied frontier is real
proof of failure, while exhausting the visit budget only means "not proven" and
the board is accepted. Candidates are regenerated only when provably unsolvable.

Measured: 714 generated boards across levels 1-42, zero unsolvable. Level start
costs 0.85 ms on average, 7.6 ms worst case.

## Boosters

- **UNDO** - 2 per level, restores the previous board.
- **+BOLT** - 2 per level. The first use opens the dormant side socket shown on
  the board; the second appends a fresh spare post. Structural changes clear the
  undo history, so the two never disagree.
- **HINT** - host-driven only (rewarded ad), via `GameBridge.triggerHint()`.

## Performance

- Resting nuts are rasterised once per colour/size into a sprite cache and
  blitted; only the few nuts actually in flight are drawn as vectors.
- The background gradient, glow, starfield and vignette are baked into one
  offscreen canvas per resize.
- `pause()` cancels the animation frame outright rather than idling, so a
  swiped-away game costs nothing while another one is being played.
- Bundle: ~119 KB, well inside the 5 MB package budget.

## Host contract

Game to host (`window.AndroidNative` when present, plus a `GameBridge`
postMessage envelope for the Flutter WebView, admin simulator and plain iframes):

- `ready`, `gameStarted`, `completed({ score, level, stats })`, `haptic(type)`
- `AndroidNative.postScore(coins)`, `AndroidNative.onLevelCompleted(level, coins)`

Host to game (`window.GameBridge`):

- `pause()` / `resume()` / `restart()` / `setSoundEnabled(bool)` / `triggerHint()`
- `getState()` returns `{ level, coins, moves }`

Progress lives in `localStorage` under `nut_bolt_level`, `nut_bolt_coins` and
`nut_bolt_best_level`, so the admin dashboard RESET PROGRESS action (clear
storage then `restart()`) drops the player back to level 1.

## Local check

Open `index.html` directly in a browser - no server or build step required.
