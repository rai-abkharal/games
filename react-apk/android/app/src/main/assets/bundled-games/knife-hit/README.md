# Knife Hit

Hyper-casual knife-throwing game — TypeScript + Phaser 3, portrait 480×800, fully self-contained `index.html`
(Phaser runtime and all game code inlined; all art is drawn procedurally on canvas textures, all sound is synthesized with Web Audio).

## Play
Open `index.html` (double-click, no server needed). Tap / click anywhere, or press **Space**, to throw.

- **100 stages**, **10 boards** (one new board every 10 stages: Log, Cheese Wheel, Cookie, Pizza, Big Wheel, Melon, Donut, Clock, Iron Gear, Frost Crystal).
- Every 10th stage is a **boss** — beat it to unlock a new knife (**10 unlockable knives** + starter, 11 total). Pick knives in the **KNIVES** menu.
- Slice **fruit** (apple, orange, lemon, strawberry, kiwi — at least one on every stage) on the rim for the apple counter; hitting a stuck knife bounces you off → stage restarts.
- Boards break into **4 pieces** when cleared; apples split into **2 halves**.
- Progress, apples, unlocked knives and best score are saved (localStorage when available, in-memory fallback).
- Dev shortcut: `index.html#stage=42` jumps straight to stage 42.

## Build
```bash
npm install
npx tsc --noEmit            # type-check
node build-single.mjs       # esbuild bundle + inline Phaser -> index.html
node make-manifest.mjs      # platform manifest (size + sha256) — always last
```
`dev.html` is the dev shell (needs a dev server); `index.html` is generated — never edit it by hand.

## Source
- `src/config.ts` — constants, deterministic 100-level generator, board & knife definitions
- `src/art.ts` — procedural canvas art (10 boards, 12 knives, apples, particles)
- `src/sfx.ts` — Web Audio SFX + save data
- `src/ui.ts` — camera, backgrounds, text, buttons
- `src/game.ts` — gameplay scene
- `src/menus.ts` — boot, menu, knife selection
- `src/main.ts` — Phaser bootstrap
