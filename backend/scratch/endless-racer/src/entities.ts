/**
 * entities.ts — every drawable/updatable object in the world.
 * All artwork is procedural: gradients, rounded rects and circles, no image files.
 */

import { Hsl, Rect, TAU, VIEW_W, VIEW_H, ROAD_X, ROAD_W, LANE_X, LANE_W, PLAYER_Y, SPEED_MIN, clamp, damp, rand, pick, chance, css, roundRect, glow } from './utils';

/* ================================================================== *
 * CARS
 * ================================================================== */

export type CarKind = 'sedan' | 'sports' | 'van' | 'truck';

interface CarSpec { w: number; h: number; cargo: boolean; roof: number }

export const CAR_SPECS: Record<CarKind, CarSpec> = {
  sedan: { w: 76, h: 142, cargo: false, roof: 0.44 },
  sports: { w: 78, h: 132, cargo: false, roof: 0.36 },
  van: { w: 84, h: 166, cargo: false, roof: 0.58 },
  truck: { w: 90, h: 196, cargo: true, roof: 0.30 },
};

export const TRAFFIC_COLORS: Hsl[] = [
  { h: 4, s: 72, l: 52 },
  { h: 28, s: 88, l: 55 },
  { h: 48, s: 92, l: 56 },
  { h: 150, s: 42, l: 44 },
  { h: 196, s: 62, l: 50 },
  { h: 222, s: 55, l: 52 },
  { h: 268, s: 40, l: 52 },
  { h: 210, s: 8, l: 82 },
  { h: 214, s: 12, l: 32 },
];

/** Shared chassis renderer. The car is drawn centred on (0,0), nose pointing up. */
function drawChassis(
  ctx: CanvasRenderingContext2D,
  kind: CarKind, color: Hsl, w: number, h: number,
  opts: { player: boolean; night: number; brake: number; wheelSpin: number },
): void {
  const spec = CAR_SPECS[kind];

  /* Ground shadow ------------------------------------------------- */
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(2, h * 0.06, w * 0.55, h * 0.5, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  /* Wheels -------------------------------------------------------- */
  const ww = w * 0.17;
  const wh = h * 0.19;
  const wheelY = h * 0.29;
  ctx.fillStyle = '#15171c';
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      roundRect(ctx, sx * (w / 2 - ww * 0.35) - ww / 2, sy * wheelY - wh / 2, ww, wh, ww * 0.35);
      ctx.fill();
    }
  }
  // rolling hub highlight so wheels read as spinning
  ctx.fillStyle = 'rgba(210,215,225,0.35)';
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const off = Math.sin(opts.wheelSpin + (sy > 0 ? 1.6 : 0)) * wh * 0.22;
      roundRect(ctx, sx * (w / 2 - ww * 0.35) - ww * 0.28, sy * wheelY + off - 1.5, ww * 0.56, 3, 1.5);
      ctx.fill();
    }
  }

  /* Body ---------------------------------------------------------- */
  const body = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  body.addColorStop(0.00, css(color, -22));
  body.addColorStop(0.18, css(color, -4));
  body.addColorStop(0.45, css(color, 10));
  body.addColorStop(0.62, css(color, 2));
  body.addColorStop(1.00, css(color, -26));
  ctx.fillStyle = body;
  roundRect(ctx, -w / 2, -h / 2, w, h, w * (kind === 'truck' ? 0.16 : 0.24));
  ctx.fill();

  // long top-light sheen down the body
  const sheen = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  sheen.addColorStop(0, 'rgba(255,255,255,0.20)');
  sheen.addColorStop(0.35, 'rgba(255,255,255,0.04)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.16)');
  ctx.fillStyle = sheen;
  roundRect(ctx, -w / 2, -h / 2, w, h, w * 0.22);
  ctx.fill();

  if (spec.cargo) {
    /* Truck: cab up front, corrugated container behind ------------- */
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    roundRect(ctx, -w * 0.46, -h * 0.05, w * 0.92, h * 0.5, 6);
    ctx.fill();
    const box = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    box.addColorStop(0, '#7c8694');
    box.addColorStop(0.45, '#cfd6df');
    box.addColorStop(1, '#6d7683');
    ctx.fillStyle = box;
    roundRect(ctx, -w * 0.45, -h * 0.06, w * 0.90, h * 0.49, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,48,60,0.35)';
    ctx.lineWidth = 1.5;
    for (let i = 1; i < 6; i++) {
      const y = -h * 0.06 + (h * 0.49 * i) / 6;
      ctx.beginPath();
      ctx.moveTo(-w * 0.43, y);
      ctx.lineTo(w * 0.43, y);
      ctx.stroke();
    }
  }

  /* Cabin + glass -------------------------------------------------- */
  const cabTop = -h * (spec.cargo ? 0.44 : 0.22);
  const cabH = h * (spec.cargo ? 0.34 : 0.46);
  ctx.fillStyle = css(color, -14);
  roundRect(ctx, -w * 0.40, cabTop, w * 0.80, cabH, w * 0.16);
  ctx.fill();

  const glass = ctx.createLinearGradient(0, cabTop, 0, cabTop + cabH);
  glass.addColorStop(0, 'rgba(196,226,255,0.92)');
  glass.addColorStop(0.5, 'rgba(96,132,178,0.85)');
  glass.addColorStop(1, 'rgba(38,54,80,0.92)');
  ctx.fillStyle = glass;
  // windshield
  ctx.beginPath();
  ctx.moveTo(-w * 0.30, cabTop + cabH * 0.30);
  ctx.lineTo(w * 0.30, cabTop + cabH * 0.30);
  ctx.lineTo(w * 0.34, cabTop + 3);
  ctx.lineTo(-w * 0.34, cabTop + 3);
  ctx.closePath();
  ctx.fill();
  if (!spec.cargo) {
    // rear window
    ctx.beginPath();
    ctx.moveTo(-w * 0.31, cabTop + cabH * 0.66);
    ctx.lineTo(w * 0.31, cabTop + cabH * 0.66);
    ctx.lineTo(w * 0.27, cabTop + cabH - 3);
    ctx.lineTo(-w * 0.27, cabTop + cabH - 3);
    ctx.closePath();
    ctx.fill();
    // roof panel
    ctx.fillStyle = css(color, 6);
    roundRect(ctx, -w * 0.30, cabTop + cabH * 0.33, w * 0.60, cabH * 0.30, 4);
    ctx.fill();
  }

  // glass glint
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(-w * 0.26, cabTop + cabH * 0.28);
  ctx.lineTo(-w * 0.06, cabTop + cabH * 0.28);
  ctx.lineTo(-w * 0.20, cabTop + 4);
  ctx.lineTo(-w * 0.30, cabTop + 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  /* Mirrors -------------------------------------------------------- */
  ctx.fillStyle = css(color, -18);
  for (const sx of [-1, 1]) {
    roundRect(ctx, sx * (w * 0.46) - w * 0.05, cabTop + cabH * 0.16, w * 0.10, h * 0.045, 2);
    ctx.fill();
  }

  /* Racing stripes for the player ---------------------------------- */
  if (opts.player) {
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    roundRect(ctx, -w * 0.09, -h / 2 + 6, w * 0.05, h - 12, 2);
    ctx.fill();
    roundRect(ctx, w * 0.04, -h / 2 + 6, w * 0.05, h - 12, 2);
    ctx.fill();
  }

  /* Lights --------------------------------------------------------- */
  const headOn = opts.night > 0.12 || opts.player;
  ctx.fillStyle = headOn ? '#fff6d8' : 'rgba(232,238,246,0.85)';
  for (const sx of [-1, 1]) {
    roundRect(ctx, sx * w * 0.30 - w * 0.11, -h / 2 + 4, w * 0.22, h * 0.045, 3);
    ctx.fill();
  }
  const tail = opts.brake > 0.02 ? '#ff5a4d' : '#d8352c';
  ctx.fillStyle = tail;
  for (const sx of [-1, 1]) {
    roundRect(ctx, sx * w * 0.30 - w * 0.12, h / 2 - h * 0.05 - 4, w * 0.24, h * 0.042, 3);
    ctx.fill();
  }

  /* Emissive passes ------------------------------------------------ */
  const lightPow = clamp(opts.night * 1.1 + (opts.player ? 0.25 : 0), 0, 1);
  for (const sx of [-1, 1]) {
    glow(ctx, sx * w * 0.30, -h / 2 + 6, w * 0.34, 'rgba(255,244,206,0.95)', 0.35 + lightPow * 0.5);
    glow(ctx, sx * w * 0.30, h / 2 - 8, w * 0.30, 'rgba(255,72,58,0.95)', 0.25 + lightPow * 0.35 + opts.brake * 0.5);
  }
  if (lightPow > 0.15) {
    // headlight cone thrown down the road ahead
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = lightPow * 0.30;
    const cone = ctx.createLinearGradient(0, -h / 2, 0, -h / 2 - 210);
    cone.addColorStop(0, 'rgba(255,240,200,0.55)');
    cone.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(-w * 0.40, -h / 2 + 4);
    ctx.lineTo(w * 0.40, -h / 2 + 4);
    ctx.lineTo(w * 0.95, -h / 2 - 210);
    ctx.lineTo(-w * 0.95, -h / 2 - 210);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/** Enemy traffic. Drives the same way as the player, just slower. */
export class TrafficCar {
  x: number;
  y: number;
  kind: CarKind;
  color: Hsl;
  w: number;
  h: number;
  speedRatio: number;     // fraction of worldSpeed (e.g. 0.50)
  speed: number;          // absolute speed, px/s
  lane: number;
  passed = false;
  private wobble = rand(0, TAU);
  private spin = 0;

  constructor(lane: number, y: number, speedRatio = 0.50) {
    this.lane = lane;
    this.x = LANE_X[lane];
    this.y = y;
    this.kind = pick<CarKind>(chance(0.18) ? ['truck', 'van'] : ['sedan', 'sedan', 'sports', 'van']);
    const spec = CAR_SPECS[this.kind];
    this.w = spec.w;
    this.h = spec.h;
    this.color = pick(TRAFFIC_COLORS);
    this.speedRatio = speedRatio;
    this.speed = SPEED_MIN * speedRatio;
  }

  get rect(): Rect { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

  update(dt: number, worldSpeed: number): void {
    this.speed = worldSpeed * this.speedRatio;
    this.y += (worldSpeed - this.speed) * dt;
    this.wobble += dt * 6;
    this.spin += dt * this.speed * 0.06;
    this.x = LANE_X[this.lane] + Math.sin(this.wobble * 0.35) * 1.6;
  }

  draw(ctx: CanvasRenderingContext2D, night: number): void {
    ctx.save();
    ctx.translate(this.x, this.y + Math.sin(this.wobble) * 0.7);
    drawChassis(ctx, this.kind, this.color, this.w, this.h, {
      player: false, night, brake: 0, wheelSpin: this.spin,
    });
    ctx.restore();
  }
}

/** The player's car — lane based, with smooth steering and body roll. */
export class PlayerCar {
  lane = 1;
  x = LANE_X[1];
  y = PLAYER_Y;
  w = CAR_SPECS.sports.w;
  h = CAR_SPECS.sports.h;
  tilt = 0;
  color: Hsl = { h: 12, s: 88, l: 52 };
  private spin = 0;
  private bob = 0;

  get rect(): Rect { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

  reset(): void {
    this.lane = 1;
    this.x = LANE_X[1];
    this.tilt = 0;
  }

  /** Returns true if the car actually changed lane. */
  steer(dir: -1 | 1): boolean {
    const next = clamp(this.lane + dir, 0, 2);
    if (next === this.lane) return false;
    this.lane = next;
    return true;
  }

  update(dt: number, worldSpeed: number): void {
    const target = LANE_X[this.lane];
    const prev = this.x;
    this.x = damp(this.x, target, 11, dt);
    const vx = (this.x - prev) / Math.max(dt, 0.0001);
    this.tilt = damp(this.tilt, clamp(vx / 900, -0.26, 0.26), 12, dt);
    this.spin += dt * worldSpeed * 0.06;
    this.bob += dt * 22;
    this.y = PLAYER_Y + Math.sin(this.bob) * 1.2;
  }

  draw(ctx: CanvasRenderingContext2D, night: number): void {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.tilt);
    drawChassis(ctx, 'sports', this.color, this.w, this.h, {
      player: true, night, brake: 0, wheelSpin: this.spin,
    });
    ctx.restore();
  }
}

/* ================================================================== *
 * COINS
 * ================================================================== */

export class Coin {
  x: number;
  y: number;
  r = 19;
  phase = rand(0, TAU);
  taken = false;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  get rect(): Rect { return { x: this.x, y: this.y, w: this.r * 1.7, h: this.r * 1.7 }; }

  update(dt: number, worldSpeed: number): void {
    this.y += worldSpeed * dt;
    this.phase += dt * 3.4;
  }

  draw(ctx: CanvasRenderingContext2D, night: number): void {
    const spin = Math.cos(this.phase);
    const wide = Math.abs(spin);
    const hover = Math.sin(this.phase * 0.9) * 3;
    ctx.save();
    ctx.translate(this.x, this.y + hover);

    // shadow on the tarmac
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(1, this.r * 0.9, this.r * 0.7 * wide + 3, this.r * 0.3, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    glow(ctx, 0, 0, this.r * 2.6, 'rgba(255,206,84,0.85)', 0.28 + night * 0.3);

    ctx.save();
    ctx.scale(Math.max(wide, 0.12), 1);
    const face = ctx.createLinearGradient(-this.r, -this.r, this.r, this.r);
    face.addColorStop(0, '#fff3bd');
    face.addColorStop(0.35, '#ffd24a');
    face.addColorStop(0.7, '#f2a41c');
    face.addColorStop(1, '#c97b0c');
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.arc(0, 0, this.r, 0, TAU);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,247,214,0.9)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, 0, this.r * 0.72, 0, TAU);
    ctx.stroke();

    ctx.fillStyle = 'rgba(160,96,10,0.75)';
    ctx.font = `700 ${Math.round(this.r * 1.1)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', 0, 1);
    ctx.restore();

    // rim thickness when the coin turns edge-on
    ctx.fillStyle = '#b4780f';
    ctx.globalAlpha = 1 - wide;
    roundRect(ctx, -3, -this.r, 6, this.r * 2, 3);
    ctx.fill();
    ctx.restore();
  }
}

/* ================================================================== *
 * PARTICLES
 * ================================================================== */

export type ParticleKind = 'spark' | 'smoke' | 'debris' | 'glint';

export class Particle {
  x = 0; y = 0; vx = 0; vy = 0;
  life = 0; max = 1; size = 1;
  rot = 0; vr = 0; drag = 0.92;
  kind: ParticleKind = 'spark';
  color = 'rgba(255,255,255,1)';
  alive = false;
}

export class Particles {
  private pool: Particle[] = [];
  private cursor = 0;

  constructor(cap = 420) {
    for (let i = 0; i < cap; i++) this.pool.push(new Particle());
  }

  private take(): Particle {
    this.cursor = (this.cursor + 1) % this.pool.length;
    return this.pool[this.cursor];
  }

  clear(): void { for (const p of this.pool) p.alive = false; }

  exhaust(x: number, y: number, speed: number): void {
    const p = this.take();
    p.alive = true;
    p.kind = 'smoke';
    p.x = x + rand(-6, 6);
    p.y = y;
    p.vx = rand(-22, 22);
    p.vy = speed * 0.55 + rand(30, 90);
    p.life = p.max = rand(0.35, 0.6);
    p.size = rand(5, 11);
    p.drag = 0.94;
    p.color = 'rgba(206,214,226,0.5)';
  }

  dust(x: number, y: number, dir: number): void {
    for (let i = 0; i < 8; i++) {
      const p = this.take();
      p.alive = true;
      p.kind = 'smoke';
      p.x = x + rand(-14, 14);
      p.y = y + rand(20, 48);
      p.vx = -dir * rand(40, 160);
      p.vy = rand(40, 150);
      p.life = p.max = rand(0.25, 0.5);
      p.size = rand(4, 9);
      p.drag = 0.9;
      p.color = 'rgba(228,222,208,0.55)';
    }
  }

  coinBurst(x: number, y: number): void {
    for (let i = 0; i < 16; i++) {
      const a = rand(0, TAU);
      const s = rand(70, 300);
      const p = this.take();
      p.alive = true;
      p.kind = i % 3 === 0 ? 'glint' : 'spark';
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s * 0.7 + 60;
      p.life = p.max = rand(0.3, 0.65);
      p.size = rand(2.5, 5.5);
      p.rot = a; p.vr = rand(-9, 9);
      p.drag = 0.9;
      p.color = pick(['rgba(255,225,120,1)', 'rgba(255,246,205,1)', 'rgba(255,181,54,1)']);
    }
  }

  crash(x: number, y: number, tint: string): void {
    for (let i = 0; i < 46; i++) {
      const a = rand(0, TAU);
      const s = rand(80, 560);
      const p = this.take();
      p.alive = true;
      p.kind = i % 4 === 0 ? 'debris' : i % 4 === 1 ? 'smoke' : 'spark';
      p.x = x + rand(-18, 18);
      p.y = y + rand(-24, 24);
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.life = p.max = rand(0.4, 1.3);
      p.size = p.kind === 'smoke' ? rand(10, 22) : rand(3, 8);
      p.rot = a; p.vr = rand(-14, 14);
      p.drag = p.kind === 'smoke' ? 0.9 : 0.94;
      p.color = p.kind === 'smoke'
        ? 'rgba(70,72,80,0.6)'
        : pick(['rgba(255,214,120,1)', 'rgba(255,132,44,1)', 'rgba(255,255,235,1)', tint]);
    }
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.alive) continue;
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d;
      p.vy *= d;
      if (p.kind === 'debris') p.vy += 420 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.kind === 'smoke') p.size += dt * 26;
      p.life -= dt;
      if (p.life <= 0) p.alive = false;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.pool) {
      if (!p.alive) continue;
      const t = clamp(p.life / p.max, 0, 1);
      ctx.save();
      ctx.globalAlpha = p.kind === 'smoke' ? t * 0.55 : t;
      ctx.fillStyle = p.color;
      if (p.kind === 'spark') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.atan2(p.vy, p.vx));
        roundRect(ctx, -p.size * 1.6, -p.size * 0.32, p.size * 3.2, p.size * 0.64, p.size * 0.32);
        ctx.fill();
      } else if (p.kind === 'glint') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * TAU;
          ctx.lineTo(Math.cos(a) * p.size * 2.2, Math.sin(a) * p.size * 2.2);
          ctx.lineTo(Math.cos(a + TAU / 8) * p.size * 0.6, Math.sin(a + TAU / 8) * p.size * 0.6);
        }
        ctx.closePath();
        ctx.fill();
      } else if (p.kind === 'debris') {
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        roundRect(ctx, -p.size / 2, -p.size / 2, p.size, p.size * 0.6, 1.5);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

/** Score pop-ups that float up and fade. */
export class Popup {
  constructor(
    public x: number, public y: number,
    public text: string, public color: string,
    public life = 0.72, public max = 0.72,
  ) { }
}

export class Popups {
  items: Popup[] = [];

  add(x: number, y: number, text: string, color = '#ffe9a0'): void {
    this.items.push(new Popup(x + rand(-16, 16), y, text, color));
  }
  clear(): void { this.items.length = 0; }

  update(dt: number): void {
    for (const p of this.items) { p.life -= dt; p.y -= dt * 96; }
    this.items = this.items.filter((p) => p.life > 0);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of this.items) {
      const t = p.life / p.max;
      ctx.globalAlpha = clamp(t * 1.4, 0, 1);
      const scale = 1 + (1 - t) * 0.25;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(scale, scale);
      ctx.font = '800 25px system-ui, sans-serif';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(12,14,20,0.75)';
      ctx.strokeText(p.text, 0, 0);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }
}

/* ================================================================== *
 * ROAD
 * ================================================================== */

interface Patch { x: number; y: number; w: number; h: number; a: number }

export class Road {
  offset = 0;
  private patches: Patch[] = [];
  private nextPatch = 0;
  private asphalt: CanvasGradient | null = null;

  constructor() {
    for (let i = 0; i < 14; i++) {
      this.patches.push({
        x: rand(ROAD_X + 12, ROAD_X + ROAD_W - 12),
        y: rand(-200, VIEW_H),
        w: rand(30, 120),
        h: rand(14, 46),
        a: rand(0.04, 0.11),
      });
    }
  }

  reset(): void { this.offset = 0; }

  update(dt: number, speed: number): void {
    this.offset += speed * dt;
    this.nextPatch -= speed * dt;
    for (const p of this.patches) {
      p.y += speed * dt;
      if (p.y > VIEW_H + 80) {
        p.y = rand(-260, -60);
        p.x = rand(ROAD_X + 12, ROAD_X + ROAD_W - 12);
        p.w = rand(30, 120);
        p.h = rand(14, 46);
        p.a = rand(0.04, 0.11);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, night: number, speed: number): void {
    if (!this.asphalt) {
      const g = ctx.createLinearGradient(ROAD_X, 0, ROAD_X + ROAD_W, 0);
      g.addColorStop(0, '#33363d');
      g.addColorStop(0.15, '#3d4149');
      g.addColorStop(0.5, '#45494f');
      g.addColorStop(0.85, '#3d4149');
      g.addColorStop(1, '#31343a');
      this.asphalt = g;
    }
    ctx.fillStyle = this.asphalt;
    ctx.fillRect(ROAD_X, 0, ROAD_W, VIEW_H);

    // tar patches / worn tarmac
    ctx.save();
    ctx.fillStyle = '#22252a';
    for (const p of this.patches) {
      ctx.globalAlpha = p.a;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.w / 2, p.h / 2, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // darker tyre-worn tracks in each lane
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = '#1b1d21';
    for (const lx of LANE_X) {
      ctx.fillRect(lx - 30, 0, 12, VIEW_H);
      ctx.fillRect(lx + 18, 0, 12, VIEW_H);
    }
    ctx.restore();

    // dashed lane dividers
    const dash = 730;
    const gap = 30;
    const period = dash + gap;
    const start = -((this.offset % period) + period) % period;
    ctx.fillStyle = 'rgba(240,240,232,0.82)';
    for (let i = 1; i < 3; i++) {
      const x = ROAD_X + LANE_W * i - 3.5;
      for (let y = start - period; y < VIEW_H + period; y += period) {
        roundRect(ctx, x, y, 7, dash, 3.5);
        ctx.fill();
      }
    }

    // solid edge lines
    ctx.fillStyle = 'rgba(244,244,236,0.9)';
    ctx.fillRect(ROAD_X + 8, 0, 6, VIEW_H);
    ctx.fillRect(ROAD_X + ROAD_W - 14, 0, 6, VIEW_H);

    // rumble-strip curbs
    const block = 300;
    const cs = -((this.offset % (block * 2)) + block * 2) % (block * 2);
    for (let y = cs - block * 2; y < VIEW_H + block * 2; y += block * 2) {
      ctx.fillStyle = '#d94a3d';
      ctx.fillRect(ROAD_X - 12, y, 12, block);
      ctx.fillRect(ROAD_X + ROAD_W, y, 12, block);
      ctx.fillStyle = '#f2f0e8';
      ctx.fillRect(ROAD_X - 12, y + block, 12, block);
      ctx.fillRect(ROAD_X + ROAD_W, y + block, 12, block);
    }

    // speed streaks on the tarmac when moving fast
    const fast = clamp((speed - 480) / 460, 0, 1);
    if (fast > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fast * 0.16;
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 12; i++) {
        const x = ROAD_X + 20 + ((i * 97 + (this.offset * 0.7)) % (ROAD_W - 40));
        const y = ((i * 233 + this.offset * 2.2) % (VIEW_H + 300)) - 150;
        roundRect(ctx, x, y, 2.5, 90 + fast * 130, 1.25);
        ctx.fill();
      }
      ctx.restore();
    }

    // headlight-free ambient darkening near the shoulders at night
    if (night > 0.05) {
      const v = ctx.createLinearGradient(ROAD_X, 0, ROAD_X + ROAD_W, 0);
      v.addColorStop(0, `rgba(6,10,26,${night * 0.35})`);
      v.addColorStop(0.5, 'rgba(6,10,26,0)');
      v.addColorStop(1, `rgba(6,10,26,${night * 0.35})`);
      ctx.fillStyle = v;
      ctx.fillRect(ROAD_X, 0, ROAD_W, VIEW_H);
    }
  }
}

/* ================================================================== *
 * ROADSIDE SCENERY
 * ================================================================== */

type PropKind = 'tree' | 'bush' | 'rock' | 'lamp' | 'sign' | 'grass';

interface Prop {
  kind: PropKind;
  side: -1 | 1;
  x: number;
  y: number;
  scale: number;
  hue: number;
  phase: number;
}

export class Scenery {
  private props: Prop[] = [];
  private spawnAcc = 0;
  private ground: CanvasGradient | null = null;

  constructor() {
    for (let i = 0; i < 26; i++) this.spawnProp(rand(-VIEW_H, VIEW_H));
    this.props.sort((a, b) => a.y - b.y);
  }

  reset(): void {
    this.props.length = 0;
    for (let i = 0; i < 26; i++) this.spawnProp(rand(-VIEW_H, VIEW_H));
  }

  private spawnProp(y: number): void {
    const side: -1 | 1 = chance(0.5) ? -1 : 1;
    const roll = Math.random();
    const kind: PropKind =
      roll < 0.42 ? 'tree' : roll < 0.62 ? 'bush' : roll < 0.74 ? 'grass'
        : roll < 0.84 ? 'rock' : roll < 0.94 ? 'lamp' : 'sign';
    const edge = side < 0 ? ROAD_X - 14 : ROAD_X + ROAD_W + 14;
    const away = kind === 'lamp' || kind === 'sign' ? rand(10, 26) : rand(18, side < 0 ? ROAD_X - 30 : VIEW_W - ROAD_X - ROAD_W - 30);
    this.props.push({
      kind,
      side,
      x: edge + side * away,
      y,
      scale: rand(0.85, 1.5),
      hue: rand(88, 132),
      phase: rand(0, TAU),
    });
  }

  update(dt: number, speed: number): void {
    this.spawnAcc += speed * dt;
    // sway is derived from the global clock at draw time, so props only scroll here
    for (const p of this.props) p.y += speed * dt;
    while (this.spawnAcc > 90) {
      this.spawnAcc -= 90;
      this.spawnProp(rand(-260, -120));
    }
    this.props = this.props.filter((p) => p.y < VIEW_H + 220);
  }

  draw(ctx: CanvasRenderingContext2D, night: number, dusk: number, time: number): void {
    /* ground on both sides of the road */
    if (!this.ground) {
      const g = ctx.createLinearGradient(0, 0, VIEW_W, 0);
      g.addColorStop(0, '#456f3a');
      g.addColorStop(0.25, '#548a46');
      g.addColorStop(0.5, '#5e9a4c');
      g.addColorStop(0.75, '#548a46');
      g.addColorStop(1, '#456f3a');
      this.ground = g;
    }
    ctx.fillStyle = this.ground;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // dirt shoulder hugging the curb
    ctx.fillStyle = '#8d7a58';
    ctx.fillRect(ROAD_X - 30, 0, 18, VIEW_H);
    ctx.fillRect(ROAD_X + ROAD_W + 12, 0, 18, VIEW_H);
    ctx.fillStyle = 'rgba(60,44,26,0.18)';
    ctx.fillRect(ROAD_X - 30, 0, 5, VIEW_H);
    ctx.fillRect(ROAD_X + ROAD_W + 25, 0, 5, VIEW_H);

    for (const p of this.props) {
      const sway = Math.sin(time * 1.4 + p.phase) * 2.2 * p.scale;
      ctx.save();
      ctx.translate(p.x, p.y);
      switch (p.kind) {
        case 'tree': this.tree(ctx, p, sway, night); break;
        case 'bush': this.bush(ctx, p, sway); break;
        case 'grass': this.grassTuft(ctx, p, sway); break;
        case 'rock': this.rock(ctx, p); break;
        case 'lamp': this.lamp(ctx, p, night); break;
        case 'sign': this.sign(ctx, p); break;
      }
      ctx.restore();
    }

    // golden-hour warmth on the greenery
    if (dusk > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = dusk * 0.10;
      ctx.fillStyle = '#ffb45c';
      ctx.fillRect(0, 0, ROAD_X - 10, VIEW_H);
      ctx.fillRect(ROAD_X + ROAD_W + 10, 0, VIEW_W - ROAD_X - ROAD_W, VIEW_H);
      ctx.restore();
    }
  }

  private tree(ctx: CanvasRenderingContext2D, p: Prop, sway: number, night: number): void {
    const s = p.scale;
    ctx.save();
    ctx.globalAlpha = 0.26;
    ctx.fillStyle = '#1d3318';
    ctx.beginPath();
    ctx.ellipse(p.side * 14 * s, 8 * s, 24 * s, 9 * s, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#5b4327';
    roundRect(ctx, -3.5 * s, -16 * s, 7 * s, 24 * s, 2.5 * s);
    ctx.fill();

    ctx.translate(sway, 0);
    const blobs: [number, number, number][] = [
      [0, -34 * s, 20 * s], [-14 * s, -22 * s, 15 * s],
      [14 * s, -24 * s, 14 * s], [2 * s, -14 * s, 13 * s],
    ];
    for (let i = 0; i < blobs.length; i++) {
      const [bx, by, br] = blobs[i];
      const light = i === 0 ? 6 : i === 1 ? -6 : 0;
      ctx.fillStyle = `hsl(${p.hue}, 44%, ${30 + light - night * 10}%)`;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = `hsla(${p.hue - 6}, 58%, ${48 - night * 14}%, 0.85)`;
    ctx.beginPath();
    ctx.arc(-6 * s, -38 * s, 11 * s, 0, TAU);
    ctx.fill();
  }

  private bush(ctx: CanvasRenderingContext2D, p: Prop, sway: number): void {
    const s = p.scale;
    ctx.translate(sway * 0.5, 0);
    for (const [bx, by, br, dl] of [[-8 * s, 0, 9 * s, -4], [6 * s, -2 * s, 11 * s, 2], [0, -8 * s, 8 * s, 6]] as number[][]) {
      ctx.fillStyle = `hsl(${p.hue}, 38%, ${28 + dl}%)`;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, TAU);
      ctx.fill();
    }
  }

  private grassTuft(ctx: CanvasRenderingContext2D, p: Prop, sway: number): void {
    const s = p.scale;
    ctx.strokeStyle = `hsla(${p.hue}, 40%, 34%, 0.9)`;
    ctx.lineWidth = 2 * s;
    ctx.lineCap = 'round';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 3.4 * s, 0);
      ctx.quadraticCurveTo(i * 4 * s + sway, -8 * s, i * 5 * s + sway * 1.8, -15 * s);
      ctx.stroke();
    }
  }

  private rock(ctx: CanvasRenderingContext2D, p: Prop): void {
    const s = p.scale;
    ctx.fillStyle = '#7d8189';
    ctx.beginPath();
    ctx.moveTo(-11 * s, 4 * s);
    ctx.lineTo(-6 * s, -8 * s);
    ctx.lineTo(4 * s, -10 * s);
    ctx.lineTo(12 * s, 1 * s);
    ctx.lineTo(6 * s, 6 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(-6 * s, -8 * s);
    ctx.lineTo(4 * s, -10 * s);
    ctx.lineTo(2 * s, -3 * s);
    ctx.closePath();
    ctx.fill();
  }

  private lamp(ctx: CanvasRenderingContext2D, p: Prop, night: number): void {
    const s = p.scale * 1.1;
    const dir = -p.side; // arm reaches over the road
    ctx.fillStyle = '#3b4148';
    roundRect(ctx, -3 * s, -66 * s, 6 * s, 70 * s, 3 * s);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -66 * s);
    ctx.quadraticCurveTo(dir * 16 * s, -74 * s, dir * 30 * s, -70 * s);
    ctx.lineWidth = 5 * s;
    ctx.strokeStyle = '#3b4148';
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.fillStyle = night > 0.15 ? '#ffe9b0' : '#aeb6c0';
    roundRect(ctx, dir * 30 * s - 8 * s, -71 * s, 16 * s, 6 * s, 3 * s);
    ctx.fill();
    if (night > 0.08) {
      glow(ctx, dir * 30 * s, -66 * s, 70 * s, 'rgba(255,214,140,0.9)', night * 0.5);
      // pool of light on the road
      glow(ctx, dir * 46 * s, -8 * s, 96 * s, 'rgba(255,206,130,0.55)', night * 0.32, 0.45);
    }
  }

  private sign(ctx: CanvasRenderingContext2D, p: Prop): void {
    const s = p.scale;
    ctx.fillStyle = '#6d737b';
    roundRect(ctx, -2.5 * s, -34 * s, 5 * s, 36 * s, 2 * s);
    ctx.fill();
    ctx.fillStyle = '#2f7d4f';
    roundRect(ctx, -20 * s, -52 * s, 40 * s, 20 * s, 4 * s);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.6 * s;
    roundRect(ctx, -17 * s, -49 * s, 34 * s, 14 * s, 3 * s);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    roundRect(ctx, -12 * s, -44 * s, 24 * s, 3.5 * s, 1.5 * s);
    ctx.fill();
  }
}
