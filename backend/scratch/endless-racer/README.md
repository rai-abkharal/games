# 🏁 Endless Racer

A three-lane endless arcade racer. Grab coins, dodge traffic, and see how far you can push
before the inevitable crash. Written in TypeScript against a raw HTML5 Canvas 2D context —
no engine, no sprite sheets, no runtime dependencies. Every car, coin, tree and sound is
generated procedurally at runtime.

## Play

**Double-click `index.html`.** That file is fully self-contained — the whole compiled game
is inlined in a single `<script>` tag, so it runs straight off the file system with no
server, no build step and no network. `dist/endless-racer.html` is an identical copy if you
want to ship one loose file.

**Controls**

| Action | Input |
| --- | --- |
| Move left | `LEFT` button · `←` · `A` · swipe left |
| Move right | `RIGHT` button · `→` · `D` · swipe right |
| Restart after a run | tap the canvas · either control button · `Space` |
| Mute | 🔊 button, top right |

**Rules**

- The game starts straight into gameplay — no menus, no pause.
- Every coin is **+10**. Every metre travelled is **+1**.
- Slipping past a car at close range is a **near miss: +25**.
- Touch any car and the run is over.
- Speed and traffic density ramp up over the first 2,600 m.
- Survive **10,000 m** and you get the `ROAD MASTER` win screen.

## Develop

`dev.html` is the source shell — it loads `src/main.ts` as a live ES module, so it only
works behind a dev server (browsers refuse module fetches over `file://`, and browsers
can't run TypeScript directly).

```bash
npm install
npm run dev        # opens dev.html with hot reload
```

After changing any source, regenerate the playable file:

```bash
npx tsc --outDir build --rootDir src --noEmit false
node build-single.mjs      # -> index.html + dist/endless-racer.html
```

## Structure

```
📦 endless-racer
 ┣ 📂 src
 ┃  ┣ 📜 main.ts       entry point — DOM binding, wiring, boot
 ┃  ┣ 📜 engine.ts     canvas + fixed-timestep loop, Input, Sfx, Game FSM
 ┃  ┣ 📜 entities.ts   PlayerCar, TrafficCar, Coin, Particles, Popups, Road, Scenery
 ┃  ┗ 📜 utils.ts      math, colour, geometry helpers and layout constants
 ┣ 📂 assets           PWA icons (SVG)
 ┣ 📂 dist             standalone single-file build
 ┣ 📜 index.html       host shell — canvas + the two control pads
 ┣ 📜 manifest.json    PWA metadata (installable, portrait, fullscreen)
 ┗ 📜 build-single.mjs inlines the compiled output into one HTML file
```

## Architecture notes

**FSM.** Three states only: `PLAYING`, `WIN`, `LOSE`. `Game.update()` dispatches to
`updatePlaying()` or `updateEnded()`; the end states keep simulating so the world coasts
to a stop instead of freezing.

**Fixed timestep.** `Engine` accumulates real time and steps the simulation at a fixed
1/60 s (max 5 catch-up steps per frame), so physics stays identical on a 60 Hz laptop and
a 120 Hz phone. Rendering happens once per animation frame.

**Decoupled input.** `Input` translates keyboard, pointer and swipe events into abstract
intents (`takeSteer()`, `takeConfirm()`) that the game logic pulls from. No game code ever
touches a DOM listener.

**Fair by construction.** A traffic wave never fills all three lanes, so a gap always
exists. Hitboxes are inset (72% × 82% for the player) so grazes read as near misses rather
than cheap deaths.

**Juice.** Body roll on lane changes, tyre dust, exhaust smoke, spinning coins with
additive glow, coin-burst glints, floating score popups, screen shake, a white impact
flash, slow-motion on death, speed streaks that scale with velocity, and a ~105 s
day/night cycle where headlights, tail lights and street lamps take over the lighting.

**Audio.** Web Audio synthesis only: a saw+square engine drone whose pitch and filter
cutoff track your speed, band-passed noise for road hiss, triangle blips for coins, and a
filtered noise burst plus sine thump for the crash.
