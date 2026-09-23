# Car Circle — offline game and captured browser source

## Updated custom version

The playable build now uses **source/game.js**, **source/body.html** and **source/style.css**. Advertising SDK integration, commercial breaks, rewarded-ad logic and ad icons have been removed. Available car rewards unlock immediately with GET. The top-right slow-down/skip control is removed. The hand tutorial remains on levels 1 and 5; the keyboard-arrow tutorial is removed. Keyboard gameplay controls still work.

The original/ and reference/ folders are archival study material; their old advertising code is not executed by the customized game. Media and JSON data are still embedded from original/.

## Play

Extract the ZIP, then open **game-page.html** in Chrome or Edge. The HTML contains the code, images, sounds and level data; it needs no internet or installation. Click/tap to start, then click/tap or press **Space**, **Up**, or **W** to send cars onto the track. Time each launch to avoid collisions. After a crash, click/tap to retry.

The game saves progress in browser storage when available. Moving the file or switching browsers may create a separate save. Sound starts after interaction.

An optional local preview is available if Node.js is installed: run `node tools/serve.cjs`, then open http://127.0.0.1:4200/. This uses only your computer. Stop it with Ctrl+C.

## Included

- **game-page.html**: self-contained playable build.
- **original/game.js**: actual captured browser-delivered JavaScript, unchanged.
- **original/style.css**: game CSS extracted from the loaded page.
- **original/body.html**: reconstructed game markup from that DOM, with transient canvas dimensions and generated skin tiles removed.
- **original/**: all 30 identified data/media dependencies (3 JSON files, 21 PNG images, 6 WebM audio files).
- **GAME-STRUCTURE.md**: architecture and useful code locations.
- **offline-loader.js** and **tools/rebuild.cjs**: local packaging adapter and rebuild tool.
- **asset-manifest.json**: file sizes and SHA-256 hashes.
- **reference/**: Poki wrapper HTML and captured loaded-game DOM, saved as text for inspection.

Edit gameplay and markup in source/, or media/data in original/, then run `node tools/rebuild.cjs` to update the standalone page. No npm install is needed.

## Scope and offline differences

Source: https://poki.com/en/g/car-circle. The wrapper credits Shoom Games. The embedded game uses the internal title **Neon Oval Dash**. Captured build: `86bf360a-e74f-49e6-99f6-b6e77ab72418`.

This is the publicly delivered browser game and its identified runtime assets, not the developer's private repository, editor project, design files or backend. Direct retrieval of the game HTML returned a host challenge, so the main script and markup were captured from the normally loaded browser page. The DOM reference includes runtime changes and is not an untouched HTTP response.

The customized page removes online Poki integration and uses direct game transitions and direct car claiming. A content security policy also blocks external resources and connections.

This package does not provide a redistribution license for the original game or assets.

## Verification

See VERIFICATION.md for checks performed and their limits. The standalone page is designed for direct file opening; automated testing used localhost because the testing browser does not permit file URLs.
