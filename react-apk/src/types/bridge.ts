/**
 * Messages exchanged between the host and an HTML5 game inside the WebView.
 * The wire format is the one the games already emit for the native app:
 * `{ action, payload }` JSON via FlutterGameBridge.postMessage, plus a handful
 * of direct NativeBridge.method(...) calls used by some uploaded games.
 */

export type HapticType =
  | 'light'
  | 'medium'
  | 'heavy'
  | 'success'
  | 'warning'
  | 'error';

export type GameToHostMessage =
  | { type: 'ready' }
  | { type: 'gameStarted' }
  | { type: 'gameOver'; score: number; stats: string }
  | { type: 'completed'; score: number; level: number }
  | { type: 'setSwipeEnabled'; enabled: boolean }
  | { type: 'haptic'; haptic: HapticType }
  | { type: 'earnCoins'; amount: number }
  | { type: 'requestHint'; action: string }
  | { type: 'saveLevelState'; level: number }
  | { type: 'showRewardedAd'; rewardType: string }
  | { type: 'metrics'; fps: number; frameTimeMs: number }
  | { type: 'paused' }
  | { type: 'resumed' };

export interface SavedGameState {
  level: number;
  coins: number;
  highScore: number;
}
