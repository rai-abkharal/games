/**
 * engine.ts — Engine (canvas + fixed-timestep loop), Input, Sfx, Game (FSM).
 */

import {
  Rect, Wall, FloorPatch, UpgradeDef, UPGRADES, TAU, VIEW_W, VIEW_H, MAP_W, MAP_H,
  KILL_TARGET, TEAM_SIZE, RESPAWN_TIME, FIGHT_R,
  P_SPEED, P_DMG, P_RATE, P_MAG, P_RELOAD, P_SPREAD, BULLET_SPEED, BULLET_RANGE,
  ALLY_SPEED, ALLY_DMG, ALLY_RATE, ALLY_JITTER, FOE_SPEED, FOE_DMG, FOE_RATE, FOE_JITTER,
  BOT_MAG, BOT_RELOAD, MEDKIT_HEAL, PICK_R, KILLS_PER_UPGRADE, SLOWMO_PICK,
  STICK_HOME_X, STICK_HOME_Y, FIRE_BTN_X, FIRE_BTN_Y, FIRE_BTN_R, LOCK_KEEP,
  MAX_DECALS, BLUE, RED, BLOOD,
  C_CONCRETE, C_CONCRETE_2, C_CONCRETE_LINE, C_ASPHALT, C_ASPHALT_2, C_ASPHALT_LINE,
  C_GRASS, C_GRASS_2, C_GRASS_EDGE,
  C_CRATE_TOP, C_CRATE_MID, C_CRATE_LOW, C_CRATE_EDGE,
  C_BRICK_TOP, C_BRICK_MID, C_BRICK_LOW, C_BRICK_EDGE,
  C_METAL_TOP, C_METAL_MID, C_METAL_LOW, C_METAL_EDGE,
  UI_INK, UI_PANEL, UI_PANEL_DARK, UI_GREEN, UI_GREEN_DARK, UI_GOLD, UI_GOLD_DARK,
  UI_REDBTN, UI_REDBTN_DARK,
  clamp, lerp, damp, rand, chance, css, roundRect, glow, shuffle, inRect,
  chunky, outlined, ribbon, star,
  buildWalls, buildFloor, medkitSpots, spawnPoints, formatTime, dist2,
  easeOutCubic, easeOutBack,
} from './utils';
import { Fighter, Bullet, Medkit, Particle, Popup, Decal, KillFeed, World } from './entities';
import { SHOT_MP3_B64 } from './assets';

/* ================================================================== *
 * Input — one floating joystick (left) + one fire button (right)
 * ================================================================== */

interface Stick { id: number; ox: number; oy: number; x: number; y: number; }

export class Input {
  private keys = new Set<string>();
  private taps: { x: number; y: number }[] = [];
  moveStick: Stick | null = null;
  firePointer = -1;
  fireHeld = false;
  mouseX = VIEW_W / 2; mouseY = VIEW_H / 2;
  mouseDown = false;
  hasMouse = false;
  private confirm = false;
  private keyConfirm = false;
  onGesture: (() => void) | null = null;

  static readonly STICK_R = 54;

  constructor(private canvas: HTMLCanvasElement) {
    const el = canvas;
    el.style.touchAction = 'none';

    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture?.(e.pointerId);
      this.gesture();
      const v = this.toVirtual(e.clientX, e.clientY);
      this.taps.push(v);
      if (this.taps.length > 4) this.taps.shift();
      this.confirm = true;
      if (e.pointerType === 'mouse') {
        this.hasMouse = true;
        this.mouseX = v.x; this.mouseY = v.y;
        this.mouseDown = true;
      } else if (Input.inFireZone(v.x, v.y)) {
        if (this.firePointer < 0) { this.firePointer = e.pointerId; this.fireHeld = true; }
      } else if (!this.moveStick) {
        this.moveStick = { id: e.pointerId, ox: v.x, oy: v.y, x: v.x, y: v.y };
      }
      e.preventDefault();
    });

    el.addEventListener('pointermove', (e) => {
      const v = this.toVirtual(e.clientX, e.clientY);
      if (e.pointerType === 'mouse') { this.hasMouse = true; this.mouseX = v.x; this.mouseY = v.y; return; }
      if (this.moveStick && this.moveStick.id === e.pointerId) { this.moveStick.x = v.x; this.moveStick.y = v.y; }
      e.preventDefault();
    });

    const up = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') this.mouseDown = false;
      if (this.moveStick && this.moveStick.id === e.pointerId) this.moveStick = null;
      if (this.firePointer === e.pointerId) { this.firePointer = -1; this.fireHeld = false; }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.gesture();
      this.keys.add(e.key.toLowerCase());
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) e.preventDefault();
      if (e.key === ' ' || e.key === 'Enter') { this.confirm = true; this.keyConfirm = true; }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => { this.keys.clear(); this.fireHeld = false; this.firePointer = -1; });
    document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  /** The whole lower-right quadrant fires; the button is just its anchor. */
  static inFireZone(x: number, y: number): boolean {
    return x > VIEW_W * 0.5 && y > VIEW_H * 0.42;
  }

  private gesture(): void { if (this.onGesture) { this.onGesture(); this.onGesture = null; } }

  toVirtual(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - r.left) / r.width) * VIEW_W,
      y: ((clientY - r.top) / r.height) * VIEW_H,
    };
  }

  key(...names: string[]): boolean { return names.some((n) => this.keys.has(n)); }

  moveVector(): { x: number; y: number } {
    let x = 0, y = 0;
    if (this.key('a', 'arrowleft')) x -= 1;
    if (this.key('d', 'arrowright')) x += 1;
    if (this.key('w', 'arrowup')) y -= 1;
    if (this.key('s', 'arrowdown')) y += 1;
    if (x || y) { const m = Math.hypot(x, y); return { x: x / m, y: y / m }; }
    if (this.moveStick) {
      const dx = this.moveStick.x - this.moveStick.ox;
      const dy = this.moveStick.y - this.moveStick.oy;
      const m = Math.hypot(dx, dy);
      if (m < 7) return { x: 0, y: 0 };
      const k = Math.min(m, Input.STICK_R) / Input.STICK_R;
      return { x: (dx / m) * k, y: (dy / m) * k };
    }
    return { x: 0, y: 0 };
  }

  firing(): boolean { return this.fireHeld || this.mouseDown || this.key(' ', 'f', 'j'); }

  takeTap(): { x: number; y: number } | null { return this.taps.shift() ?? null; }
  flushTaps(): void { this.taps.length = 0; this.confirm = false; this.keyConfirm = false; }
  takeConfirm(): boolean { const c = this.confirm; this.confirm = false; return c; }
  /** Keyboard-only confirm — a stray screen tap must not trigger it. */
  takeKey(): boolean { const c = this.keyConfirm; this.keyConfirm = false; return c; }
  flush(): void {
    this.taps.length = 0; this.confirm = false; this.keyConfirm = false;
    this.moveStick = null; this.fireHeld = false; this.firePointer = -1;
  }
}

/* ================================================================== *
 * Sfx — everything synthesized, nothing loaded
 * ================================================================== */

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambGain: GainNode | null = null;
  private shots: AudioBuffer[] = [];        // synthesized fallback
  private shotBuf: AudioBuffer | null = null;  // the embedded sample
  private shotOffset = 0;
  muted = false;
  private lastStep = 0;

  init(): void {
    if (this.ctx) return;
    const w = window as unknown as { AudioContext: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const Ctor = w.AudioContext || w.webkitAudioContext;
    if (!Ctor) return;
    try {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.renderGunshots();
      this.loadShotSample();
      this.startAmbience();
    } catch { this.ctx = null; }
  }

  /**
   * The gunshot is rendered sample-by-sample into a few buffers at startup —
   * a highpassed transient, a resonant crack, a lowpassed body, a pitch-swept
   * thump, a mechanical click and two slap-back tails, soft-clipped together.
   * Nothing is loaded; this is the whole sound. Variants plus a random
   * playback rate keep a long burst from sounding like a loop.
   */
  private renderGunshots(): void {
    if (!this.ctx) return;
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * 0.42);
    for (let v = 0; v < 4; v++) {
      const buf = this.ctx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      const crackDecay = 300 + v * 34;       // transient bite
      const bodyDecay = 34 + v * 3;          // chest punch
      const thumpF = 118 + v * 7;
      let hp = 0, prevN = 0, lp = 0, lp2 = 0, res = 0, resV = 0, phase = 0;
      const k = 0.055 + v * 0.004;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const n = Math.random() * 2 - 1;

        hp = 0.90 * (hp + n - prevN); prevN = n;            // high-pass -> snap
        const transient = hp * Math.exp(-t * crackDecay);

        // a lightly resonant band around 1.4 kHz gives the shot its "crack"
        const w = (TAU * (1350 + v * 90)) / sr;
        resV += (n * 0.5 - res) * w - resV * 0.10;
        res += resV;
        const crack = res * Math.exp(-t * 88);

        lp += (n - lp) * k;                                  // low-passed body
        const body = lp * Math.exp(-t * bodyDecay);

        const f = thumpF * Math.exp(-t * 17) + 44;           // pitch-swept thump
        phase += (TAU * f) / sr;
        const thump = Math.sin(phase) * Math.exp(-t * 26);

        const click = t < 0.012 ? Math.sin(TAU * 2700 * t) * Math.exp(-t * 520) * 0.35 : 0;

        lp2 += (n - lp2) * 0.012;                            // room slap-back
        let tail = 0;
        if (t > 0.05) tail += lp2 * Math.exp(-(t - 0.05) * 13) * 0.55;
        if (t > 0.13) tail += lp2 * Math.exp(-(t - 0.13) * 9) * 0.32;

        const mix = transient * 1.15 + crack * 1.5 + body * 0.85 + thump * 0.75 + click + tail;
        d[i] = Math.tanh(mix * 1.55) * 0.82;                 // soft clip for punch
      }
      this.shots.push(buf);
    }
  }

  /**
   * Decodes the embedded gunshot. MP3 encoders pad the head of the stream, so
   * once decoded we find the first sample with real signal and start playback
   * from there — otherwise every shot fires ~25 ms late.
   */
  private loadShotSample(): void {
    if (!this.ctx) return;
    try {
      const bin = atob(SHOT_MP3_B64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      this.ctx.decodeAudioData(
        bytes.buffer,
        (buf) => {
          const d = buf.getChannelData(0);
          let i = 0;
          while (i < d.length && Math.abs(d[i]) < 0.02) i++;
          this.shotOffset = Math.max(0, i - 48) / buf.sampleRate;
          this.shotBuf = buf;
        },
        () => { /* decode failed — the synthesized shot stays in place */ },
      );
    } catch { /* no atob, or bad data — same fallback */ }
  }

  /** Plays one gunshot, optionally muffled for distance. */
  private playShot(vol: number, cutoff = 0): void {
    if (!this.ctx || !this.master || this.muted) return;
    const sampled = this.shotBuf !== null;
    if (!sampled && !this.shots.length) return;
    const src = this.ctx.createBufferSource();
    src.buffer = sampled ? this.shotBuf : this.shots[Math.floor(Math.random() * this.shots.length)];
    // a touch of detune so a long burst doesn't comb-filter against itself
    src.playbackRate.value = sampled ? rand(0.97, 1.045) : rand(0.93, 1.08);
    const g = this.ctx.createGain();
    g.gain.value = vol;
    if (cutoff) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = 0.7;
      src.connect(f); f.connect(g);
    } else src.connect(g);
    g.connect(this.master);
    src.start(0, sampled ? this.shotOffset : 0);
  }

  /** A quiet looping wind bed so the arena never sounds dead. */
  private startAmbience(): void {
    if (!this.ctx || !this.master) return;
    try {
      const len = this.ctx.sampleRate * 3;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      let v = 0;
      for (let i = 0; i < len; i++) {
        v = v * 0.985 + (Math.random() * 2 - 1) * 0.015;   // brownish noise
        d[i] = v * 3;
      }
      // taper the seam so the loop doesn't click
      for (let i = 0; i < 2000; i++) {
        const k = i / 2000;
        d[i] *= k; d[len - 1 - i] *= k;
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 340;
      this.ambGain = this.ctx.createGain();
      this.ambGain.gain.value = 0.28;
      src.connect(f); f.connect(this.ambGain); this.ambGain.connect(this.master);
      src.start();
    } catch { /* ambience is optional */ }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, cutoff: number, type: BiquadFilterType = 'bandpass', q = 1.1, delay = 0): void {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = cutoff; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }

  /* --- weapons --- */
  shot(): void { this.playShot(0.78); }
  allyShot(): void { this.playShot(0.26, 2600); }
  distantShot(): void { this.playShot(0.17, 900); }
  whiz(): void { this.noise(0.09, 0.15, 2700, 'bandpass', 6); }
  casing(): void { this.tone(rand(2000, 2600), 0.05, 'triangle', 0.05, 1200, 0.13); }
  step(t: number): void {
    if (t - this.lastStep < 0.12) return;
    this.lastStep = t;
    this.noise(0.05, 0.055, 250, 'lowpass');
  }
  hit(): void { this.tone(440, 0.045, 'square', 0.12, 250); this.noise(0.04, 0.1, 3100, 'bandpass', 3); }
  hurt(): void { this.noise(0.13, 0.25, 400, 'lowpass'); this.tone(150, 0.15, 'sawtooth', 0.13, 70); }
  kill(n: number): void {
    this.tone(560 + n * 90, 0.09, 'triangle', 0.25, 900 + n * 120);
    this.noise(0.17, 0.14, 520, 'lowpass', 1, 0.02);
  }
  death(): void {
    this.tone(250, 0.5, 'sawtooth', 0.22, 55);
    this.noise(0.45, 0.22, 280, 'lowpass');
    this.tone(70, 0.3, 'sine', 0.2, 40, 0.06);
  }
  reloadOut(): void { this.tone(255, 0.045, 'square', 0.11, 175); this.noise(0.05, 0.07, 900, 'bandpass', 2); }
  reloadIn(): void { this.tone(520, 0.05, 'square', 0.13, 720); this.noise(0.06, 0.09, 1700, 'bandpass', 2, 0.03); }
  dryFire(): void { this.tone(900, 0.02, 'square', 0.06, 420); }
  heal(): void { this.tone(520, 0.1, 'sine', 0.2, 880); this.tone(780, 0.14, 'sine', 0.13, 1180, 0.04); }
  upgrade(): void { [660, 880, 1180].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.2, undefined, i * 0.07)); }
  heartbeat(): void { this.tone(58, 0.14, 'sine', 0.26, 42); this.tone(52, 0.12, 'sine', 0.19, 38, 0.17); }
  beep(last: boolean): void { this.tone(last ? 900 : 620, 0.1, 'square', 0.15, last ? 1200 : 620); }

  /* --- interface --- */
  uiTap(): void { this.tone(760, 0.05, 'triangle', 0.16, 980); }
  starDing(n: number): void {
    this.tone(700 + n * 200, 0.22, 'triangle', 0.24, 1500 + n * 240);
    this.tone(1400 + n * 300, 0.16, 'sine', 0.12, 2400, 0.03);
    this.noise(0.18, 0.07, 4200, 'bandpass', 2.5);
  }
  countTick(): void { this.tone(1250, 0.02, 'triangle', 0.05); }
  whoosh(): void { this.noise(0.3, 0.16, 900, 'bandpass', 0.7); }
  win(): void { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.24, undefined, i * 0.14)); }
  lose(): void { [440, 370, 294, 220].forEach((f, i) => this.tone(f, 0.36, 'sawtooth', 0.2, undefined, i * 0.16)); }
}

/* ================================================================== *
 * Game — the FSM
 * ================================================================== */

type State = 'PLAYING' | 'WIN' | 'LOSE';

const ALLY_NAMES = ['ECHO', 'NOVA', 'RAVEN'];
const FOE_NAMES = ['VIPER', 'HAWK', 'GHOST', 'SABRE'];

/** Stable pseudo-random from a coordinate — used for floor texture. */
function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export class Game implements World {
  state: State = 'PLAYING';
  time = 0;
  matchTime = 0;
  endTimer = 0;

  walls: Wall[] = buildWalls();
  floor: FloorPatch[] = buildFloor();
  fighters: Fighter[] = [];
  medkits: Medkit[] = [];
  bullets: Bullet[] = [];
  parts: Particle[] = [];
  decals: Decal[] = [];
  pops: Popup[] = [];
  feed = new KillFeed();
  player!: Fighter;

  score: [number, number] = [0, 0];
  camX = 0; camY = 0;
  shake = 0; flash = 0; hitMark = 0;
  banner = ''; bannerT = 0;
  lockId = 0; lockPulse = 0;
  firePress = 0;

  offers: UpgradeDef[] | null = null;
  offerAnim = 0;
  upgradesTaken: string[] = [];
  pendingOffers = 0;
  nextUpgradeAt = KILLS_PER_UPGRADE;

  shotsFired = 0; shotsHit = 0; bestStreak = 0;
  private prevReload = 0;
  private beatT = 0;
  private lastBeep = -1;

  // results screen
  stars = 0; starsShown = 0;
  starLandedAt: number[] = [];
  cash = 0; shownCash = 0;

  constructor(public sfx: Sfx, public input: Input) {
    this.reset();
  }

  /* ---------------- setup ---------------- */

  reset(): void {
    this.state = 'PLAYING';
    this.time = 0; this.matchTime = 0; this.endTimer = 0;
    this.fighters = [];
    this.bullets = []; this.parts = []; this.pops = []; this.decals = [];
    this.feed = new KillFeed();
    this.score = [0, 0];
    this.shake = 0; this.flash = 0; this.hitMark = 0;
    this.banner = ''; this.bannerT = 0;
    this.lockId = 0; this.lockPulse = 0; this.firePress = 0;
    this.offers = null; this.offerAnim = 0; this.pendingOffers = 0;
    this.upgradesTaken = [];
    this.nextUpgradeAt = KILLS_PER_UPGRADE;
    this.shotsFired = 0; this.shotsHit = 0; this.bestStreak = 0;
    this.prevReload = 0; this.beatT = 0; this.lastBeep = -1;
    this.stars = 0; this.starsShown = 0; this.starLandedAt = [];
    this.cash = 0; this.shownCash = 0;

    this.medkits = medkitSpots().map((s) => new Medkit(s.x, s.y));

    this.player = new Fighter(0, true, 'YOU', {
      dmg: P_DMG, rate: P_RATE, spread: P_SPREAD, speed: P_SPEED,
      mag: P_MAG, reload: P_RELOAD, jitter: 0,
    });
    this.player.bulletSpeed = BULLET_SPEED;
    this.player.range = BULLET_RANGE;
    this.fighters.push(this.player);

    for (let i = 0; i < TEAM_SIZE - 1; i++) {
      this.fighters.push(new Fighter(0, false, ALLY_NAMES[i], {
        dmg: ALLY_DMG, rate: ALLY_RATE, spread: 0.03, speed: ALLY_SPEED,
        mag: BOT_MAG, reload: BOT_RELOAD, jitter: ALLY_JITTER,
      }));
    }
    for (let i = 0; i < TEAM_SIZE; i++) {
      this.fighters.push(new Fighter(1, false, FOE_NAMES[i], {
        dmg: FOE_DMG, rate: FOE_RATE, spread: 0.03, speed: FOE_SPEED,
        mag: BOT_MAG, reload: BOT_RELOAD, jitter: FOE_JITTER,
      }));
    }

    const blueSpots = shuffle(spawnPoints(0));
    const redSpots = shuffle(spawnPoints(1));
    let b = 0, r = 0;
    for (const f of this.fighters) {
      const s = f.team === 0 ? blueSpots[b++] : redSpots[r++];
      f.placeAt(s.x, s.y, f.team === 0 ? -Math.PI / 2 : Math.PI / 2);
      f.kills = 0; f.deaths = 0;
    }

    this.camX = clamp(this.player.x - VIEW_W / 2, 0, MAP_W - VIEW_W);
    this.camY = clamp(this.player.y - VIEW_H / 2, 0, MAP_H - VIEW_H);
    this.input.flush();
  }

  /* ---------------- World interface ---------------- */

  losClear(ax: number, ay: number, bx: number, by: number): boolean {
    for (const w of this.walls) if (segRect(ax, ay, bx, by, w)) return false;
    return true;
  }

  fire(owner: Fighter, angle: number): void {
    this.bullets.push(new Bullet(owner, angle, owner.bulletSpeed, owner.dmg, owner.range, owner.pierce));
    if (owner.isPlayer) this.shotsFired++;
  }

  shotFx(owner: Fighter, angle: number): void {
    const near = dist2(owner.x, owner.y, this.player.x, this.player.y) < 430 * 430;
    const quiet = this.state !== 'PLAYING';   // results screen shouldn't rattle with gunfire
    if (quiet) { /* visuals only */ }
    else if (owner.isPlayer) { this.sfx.shot(); this.shake = Math.max(this.shake, 2.6); }
    else if (near && chance(0.55)) {
      if (owner.team === this.player.team) this.sfx.allyShot(); else this.sfx.distantShot();
    }

    const bx = owner.x + Math.cos(angle) * 34, by = owner.y + Math.sin(angle) * 34;
    this.spray(bx, by, angle, 0.5, 2, 'rgba(232,222,204,0.35)', 60, 3.4, 0.36, 2.2);

    const ca = angle + Math.PI / 2 + rand(-0.25, 0.25);
    const cs = rand(70, 130);
    const p = new Particle(owner.x + Math.cos(angle) * 10, owner.y + Math.sin(angle) * 10,
      Math.cos(ca) * cs, Math.sin(ca) * cs, rand(0.35, 0.55), 1.8, '#ecc05a', 5.5);
    p.square = true; p.spin = rand(-16, 16); p.rot = ca;
    this.parts.push(p);
    if (owner.isPlayer && chance(0.5)) this.sfx.casing();
  }

  puff(x: number, y: number, n: number, color: string, speed: number, size: number): void {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      this.parts.push(new Particle(x, y, Math.cos(a) * rand(0, speed), Math.sin(a) * rand(0, speed),
        rand(0.16, 0.42), rand(size * 0.6, size), color));
    }
  }

  spray(x: number, y: number, angle: number, spread: number, n: number,
        color: string, speed: number, size: number, life: number, drag = 3.2): void {
    for (let i = 0; i < n; i++) {
      const a = angle + rand(-spread, spread);
      const s = rand(speed * 0.35, speed);
      this.parts.push(new Particle(x, y, Math.cos(a) * s, Math.sin(a) * s,
        rand(life * 0.6, life), rand(size * 0.55, size), color, drag));
    }
  }

  /* ---------------- update ---------------- */

  update(rawDt: number): void {
    let scale = 1;
    if (this.state !== 'PLAYING') scale = lerp(0.3, 1, clamp(this.endTimer / 1.2, 0, 1));
    else if (this.offers) scale = SLOWMO_PICK;
    const dt = rawDt * scale;

    this.time += dt;
    this.shake = damp(this.shake, 0, 7, rawDt);
    this.flash = damp(this.flash, 0, 5, rawDt);
    this.hitMark = Math.max(0, this.hitMark - rawDt * 4);
    this.lockPulse += rawDt;
    this.firePress = damp(this.firePress, this.input.firing() ? 1 : 0, 18, rawDt);
    if (this.bannerT > 0) this.bannerT -= rawDt;

    if (this.state === 'PLAYING') {
      this.matchTime += dt;
      if (this.offers) this.updateOffers(rawDt);
      this.updatePlaying(dt);
      this.updateTension(rawDt);
    } else {
      this.updateWorld(dt, true);
      this.updateEnd(rawDt);
    }

    this.updateCamera(rawDt);
  }

  /** Heartbeat when hurt, countdown beeps while dead. */
  private updateTension(rawDt: number): void {
    const p = this.player;
    if (p.alive && p.hp < p.maxHp * 0.3) {
      this.beatT -= rawDt;
      if (this.beatT <= 0) { this.beatT = 0.95; this.sfx.heartbeat(); }
    } else this.beatT = 0;

    if (!p.alive) {
      const s = Math.ceil(Math.max(0, p.respawnT));
      if (s !== this.lastBeep && s > 0) { this.lastBeep = s; this.sfx.beep(s === 1); }
    } else this.lastBeep = -1;
  }

  target(): Fighter | null {
    const p = this.player;
    if (!p.alive) return null;
    const held = this.fighters.find((f) => f.id === this.lockId);
    if (held && held.alive && held.team !== p.team) {
      const d = Math.hypot(held.x - p.x, held.y - p.y);
      if (d < p.range * LOCK_KEEP && this.losClear(p.x, p.y, held.x, held.y)) return held;
    }
    let best: Fighter | null = null, bestD = Infinity;
    for (const f of this.fighters) {
      if (f.team === p.team || !f.alive) continue;
      const d = Math.hypot(f.x - p.x, f.y - p.y);
      if (d > p.range) continue;
      if (!this.losClear(p.x, p.y, f.x, f.y)) continue;
      if (d < bestD) { bestD = d; best = f; }
    }
    this.lockId = best ? best.id : 0;
    return best;
  }

  private updatePlaying(dt: number): void {
    const p = this.player;
    if (p.alive && !this.offers) {
      const mv = this.input.moveVector();
      p.inMoveX = mv.x; p.inMoveY = mv.y;

      const firing = this.input.firing();
      let aim: number | null = null;
      if (firing) {
        const t = this.target();
        if (t) {
          const lead = 0.09;
          aim = Math.atan2(t.y + t.vy * lead - p.y, t.x + t.vx * lead - p.x);
        }
      } else this.lockId = 0;
      p.inAim = aim;
      p.inFire = firing;
      if (this.input.key('r')) p.startReload();
    } else {
      p.inMoveX = 0; p.inMoveY = 0; p.inFire = false; p.inAim = null;
    }

    this.updateWorld(dt, false);

    for (const f of this.fighters) {
      if (!f.alive && f.respawnT <= 0) {
        const spots = spawnPoints(f.team);
        let best = spots[0], bestScore = -1;
        for (const s of spots) {
          let nearest = Infinity;
          for (const o of this.fighters) {
            if (o.team === f.team || !o.alive) continue;
            nearest = Math.min(nearest, dist2(s.x, s.y, o.x, o.y));
          }
          if (nearest > bestScore) { bestScore = nearest; best = s; }
        }
        f.placeAt(best.x + rand(-26, 26), best.y, f.team === 0 ? -Math.PI / 2 : Math.PI / 2);
        this.puff(f.x, f.y, 16, css(f.team === 0 ? BLUE : RED, 26, 0.9), 160, 3.6);
      }
    }

    if (this.score[0] >= KILL_TARGET) this.finish('WIN');
    else if (this.score[1] >= KILL_TARGET) this.finish('LOSE');
  }

  private updateWorld(dt: number, coasting: boolean): void {
    const p = this.player;

    for (const f of this.fighters) {
      if (coasting) { f.inFire = false; f.update(dt * 0.6, this); } else f.update(dt, this);
      if (f.stepped && !coasting) {
        if (f.isPlayer || dist2(f.x, f.y, p.x, p.y) < 220 * 220) this.sfx.step(this.time);
      }
    }

    if (p.reloadT > 0 && this.prevReload <= 0) this.sfx.reloadOut();
    if (p.reloadT <= 0 && this.prevReload > 0) this.sfx.reloadIn();
    this.prevReload = p.reloadT;

    for (const m of this.medkits) m.update(dt);
    for (const m of this.medkits) {
      if (!m.active) continue;
      for (const f of this.fighters) {
        if (!f.alive || f.hp >= f.maxHp) continue;
        if (dist2(f.x, f.y, m.x, m.y) < (PICK_R + FIGHT_R) * (PICK_R + FIGHT_R)) {
          f.hp = Math.min(f.maxHp, f.hp + MEDKIT_HEAL);
          m.take();
          this.puff(m.x, m.y, 14, 'rgba(255,255,255,0.95)', 130, 3);
          this.pops.push(new Popup(f.x, f.y - 22, `+${MEDKIT_HEAL}`, '#7ef0b6', 15));
          if (f.isPlayer) this.sfx.heal();
          break;
        }
      }
    }

    for (const b of this.bullets) {
      b.update(dt);
      if (b.dead) continue;

      if (!b.whizzed && b.team !== p.team && p.alive) {
        if (segCircle(b.px, b.py, b.x, b.y, p.x, p.y, 38)) {
          b.whizzed = true;
          if (this.state === 'PLAYING') this.sfx.whiz();
        }
      }

      let struck = false;
      for (const w of this.walls) {
        if (segRect(b.px, b.py, b.x, b.y, w)) {
          b.dead = true; struck = true;
          this.spray(b.x, b.y, b.angle + Math.PI, 1.0, 4, 'rgba(255,232,172,0.9)', 160, 2.2, 0.22, 5);
          this.spray(b.x, b.y, b.angle + Math.PI, 0.7, 2, 'rgba(196,186,172,0.5)', 45, 3.2, 0.42, 2);
          break;
        }
      }
      if (struck) continue;

      for (const f of this.fighters) {
        if (!f.alive || f.team === b.team || f.shieldT > 0) continue;
        if (b.hitIds.indexOf(f.id) >= 0) continue;
        if (segCircle(b.px, b.py, b.x, b.y, f.x, f.y, FIGHT_R * 0.92)) {
          b.hitIds.push(f.id);
          const killed = f.takeDamage(b.dmg, this);
          this.onHit(b, f, killed);
          if (b.pierce > 0) b.pierce--; else b.dead = true;
          break;
        }
      }
    }
    this.bullets = this.bullets.filter((b) => !b.dead);

    for (const q of this.parts) q.update(dt);
    this.parts = this.parts.filter((q) => !q.dead);
    for (const d of this.decals) d.update(dt);
    this.decals = this.decals.filter((d) => !d.dead);
    for (const q of this.pops) q.update(dt);
    this.pops = this.pops.filter((q) => !q.dead);
    this.feed.update(dt);
    if (this.parts.length > 460) this.parts.splice(0, this.parts.length - 460);
  }

  private onHit(b: Bullet, victim: Fighter, killed: boolean): void {
    const shooter = b.owner;
    this.spray(victim.x, victim.y, b.angle, 0.75, killed ? 20 : 6,
      css(BLOOD, killed ? 6 : 12, 0.95), killed ? 240 : 145, killed ? 3.6 : 2.6, killed ? 0.5 : 0.32, 4.5);
    this.spray(victim.x, victim.y, b.angle, 1.5, 3, css(BLOOD, -12, 0.7), 60, 2.4, 0.6, 2);

    const quiet = this.state !== 'PLAYING';
    if (shooter.isPlayer) {
      this.shotsHit++;
      this.hitMark = 1;
      if (!quiet) this.sfx.hit();
      if (shooter.lifesteal > 0) shooter.hp = Math.min(shooter.maxHp, shooter.hp + shooter.lifesteal);
    }
    if (victim.isPlayer && !quiet) {
      this.shake = Math.max(this.shake, 4.5);
      this.flash = Math.max(this.flash, 0.3);
      this.sfx.hurt();
    }
    if (!killed) return;

    victim.respawnT = RESPAWN_TIME;
    victim.streak = 0;
    victim.onDeath(b.angle);
    this.decals.push(new Decal(victim.x, victim.y, 21));
    if (this.decals.length > MAX_DECALS) this.decals.shift();
    this.puff(victim.x, victim.y, 9, 'rgba(255,255,255,0.75)', 160, 2.6);

    if (this.state !== 'PLAYING') return;
    victim.deaths++;
    shooter.kills++;
    shooter.streak++;
    this.score[shooter.team]++;

    this.feed.push(`${shooter.isPlayer ? 'YOU' : shooter.tag}  ▸  ${victim.isPlayer ? 'YOU' : victim.tag}`,
      shooter.team, shooter.isPlayer || victim.isPlayer);

    if (shooter.isPlayer) {
      this.bestStreak = Math.max(this.bestStreak, shooter.streak);
      this.sfx.kill(Math.min(shooter.streak, 5));
      this.shake = Math.max(this.shake, 6);
      this.pops.push(new Popup(victim.x, victim.y - 20, 'ELIMINATED', '#ffe08a', 16));
      if (shooter.streak >= 2) {
        const names = ['', '', 'DOUBLE KILL', 'TRIPLE KILL', 'RAMPAGE', 'UNSTOPPABLE', 'GODLIKE'];
        this.setBanner(names[Math.min(shooter.streak, 6)]);
      }
      if (shooter.kills >= this.nextUpgradeAt) {
        this.nextUpgradeAt += KILLS_PER_UPGRADE;
        this.pendingOffers++;
        if (!this.offers) this.rollOffers();
      }
    }
    if (victim.isPlayer) {
      this.sfx.death();
      this.flash = Math.max(this.flash, 0.7);
      this.shake = Math.max(this.shake, 9);
      this.lockId = 0;
    }
  }

  private setBanner(text: string): void { this.banner = text; this.bannerT = 1.6; }

  /* ---------------- upgrades ---------------- */

  private rollOffers(): void {
    const pool = UPGRADES.filter((u) => {
      if (u.key === 'multi') return this.count('multi') < 2;
      if (u.key === 'pierce') return this.count('pierce') < 2;
      if (u.key === 'lifesteal') return this.count('lifesteal') < 3;
      if (u.key === 'armor') return this.count('armor') < 3;
      return true;
    });
    this.offers = shuffle(pool.slice()).slice(0, 3);
    this.offerAnim = 0;
    this.input.flushTaps();
    this.sfx.whoosh();
  }

  private count(key: string): number { return this.upgradesTaken.filter((k) => k === key).length; }

  private updateOffers(rawDt: number): void {
    this.offerAnim = Math.min(1, this.offerAnim + rawDt * 3.4);
    const cards = this.offerRects();
    const tap = this.input.takeTap();
    let chosen = -1;
    if (tap) for (let i = 0; i < cards.length; i++) if (inRect(tap.x, tap.y, cards[i])) chosen = i;
    if (this.input.key('1')) chosen = 0;
    if (this.input.key('2')) chosen = 1;
    if (this.input.key('3')) chosen = 2;
    if (this.offerAnim < 0.35) return;
    if (chosen < 0 || !this.offers || chosen >= this.offers.length) return;
    this.applyUpgrade(this.offers[chosen]);
    this.offers = null;
    this.pendingOffers = Math.max(0, this.pendingOffers - 1);
    this.input.flushTaps();
    if (this.pendingOffers > 0) this.rollOffers();
  }

  offerRects(): Rect[] {
    const w = 322, h = 102, gap = 16;
    const top = (VIEW_H - (3 * h + 2 * gap)) / 2 + 28;
    return [0, 1, 2].map((i) => ({ x: (VIEW_W - w) / 2, y: top + i * (h + gap), w, h }));
  }

  private applyUpgrade(u: UpgradeDef): void {
    const p = this.player;
    this.upgradesTaken.push(u.key);
    switch (u.key) {
      case 'dmg': p.dmg *= 1.22; break;
      case 'rate': p.rate *= 1.18; break;
      case 'mag': p.magSize += 12; p.mag += 12; break;
      case 'reload': p.reloadTime *= 0.75; break;
      case 'speed': p.speed *= 1.14; break;
      case 'hp': p.maxHp += 25; p.hp += 25; break;
      case 'multi': p.shots += 1; break;
      case 'pierce': p.pierce += 1; break;
      case 'accuracy': p.spread *= 0.6; break;
      case 'lifesteal': p.lifesteal += 5; break;
      case 'armor': p.armor = Math.min(0.55, p.armor + 0.15); break;
      case 'range': p.range *= 1.25; p.bulletSpeed *= 1.25; break;
    }
    this.sfx.upgrade();
    this.setBanner(u.name);
    this.pops.push(new Popup(p.x, p.y - 28, u.name, '#ffd36e', 15));
  }

  /* ---------------- camera / finish / results ---------------- */

  private updateCamera(rawDt: number): void {
    const p = this.player;
    let ax = p.x, ay = p.y;
    const t = this.fighters.find((f) => f.id === this.lockId && f.alive);
    if (t && p.alive) { ax = lerp(p.x, t.x, 0.18); ay = lerp(p.y, t.y, 0.18); }
    const tx = clamp(ax - VIEW_W / 2, 0, MAP_W - VIEW_W);
    const ty = clamp(ay - VIEW_H / 2, 0, MAP_H - VIEW_H);
    this.camX = damp(this.camX, tx, 7, rawDt);
    this.camY = damp(this.camY, ty, 7, rawDt);
  }

  private finish(s: State): void {
    if (this.state !== 'PLAYING') return;
    this.state = s;
    this.endTimer = 0;
    this.offers = null;
    this.flash = 0.6;
    this.shake = 8;
    const p = this.player;
    const kd = p.deaths ? p.kills / p.deaths : p.kills;
    this.stars = (s === 'WIN' ? 1 : 0) + (p.kills >= 10 ? 1 : 0) + (kd >= 1.5 ? 1 : 0);
    this.cash = p.kills * 100 + this.bestStreak * 50 + (s === 'WIN' ? 1500 : 0);
    this.shownCash = 0;
    this.starLandedAt = [];
    if (s === 'WIN') this.sfx.win(); else this.sfx.lose();
  }

  private updateEnd(rawDt: number): void {
    this.endTimer += rawDt;

    // stars land one at a time, each with its own burst
    const want = clamp(Math.floor((this.endTimer - 0.4) / 0.32), 0, this.stars);
    while (this.starsShown < want) {
      this.starsShown++;
      this.starLandedAt.push(this.endTimer);
      this.sfx.starDing(this.starsShown);
      this.shake = Math.max(this.shake, 2.4);
    }

    // cash counts up once the ribbon has landed
    if (this.endTimer > 0.55) {
      const before = this.shownCash;
      this.shownCash = damp(this.shownCash, this.cash, 6, rawDt);
      if (Math.floor(before / 110) !== Math.floor(this.shownCash / 110)) this.sfx.countTick();
    }

    // the REMATCH button is the only way back in
    const tap = this.input.takeTap();
    const key = this.input.takeKey();
    this.input.takeConfirm();          // drain, so it can't leak into the next match
    if (this.endTimer < this.rematchAt()) return;
    if (key || (tap && inRect(tap.x, tap.y, this.rematchRect()))) {
      this.sfx.uiTap();
      this.reset();
    }
  }

  /** When the rematch button becomes live. */
  rematchAt(): number { return 1.0 + this.stars * 0.32; }

  /** Kept so the host loop can still drive a keyboard restart. */
  maybeRestart(): void { /* results input is handled in updateEnd */ }

  /* ================================================================ *
   * Render
   * ================================================================ */

  render(ctx: CanvasRenderingContext2D): void {
    const sx = this.shake > 0.05 ? rand(-this.shake, this.shake) : 0;
    const sy = this.shake > 0.05 ? rand(-this.shake, this.shake) : 0;

    ctx.save();
    ctx.translate(-this.camX + sx, -this.camY + sy);
    this.drawGround(ctx);
    for (const d of this.decals) d.draw(ctx);
    this.drawWalls(ctx);
    for (const m of this.medkits) m.draw(ctx);
    for (const f of this.fighters) if (!f.alive) f.draw(ctx);
    for (const f of this.fighters) if (f.alive) f.draw(ctx);
    for (const b of this.bullets) b.draw(ctx);
    for (const q of this.parts) q.draw(ctx);
    this.drawLockRing(ctx);
    for (const q of this.pops) q.draw(ctx);
    this.drawOffscreenMarkers(ctx);
    ctx.restore();

    this.drawVignette(ctx);
    this.drawHud(ctx);
    this.drawControls(ctx);
    if (this.offers) this.drawOffers(ctx);
    if (this.state !== 'PLAYING') this.drawResults(ctx);

    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(255,90,90,${clamp(this.flash, 0, 0.7)})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  /* ---------------- environment ---------------- */

  private view(): Rect {
    const x = Math.max(0, this.camX - 60), y = Math.max(0, this.camY - 60);
    return {
      x, y,
      w: Math.min(MAP_W, this.camX + VIEW_W + 60) - x,
      h: Math.min(MAP_H, this.camY + VIEW_H + 60) - y,
    };
  }

  private drawGround(ctx: CanvasRenderingContext2D): void {
    const v = this.view();

    // pale concrete base, laid in tiles with a subtle checker
    ctx.fillStyle = C_CONCRETE;
    ctx.fillRect(v.x, v.y, v.w, v.h);
    const T = 64;
    const i0 = Math.floor(v.x / T), i1 = Math.ceil((v.x + v.w) / T);
    const j0 = Math.floor(v.y / T), j1 = Math.ceil((v.y + v.h) / T);
    ctx.fillStyle = C_CONCRETE_2;
    for (let i = i0; i < i1; i++) {
      for (let j = j0; j < j1; j++) {
        if ((i + j) % 2 === 0) continue;
        ctx.fillRect(i * T, j * T, T, T);
      }
    }
    ctx.strokeStyle = C_CONCRETE_LINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = i0; i <= i1; i++) { ctx.moveTo(i * T, v.y); ctx.lineTo(i * T, v.y + v.h); }
    for (let j = j0; j <= j1; j++) { ctx.moveTo(v.x, j * T); ctx.lineTo(v.x + v.w, j * T); }
    ctx.stroke();
    // a few stains so the concrete isn't uniform
    ctx.fillStyle = 'rgba(140,134,120,0.14)';
    for (let i = i0; i < i1; i++) {
      for (let j = j0; j < j1; j++) {
        const h = hash2(i, j);
        if (h < 0.82) continue;
        ctx.beginPath();
        ctx.ellipse(i * T + h * 40, j * T + hash2(j, i) * 40, 16 + h * 14, 11 + h * 9, h * 3, 0, TAU);
        ctx.fill();
      }
    }

    for (const p of this.floor) {
      if (p.x > v.x + v.w || p.x + p.w < v.x || p.y > v.y + v.h || p.y + p.h < v.y) continue;
      if (p.kind === 'asphalt') this.drawAsphalt(ctx, p, v); else this.drawGrass(ctx, p, v);
    }

    // team spawn tints
    for (const [team, y] of [[0, MAP_H - 210], [1, 0]] as [number, number][]) {
      const c = team === 0 ? BLUE : RED;
      const g = ctx.createLinearGradient(0, y, 0, y + 210);
      g.addColorStop(0, css(c, 0, team === 0 ? 0 : 0.22));
      g.addColorStop(1, css(c, 0, team === 0 ? 0.22 : 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, y, MAP_W, 210);
    }
  }

  private drawAsphalt(ctx: CanvasRenderingContext2D, p: Rect, v: Rect): void {
    ctx.save();
    roundRect(ctx, p.x, p.y, p.w, p.h, 6);
    ctx.clip();
    ctx.fillStyle = C_ASPHALT;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    // diamond paving
    const S = 56;
    ctx.strokeStyle = C_ASPHALT_LINE;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    const lo = Math.max(p.y, v.y) - p.w, hi = Math.min(p.y + p.h, v.y + v.h) + p.w;
    for (let k = Math.floor(lo / S) * S; k < hi; k += S) {
      ctx.moveTo(p.x, k); ctx.lineTo(p.x + p.w, k - p.w);
      ctx.moveTo(p.x, k); ctx.lineTo(p.x + p.w, k + p.w);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(p.x, p.y, p.w, 6);
    ctx.restore();
    ctx.strokeStyle = 'rgba(28,32,36,0.45)';
    ctx.lineWidth = 2.4;
    roundRect(ctx, p.x, p.y, p.w, p.h, 6); ctx.stroke();
  }

  private drawGrass(ctx: CanvasRenderingContext2D, p: Rect, v: Rect): void {
    roundRect(ctx, p.x, p.y, p.w, p.h, 16);
    ctx.fillStyle = C_GRASS; ctx.fill();
    ctx.save();
    roundRect(ctx, p.x, p.y, p.w, p.h, 16);
    ctx.clip();
    const S = 26;
    const ax = Math.max(p.x, v.x), bx = Math.min(p.x + p.w, v.x + v.w);
    const ay = Math.max(p.y, v.y), by = Math.min(p.y + p.h, v.y + v.h);
    ctx.fillStyle = C_GRASS_2;
    for (let x = Math.floor(ax / S) * S; x < bx; x += S) {
      for (let y = Math.floor(ay / S) * S; y < by; y += S) {
        const h = hash2(x * 0.11, y * 0.13);
        if (h < 0.45) continue;
        ctx.beginPath();
        ctx.ellipse(x + h * S, y + hash2(y, x) * S, 7 + h * 5, 4 + h * 3, h * 2, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.strokeStyle = C_GRASS_EDGE;
    ctx.lineWidth = 3;
    roundRect(ctx, p.x + 1.5, p.y + 1.5, p.w - 3, p.h - 3, 15); ctx.stroke();
  }

  private drawWalls(ctx: CanvasRenderingContext2D): void {
    const v = this.view();
    for (const w of this.walls) {
      if (w.x > v.x + v.w || w.x + w.w < v.x || w.y > v.y + v.h || w.y + w.h < v.y) continue;
      // long soft shadow, consistent light from the top-left
      ctx.fillStyle = 'rgba(24,26,32,0.34)';
      roundRect(ctx, w.x + 5, w.y + 11, w.w, w.h, 7); ctx.fill();

      const [top, mid, low, edge] =
        w.kind === 'crate' ? [C_CRATE_TOP, C_CRATE_MID, C_CRATE_LOW, C_CRATE_EDGE]
        : w.kind === 'brick' ? [C_BRICK_TOP, C_BRICK_MID, C_BRICK_LOW, C_BRICK_EDGE]
        : [C_METAL_TOP, C_METAL_MID, C_METAL_LOW, C_METAL_EDGE];

      const g = ctx.createLinearGradient(w.x, w.y, w.x, w.y + w.h);
      g.addColorStop(0, top);
      g.addColorStop(0.5, mid);
      g.addColorStop(1, low);
      ctx.fillStyle = g;
      roundRect(ctx, w.x, w.y, w.w, w.h, 7); ctx.fill();

      ctx.save();
      roundRect(ctx, w.x, w.y, w.w, w.h, 7);
      ctx.clip();
      if (w.kind === 'crate') this.crateDetail(ctx, w, edge);
      else if (w.kind === 'brick') this.brickDetail(ctx, w);
      else this.metalDetail(ctx, w);
      // bevel
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(w.x + 2, w.y + w.h - 2); ctx.lineTo(w.x + 2, w.y + 2); ctx.lineTo(w.x + w.w - 2, w.y + 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.moveTo(w.x + w.w - 2, w.y + 2); ctx.lineTo(w.x + w.w - 2, w.y + w.h - 2); ctx.lineTo(w.x + 2, w.y + w.h - 2);
      ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = edge;
      ctx.lineWidth = 2.8;
      roundRect(ctx, w.x, w.y, w.w, w.h, 7); ctx.stroke();
    }
  }

  private crateDetail(ctx: CanvasRenderingContext2D, w: Wall, edge: string): void {
    const along = w.w >= w.h;
    ctx.strokeStyle = 'rgba(30,70,55,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (along) for (let x = w.x + 26; x < w.x + w.w - 6; x += 26) { ctx.moveTo(x, w.y + 3); ctx.lineTo(x, w.y + w.h - 3); }
    else for (let y = w.y + 26; y < w.y + w.h - 6; y += 26) { ctx.moveTo(w.x + 3, y); ctx.lineTo(w.x + w.w - 3, y); }
    ctx.stroke();
    // diagonal brace + corner bolts
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(w.x + 6, w.y + w.h - 6); ctx.lineTo(w.x + w.w - 6, w.y + 6);
    ctx.stroke();
    ctx.fillStyle = edge;
    for (const [bx, by] of [[9, 9], [w.w - 9, 9], [9, w.h - 9], [w.w - 9, w.h - 9]] as [number, number][]) {
      ctx.beginPath(); ctx.arc(w.x + bx, w.y + by, 2.6, 0, TAU); ctx.fill();
    }
  }

  private brickDetail(ctx: CanvasRenderingContext2D, w: Wall): void {
    ctx.strokeStyle = 'rgba(80,76,44,0.4)';
    ctx.lineWidth = 1.8;
    const R = 13;
    ctx.beginPath();
    if (w.w >= w.h) {
      for (let y = w.y + R; y < w.y + w.h; y += R) { ctx.moveTo(w.x, y); ctx.lineTo(w.x + w.w, y); }
      let row = 0;
      for (let y = w.y; y < w.y + w.h; y += R, row++) {
        for (let x = w.x + (row % 2 ? 0 : 16); x < w.x + w.w; x += 32) { ctx.moveTo(x, y); ctx.lineTo(x, y + R); }
      }
    } else {
      for (let x = w.x + R; x < w.x + w.w; x += R) { ctx.moveTo(x, w.y); ctx.lineTo(x, w.y + w.h); }
      let col = 0;
      for (let x = w.x; x < w.x + w.w; x += R, col++) {
        for (let y = w.y + (col % 2 ? 0 : 16); y < w.y + w.h; y += 32) { ctx.moveTo(x, y); ctx.lineTo(x + R, y); }
      }
    }
    ctx.stroke();
  }

  private metalDetail(ctx: CanvasRenderingContext2D, w: Wall): void {
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    roundRect(ctx, w.x + 8, w.y + 8, w.w - 16, w.h - 16, 4); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    for (const [bx, by] of [[6, 6], [w.w - 6, 6], [6, w.h - 6], [w.w - 6, w.h - 6]] as [number, number][]) {
      ctx.beginPath(); ctx.arc(w.x + bx, w.y + by, 2.4, 0, TAU); ctx.fill();
    }
  }

  private drawLockRing(ctx: CanvasRenderingContext2D): void {
    if (!this.input.firing() || !this.player.alive) return;
    const t = this.fighters.find((f) => f.id === this.lockId && f.alive);
    if (!t) return;
    const r = (18 + this.player.bloom * 16) * (1 + Math.sin(this.lockPulse * 9) * 0.07);
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(this.lockPulse * 1.5);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(16,20,30,0.6)';
    ctx.lineWidth = 5;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.arc(0, 0, r, i * (TAU / 4) + 0.3, i * (TAU / 4) + TAU / 4 - 0.3); ctx.stroke();
    }
    ctx.strokeStyle = '#ff6b7f';
    ctx.lineWidth = 2.6;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.arc(0, 0, r, i * (TAU / 4) + 0.3, i * (TAU / 4) + TAU / 4 - 0.3); ctx.stroke();
    }
    ctx.restore();
  }

  private drawOffscreenMarkers(ctx: CanvasRenderingContext2D): void {
    const p = this.player;
    if (!p.alive) return;
    for (const f of this.fighters) {
      if (f.team === p.team || !f.alive) continue;
      const sx = f.x - this.camX, sy = f.y - this.camY;
      if (sx > 16 && sx < VIEW_W - 16 && sy > 70 && sy < VIEW_H - 16) continue;
      const d = Math.hypot(f.x - p.x, f.y - p.y);
      if (d > 620) continue;
      const a = Math.atan2(f.y - p.y, f.x - p.x);
      ctx.save();
      ctx.translate(p.x + Math.cos(a) * 195, p.y + Math.sin(a) * 195);
      ctx.rotate(a);
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(10, 0); ctx.lineTo(-7, -7); ctx.lineTo(-7, 7);
      ctx.closePath();
      ctx.fillStyle = css(RED, 12); ctx.fill();
      ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(16,20,30,0.8)'; ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  private drawVignette(ctx: CanvasRenderingContext2D): void {
    const g = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.3, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.74);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(10,14,24,0.44)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    const p = this.player;
    if (p.alive && p.hp < p.maxHp * 0.36) {
      const t = 1 - p.hp / (p.maxHp * 0.36);
      const r = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.2, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.62);
      r.addColorStop(0, 'rgba(255,0,0,0)');
      r.addColorStop(1, `rgba(255,20,20,${0.18 + t * 0.3 + Math.sin(this.time * 6) * 0.05})`);
      ctx.fillStyle = r;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  /* ---------------- HUD ---------------- */

  private drawHud(ctx: CanvasRenderingContext2D): void {
    ctx.textBaseline = 'alphabetic';
    this.teamPill(ctx, 10, 12, 150, 46, BLUE, 'BLUE', this.score[0], false);
    this.teamPill(ctx, VIEW_W - 160, 12, 150, 46, RED, 'RED', this.score[1], true);

    // timer pill
    chunky(ctx, VIEW_W / 2 - 44, 16, 88, 32, 11, '#2c3450', '#1b2138', 5);
    ctx.textAlign = 'center';
    outlined(ctx, formatTime(this.matchTime), VIEW_W / 2, 38, 16, UI_INK, 900, 4);

    this.drawMinimap(ctx, 10, 68, 86);
    this.drawFeed(ctx);
    this.drawBottom(ctx);

    if (this.hitMark > 0.02) {
      const p = this.player;
      const sx = p.x - this.camX, sy = p.y - this.camY;
      ctx.save();
      ctx.globalAlpha = this.hitMark;
      ctx.lineCap = 'round';
      for (const [col, lw] of [['rgba(16,20,30,0.8)', 5], ['#ffffff', 2.4]] as [string, number][]) {
        ctx.strokeStyle = col; ctx.lineWidth = lw;
        for (const a of [0.785, 2.356, 3.927, 5.498]) {
          ctx.beginPath();
          ctx.moveTo(sx + Math.cos(a) * 11, sy + Math.sin(a) * 11);
          ctx.lineTo(sx + Math.cos(a) * 19, sy + Math.sin(a) * 19);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    if (this.bannerT > 0 && this.banner) {
      const t = clamp(this.bannerT / 1.6, 0, 1);
      const pop = easeOutBack(clamp((1.6 - this.bannerT) * 3.2, 0, 1));
      ctx.save();
      ctx.globalAlpha = Math.min(1, t * 2.2);
      ctx.translate(VIEW_W / 2, 140);
      ctx.scale(pop, pop);
      ctx.textAlign = 'center';
      outlined(ctx, this.banner, 0, 0, 27, UI_GOLD, 900, 7);
      ctx.restore();
    }

    if (!this.player.alive && this.state === 'PLAYING') {
      const secs = Math.ceil(Math.max(0, this.player.respawnT));
      ctx.fillStyle = 'rgba(8,11,18,0.5)';
      ctx.fillRect(0, 296, VIEW_W, 150);
      ctx.textAlign = 'center';
      outlined(ctx, 'YOU WERE ELIMINATED', VIEW_W / 2, 336, 17, '#ff8a9c', 900, 5);
      const beat = 1 + (1 - clamp(this.player.respawnT % 1, 0, 1)) * 0.12;
      ctx.save();
      ctx.translate(VIEW_W / 2, 404);
      ctx.scale(beat, beat);
      outlined(ctx, `${secs}`, 0, 0, 56, UI_INK, 900, 10);
      ctx.restore();
      outlined(ctx, 'RESPAWNING', VIEW_W / 2, 430, 12, 'rgba(233,238,248,0.75)', 800, 4);
    }
  }

  private teamPill(
    ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
    c: typeof BLUE, label: string, v: number, right: boolean,
  ): void {
    chunky(ctx, x, y, w, h, 14, css(c, -2), css(c, -26), 6);
    // head badge
    const bx = right ? x + w - 24 : x + 24, by = y + 18;
    ctx.fillStyle = css(c, 26);
    ctx.beginPath(); ctx.arc(bx, by, 11, 0, TAU); ctx.fill();
    ctx.lineWidth = 2.2; ctx.strokeStyle = 'rgba(16,20,30,0.75)'; ctx.stroke();
    ctx.fillStyle = 'rgba(16,20,30,0.75)';
    ctx.beginPath(); ctx.arc(bx, by, 4.6, 0, TAU); ctx.fill();

    ctx.textAlign = right ? 'right' : 'left';
    const tx = right ? x + w - 42 : x + 42;
    outlined(ctx, label, tx, y + 16, 11, 'rgba(255,255,255,0.8)', 800, 3);
    outlined(ctx, `${v}`, tx, y + 33, 21, UI_INK, 900, 5);

    // progress toward the target
    const px = x + 9, pw = w - 18, py = y + h - 13;
    roundRect(ctx, px, py, pw, 5, 2.5);
    ctx.fillStyle = 'rgba(12,16,28,0.5)'; ctx.fill();
    roundRect(ctx, px, py, pw * clamp(v / KILL_TARGET, 0, 1), 5, 2.5);
    ctx.fillStyle = '#ffffff'; ctx.fill();
  }

  private drawMinimap(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
    const h = w * (MAP_H / MAP_W);
    chunky(ctx, x, y, w, h, 10, 'rgba(24,30,48,0.78)', 'rgba(14,18,30,0.85)', 4);
    const sx = w / MAP_W, sy = h / MAP_H;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    for (const wl of this.walls) ctx.fillRect(x + wl.x * sx, y + wl.y * sy, Math.max(1, wl.w * sx), Math.max(1, wl.h * sy));
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + this.camX * sx, y + this.camY * sy, VIEW_W * sx, VIEW_H * sy);
    for (const f of this.fighters) {
      if (!f.alive) continue;
      const enemy = f.team !== this.player.team;
      if (enemy && !f.bursting && !this.losClear(this.player.x, this.player.y, f.x, f.y)) continue;
      ctx.fillStyle = f.isPlayer ? '#ffffff' : css(f.team === 0 ? BLUE : RED, 20);
      ctx.beginPath();
      ctx.arc(x + f.x * sx, y + f.y * sy, f.isPlayer ? 3.2 : 2.4, 0, TAU);
      ctx.fill();
    }
  }

  private drawFeed(ctx: CanvasRenderingContext2D): void {
    ctx.textAlign = 'right';
    let y = 82;
    for (const it of this.feed.items) {
      ctx.globalAlpha = clamp(it.life / 0.7, 0, 1);
      const size = it.big ? 12 : 11;
      ctx.font = `${it.big ? 900 : 700} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
      const tw = ctx.measureText(it.text).width;
      chunky(ctx, VIEW_W - 12 - tw - 18, y - 14, tw + 20, 22, 7,
        it.big ? 'rgba(60,48,20,0.85)' : 'rgba(22,28,44,0.8)', 'rgba(10,14,24,0.85)', 3);
      outlined(ctx, it.text, VIEW_W - 22, y, size, it.big ? UI_GOLD : css(it.team === 0 ? BLUE : RED, 30), it.big ? 900 : 700, 3);
      y += 26;
      ctx.globalAlpha = 1;
    }
  }

  private drawBottom(ctx: CanvasRenderingContext2D): void {
    const p = this.player;

    // health
    const bw = 208, bh = 22, bx = (VIEW_W - bw) / 2, by = VIEW_H - 64;
    chunky(ctx, bx, by, bw, bh, 11, '#2c3450', '#1b2138', 5);
    const hpf = clamp(p.hp / p.maxHp, 0, 1);
    const col = hpf > 0.5 ? ['#63d081', '#3ea75c'] : hpf > 0.25 ? ['#f5c342', '#c99321'] : ['#ef5f74', '#bc3b50'];
    roundRect(ctx, bx + 3, by + 3, (bw - 6) * hpf, bh - 11, 7);
    ctx.fillStyle = col[0]; ctx.fill();
    roundRect(ctx, bx + 3, by + 3, (bw - 6) * hpf, (bh - 11) * 0.5, 7);
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill();
    ctx.textAlign = 'center';
    outlined(ctx, `${Math.ceil(p.hp)} / ${p.maxHp}`, VIEW_W / 2, by + 15, 12, UI_INK, 900, 3.5);

    // ammo
    const aw = 124, ax = (VIEW_W - aw) / 2, ay = VIEW_H - 38;
    chunky(ctx, ax, ay, aw, 28, 11, '#2c3450', '#1b2138', 5);
    if (p.reloadT > 0) {
      const t = 1 - p.reloadT / p.reloadTime;
      roundRect(ctx, ax + 4, ay + 4, (aw - 8) * t, 15, 6);
      ctx.fillStyle = UI_GOLD; ctx.fill();
      outlined(ctx, 'RELOADING', VIEW_W / 2, ay + 16, 11, UI_INK, 900, 3.5);
    } else {
      // bullet glyph
      ctx.fillStyle = p.mag <= 5 ? '#ef5f74' : UI_GOLD;
      roundRect(ctx, ax + 12, ay + 7, 7, 12, 3); ctx.fill();
      outlined(ctx, `${p.mag} / ${p.magSize}`, VIEW_W / 2 + 8, ay + 19, 15,
        p.mag <= 5 ? '#ff8a9c' : UI_INK, 900, 4);
    }

    // level + kills chips
    chunky(ctx, 12, VIEW_H - 38, 66, 28, 10, UI_GOLD, UI_GOLD_DARK, 5);
    ctx.textAlign = 'center';
    outlined(ctx, `LVL ${this.upgradesTaken.length + 1}`, 45, VIEW_H - 19, 12, UI_INK, 900, 3.5);
    chunky(ctx, VIEW_W - 90, VIEW_H - 38, 78, 28, 10, '#2c3450', '#1b2138', 5);
    outlined(ctx, `${p.kills} KILLS`, VIEW_W - 51, VIEW_H - 19, 12, UI_INK, 900, 3.5);
  }

  /* ---------------- joystick + fire button ---------------- */

  private drawControls(ctx: CanvasRenderingContext2D): void {
    if (this.state !== 'PLAYING' || this.offers) return;
    const s = this.input.moveStick;

    if (s) {
      const dx = s.x - s.ox, dy = s.y - s.oy;
      const m = Math.hypot(dx, dy) || 1;
      const k = Math.min(m, Input.STICK_R);
      ctx.fillStyle = 'rgba(16,22,38,0.42)';
      ctx.beginPath(); ctx.arc(s.ox, s.oy, Input.STICK_R, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.32)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(s.ox, s.oy, Input.STICK_R, 0, TAU); ctx.stroke();
      const nx = s.ox + (dx / m) * k, ny = s.oy + (dy / m) * k;
      ctx.fillStyle = 'rgba(12,18,32,0.8)';
      ctx.beginPath(); ctx.arc(nx, ny + 3, 24, 0, TAU); ctx.fill();
      const g = ctx.createRadialGradient(nx - 6, ny - 8, 2, nx, ny, 25);
      g.addColorStop(0, '#f2f6ff');
      g.addColorStop(1, '#9fb3d8');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(nx, ny, 24, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(16,20,30,0.7)'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(nx, ny, 24, 0, TAU); ctx.stroke();
    } else {
      ctx.globalAlpha = 0.34;
      ctx.fillStyle = 'rgba(16,22,38,0.4)';
      ctx.beginPath(); ctx.arc(STICK_HOME_X, STICK_HOME_Y, 46, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(STICK_HOME_X, STICK_HOME_Y, 46, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath(); ctx.arc(STICK_HOME_X, STICK_HOME_Y, 21, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
      ctx.globalAlpha = 0.5;
      outlined(ctx, 'MOVE', STICK_HOME_X, STICK_HOME_Y + 66, 11, UI_INK, 900, 3);
      ctx.globalAlpha = 1;
    }

    // fire button — chunky, with a solid lip that compresses when held
    const press = this.firePress;
    const lip = 8 * (1 - press * 0.7);
    const r = FIRE_BTN_R;
    const hot = this.lockId !== 0 && this.input.firing();
    ctx.fillStyle = hot ? '#8e2438' : UI_REDBTN_DARK;
    ctx.beginPath(); ctx.arc(FIRE_BTN_X, FIRE_BTN_Y + lip, r, 0, TAU); ctx.fill();
    const fg = ctx.createRadialGradient(FIRE_BTN_X - 12, FIRE_BTN_Y - 16, 4, FIRE_BTN_X, FIRE_BTN_Y, r);
    fg.addColorStop(0, hot ? '#ff9c8a' : '#f5798c');
    fg.addColorStop(1, hot ? '#e03651' : UI_REDBTN);
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.arc(FIRE_BTN_X, FIRE_BTN_Y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(16,20,30,0.75)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(FIRE_BTN_X, FIRE_BTN_Y, r, 0, TAU); ctx.stroke();

    ctx.save();
    ctx.translate(FIRE_BTN_X, FIRE_BTN_Y - 3);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -17); ctx.lineTo(8, -4); ctx.lineTo(8, 13); ctx.lineTo(-8, 13); ctx.lineTo(-8, -4);
    ctx.closePath(); ctx.fill();
    ctx.lineWidth = 2.6; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(16,20,30,0.8)'; ctx.stroke();
    ctx.fillStyle = 'rgba(16,20,30,0.35)';
    ctx.fillRect(-8, 6, 16, 2.6);
    ctx.restore();
    ctx.textAlign = 'center';
    outlined(ctx, 'FIRE', FIRE_BTN_X, FIRE_BTN_Y + 34, 12, UI_INK, 900, 3.5);

    if (this.input.firing() && this.lockId === 0 && this.player.alive) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 7]);
      ctx.beginPath(); ctx.arc(FIRE_BTN_X, FIRE_BTN_Y, r + 11, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  private drawOffers(ctx: CanvasRenderingContext2D): void {
    if (!this.offers) return;
    const a = easeOutCubic(this.offerAnim);
    ctx.fillStyle = `rgba(6,9,18,${0.8 * a})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    outlined(ctx, 'FIELD UPGRADE', VIEW_W / 2, 152, 27, UI_GOLD, 900, 7);
    outlined(ctx, 'PICK ONE', VIEW_W / 2, 178, 13, 'rgba(233,238,248,0.75)', 800, 4);

    const rects = this.offerRects();
    for (let i = 0; i < this.offers.length; i++) {
      const r = rects[i];
      const u = this.offers[i];
      ctx.save();
      ctx.translate(0, (1 - a) * (30 + i * 16));
      chunky(ctx, r.x, r.y, r.w, r.h, 18, UI_PANEL, UI_PANEL_DARK, 8, 'rgba(245,195,66,0.75)');
      chunky(ctx, r.x + 16, r.y + 26, 46, 46, 14, UI_GOLD, UI_GOLD_DARK, 5);
      ctx.textAlign = 'center';
      outlined(ctx, `${i + 1}`, r.x + 39, r.y + 58, 22, UI_INK, 900, 5);
      ctx.textAlign = 'left';
      outlined(ctx, u.name, r.x + 76, r.y + 46, 18, UI_INK, 900, 4.5);
      outlined(ctx, u.desc, r.x + 76, r.y + 70, 13, 'rgba(226,233,248,0.85)', 700, 3.5);
      ctx.restore();
    }
    ctx.textAlign = 'center';
    ctx.globalAlpha = 1;
  }

  /* ---------------- results screen ---------------- */

  rematchRect(): Rect { return { x: (VIEW_W - 252) / 2, y: 512, w: 252, h: 72 }; }

  private drawResults(ctx: CanvasRenderingContext2D): void {
    const t = clamp(this.endTimer / 0.6, 0, 1);
    const win = this.state === 'WIN';
    ctx.fillStyle = `rgba(6,9,18,${0.88 * t})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalAlpha = t;
    ctx.textAlign = 'center';

    /* stars */
    for (let i = 0; i < 3; i++) {
      const earned = i < this.starsShown;
      const landed = earned ? this.endTimer - this.starLandedAt[i] : -1;
      this.drawStar(ctx, VIEW_W / 2 + (i - 1) * 80, 240, 33, earned, landed);
    }

    /* ribbon */
    const rp = easeOutBack(clamp((this.endTimer - 0.12) * 2.6, 0, 1));
    ctx.save();
    ctx.translate(VIEW_W / 2, 336);
    ctx.scale(rp, rp);
    ribbon(ctx, 0, 0, 290, 62, win ? UI_GREEN : UI_REDBTN, win ? UI_GREEN_DARK : UI_REDBTN_DARK);
    ctx.textAlign = 'center';
    outlined(ctx, win ? 'VICTORY' : 'DEFEAT', 0, 12, 35, UI_INK, 900, 8);
    ctx.restore();

    /* cash earned */
    ctx.textAlign = 'center';
    outlined(ctx, 'CASH EARNED', VIEW_W / 2, 412, 14, 'rgba(226,233,248,0.72)', 800, 4);
    const cashTxt = `${Math.round(this.shownCash)}`;
    ctx.font = '900 42px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    const cw = ctx.measureText(cashTxt).width;
    const done = this.cash - this.shownCash < 12;
    const bump = done ? 1 + Math.max(0, 1 - (this.endTimer - 1.1) * 3) * 0.12 : 1;
    ctx.save();
    ctx.translate(VIEW_W / 2, 458);
    ctx.scale(bump, bump);
    this.drawCash(ctx, -cw / 2 - 30, -13);
    ctx.textAlign = 'left';
    outlined(ctx, cashTxt, -cw / 2 + 4, 0, 42, UI_GOLD, 900, 9);
    ctx.restore();

    /* rematch */
    if (this.endTimer > this.rematchAt()) {
      const r = this.rematchRect();
      const inA = easeOutBack(clamp((this.endTimer - this.rematchAt()) * 3.4, 0, 1));
      const pulse = 1 + Math.sin(this.endTimer * 4) * 0.018;
      ctx.save();
      ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
      ctx.scale(inA * pulse, inA * pulse);
      chunky(ctx, -r.w / 2, -r.h / 2, r.w, r.h, 20, UI_GREEN, UI_GREEN_DARK, 9);
      // the chunky lip sits at the bottom, so the label centres on the top face
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      outlined(ctx, 'REMATCH', 0, -r.h / 2 + (r.h - 9) / 2, 27, UI_INK, 900, 6.5);
      ctx.textBaseline = 'alphabetic';
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /** Chunky five-point star: outline, gradient body, inner facet, sparkle burst. */
  private drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number,
                   earned: boolean, landed: number): void {
    if (!earned) {
      ctx.globalAlpha *= 0.55;
      star(ctx, cx, cy, r, 'rgba(255,255,255,0.07)', 'rgba(255,255,255,0.20)');
      ctx.globalAlpha /= 0.55;
      return;
    }
    const pop = easeOutBack(clamp(landed * 4.2, 0, 1));
    const spin = (1 - clamp(landed * 3.2, 0, 1)) * -1.1;
    const idle = Math.sin(this.endTimer * 2.6 + cx) * 0.035;

    ctx.save();
    ctx.translate(cx, cy + Math.sin(this.endTimer * 2.6 + cx) * 1.8);
    ctx.rotate(spin + idle);
    ctx.scale(pop, pop);

    glow(ctx, 0, 0, r * 1.9, 'rgba(255,208,96,0.6)', 0.85);
    // dark rim first, drawn as a fat stroke under the body
    star(ctx, 0, 0, r, '#7a5310', '#3a2705');
    const g = ctx.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, '#ffe487');
    g.addColorStop(0.5, '#f7c53f');
    g.addColorStop(1, '#d99b1c');
    star(ctx, 0, 0, r * 0.93, '#00000000', '#00000000');
    ctx.fillStyle = g; ctx.fill();
    // inner facet + specular
    star(ctx, 0, -r * 0.06, r * 0.52, 'rgba(255,255,255,0.32)', 'rgba(255,255,255,0)');
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.22, -r * 0.4, r * 0.15, r * 0.09, -0.6, 0, TAU);
    ctx.fill();
    ctx.restore();

    // burst of sparks on the frame it lands
    const bt = clamp(landed / 0.5, 0, 1);
    if (bt < 1) {
      const ease = easeOutCubic(bt);
      ctx.save();
      ctx.globalAlpha *= 1 - bt;
      ctx.strokeStyle = '#ffe9a8';
      ctx.lineWidth = 3 * (1 - bt) + 0.6;
      ctx.lineCap = 'round';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + 0.3;
        const r0 = r * (0.9 + ease * 0.7), r1 = r0 + 11 * (1 - bt) + 4;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,233,168,0.8)';
      ctx.lineWidth = 2.5 * (1 - bt);
      ctx.beginPath();
      ctx.arc(cx, cy, r * (1 + ease * 1.1), 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawCash(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.12);
    for (let i = 2; i >= 0; i--) {
      roundRect(ctx, -16 + i * 2, -11 + i * 3, 32, 19, 4);
      ctx.fillStyle = i === 0 ? '#5fd06a' : '#3ea24c';
      ctx.fill();
      ctx.lineWidth = 2.2; ctx.strokeStyle = '#1d5c2a'; ctx.stroke();
    }
    ctx.fillStyle = '#e8fbe9';
    roundRect(ctx, -12, -4, 24, 5, 2.5); ctx.fill();
    ctx.restore();
  }
}

/* ================================================================== *
 * Geometry helpers used only by the simulation
 * ================================================================== */

/** Slab test: does segment a→b intersect the AABB? */
export function segRect(x0: number, y0: number, x1: number, y1: number, r: Rect): boolean {
  const dx = x1 - x0, dy = y1 - y0;
  let tmin = 0, tmax = 1;
  for (let axis = 0; axis < 2; axis++) {
    const p = axis === 0 ? x0 : y0;
    const d = axis === 0 ? dx : dy;
    const lo = axis === 0 ? r.x : r.y;
    const hi = axis === 0 ? r.x + r.w : r.y + r.h;
    if (Math.abs(d) < 1e-8) {
      if (p < lo || p > hi) return false;
    } else {
      let t1 = (lo - p) / d, t2 = (hi - p) / d;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
  }
  return true;
}

/** Does segment a→b pass within `rad` of point (cx, cy)? */
export function segCircle(x0: number, y0: number, x1: number, y1: number, cx: number, cy: number, rad: number): boolean {
  const dx = x1 - x0, dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((cx - x0) * dx + (cy - y0) * dy) / len2 : 0;
  t = clamp(t, 0, 1);
  const px = x0 + dx * t, py = y0 + dy * t;
  return dist2(px, py, cx, cy) <= rad * rad;
}

/* ================================================================== *
 * Engine — canvas sizing and the fixed-timestep loop
 * ================================================================== */

export class Engine {
  private ctx: CanvasRenderingContext2D;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private step = 1 / 60;
  private lastW = 0; private lastH = 0;

  constructor(private canvas: HTMLCanvasElement, private game: Game) {
    const c = canvas.getContext('2d', { alpha: false });
    if (!c) throw new Error('2d context unavailable');
    this.ctx = c;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (w === this.lastW && h === this.lastH) return;
    this.lastW = w; this.lastH = h;
    this.canvas.width = w; this.canvas.height = h;
  }

  start(): void {
    cancelAnimationFrame(this.raf);
    this.acc = 0;
    this.last = performance.now();
    const frame = (now: number) => {
      this.raf = requestAnimationFrame(frame);
      const delta = (now - this.last) / 1000;
      this.last = now;
      this.acc += Math.min(delta, 0.25);
      let steps = 0;
      while (this.acc >= this.step && steps < 5) {
        this.game.update(this.step);
        this.acc -= this.step;
        steps++;
      }
      if (steps === 5) this.acc = 0;
      this.draw();
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void { cancelAnimationFrame(this.raf); }

  private draw(): void {
    this.resize();
    const ctx = this.ctx;
    const w = this.canvas.width, h = this.canvas.height;
    const scale = Math.min(w / VIEW_W, h / VIEW_H);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#07090f';
    ctx.fillRect(0, 0, w, h);
    ctx.setTransform(scale, 0, 0, scale, (w - VIEW_W * scale) / 2, (h - VIEW_H * scale) / 2);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, VIEW_W, VIEW_H);
    ctx.clip();
    this.game.render(ctx);
    ctx.restore();
  }
}
