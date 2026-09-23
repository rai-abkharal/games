# Bundled tutorial games

Android packages three self-contained level-one games. `npm run tutorial:build`
generates `android/app/src/main/assets/tutorial-games`; Gradle also runs it before
each build. Arrow Puzzle and Water Sort use the existing backend HTML builds.
Knife Hit's source snapshot was copied from the project's `scratch/knife_hit.html`.

The generator skips Arrow's artificial loading screen, opens Knife Hit directly
in stage 1, removes external font requests, limits progression, and gives each
tutorial document fresh in-memory storage. Normal game files are not modified.

Native startup copies the packaged documents into a separate content-addressed
directory and serves them over the existing loopback HTTP origin. They are not
downloaded or subject to catalogue cache eviction. The tutorial works without a
catalogue response, and normal game saves are neither restored nor overwritten.

The first game initializes behind the existing app splash. Knife Hit and Water
Sort do **not** boot offscreen: their local WebViews start when selected, without
waiting for the pager's settle callback. This avoids reusing a frozen engine or
a canvas cleared by a layout resize while its render loop was parked.
Background/navigation/ad suspension still pauses it normally. Normal feed games
retain their existing loading policy. The existing app splash is unchanged.
A completed-level swipe always selects the next game, even if preparation is
unfinished. A cold target can finish loading as the selected page. The prompt
only dismisses after navigation is accepted and always uses the latest callback.
There is still real WebView initialization time; this removes network loading,
not the device's rendering cost. Errors retain the existing retry UI.

Knife's tutorial skips the normal entrance fade/input-locked intro and exposes
`__PHASER_GAME__` as well as `__kh`, so the host can explicitly wake its loop,
scene clocks and input after preloading. To inspect the actual host lifecycle,
run `node scripts/check-knife-lifecycle.cjs`, open the printed URL, then call
`__knifeCheck.state()`, `.resume()` and `.pause()` in the browser console.
The harness initially pauses after load to reproduce the old standby path. Add
`--selected` for the new path: load followed immediately by the host resume script.
Add `--water --selected` to check Water Sort with the same host bootstrap/resume.
Development builds log host decisions as `[tutorial.lifecycle]` for device diagnosis.
