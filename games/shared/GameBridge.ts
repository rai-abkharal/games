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

  private soundEnabled = true;
  private isPaused = false;
  private isDestroyed = false;
  private isGameplayActive = false;
  private lastHapticAt = 0;
  private metricsTimer: number | null = null;

  // Each mini-game has one active gameplay scene. Replacing these handlers
  // prevents old Phaser Scenes from being retained after every restart.
  private onPauseListener: LifecycleListener | null = null;
  private onResumeListener: LifecycleListener | null = null;
  private onRestartListener: LifecycleListener | null = null;
  private onSoundChangeListeners: Set<SoundListener> = new Set();

  private readonly handleFlutterPause = () => this.triggerPause();
  private readonly handleFlutterResume = () => this.triggerResume();
  private readonly handleFlutterRestart = () => this.triggerRestart();
  private readonly handleFlutterSound = (event: Event) => {
    const customEvent = event as CustomEvent<{ enabled?: boolean }>;
    if (typeof customEvent.detail?.enabled === 'boolean') {
      this.setSound(customEvent.detail.enabled);
    }
  };

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
    const bridge = {
      ready: () => this.ready(),
      gameStarted: () => this.gameStarted(),
      pause: () => this.triggerPause(),
      resume: () => this.triggerResume(),
      restart: () => this.triggerRestart(),
      gameOver: (payload: GameOverPayload) => this.gameOver(payload),
      completed: (payload: GameCompletedPayload) => this.completed(payload),
      setSoundEnabled: (enabled: boolean) => this.setSound(enabled),
      haptic: (type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error') =>
        this.haptic(type),
      destroy: () => this.destroy(),
    };

    (window as any).GameBridge = bridge;

    window.addEventListener('flutter:pause', this.handleFlutterPause);
    window.addEventListener('flutter:resume', this.handleFlutterResume);
    window.addEventListener('flutter:restart', this.handleFlutterRestart);
    window.addEventListener('flutter:sound', this.handleFlutterSound as EventListener);
  }

  private notifyFlutter(action: string, payload: any) {
    if (this.isDestroyed) return;
    const message = JSON.stringify({ action, payload });

    if ((window as any).flutter_inappwebview?.callHandler) {
      (window as any).flutter_inappwebview.callHandler('GameBridgeChannel', message);
    }

    if ((window as any).FlutterGameBridge?.postMessage) {
      (window as any).FlutterGameBridge.postMessage(message);
    }

    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ source: 'GameBridge', action, payload }, '*');
    }
  }

  private startMetricsReporting() {
    if (this.metricsTimer !== null || !this.isGameplayActive || this.isPaused) return;

    const report = () => {
      const game = (window as any).__PHASER_GAME__;
      const loop = game?.loop;
      if (!loop || this.isDestroyed || !this.isGameplayActive || this.isPaused) return;

      const fps = Number(loop.actualFps ?? 0);
      const frameTimeMs = Number(loop.delta ?? 0);
      if (!Number.isFinite(fps) || !Number.isFinite(frameTimeMs)) return;

      this.notifyFlutter('metrics', {
        fps: Math.round(fps * 10) / 10,
        frameTimeMs: Math.round(frameTimeMs * 10) / 10,
      });
    };

    report();
    this.metricsTimer = window.setInterval(report, 1000);
  }

  private stopMetricsReporting() {
    if (this.metricsTimer !== null) {
      window.clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
  }

  public triggerPause() {
    if (this.isDestroyed || this.isPaused) return;
    this.isPaused = true;
    this.stopMetricsReporting();

    try {
      this.onPauseListener?.();
    } catch (_) {}

    const game = (window as any).__PHASER_GAME__;
    if (game?.loop) {
      try {
        game.loop.sleep();
      } catch (_) {}
    }

    this.notifyFlutter('paused', {});
  }

  public triggerResume() {
    if (this.isDestroyed) return;

    const wasPaused = this.isPaused;
    this.isPaused = false;

    const game = (window as any).__PHASER_GAME__;
    if (game?.loop) {
      try {
        game.loop.wake();
      } catch (_) {}
    }

    if (wasPaused) {
      try {
        this.onResumeListener?.();
      } catch (_) {}
      this.notifyFlutter('resumed', {});
    }

    this.startMetricsReporting();
  }

  public triggerRestart() {
    if (this.isDestroyed) return;

    const listener = this.onRestartListener;
    if (listener) {
      try {
        listener();
        return;
      } catch (_) {}
    }

    // Universal fallback used when restart is requested during gameplay.
    const game = (window as any).__PHASER_GAME__;
    try {
      if (game?.scene?.keys?.GameScene) {
        game.scene.start('GameScene');
      }
    } catch (_) {}
  }

  public setSound(enabled: boolean) {
    if (this.isDestroyed) return;
    this.soundEnabled = enabled;
    this.onSoundChangeListeners.forEach((listener) => {
      try {
        listener(enabled);
      } catch (_) {}
    });
  }

  public isSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  public getIsPaused(): boolean {
    return this.isPaused;
  }

  public onPause(listener: LifecycleListener) {
    this.onPauseListener = listener;
  }

  public offPause(listener: LifecycleListener) {
    if (this.onPauseListener === listener) this.onPauseListener = null;
  }

  public onResume(listener: LifecycleListener) {
    this.onResumeListener = listener;
  }

  public offResume(listener: LifecycleListener) {
    if (this.onResumeListener === listener) this.onResumeListener = null;
  }

  public onRestart(listener: LifecycleListener) {
    this.onRestartListener = listener;
  }

  public offRestart(listener: LifecycleListener) {
    if (this.onRestartListener === listener) this.onRestartListener = null;
  }

  public onSoundChange(listener: SoundListener) {
    this.onSoundChangeListeners.add(listener);
  }

  public offSoundChange(listener: SoundListener) {
    this.onSoundChangeListeners.delete(listener);
  }

  public ready() {
    this.notifyFlutter('ready', {});
  }

  public gameStarted() {
    // A previous GameOverScene must not remain reachable through its callback.
    this.onRestartListener = null;
    this.isGameplayActive = true;
    this.notifyFlutter('gameStarted', {});
    this.startMetricsReporting();
  }

  public gameOver(payload: GameOverPayload) {
    this.onPauseListener = null;
    this.onResumeListener = null;
    this.isGameplayActive = false;
    this.stopMetricsReporting();
    this.notifyFlutter('gameOver', payload);
  }

  public completed(payload: GameCompletedPayload) {
    this.onPauseListener = null;
    this.onResumeListener = null;
    this.isGameplayActive = false;
    this.stopMetricsReporting();
    this.notifyFlutter('completed', payload);
  }

  public haptic(type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error') {
    const now = performance.now();
    if (now - this.lastHapticAt < 60) return;
    this.lastHapticAt = now;
    this.notifyFlutter('haptic', { type });
  }

  public destroy() {
    if (this.isDestroyed) return;

    this.stopMetricsReporting();
    window.removeEventListener('flutter:pause', this.handleFlutterPause);
    window.removeEventListener('flutter:resume', this.handleFlutterResume);
    window.removeEventListener('flutter:restart', this.handleFlutterRestart);
    window.removeEventListener('flutter:sound', this.handleFlutterSound as EventListener);

    this.onPauseListener = null;
    this.onResumeListener = null;
    this.onRestartListener = null;
    this.onSoundChangeListeners.clear();
    this.isGameplayActive = false;
    this.isDestroyed = true;

    try {
      delete (window as any).GameBridge;
    } catch (_) {}
  }
}

export const GameBridge = GameBridgeManager.getInstance();
