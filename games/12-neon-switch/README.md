# Neon Switch — Publishable Package

This ZIP is directly playable in a modern browser: open `index.html` through a local/static web server.

It is also compatible with the platform's package shape:
- `index.html` entry
- `manifest.json`
- portrait orientation
- TAP controls
- `neon-switch.svg` thumbnail

For the platform's official build pipeline, place the game under `games/neon-switch/` and run `node build_all.js`. The supplied pipeline will run Vite and generate its own `dist` package.
