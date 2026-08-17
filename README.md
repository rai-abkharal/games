# 🎮 Mini-Games Swipe App (TikTok-Style 2D Mini-Game Feed)

A high-performance vertical swipe feed of HTML5/Phaser mini-games wrapped in a Flutter host app for **Android** and **iOS**, backed by a lightweight Node.js/TypeScript catalog API and local asset CDN.

```
                        +-----------------------------------------+
                        |           Cloudflare CDN / R2           |
                        |      (Local Dev Node.js Backend)        |
                        +--------------------+--------------------+
                                             |
                   GET /api/games catalog    |   Game bundles (HTML/JS/Assets)
                                             v
+-----------------------------------------------------------------------------------+
| Flutter Mobile Host App (Android & iOS)                                           |
|                                                                                   |
|  +---------------------+   Vertical Swipe    +----------------------------------+ |
|  | Riverpod Feed State | ------------------> | PageView.builder (1 Active Page) | |
|  +----------+----------+                     +----------------+-----------------+ |
|             |                                                 |                   |
|             v                                                 v                   |
|  +---------------------+                     +----------------------------------+ |
|  | Game Cache Manager  |                     |  GameHost Widget & Overlay UI    | |
|  | - LRU Eviction      |                     |  - Pause / Resume on swipe       | |
|  | - Background Preload|                     |  - Mute/Unmute, Score Overlay    | |
|  | - Shelf Local Server|                     +----------------+-----------------+ |
|  +----------+----------+                                      |                   |
|             |                                                 v                   |
|             | Serves http://localhost:PORT/                   |                   |
|             +-------------------------------------------------+                   |
|                                                               |                   |
|                                                               v                   |
|                                              +----------------------------------+ |
|                                              | WebView (Android / WKWebView)    | |
|                                              |  +-----------------------------+ | |
|                                              |  | window.GameBridge Channel   | | |
|                                              |  | - ready / gameStarted       | | |
|                                              |  | - pause / resume            | | |
|                                              |  | - gameOver / completed      | | |
|                                              |  | - setSoundEnabled           | | |
|                                              |  +--------------+--------------+ | |
|                                              |                 |                | |
|                                              |                 v                | |
|                                              |  +-----------------------------+ | |
|                                              |  | Phaser 3 / TS Mini-Game     | | |
|                                              |  +-----------------------------+ | |
|                                              +----------------------------------+ |
+-----------------------------------------------------------------------------------+
```

---

## 📂 Repository Structure

```
├── backend/                  # Node.js + TypeScript Fastify/Express Catalog API & CDN Asset Server
│   ├── catalog/games.json    # Validated game feed catalog with SHA-256 hashes & metadata
│   ├── public/games/         # Deployed static game bundles (CDN simulation)
│   ├── scripts/deploy-game.ts# Automated game validation & publishing CLI
│   └── tests/api.test.ts     # Vitest integration test suite
│
├── games/                    # 10 Complete Phaser 3 + TypeScript Mini-Games
│   ├── 01-tap-cannon/        # Tap Cannon (30s target shooting score chase)
│   ├── 02-color-match/       # Color Match (60s speed reaction color grid)
│   ├── 03-stack-tower/       # Stack Tower (Block stacking & overhang slicing)
│   ├── 04-lane-dodge/        # Lane Dodge (3-lane survival dodging runner)
│   ├── 05-memory-flip/       # Memory Flip (Card flip matching memory puzzle)
│   ├── 06-fruit-catch/       # Fruit Catch (Basket fruit catcher & bomb dodger)
│   ├── 07-tiny-archer/       # Tiny Archer (Aim trajectory & bow shooting)
│   ├── 08-pipe-connect/      # Pipe Connect (Grid tile rotation fluid flow puzzle)
│   ├── 09-one-tap-runner/    # One-Tap Runner (Endless dash with double jump)
│   ├── 10-merge-dots/        # Merge Dots (2048-style dot synthesis puzzle)
│   ├── shared/               # Shared GameBridge & procedural WebAudio synth
│   └── scripts/              # build-all-games.ts & deploy-all-games.ts
│
└── frontend/                 # Flutter Mobile App (Android & iOS)
    ├── lib/app/              # MaterialApp configuration & theme
    ├── lib/core/bridge/      # JavaScript GameBridge Controller
    ├── lib/core/cache/       # LRU Cache Manager (150MB cap + background preloading)
    ├── lib/core/server/      # Embedded local HTTP Shelf daemon (CORS-free offline play)
    ├── lib/core/network/     # Catalog API Client with bundled asset fallback
    ├── lib/features/feed/    # TikTok-style vertical swipe feed & overlays
    └── lib/features/game_host/# Active WebView container
```

---

## 🕹️ 10 Included Mini-Games

| # | Game | Category | Core Mechanic | Bundle Size |
|---|---|---|---|---|
| 01 | **Tap Cannon** | Arcade | Tap screen to shoot moving & gold targets in 30s | 1.43 MB |
| 02 | **Color Match** | Puzzle | Match falling & appearing colors before time runs out | 1.43 MB |
| 03 | **Stack Tower** | Casual | Precision tap to stack moving blocks and slice overhangs | 1.43 MB |
| 04 | **Lane Dodge** | Arcade | Tap/swipe 3 vertical lanes to dodge incoming hazards | 1.43 MB |
| 05 | **Memory Flip** | Puzzle | Flip cards and match pairs in fewest moves & time | 1.43 MB |
| 06 | **Fruit Catch** | Arcade | Move basket horizontally to catch fruits and avoid bombs | 1.43 MB |
| 07 | **Tiny Archer** | Action | Drag to draw bow, predictive trajectory, shoot targets | 1.43 MB |
| 08 | **Pipe Connect** | Puzzle | Rotate pipe tiles to connect water source to drain | 1.43 MB |
| 09 | **One-Tap Runner** | Runner | Auto-run; tap to jump and double-jump over spikes | 1.43 MB |
| 10 | **Merge Dots** | Puzzle | Swipe to slide and merge matching number dots into 2048 | 1.43 MB |

---

## 🚀 Quick Start & Development

### 1. Start the Backend Catalog & CDN Server
```bash
cd backend
npm install
npm run dev
```
- Catalog API: `http://localhost:8080/api/games`
- Health check: `http://localhost:8080/api/health`

### 2. Build and Deploy All Mini-Games
```bash
cd games
npm install
npm run build:all
npm run deploy:all
```

### 3. Run the Flutter Mobile App (Android & iOS)
```bash
cd frontend
flutter pub get
flutter run
```

### 4. Run Automated Test Suites
```bash
# Backend unit & integration tests
cd backend && npm test

# Flutter unit & widget tests
cd frontend && flutter test
```

---

## 🌉 The `GameBridge` Lifecycle Contract

Every mini-game implements the standardized bidirectional bridge without exposing native APIs:

### Game to Flutter Host:
- `ready()`: Triggered on boot when scene is ready.
- `gameStarted()`: Triggered when gameplay begins.
- `gameOver(payload)`: Emits score, level, and stats to host.
- `completed(payload)`: Emits puzzle completion metrics.
- `haptic(type)`: Triggers native haptic feedback (`light`, `medium`, `heavy`).

### Flutter Host to Game:
- `pause()`: Pauses timers, physics, tweens, and audio when swiped away or backgrounded.
- `resume()`: Resumes game when swiped back into focus.
- `restart()`: Restarts current game scene without page reloading.
- `setSoundEnabled(bool)`: Toggles audio synthesis volume immediately.

---

## 🛡️ Apple Guideline 4.7 & App Store Compliance
- **Zero Native API Exposure**: HTML5 games run in sandboxed WebViews communicating strictly through the `window.GameBridge` message protocol.
- **Dynamic Catalog Metadata**: Every game package specifies semantic versioning, exact file checksums, age ratings, orientation, and content categories.
- **Privacy & Security**: No external trackers, ad SDKs, login requirements, or arbitrary remote script executions.
