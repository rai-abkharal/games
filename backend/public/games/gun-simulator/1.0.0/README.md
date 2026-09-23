# Gun Simulator — 16 guns, portrait, TypeScript + Pixi.js

A portrait gun-simulator in the style of the reference video: the game opens
straight on the first gun — no loading screen, no home screen, no gun-selection
menu. Swipe the arrows to change guns, tap the gun to shoot.

## Controls

| Action | Touch | Keyboard |
| --- | --- | --- |
| Fire (single shot or 3-round burst, depending on the mode pill) | tap the gun area | Space / Enter |
| Full auto | **hold** the gun area (after ~0.2 s the gun goes cyclic and keeps firing while held) | hold Space |
| Change gun | ◀ ▶ arrows | ← → (or A / D) |
| Reload | RELOAD button, or tap the gun when the magazine is empty ("TAP TO RELOAD") | R |
| Fire mode | SINGLE SHOT / BURST MODE pills | 1 / 2 |
| Mute | speaker icon | M |

Every shot vibrates the phone (`navigator.vibrate`, per-gun strength — pistols
short, shotguns and .50 cal long). Android browsers support this; iOS Safari
does not expose the vibration API to web pages, so there it is silently skipped.

## The 16 guns

| # | Gun | Calibre | Mag | Fire sound (your file) | Reload sound (your file) |
| --- | --- | --- | --- | --- | --- |
| 1 | Colt M1911 | .45 ACP | 7 | M1911_fire.ogg | 1911-reload-6248.mp3 |
| 2 | Glock 17 | 9×19 | 17 | pistol-AF.mp3 | reload-123781.mp3 |
| 3 | Desert Eagle .50 | .50 AE | 7 | pistol-DF.mp3 | 1911-reload-6248.mp3 |
| 4 | Beretta M9 | 9×19 | 15 | pistol-Ef.mp3 | reload-123781.mp3 |
| 5 | H&K MP5A3 | 9×19 | 30 | MP5_fire.ogg | reload-123781.mp3 |
| 6 | AK-47 | 7.62×39 | 30 | AK_fire.ogg | AK_reload.wav |
| 7 | IMI Uzi | 9×19 | 32 | MP5_fire.ogg (pitched) | reload-123781.mp3 |
| 8 | AKM | 7.62×39 | 30 | akm-gunshot-368240.mp3 | AK_reload.wav |
| 9 | AK-74 | 5.45×39 | 30 | ak74-sound-effect-351437.mp3 | AK_reload.wav |
| 10 | Colt M4A1 | 5.56×45 | 30 | M4_Fire.ogg | machine-gun-reload-81593.mp3 |
| 11 | FN SCAR-H | 7.62×51 | 20 | assaultrifle2-47258.mp3 | machine-gun-reload-81593.mp3 |
| 12 | M249 SAW | 5.56×45 belt | 100 | shot-rifle-39-mm-37542.mp3 | machine-gun-reload-81593.mp3 |
| 13 | Remington 870 (pump) | 12 ga | 6 | Shotgun_fire.ogg | reload-123781.mp3 per shell |
| 14 | Benelli M4 | 12 ga | 7 | ShotGun.mp3 | reload-123781.mp3 per shell |
| 15 | AWM .338 (bolt) | .338 LM | 5 | Sniper_fire.ogg | reload-123781.mp3 |
| 16 | Barrett M82A1 | .50 BMG | 10 | Sniper.mp3 | machine-gun-reload-81593.mp3 |

`ShellFall1.wav` plays when each ejected casing hits the floor.

**Only your recordings are used** — nothing is synthesised. The files were
trimmed of leading/trailing silence, peak-normalised and re-encoded to mono MP3
(`tools/gen_sounds.py`) so they decode on every browser (Safari cannot decode
OGG). Reload animations are keyed to the actual timing of the reload
recordings: the magazine drops on the mag-release click, seats on the insert
click, and the bolt / slide / charging handle cycles on the last click.

Firing feel: each shot picks a random ±3 % pitch and volume, muzzle flash
variant, flash size and rotation, so auto fire never sounds or looks like a loop.
Pistols, M4, SCAR, M249, Benelli and Barrett lock their slide/bolt open on the
last round; the 870 pumps and the AWM cycles its bolt after every shot.

## Gun and effect images

The gun sprites are **image sprites** (WebP with alpha) generated offline by a
small rendering pipeline (`tools/gunart.py`, `tools/pistols.py`,
`tools/longguns.py`): every gun is built from shaded, bevelled metal / polymer /
wood parts and exported as three layers so they can animate independently:

| file | what it is | how it moves |
| --- | --- | --- |
| `assets/guns/<id>_body.webp` | frame, barrel, stock… | recoil + muzzle rise |
| `assets/guns/<id>_action.webp` | slide / bolt / pump / charging handle | slides back on every shot, locks open when empty |
| `assets/guns/<id>_mag.webp` | magazine / belt box | drops out and returns during the reload |

`assets/guns/meta.json` stores, per gun, the muzzle point, ejection port, action
travel and magazine-drop vector in sprite pixels.

Muzzle flashes (`assets/fx/flash_<kind>_<0-2>.webp`, drawn additively), smoke,
brass casings, shotgun shells and the ammo icons are in `assets/fx/`.

### Swapping in your own photos

Because every image is loaded by file name, you can replace any of them with a
real photograph:

1. Put a transparent PNG/WebP of the gun's **right side, muzzle pointing left**
   at `assets/guns/<id>_body.webp` (keep the name; `.png` also works if you
   update `parts[].file` in `meta.json`).
2. Either supply matching `_action` / `_mag` layers on the same canvas, or delete
   those entries from `meta.json` to get a static gun.
3. Update `muzzle`, `eject`, and the `parts[]` `x/y/w/h` in `meta.json`.
4. `npm run build` — the images are inlined into `index.html`.

The same rule applies to sounds: drop a file with the same name into
`assets/sounds/` and rebuild.

## Build

```bash
npm install
npm run build      # gen-assets -> type-check -> esbuild bundle (Pixi.js + game + assets) -> index.html -> manifest.json
```

`index.html` is fully self-contained (~2 MB): Pixi.js, all sprites and all
sounds are inlined, so it runs from a double-click with no server and no
network. Never hand-edit it — edit `src/` or `dev.html` and rebuild, then run
`node make-manifest.mjs` last (the manifest hashes `index.html` byte for byte).

Source layout:

```
src/data.ts     every gun and every tuning number (rate of fire, recoil, flash, haptics…)
src/game.ts     GunView (sprite assembly + animation), Fx (flash/smoke/casings), HUD, firing state machine
src/audio.ts    Web Audio playback of the embedded recordings (compressor on the master bus)
src/main.ts     boot only
src/assets.ts   GENERATED base64 assets (tools/gen-assets.mjs)
tools/          sprite renderer, sound converter, headless screenshot tests
```

Package: `gun-simulator-1_0_0.zip` (root-level `manifest.json`, `index.html`,
thumbnail, this README, `src/`).
