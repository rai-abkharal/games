/**
 * utils.ts — pure helpers: math, randomness, colour, geometry, layout constants.
 * No game state lives here, so every module can import it freely.
 */

export interface Rect { x: number; y: number; w: number; h: number }
export interface Hsl { h: number; s: number; l: number }

export const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ *
 * Virtual resolution. Everything is authored against this fixed
 * 480x800 canvas; engine.ts scales it to whatever the device gives us.
 * ------------------------------------------------------------------ */
export const VIEW_W = 480;
export const VIEW_H = 800;

/* Road layout ------------------------------------------------------- */
export const LANE_COUNT = 3;
export const ROAD_W = 330;
export const ROAD_X = (VIEW_W - ROAD_W) / 2;
export const LANE_W = ROAD_W / LANE_COUNT;
export const LANE_X: number[] = [0, 1, 2].map((i) => ROAD_X + LANE_W * (i + 0.5));
export const PLAYER_Y = VIEW_H - 200;

/* Tuning ------------------------------------------------------------ */
export const SPEED_MIN = 330;        // px/s at the start of a run
export const SPEED_MAX = 940;        // px/s once fully ramped up
export const RAMP_METERS = 2600;     // distance over which difficulty maxes out
export const GOAL_METERS = 10000;    // survive this far and you WIN
export const PX_PER_METER = 9;

/* Math -------------------------------------------------------------- */
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
/** Frame-rate independent lerp — the workhorse for smooth follow motion. */
export function damp(a: number, b: number, lambda: number, dt: number): number {
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}
export function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
export function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max + 1));
}
export function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}
export function chance(p: number): boolean {
  return Math.random() < p;
}
export function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
  return items;
}
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/* Geometry ---------------------------------------------------------- */
export function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x - a.w / 2 < b.x + b.w / 2 &&
    a.x + a.w / 2 > b.x - b.w / 2 &&
    a.y - a.h / 2 < b.y + b.h / 2 &&
    a.y + a.h / 2 > b.y - b.h / 2
  );
}
/** Shrinks a hitbox so near-misses feel fair instead of frustrating. */
export function inset(r: Rect, fx: number, fy: number): Rect {
  return { x: r.x, y: r.y, w: r.w * fx, h: r.h * fy };
}

/* Colour ------------------------------------------------------------ */
export function css(c: Hsl, dl = 0, alpha = 1, ds = 0): string {
  return `hsla(${c.h}, ${clamp(c.s + ds, 0, 100)}%, ${clamp(c.l + dl, 0, 100)}%, ${alpha})`;
}

/* Canvas helpers ---------------------------------------------------- */
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/** Soft additive light blob — used for lamps, headlights and coin shine. */
export function glow(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, radius: number,
  color: string, alpha: number, squash = 1,
): void {
  if (alpha <= 0.002 || radius <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(1, squash);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/**
 * Day/night cycle. Returns how "night" the world currently is (0..1)
 * plus a warm dusk factor used for golden-hour tinting.
 */
export function ambient(time: number): { night: number; dusk: number } {
  const cycle = (time / 105) % 1;
  const night = clamp(Math.sin(cycle * TAU - Math.PI / 2) * 0.5 + 0.5, 0, 1);
  const dusk = Math.max(0, 1 - Math.abs(night - 0.34) / 0.34);
  return { night, dusk };
}

export function formatScore(n: number): string {
  return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
