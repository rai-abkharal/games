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

The first game initializes behind the existing app splash. Only the next bundled
tutorial is allowed to initialize offscreen, after the active game is ready; it
is paused until selected. Normal feed games retain their existing loading policy.
An early swipe waits on the completed game until the next page is ready, rather
than exposing its loading placeholder. The existing app splash is unchanged.
There is still real WebView initialization time; this removes network loading,
not the device's rendering cost. Errors retain the existing retry UI.
