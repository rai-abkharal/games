# Verification

## Custom version checks

- Active source passes the JavaScript syntax check; advertising SDK calls, ad gates, ad badge drawing, top-right action logic, and arrow tutorial references are absent.
- Confirmed the user's saved level 15 loads with no top-right button and no console errors.
- A separate QA page tested hand-only tutorials on levels 1 and 5 and the direct GET car reward flow. QA controls are not included in game-page.html.
- GET unlocked car 6 and advanced from the level 10 reward screen to level 11 in playing state, with no console errors.
- Rebuilt the standalone page using source/; original/ is retained only as archival code and as the source of media/data resources.

## Initial extraction checks (before customization)

- Built a 543,761-byte standalone HTML page with 30 embedded resources.
- Confirmed the packaged original/game.js matches the captured inline JavaScript byte for byte.
- Decoded every embedded resource and compared its bytes against the separate original file.
- Checked JavaScript syntax with Node.js.
- Verified no external script tags or static image requests remain in the playable page. Its CSP excludes HTTP(S) resource loading and connections; data and Blob resources are permitted.
- Opened the standalone page on a localhost server. Observed the track, level number, tutorial artwork and car queue. Tested keyboard and mouse launches, moving cars, collision effects, retry, and reload.
- The browser reported no console errors or warnings during these checks.

Limits: testing used localhost rather than file URLs because the automated browser does not permit file URLs. The file is self-contained and designed to open directly in Chrome/Edge. A full level-completion run, every generated level, every unlock path, touch-device input and audible playback were not verified. No claim is made that this package contains private developer-side files beyond the browser-delivered game.
