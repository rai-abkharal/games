/**
 * engine.ts — canvas/renderer setup, the fixed-timestep loop, the decoupled
 * input manager, a tiny Web Audio synth, and the game's finite state machine.
 */

import { VIEW_W, VIEW_H, LANE_X, LANE_COUNT, PLAYER_Y, ROAD_X, ROAD_W, SPEED_MIN, SPEED_MAX, RAMP_METERS, GOAL_METERS, PX_PER_METER, TAU, clamp, lerp, damp, rand, randInt, pick, chance, shuffle, easeOutBack, overlaps, inset, roundRect, glow, ambient, formatScore } from './utils';
import { PlayerCar, TrafficCar, Coin, Particles, Popups, Road, Scenery, CAR_SPECS } from './entities';

export type GameState = 'PLAYING' | 'WIN' | 'LOSE';
export type Steer = -1 | 1;

/* ================================================================== *
 * INPUT — raw DOM events in, abstract intents out.
 * ================================================================== */
export class Input {
  private queue: Steer[] = [];
  private confirm = false;
  onGesture: (() => void) | null = null;

  constructor(canvas: HTMLElement, leftBtn: HTMLElement, rightBtn: HTMLElement) {
    const press = (dir: Steer) => {
      this.queue.push(dir);
      this.confirm = true;
      this.gesture();
    };

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') { press(-1); e.preventDefault(); }
      else if (k === 'arrowright' || k === 'd') { press(1); e.preventDefault(); }
      else if (k === ' ' || k === 'enter') { this.confirm = true; this.gesture(); e.preventDefault(); }
    });

    const bind = (el: HTMLElement, dir: Steer) => {
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); press(dir); });
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    bind(leftBtn, -1);
    bind(rightBtn, 1);

    // swipe / tap on the play area
    let sx = 0, sy = 0, down = false;
    canvas.addEventListener('pointerdown', (e) => { down = true; sx = e.clientX; sy = e.clientY; this.gesture(); });
    canvas.addEventListener('pointerup', (e) => {
      if (!down) return;
      down = false;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      if (Math.abs(dx) > 26 && Math.abs(dx) > Math.abs(dy)) press(dx > 0 ? 1 : -1);
      else this.confirm = true;
    });
  }

  private gesture(): void {
    if (this.onGesture) { this.onGesture(); this.onGesture = null; }
  }

  /** Pops the next queued steering intent, or null. */
  takeSteer(): Steer | null {
    return this.queue.length ? (this.queue.shift() as Steer) : null;
  }

  /** True once per "any button" press — used to restart after a run ends. */
  takeConfirm(): boolean {
    const c = this.confirm;
    this.confirm = false;
    return c;
  }

  flush(): void { this.queue.length = 0; this.confirm = false; }
}

/* ================================================================== *
 * AUDIO — everything synthesised, zero asset loading.
 * ================================================================== */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private oscA: OscillatorNode | null = null;
  private oscB: OscillatorNode | null = null;
  muted = false;

  /** Must be called from a user gesture (autoplay policy). */
  init(): void {
    if (this.ctx) return;
    type ACtor = typeof AudioContext;
    const Ctor: ACtor | undefined =
      (window as unknown as { AudioContext?: ACtor; webkitAudioContext?: ACtor }).AudioContext ||
      (window as unknown as { webkitAudioContext?: ACtor }).webkitAudioContext;
    if (!Ctor) return;
    const ac = new Ctor();
    this.ctx = ac;

    this.master = ac.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(ac.destination);

    // engine drone: saw + square through a speed-driven lowpass
    this.engineFilter = ac.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 700;
    this.engineGain = ac.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);

    this.oscA = ac.createOscillator();
    this.oscA.type = 'sawtooth';
    this.oscA.frequency.value = 58;
    this.oscB = ac.createOscillator();
    this.oscB.type = 'square';
    this.oscB.frequency.value = 87;
    const bGain = ac.createGain();
    bGain.gain.value = 0.35;
    this.oscA.connect(this.engineFilter);
    this.oscB.connect(bGain);
    bGain.connect(this.engineFilter);
    this.oscA.start();
    this.oscB.start();

    // road hiss
    const len = ac.sampleRate * 2;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.6;
    const noise = ac.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const nf = ac.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 900;
    nf.Q.value = 0.6;
    const ng = ac.createGain();
    ng.gain.value = 0.05;
    noise.connect(nf); nf.connect(ng); ng.connect(this.engineGain);
    noise.start();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.05);
    }
    return this.muted;
  }

  /** speed01: 0..1 throttle position. alive: engine audible or cut. */
  setEngine(speed01: number, alive: boolean): void {
    if (!this.ctx || !this.oscA || !this.oscB || !this.engineFilter || !this.engineGain) return;
    const t = this.ctx.currentTime;
    const f = 52 + speed01 * 96;
    this.oscA.frequency.setTargetAtTime(f, t, 0.12);
    this.oscB.frequency.setTargetAtTime(f * 1.51, t, 0.12);
    this.engineFilter.frequency.setTargetAtTime(420 + speed01 * 1500, t, 0.15);
    this.engineGain.gain.setTargetAtTime(alive ? 0.07 + speed01 * 0.05 : 0, t, 0.2);
  }

  private blip(freq: number, dur: number, type: OscillatorType, vol: number, sweep = 1): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  coin(pitch = 0): void {
    this.blip(1180 + pitch * 60, 0.09, 'triangle', 0.16, 1.35);
    window.setTimeout(() => this.blip(1760 + pitch * 80, 0.12, 'triangle', 0.13, 1.2), 55);
  }

  swerve(): void { this.blip(320, 0.16, 'sawtooth', 0.06, 0.4); }

  milestone(): void {
    this.blip(660, 0.12, 'square', 0.1, 1.4);
    window.setTimeout(() => this.blip(990, 0.18, 'square', 0.1, 1.3), 90);
  }

  crash(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * 0.6);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.6);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2600, t);
    f.frequency.exponentialRampToValueAtTime(180, t + 0.55);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
    this.blip(90, 0.45, 'sine', 0.4, 0.35);
  }
}

/* ================================================================== *
 * GAME — the finite state machine and all world simulation.
 * ================================================================== */
export class Game {
  state: GameState = 'PLAYING';

  private road = new Road();
  private scenery = new Scenery();
  private particles = new Particles();
  private popups = new Popups();
  private player = new PlayerCar();
  private traffic: TrafficCar[] = [];
  private coins: Coin[] = [];

  private time = 0;
  private worldSpeed = SPEED_MIN;
  private distance = 0;
  private coinCount = 0;
  private bonus = 0;
  best = 0;

  private lastOpenLane = 1;
  private readonly TRAFFIC_SPEED_RATIO = 0.50;
  private spawnTimer = 1.2;
  private coinTimer = 0.9;
  private exhaustTimer = 0;
  private milestone = 0;
  private endTimer = 0;
  private shake = 0;
  private flash = 0;
  private crashAt = { x: VIEW_W / 2, y: PLAYER_Y };

  constructor(private input: Input, private sfx: Sfx) {}

  get score(): number { return Math.floor(this.distance) + this.coinCount * 10 + this.bonus; }
  private get difficulty(): number { return clamp(this.distance / RAMP_METERS, 0, 1); }

  restart(): void {
    this.state = 'PLAYING';
    this.traffic.length = 0;
    this.coins.length = 0;
    this.particles.clear();
    this.popups.clear();
    this.player.reset();
    this.road.reset();
    this.scenery.reset();
    this.worldSpeed = SPEED_MIN;
    this.distance = 0;
    this.coinCount = 0;
    this.bonus = 0;
    this.lastOpenLane = 1;
    this.spawnTimer = 1.2;
    this.coinTimer = 0.9;
    this.milestone = 0;
    this.endTimer = 0;
    this.shake = 0;
    this.flash = 0;
    this.input.flush();
  }

  /* ---------------------------------------------------------------- */
  update(rawDt: number): void {
    // brief slow-motion after a run ends, then ease back to real time
    const scale = this.state === 'PLAYING' ? 1 : lerp(0.32, 1, clamp(this.endTimer / 1.1, 0, 1));
    const dt = rawDt * scale;

    this.time += dt;
    this.shake = damp(this.shake, 0, 6, rawDt);
    this.flash = damp(this.flash, 0, 8, rawDt);

    if (this.state === 'PLAYING') this.updatePlaying(dt);
    else this.updateEnded(dt, rawDt);

    this.road.update(dt, this.worldSpeed);
    this.scenery.update(dt, this.worldSpeed);
    this.particles.update(dt);
    this.popups.update(dt);
  }

  private updatePlaying(dt: number): void {
    const steer = this.input.takeSteer();
    if (steer && this.player.steer(steer)) {
      this.particles.dust(this.player.x, this.player.y, steer);
      this.sfx.swerve();
    }
    this.input.takeConfirm();

    this.worldSpeed = lerp(SPEED_MIN, SPEED_MAX, this.difficulty);
    this.distance += (this.worldSpeed * dt) / PX_PER_METER;
    this.player.update(dt, this.worldSpeed);

    /* engine smoke trail */
    this.exhaustTimer -= dt;
    if (this.exhaustTimer <= 0) {
      this.exhaustTimer = 0.03;
      this.particles.exhaust(this.player.x, this.player.y + this.player.h / 2, this.worldSpeed);
    }

    /* traffic spawning — guaranteed open lane corridor */
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) this.spawnWave();

    /* coin trails */
    this.coinTimer -= dt;
    if (this.coinTimer <= 0) this.spawnCoins();

    /* simulate traffic */
    for (const car of this.traffic) {
      car.update(dt, this.worldSpeed);
      if (!car.passed && car.y - car.h / 2 > this.player.y + this.player.h / 2) {
        car.passed = true;
        if (Math.abs(car.x - this.player.x) < 118) {
          this.bonus += 25;
          this.popups.add(this.player.x, this.player.y - 70, 'NEAR MISS +25', '#8ef0c4');
          this.sfx.milestone();
        }
      }
      if (overlaps(inset(this.player.rect, 0.72, 0.82), inset(car.rect, 0.82, 0.9))) {
        this.crash(car.x, car.y);
        return;
      }
    }

    /* Continuous Safety Invariant: Guarantee at least one lane is completely clear */
    this.enforceOpenLaneInvariant();

    this.traffic = this.traffic.filter((c) => c.y < VIEW_H + 260);

    /* coins */
    for (const coin of this.coins) {
      coin.update(dt, this.worldSpeed);
      if (!coin.taken && overlaps(inset(this.player.rect, 0.95, 0.9), coin.rect)) {
        coin.taken = true;
        this.coinCount++;
        this.particles.coinBurst(coin.x, coin.y);
        this.popups.add(coin.x, coin.y - 18, '+10');
        this.sfx.coin(this.coinCount % 6);
      }
    }
    this.coins = this.coins.filter((c) => !c.taken && c.y < VIEW_H + 60);

    /* distance milestones */
    if (this.distance > this.milestone + 500) {
      this.milestone = Math.floor(this.distance / 500) * 500;
      this.popups.add(VIEW_W / 2, VIEW_H * 0.34, `${this.milestone} m`, '#9ad9ff');
      this.sfx.milestone();
    }

    if (this.distance >= GOAL_METERS) this.win();

    this.sfx.setEngine(this.difficulty, true);
  }

  private updateEnded(dt: number, rawDt: number): void {
    this.endTimer += rawDt;
    this.worldSpeed = damp(this.worldSpeed, 0, 2.2, dt);
    for (const car of this.traffic) car.update(dt, this.worldSpeed);
    for (const coin of this.coins) coin.update(dt, this.worldSpeed);
    this.sfx.setEngine(0, false);
    if (this.endTimer > 0.75 && this.input.takeConfirm()) this.restart();
    else if (this.endTimer > 0.75 && this.input.takeSteer()) this.restart();
  }

  /**
   * Continuous Safety Guard:
   * 1. Guarantees that at any vertical slice of the road, at least ONE lane is 100% clear.
   * 2. If any two cars in different lanes overlap vertically within 240px, the 3rd lane must maintain >=300px clearance.
   * 3. Prevents same-lane tailgating (<180px gap).
   */
  private enforceOpenLaneInvariant(): void {
    const cars = this.traffic;
    const len = cars.length;

    // 1. Same-lane anti-tailgate check
    for (let i = 0; i < len; i++) {
      for (let j = 0; j < len; j++) {
        if (i === j) continue;
        const a = cars[i];
        const b = cars[j];
        if (a.lane === b.lane && a.y < b.y) {
          const minGap = Math.max(a.h, b.h) + 40;
          if (b.y - a.y < minGap) {
            a.y = b.y - minGap;
          }
        }
      }
    }

    // 2. Cross-lane 3-lane blockade prevention
    for (let i = 0; i < len; i++) {
      for (let j = i + 1; j < len; j++) {
        const a = cars[i];
        const b = cars[j];
        if (a.lane === b.lane) continue;
        if (Math.abs(a.y - b.y) < 240) {
          // Lanes a.lane and b.lane are occupied near this Y.
          const openLane = 3 - a.lane - b.lane;
          const midY = (a.y + b.y) / 2;
          for (let k = 0; k < len; k++) {
            if (k === i || k === j) continue;
            const c = cars[k];
            if (c.lane === openLane && Math.abs(c.y - midY) < 290) {
              // Car c would close the only open passage. Push it back safely.
              if (c.y <= midY) {
                c.y = midY - 320;
              } else {
                c.y = midY + 320;
              }
            }
          }
        }
      }
    }
  }

  private spawnWave(): void {
    const diff = this.difficulty;
    const kindH = CAR_SPECS.truck.h;
    const spawnY = -kindH - 40;

    // Decide which lane is designated OPEN for this wave
    let nextOpenLane: number;
    const roll = Math.random();
    if (roll < 0.40) {
      nextOpenLane = this.lastOpenLane;
    } else if (roll < 0.75) {
      const shift = chance(0.5) ? 1 : -1;
      nextOpenLane = clamp(this.lastOpenLane + shift, 0, 2);
    } else {
      nextOpenLane = pick([0, 1, 2]);
    }

    // Candidate lanes that can receive obstacle traffic (all lanes except nextOpenLane)
    const blockedCandidates = [0, 1, 2].filter((l) => l !== nextOpenLane);

    // Difficulty controls whether 1 car (2 open lanes) or 2 cars (1 open lane) spawn
    const spawnTwo = chance(0.20 + diff * 0.45);
    const lanesToSpawn = spawnTwo ? blockedCandidates : [pick(blockedCandidates)];

    for (const lane of lanesToSpawn) {
      this.traffic.push(new TrafficCar(lane, spawnY - rand(0, 16), this.TRAFFIC_SPEED_RATIO));
    }

    // Calculate gap to next wave: proportional to lane transition distance so player can react and swerve
    const laneShift = Math.abs(nextOpenLane - this.lastOpenLane);
    const baseGap = 360 + laneShift * 80 + rand(0, 60);
    const closingSpeed = Math.max(120, this.worldSpeed * (1 - this.TRAFFIC_SPEED_RATIO));
    this.spawnTimer = baseGap / closingSpeed;

    this.lastOpenLane = nextOpenLane;
  }

  private spawnCoins(): void {
    const free: number[] = [];
    for (let l = 0; l < LANE_COUNT; l++) {
      if (!this.traffic.some((c) => c.lane === l && c.y > -700 && c.y < 260)) free.push(l);
    }
    if (free.length) {
      // Prioritize the designated open lane so coins guide the player into the safe path
      const lane = free.includes(this.lastOpenLane) ? this.lastOpenLane : pick(free);
      const n = randInt(3, 5);
      const drift = chance(0.25) ? rand(-12, 12) : 0;
      for (let i = 0; i < n; i++) {
        this.coins.push(new Coin(LANE_X[lane] + drift, -50 - i * 56));
      }
    }
    this.coinTimer = rand(1.4, 2.5);
  }

  private crash(x: number, y: number): void {
    this.state = 'LOSE';
    this.endTimer = 0;
    this.shake = 26;
    this.flash = 0.85;
    this.crashAt = { x: (x + this.player.x) / 2, y: (y + this.player.y) / 2 };
    this.particles.crash(this.crashAt.x, this.crashAt.y, 'rgba(255,90,60,1)');
    this.best = Math.max(this.best, this.score);
    this.sfx.crash();
    this.input.flush();
  }

  private win(): void {
    this.state = 'WIN';
    this.endTimer = 0;
    this.flash = 0.5;
    this.best = Math.max(this.best, this.score);
    this.particles.coinBurst(VIEW_W / 2, VIEW_H * 0.4);
    this.sfx.milestone();
    this.input.flush();
  }

  /* ---------------------------------------------------------------- */
  render(ctx: CanvasRenderingContext2D): void {
    const { night, dusk } = ambient(this.time);

    ctx.save();
    if (this.shake > 0.4) {
      ctx.translate(rand(-this.shake, this.shake), rand(-this.shake, this.shake));
    }

    this.scenery.draw(ctx, night, dusk, this.time);
    this.road.draw(ctx, night, this.worldSpeed);
    for (const coin of this.coins) coin.draw(ctx, night);
    for (const car of this.traffic) car.draw(ctx, night);
    if (this.state !== 'LOSE' || this.endTimer < 0.12) this.player.draw(ctx, night);
    this.particles.draw(ctx);

    /* night + dusk grading over the whole scene */
    if (night > 0.01) {
      ctx.fillStyle = `rgba(9,14,40,${night * 0.58})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (dusk > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = dusk * 0.10;
      ctx.fillStyle = '#ff9b3d';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.restore();
    }
    // vignette keeps the eye on the road
    const vg = ctx.createRadialGradient(VIEW_W / 2, VIEW_H * 0.52, VIEW_H * 0.28, VIEW_W / 2, VIEW_H * 0.52, VIEW_H * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, `rgba(0,0,0,${0.28 + night * 0.22})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    this.popups.draw(ctx);
    ctx.restore();

    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(255,236,214,${this.flash * 0.6})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    this.drawHud(ctx);
    if (this.state !== 'PLAYING') this.drawEndCard(ctx);
  }

  private drawHud(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    roundRect(ctx, 12, 12, VIEW_W - 24, 70, 18);
    ctx.fillStyle = 'rgba(9,12,20,0.46)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.fillText('SCORE', 30, 38);
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 30px system-ui, sans-serif';
    ctx.fillText(formatScore(this.score), 28, 68);

    // coin pill
    const cx = VIEW_W / 2 + 6;
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath();
    ctx.arc(cx - 34, 46, 11, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(150,90,10,0.8)';
    ctx.font = '800 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('$', cx - 34, 51);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffe9a8';
    ctx.font = '800 21px system-ui, sans-serif';
    ctx.fillText(`x${this.coinCount}`, cx - 18, 53);

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.fillText('KM/H', VIEW_W - 30, 38);
    ctx.fillStyle = '#9ad9ff';
    ctx.font = '800 24px system-ui, sans-serif';
    ctx.fillText(String(Math.round(this.worldSpeed * 0.42)), VIEW_W - 28, 62);

    // distance progress toward the 10 km goal
    const bw = VIEW_W - 60;
    roundRect(ctx, 30, 76, bw, 4, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fill();
    roundRect(ctx, 30, 76, Math.max(4, bw * clamp(this.distance / GOAL_METERS, 0, 1)), 4, 2);
    ctx.fillStyle = '#7ef0b6';
    ctx.fill();
    ctx.restore();
  }

  private drawEndCard(ctx: CanvasRenderingContext2D): void {
    const won = this.state === 'WIN';
    const t = clamp((this.endTimer - 0.35) / 0.5, 0, 1);
    if (t <= 0) return;

    ctx.save();
    ctx.globalAlpha = t;
    ctx.fillStyle = 'rgba(5,8,16,0.74)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    const pw = 356;
    const ph = 322;
    const px = (VIEW_W - pw) / 2;
    const py = VIEW_H / 2 - ph / 2 - 20;
    ctx.translate(VIEW_W / 2, py + ph / 2);
    const s = 0.86 + easeOutBack(t) * 0.14;
    ctx.scale(s, s);
    ctx.translate(-VIEW_W / 2, -(py + ph / 2));

    roundRect(ctx, px, py, pw, ph, 26);
    const panel = ctx.createLinearGradient(0, py, 0, py + ph);
    panel.addColorStop(0, 'rgba(30,36,52,0.97)');
    panel.addColorStop(1, 'rgba(16,20,32,0.97)');
    ctx.fillStyle = panel;
    ctx.fill();
    ctx.strokeStyle = won ? 'rgba(255,214,110,0.6)' : 'rgba(255,110,90,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = 'center';
    glow(ctx, VIEW_W / 2, py + 62, 150, won ? 'rgba(255,206,84,0.5)' : 'rgba(255,86,64,0.45)', 0.55);
    ctx.fillStyle = won ? '#ffd75e' : '#ff6b52';
    ctx.font = '900 40px system-ui, sans-serif';
    ctx.fillText(won ? 'ROAD MASTER!' : 'CRASHED!', VIEW_W / 2, py + 74);

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillText('FINAL SCORE', VIEW_W / 2, py + 108);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 56px system-ui, sans-serif';
    ctx.fillText(formatScore(this.score), VIEW_W / 2, py + 158);

    const rows: [string, string][] = [
      ['Coins collected', `${this.coinCount}  (+${this.coinCount * 10})`],
      ['Distance', `${formatScore(this.distance)} m`],
      ['Best score', formatScore(this.best)],
    ];
    ctx.font = '600 16px system-ui, sans-serif';
    rows.forEach(([label, value], i) => {
      const y = py + 194 + i * 30;
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText(label, px + 30, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#e8eefc';
      ctx.fillText(value, px + pw - 30, y);
    });

    ctx.textAlign = 'center';
    ctx.globalAlpha = t * (0.55 + 0.45 * Math.sin(this.time * 5));
    ctx.fillStyle = '#8ef0c4';
    ctx.font = '800 15px system-ui, sans-serif';
    ctx.fillText('TAP  ◀  ▶   or  SPACE  to race again', VIEW_W / 2, py + ph - 22);
    ctx.restore();
  }
}

/* ================================================================== *
 * ENGINE — canvas sizing, DPR handling and the fixed-timestep loop.
 * ================================================================== */
export class Engine {
  private ctx: CanvasRenderingContext2D;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private readonly step = 1 / 60;

  constructor(private canvas: HTMLCanvasElement, private game: Game) {
    const c = canvas.getContext('2d', { alpha: false });
    if (!c) throw new Error('2D canvas context unavailable');
    this.ctx = c;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => this.resize());
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
    const scale = Math.min(w / VIEW_W, h / VIEW_H);
    this.ctx.setTransform(scale, 0, 0, scale, (w - VIEW_W * scale) / 2, (h - VIEW_H * scale) / 2);
  }

  start(): void {
    this.last = performance.now();
    const frame = (now: number) => {
      this.raf = requestAnimationFrame(frame);
      let delta = (now - this.last) / 1000;
      this.last = now;
      if (delta > 0.25) delta = 0.25;      // tab was backgrounded
      this.acc += delta;
      let steps = 0;
      while (this.acc >= this.step && steps < 5) {
        this.game.update(this.step);
        this.acc -= this.step;
        steps++;
      }
      if (steps === 5) this.acc = 0;
      this.resize();
      this.ctx.fillStyle = '#0b0f18';
      this.ctx.fillRect(-VIEW_W, -VIEW_H, VIEW_W * 3, VIEW_H * 3);
      this.game.render(this.ctx);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void { cancelAnimationFrame(this.raf); }
}
