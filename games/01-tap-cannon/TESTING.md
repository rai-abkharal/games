# Tap Cannon - Testing Checklist

- [x] **Touch Input**: Tap anywhere rotates cannon barrel and shoots projectile instantly.
- [x] **Collisions**: Cannonball destroys bullseye targets & bonus gold targets with particle bursts.
- [x] **Score & Timer**: 30-second countdown with combo multiplier and visual warning when < 5s.
- [x] **Lifecycle & Bridge**:
  - `GameBridge.ready()` fires on Boot.
  - `GameBridge.gameStarted()` fires on game start.
  - `GameBridge.pause()` / `resume()` stops timers and physics cleanly.
  - `GameBridge.gameOver()` emits payload with final score to Flutter host.
- [x] **Restart**: In-scene restart button re-triggers game loop without page reload.
- [x] **Responsive Scaling**: Scales cleanly across various phone aspect ratios (16:9, 19.5:9, etc.).
