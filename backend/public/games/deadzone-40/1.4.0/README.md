# Deadzone 40

A portrait, top-down 4v4 team deathmatch. You lead the blue squad against four
enemy soldiers in a walled arena. Everyone respawns; nobody stops. **First team
to 40 kills wins.**

`index.html` is fully self-contained — no server, no network, no sibling files.
Double-click it and it plays.

## Controls

| | Touch | Keyboard / mouse |
| --- | --- | --- |
| Move | floating joystick — drag anywhere on the left | `WASD` / arrow keys |
| Fire | hold the **FIRE** button (lower right) | `Space`, `F`, or hold the mouse button |
| Reload | automatic when the mag empties | `R` |
| Pick an upgrade | tap the card | `1` / `2` / `3` |
| Rematch | tap the REMATCH button | `Space` / `Enter` |

The joystick is floating — it appears wherever your thumb lands. You never aim
manually: **hold FIRE and your soldier swings onto the nearest enemy in line of
sight** and keeps tracking them. A red reticle marks the locked target. With no
one in range the button still fires straight ahead, and a dashed ring round the
button tells you there's nothing locked.

Holding the trigger blooms your spread — the reticle visibly widens as it does.
Tapping in bursts is far more accurate than praying and spraying, which is the
skill the auto-target leaves in your hands.

## The loop

- Fixed loadout: everyone starts with the same rifle, so nothing is decided by
  a lucky pickup.
- **Every 3 personal kills you choose one of three field upgrades** — damage,
  fire rate, extended mag, faster reload, move speed, extra health, split
  barrel, armour-piercing rounds, tighter spread, lifesteal, a vest, or a
  longer barrel. The world drops to slow motion while you pick; it never
  freezes.
- Recoil bloom: sustained fire widens the cone, so bursts beat holding.
- Health regenerates 5 seconds after you last took a hit, and five medkits
  respawn around the arena, so a bad fight isn't a death sentence.
- Spawns are chosen away from living enemies, with a 1.1 s spawn shield.
- Your three allies and the four enemies run the same AI: take cover, hold a
  firing distance, strafe, break line of sight, burst-fire, and run for a
  medkit when hurt. They score too — you are the swing factor, not the whole
  team.

## Arena art

The whole map is drawn procedurally at runtime — no image files anywhere. Pale
tiled concrete with grime patches, dark asphalt roads laid in diamond paving,
bright grass patches with scattered tufts and a darker rim, and three kinds of
cover: green wooden crates with plank seams, a diagonal brace and corner bolts;
olive brick walls with staggered courses; and dark metal boxes with riveted
corners. Everything casts a long soft shadow from the same light direction and
carries a bevelled edge, so cover reads as solid at a glance.

## Presentation

Soldiers are drawn from paths with heavy dark outlines so they read at a glance:
skin-toned head with a team-coloured cap and brim, eyes peeking out under it,
plate carrier with pouches and shoulder pads, backpack, bare forearms and gloved
hands on the rifle, and a rifle with stock, receiver, canted magazine,
handguard, barrel, muzzle device and iron sight. Legs swing and boots alternate
while moving then settle when you stop, the body breathes when idle, banks into
a turn, and kicks back when firing. Fresh spawns pop in with a scale punch.

On top of that: four-point muzzle flash with additive glow, tracer rounds with
faded tails, brass casings that spin out and bounce, barrel smoke, sparks and
dust on wall impacts, directional blood spray that follows the round's
travel, blood pools that spread under a corpse, and blood decals that stain the
ground and fade over fourteen seconds. Death plays as a slump-and-tip, drained
of colour, fading out as the respawn timer runs down.

The gunshot is a real recording — freesound_community "shoot 6" (81136),
trimmed to 0.6s, loudness normalised and re-encoded mono 128 kbps, then
base64-embedded in `src/assets.ts` so the shipped file still has nothing to
fetch. It is decoded once on the first user gesture. MP3 encoders pad the head
of the stream, so after decoding the code scans for the first sample with real
signal and starts playback from there; without that every shot fires about
25 ms late. Each shot gets a slight random playback rate so a full-auto burst
doesn't comb-filter against itself, and the same buffer played quieter through
a low-pass becomes the ally and distant-enemy reports. If decoding ever fails
the game falls back to four synthesized shots rendered sample-by-sample at
startup (high-passed transient, resonant crack, low-passed body, pitch-swept
thump, mechanical click, two room slap-backs, soft-clipped).

Everything else is synthesized through Web Audio with nothing loaded:
a looping wind bed under everything, quieter reports for allies and lowpassed ones
for distant enemies, a bandpassed whiz when an enemy round passes within 38px of
you, brass tinkle, magazine out/in clicks, hit ticks, footsteps, a heartbeat
under 30% health, respawn countdown beeps that sharpen on the last one, and a
full set of interface sounds — whoosh, ticks, star dings, the multiplier lock
and the score count-up. Combat audio mutes the moment the match ends.

## Results screen

Deliberately sparse: up to three stars, a ribbon banner, the cash you earned,
and a REMATCH button. Nothing else.

Stars are awarded one for the win, one for ten kills and one for a 1.5 K/D.
They land one at a time, each spinning into place with an overshoot, throwing
an expanding ring and eight sparks, and then drifting on a slow bob with a
moving specular highlight. Unearned slots stay as dim outlines.

The cash figure counts up with a ticking sound. **REMATCH is the only way back
in** — a tap anywhere else is ignored; on desktop `Space` or `Enter` presses it.

## Arena

1040 × 1680, 180°-rotationally symmetric, so neither side gets the better
cover. The camera follows you; a minimap shows allies always and enemies only
when they're firing or in your line of sight.

## Build

```bash
npx tsc --noEmit                                     # type-check
npx tsc --outDir build --rootDir src --noEmit false  # compile
node build-single.mjs                                # -> index.html
node make-manifest.mjs                               # size + hash — always last
```

Never hand-edit `index.html`; it is generated from `dev.html`, and any edit
invalidates the `sha256` in `manifest.json`.

`test-harness.mjs`, `test-play.mjs` and `test-draw.mjs` run the built bundle
headless in Node against a stubbed canvas — they simulate full matches, check
that the match reaches a win/lose state, exercise the upgrade overlay and the
restart gate, and assert that no draw call is ever made with a non-finite
number.

## Source layout

```
src/assets.ts     base64 gunshot sample (inlined first)
src/utils.ts      pure helpers + every tuning constant
src/entities.ts   Fighter, Bullet, Medkit, Particle, Popup, Decal, KillFeed
src/engine.ts     Engine (loop), Input (joystick/fire/keys), Sfx, Game (FSM)
src/main.ts       boot only
```

Balance lives entirely in `src/utils.ts`. To make it harder, raise `FOE_DMG`
and `FOE_RATE` or lower `FOE_JITTER`; for a shorter match, drop `KILL_TARGET`.
`BLOOM_GAIN` / `BLOOM_MAX` control how punishing sustained fire is — they are
the main lever on how strong auto-target feels.

## Notes

- No platform SDK bridge is wired in, so the shell won't see scores and its
  pause / restart / mute buttons won't reach the game. `hasReward` is `false`.
  It's about ten lines to add if you supply the SDK.
- No `localStorage`, no web fonts, no external requests. All art is drawn
  procedurally; all audio except the gunshot is synthesized, and the gunshot is
  embedded as base64 inside the entry file rather than fetched, so `index.html`
  is still fully self-contained.
- The gunshot sample comes from the freesound community pool. Check its
  upstream licence before a commercial release; swapping it is a one-line
  change in `src/assets.ts`.
