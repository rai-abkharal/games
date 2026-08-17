export interface GameOverPayload {
  score: number;
  highScore?: number;
  level?: number;
  timeSpentSeconds?: number;
  stats?: Record<string, any>;
}

export interface GameCompletedPayload {
  score: number;
  level: number;
  stats?: Record<string, any>;
}

export type LifecycleListener = () => void;
export type SoundListener = (enabled: boolean) => void;

class GameBridgeManager {
  private static instance: GameBridgeManager;
  private soundEnabled: boolean = true;
  private isPaused: boolean = false;
  private onPauseListeners: Set<LifecycleListener> = new Set();
  private onResumeListeners: Set<LifecycleListener> = new Set();
  private onRestartListeners: Set<LifecycleListener> = new Set();
  private onSoundChangeListeners: Set<SoundListener> = new Set();

  private constructor() {
    this.setupGlobalBridge();
  }

  public static getInstance(): GameBridgeManager {
    if (!GameBridgeManager.instance) {
      GameBridgeManager.instance = new GameBridgeManager();
    }
    return GameBridgeManager.instance;
  }

  private setupGlobalBridge() {
    // Expose window.GameBridge
    const bridge = {
      ready: () => this.notifyFlutter('ready', {}),
      gameStarted: () => this.notifyFlutter('gameStarted', {}),
      pause: () => this.triggerPause(),
      resume: () => this.triggerResume(),
      restart: () => this.triggerRestart(),
      gameOver: (payload: GameOverPayload) => this.notifyFlutter('gameOver', payload),
      completed: (payload: GameCompletedPayload) => this.notifyFlutter('completed', payload),
      setSoundEnabled: (enabled: boolean) => this.setSound(enabled),
      haptic: (type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error') =>
        this.notifyFlutter('haptic', { type }),
    };

    (window as any).GameBridge = bridge;

    // Listen for custom window events dispatched by Flutter host injection
    window.addEventListener('flutter:pause', () => this.triggerPause());
    window.addEventListener('flutter:resume', () => this.triggerResume());
    window.addEventListener('flutter:restart', () => this.triggerRestart());
    window.addEventListener('flutter:sound', (e: any) => {
      if (e.detail && typeof e.detail.enabled === 'boolean') {
        this.setSound(e.detail.enabled);
      }
    });

    console.log('🎮 [GameBridge] Initialized window.GameBridge');
  }

  private notifyFlutter(action: string, payload: any) {
    console.log(`📡 [GameBridge -> Host] ${action}:`, payload);

    // 1. Standard flutter_inappwebview channel
    if ((window as any).flutter_inappwebview && (window as any).flutter_inappwebview.callHandler) {
      (window as any).flutter_inappwebview.callHandler('GameBridgeChannel', JSON.stringify({ action, payload }));
    }

    // 2. Standard webview_flutter JavaScriptChannel
    if ((window as any).FlutterGameBridge && (window as any).FlutterGameBridge.postMessage) {
      (window as any).FlutterGameBridge.postMessage(JSON.stringify({ action, payload }));
    }

    // 3. PostMessage fallback
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ source: 'GameBridge', action, payload }, '*');
    }
  }

  public triggerPause() {
    this.isPaused = true;
    this.onPauseListeners.forEach((cb) => {
      try { cb(); } catch (e) { console.error(e); }
    });
    // Sleep Phaser engine loop to drop background CPU/GPU consumption to 0%
    if ((window as any).__PHASER_GAME__ && (window as any).__PHASER_GAME__.loop) {
      try { (window as any).__PHASER_GAME__.loop.sleep(); } catch (_) {}
    }
    this.notifyFlutter('paused', {});
  }

  public triggerResume() {
    this.isPaused = false;
    // Wake Phaser engine loop
    if ((window as any).__PHASER_GAME__ && (window as any).__PHASER_GAME__.loop) {
      try { (window as any).__PHASER_GAME__.loop.wake(); } catch (_) {}
    }
    this.onResumeListeners.forEach((cb) => {
      try { cb(); } catch (e) { console.error(e); }
    });
    this.notifyFlutter('resumed', {});
  }

  public triggerRestart() {
    this.onRestartListeners.forEach((cb) => {
      try { cb(); } catch (e) { console.error(e); }
    });
  }

  public setSound(enabled: boolean) {
    this.soundEnabled = enabled;
    this.onSoundChangeListeners.forEach((cb) => {
      try { cb(enabled); } catch (e) { console.error(e); }
    });
  }

  public isSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  public getIsPaused(): boolean {
    return this.isPaused;
  }

  public onPause(cb: LifecycleListener) {
    this.onPauseListeners.add(cb);
  }

  public offPause(cb: LifecycleListener) {
    this.onPauseListeners.delete(cb);
  }

  public onResume(cb: LifecycleListener) {
    this.onResumeListeners.add(cb);
  }

  public offResume(cb: LifecycleListener) {
    this.onResumeListeners.delete(cb);
  }

  public onRestart(cb: LifecycleListener) {
    this.onRestartListeners.add(cb);
  }

  public onSoundChange(cb: SoundListener) {
    this.onSoundChangeListeners.add(cb);
  }

  public ready() {
    this.notifyFlutter('ready', {});
  }

  public gameStarted() {
    this.notifyFlutter('gameStarted', {});
  }

  public gameOver(payload: GameOverPayload) {
    this.notifyFlutter('gameOver', payload);
  }

  public completed(payload: GameCompletedPayload) {
    this.notifyFlutter('completed', payload);
  }

  public haptic(type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error') {
    this.notifyFlutter('haptic', { type });
  }
}

export const GameBridge = GameBridgeManager.getInstance();
