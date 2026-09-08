# Darts Duel

Canvas 2D / TypeScript game in the existing mini-game suite, based on `games/dartgameplay.mp4`. Uses the suite's Vite single-file build, `GameBridge`, `SoundFx`, and Sudoku Pro difficulty conventions. No additional game engine or runtime dependency.

From the repository root:

```powershell
npm.cmd run dev --prefix games/30-darts-duel
npm.cmd test --prefix games/30-darts-duel
npm.cmd run build --prefix games/30-darts-duel
```

Development URL: `http://127.0.0.1:5186`. The self-contained production entry is `dist/index.html`. Fredoka is embedded for offline rendering; its SIL Open Font License ships in `dist/font-license.txt`.

Tap anywhere on the canvas (or press Space/Enter with it focused) to lock X, then Y. The chosen coordinate is never adjusted. Bot starts; each turn has one dart. Both start at 301. Exactly zero wins without a double-out; overshoots preserve the remaining score. The difficulty label opens the existing Sudoku-style slider as an overlay.

## Integration

Sudoku Pro is a visual reference for the difficulty slider only. Darts Duel independently stores Easy / Medium / Hard in `darts_duel_difficulty_v1` and defaults to Easy when no valid Darts setting exists. It never reads Sudoku preferences or saved puzzles, writes Sudoku settings, or listens for Sudoku difficulty events. Restart and replay preserve the current Darts difficulty. Results are also independent, in `darts_duel_stats_v1`.

The existing game bridge handles ready/start/completed/game-over, sound settings, pause/resume, restart, and haptics. There is no top-left back control. Results offer Play Again; no unrelated Home or Stats screens are introduced. Host navigation remains with the app.

## Systems and tuning

- `game/Config.ts`: all ring radii, sector order, timings, difficulty accuracy and flight durations.
- `game/Match.ts`: finite-state turn lifecycle and input guards.
- `game/ScoreManager.ts`: normalized hit geometry, scoring and busts.
- `game/AimController.ts`, `BotController.ts`: linear timing and imperfect coordinate-based AI.
- `rendering/`: cached high-resolution board, vector darts, layout, impact camera, particles and room.
- `ui/GameUI.ts`: accessible HUD, difficulty/help overlays and results.
- `integration/`: shared audio and independent Darts difficulty storage.

Flight durations are 0.72 / 0.49 / 0.30 seconds for Easy / Medium / Hard. Board drawing and hit tests use the same normalized radii. High-DPI canvas resolution tracks devicePixelRatio; the board cache also accounts for the maximum impact zoom. Embedded darts and particles are bounded. Paused and finished games do not continually redraw the canvas.

## Verification

The automated test suite covers every sector and multiplier, bull/ring/sector boundaries, misses, busts, single checkouts, two-stage aiming, bot-first turns, input spam, result timing, difficulty integration, restart reset, bounded dart retention and statistical AI progression.

Browser verification additionally exercised real clicks, all difficulty controls, both result panels, help/pause, host lifecycle, and 50 consecutive replays. Visual checks use phone, tablet and desktop viewports, including high-DPI emulation. Timing measured in desktop browser emulation does not substitute for profiling on physical mobile hardware.

No remote publishing is needed for local play. The repository's `backend/scripts/deploy-game.ts` registers the built game in the local backend and bundled app catalogs.

The full catalog check passes for Darts Duel and Sudoku Pro. It also reports an existing Water Sort metadata issue: its checksum is missing and its recorded size is 15,000 bytes versus an 82,271-byte package. That unrelated entry is unchanged.
