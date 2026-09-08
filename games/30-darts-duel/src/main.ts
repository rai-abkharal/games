/// <reference types="vite/client" />
import './style.css';
import { GameBridge } from '../../shared/GameBridge';
import { Difficulty, CONFIG } from './game/Config';
import { Match, MatchEvent } from './game/Match';
import { AudioManager } from './integration/AudioManager';
import { readDifficulty, saveDifficulty } from './integration/DifficultyManager';
import { Renderer } from './rendering/Renderer';
import { GameUI } from './ui/GameUI';
export class DartsGame {
  match: Match;
  renderer: Renderer;
  ui: GameUI;
  hostPaused = false;
  private audio = new AudioManager();
  private abort = new AbortController();
  private observer: ResizeObserver;
  private raf = 0;
  private lastTime = 0;
  private destroyed = false;
  private needsRender = true;
  private onPause = () => { this.hostPaused = true; };
  private onResume = () => { this.hostPaused = false; this.lastTime = performance.now(); };
  private onRestart = () => this.restart(this.match.difficulty);
  constructor(canvas: HTMLCanvasElement) {
    let selected: Difficulty = 'easy';
    try { selected = readDifficulty(localStorage); } catch { /* Sandboxed origins may deny storage. */ }
    this.match = new Match(selected, event => this.event(event));
    this.renderer = new Renderer(canvas);
    this.ui = new GameUI(this.match, d => this.restart(d), () => {
      this.audio.activate(); this.audio.play('tap', this.match);
    }, () => this.audio.play('medal', this.match));
    const resize = () => {
      this.renderer.resize();
      this.needsRender = true;
      document.getElementById('game')!.style.setProperty('--u', `${this.renderer.layout.scale}px`);
    };
    this.observer = new ResizeObserver(resize); this.observer.observe(canvas); resize();
    document.fonts.ready.then(() => { if (!this.destroyed) { this.renderer.fontsReady(); this.needsRender = true; } });
    const signal = this.abort.signal;
    window.addEventListener('resize', resize, { signal });
    canvas.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0) return;
      event.preventDefault(); this.audio.activate(); this.tap();
    }, { signal });
    canvas.addEventListener('keydown', event => {
      if ((event.code === 'Space' || event.code === 'Enter') && !event.repeat) { event.preventDefault(); this.audio.activate(); this.tap(); }
    }, { signal });
    document.addEventListener('visibilitychange', () => { this.lastTime = performance.now(); }, { signal });
    window.addEventListener('pagehide', event => {
      if (event.persisted) this.onPause(); else this.destroy();
    }, { signal });
    window.addEventListener('pageshow', event => { if (event.persisted) this.onResume(); }, { signal });
    GameBridge.ready(); GameBridge.setSwipeEnabled(false);
    this.restart(selected);
    this.lastTime = performance.now(); this.raf = requestAnimationFrame(t => this.frame(t));
  }
  get paused() { return this.hostPaused || document.hidden || this.ui.modal !== null; }
  tap() { if (!this.paused) this.match.tap(); }
  restart(difficulty: Difficulty = this.match.difficulty) {
    this.hostPaused = false;
    this.needsRender = true;
    this.match.reset(difficulty); this.ui.reset();
    saveDifficulty(difficulty); GameBridge.gameStarted(); this.bindHost();
    this.lastTime = performance.now();
  }
  private bindHost() {
    GameBridge.onPause(this.onPause); GameBridge.onResume(this.onResume); GameBridge.onRestart(this.onRestart);
  }
  private event(event: MatchEvent) {
    this.audio.play(event, this.match);
    if (event === 'impact') {
      this.renderer.effects.burst();
      try { GameBridge.haptic(this.match.hit.score ? 'light' : 'warning'); } catch { /* Optional host capability. */ }
    }
    if (event === 'turn') this.ui.announce(this.match.side === 'bot' ? 'Bot thinking.' : 'Your turn. Tap to lock horizontal aim.');
    if (event === 'lockX' && this.match.side === 'player') this.ui.announce('Horizontal aim locked. Tap to lock vertical aim and throw.');
    if (event === 'score') {
      this.ui.updateScores();
      this.ui.announce(`${this.match.side === 'player' ? 'You' : 'Bot'}: ${this.match.bust ? 'bust' : this.match.hit.score + ' points'}. ${this.match.scores[this.match.side]} remaining.`);
    }
    if (event === 'victory' || event === 'defeat') {
      this.ui.showResult();
      const stats = { difficulty: this.match.difficulty, won: event === 'victory', playerRemaining: this.match.scores.player,
        botRemaining: this.match.scores.bot, darts: this.match.throws.player };
      try {
        const key = 'darts_duel_stats_v1';
        const stored = JSON.parse(localStorage.getItem(key) || '{}');
        const previous = stored[this.match.difficulty] || { played: 0, wins: 0 };
        stored[this.match.difficulty] = { played: previous.played + 1, wins: previous.wins + (stats.won ? 1 : 0) };
        localStorage.setItem(key, JSON.stringify(stored));
      } catch { /* Match results still work without storage. */ }
      if (event === 'victory') GameBridge.completed({ score: CONFIG.startScore, level: 1, stats });
      else GameBridge.gameOver({ score: CONFIG.startScore - this.match.scores.player, timeSpentSeconds: Math.round(this.match.elapsed), stats });
      this.bindHost();
    }
  }
  private frame(now: number) {
    if (this.destroyed) return;
    const dt = Math.min(0.05, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    const active = !this.paused && !this.match.result;
    if (active) this.match.update(dt);
    if (active || this.needsRender) { this.renderer.draw(this.match); this.needsRender = false; }
    const paused = document.getElementById('paused')!;
    const hidden = !this.hostPaused || this.ui.modal !== null;
    if (paused.hidden !== hidden) paused.hidden = hidden;
    this.raf = requestAnimationFrame(t => this.frame(t));
  }
  destroy() {
    this.destroyed = true; cancelAnimationFrame(this.raf); this.abort.abort(); this.observer.disconnect(); this.ui.destroy();
    GameBridge.offPause(this.onPause); GameBridge.offResume(this.onResume); GameBridge.offRestart(this.onRestart);
    GameBridge.destroy();
  }
}
const game = new DartsGame(document.getElementById('gameCanvas') as HTMLCanvasElement);
if (import.meta.env.DEV) (window as unknown as { __darts: DartsGame }).__darts = game;
