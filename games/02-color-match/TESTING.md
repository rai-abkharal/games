# Color Match - Testing Checklist

- [x] **Touch Input**: Large touch grid tiles responsive to quick taps.
- [x] **Color Matching Logic**: Correctly selects random target color and verifies tapped tile.
- [x] **Lives & Streak**: 3 lives, screen shake on error, combo multiplier on streak.
- [x] **Lifecycle & Bridge**: Correctly integrates with `window.GameBridge` (`ready`, `gameStarted`, `pause`, `resume`, `gameOver`).
- [x] **No Drag Glitches**: Uses tap/pointerdown only, no horizontal scroll interference.
