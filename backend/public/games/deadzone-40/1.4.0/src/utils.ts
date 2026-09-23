/**
 * utils.ts — pure helpers + every tuning constant in the game.
 * No game state, no imports. Tweak balance and palette here and nowhere else.
 */

export interface Rect { x: number; y: number; w: number; h: number }
export interface Hsl { h: number; s: number; l: number }
export type WallKind = 'crate' | 'brick' | 'metal';
export interface Wall extends Rect { kind: WallKind }
export type FloorKind = 'asphalt' | 'grass';
export interface FloorPatch extends Rect { kind: FloorKind }

export const TAU = Math.PI * 2;

/* Virtual resolution (portrait) --------------------------------------- */
export const VIEW_W = 480;
export const VIEW_H = 800;

/* World ---------------------------------------------------------------- */
export const MAP_W = 1040;
export const MAP_H = 1680;
export const WALL_T = 26;

/* Match rules ---------------------------------------------------------- */
export const KILL_TARGET = 40;
export const TEAM_SIZE = 4;
export const RESPAWN_TIME = 2.4;

/* Fighter base --------------------------------------------------------- */
export const FIGHT_R = 15;
export const MAX_HP = 100;
export const REGEN_DELAY = 5.0;
export const REGEN_RATE = 13;

export const P_SPEED = 162;
export const P_DMG = 17;
export const P_RATE = 7.6;
export const P_MAG = 30;
export const P_RELOAD = 1.45;
export const P_SPREAD = 0.05;
export const BULLET_SPEED = 660;
export const BULLET_RANGE = 470;

export const ALLY_SPEED = 146;
export const ALLY_DMG = 14.5;
export const ALLY_RATE = 5.5;
export const ALLY_JITTER = 0.105;

export const FOE_SPEED = 148;
export const FOE_DMG = 15;
export const FOE_RATE = 5.6;
export const FOE_JITTER = 0.105;

/* Bot behaviour -------------------------------------------------------- */
export const BOT_ENGAGE = 400;
export const BOT_PREFER = 230;
export const BOT_TOOCLOSE = 132;
export const BOT_REACT = 0.26;
export const BOT_MAG = 26;
export const BOT_RELOAD = 1.9;
export const BOT_BURST_ON = 0.85;
export const BOT_BURST_OFF = 0.5;

/* Pickups --------------------------------------------------------------- */
export const MEDKIT_HEAL = 42;
export const MEDKIT_RESPAWN = 11;
export const PICK_R = 16;

/* Upgrades -------------------------------------------------------------- */
export const KILLS_PER_UPGRADE = 3;
export const SLOWMO_PICK = 0.14;

/* Controls: joystick + fire button --------------------------------------- */
export const STICK_HOME_X = 82;
export const STICK_HOME_Y = VIEW_H - 138;
export const FIRE_BTN_X = VIEW_W - 80;
export const FIRE_BTN_Y = VIEW_H - 138;
export const FIRE_BTN_R = 52;

/* Auto-target ------------------------------------------------------------ */
export const TURN_RATE = 12;
export const FIRE_TOL = 0.30;
export const LOCK_KEEP = 1.18;

/* Recoil bloom ----------------------------------------------------------- */
export const BLOOM_GAIN = 0.115;
export const BLOOM_MAX = 0.135;
export const BLOOM_DECAY = 3.4;

/* Gore ------------------------------------------------------------------- */
export const MAX_DECALS = 46;

/* ---------------------------------------------------------------------- *
 * Palette — bright, saturated, cartoon-shooter
 * ---------------------------------------------------------------------- */
export const BLUE: Hsl = { h: 205, s: 80, l: 55 };
export const RED: Hsl = { h: 352, s: 76, l: 57 };
export const BLOOD: Hsl = { h: 352, s: 70, l: 32 };

export const C_CONCRETE = '#cfccc2';
export const C_CONCRETE_2 = '#c4c0b5';
export const C_CONCRETE_LINE = 'rgba(120,116,104,0.30)';
export const C_ASPHALT = '#5b6066';
export const C_ASPHALT_2 = '#53585e';
export const C_ASPHALT_LINE = 'rgba(30,34,38,0.35)';
export const C_GRASS = '#86c033';
export const C_GRASS_2 = '#74ab28';
export const C_GRASS_EDGE = '#5d8c1e';

export const C_CRATE_TOP = '#79bd97';
export const C_CRATE_MID = '#5fa87f';
export const C_CRATE_LOW = '#468467';
export const C_CRATE_EDGE = '#2f5d48';

export const C_BRICK_TOP = '#c2bc78';
export const C_BRICK_MID = '#aaa463';
export const C_BRICK_LOW = '#8d8850';
export const C_BRICK_EDGE = '#5f5c36';

export const C_METAL_TOP = '#5a606b';
export const C_METAL_MID = '#474c56';
export const C_METAL_LOW = '#363a43';
export const C_METAL_EDGE = '#22252b';

/* UI palette */
export const UI_INK = '#ffffff';
export const UI_OUTLINE = 'rgba(16,20,30,0.88)';
export const UI_PANEL = '#4e5b8f';
export const UI_PANEL_DARK = '#3a4570';
export const UI_GREEN = '#57c04a';
export const UI_GREEN_DARK = '#3d9433';
export const UI_GOLD = '#f5c342';
export const UI_GOLD_DARK = '#c99321';
export const UI_REDBTN = '#e8455f';
export const UI_REDBTN_DARK = '#b62c45';

/* Math ------------------------------------------------------------------ */
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
export function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
export function damp(a: number, b: number, lambda: number, dt: number): number {
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}
export function rand(min: number, max: number): number { return min + Math.random() * (max - min); }
export function randInt(min: number, max: number): number { return Math.floor(rand(min, max + 1)); }
export function pick<T>(items: T[]): T { return items[Math.floor(Math.random() * items.length)]; }
export function chance(p: number): boolean { return Math.random() < p; }
export function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = items[i]; items[i] = items[j]; items[j] = t;
  }
  return items;
}
export function easeOutCubic(t: number): number { return 1 - Math.pow(1 - t, 3); }
export function easeOutBack(t: number): number {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy;
}
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
export function approachAngle(a: number, b: number, maxStep: number): number {
  return a + clamp(angleDelta(a, b), -maxStep, maxStep);
}

/* Geometry --------------------------------------------------------------- */
export function inRect(px: number, py: number, r: Rect): boolean {
  return px > r.x && px < r.x + r.w && py > r.y && py < r.y + r.h;
}
export function resolveCircleRect(cx: number, cy: number, cr: number, r: Rect): [number, number] {
  const nx = clamp(cx, r.x, r.x + r.w);
  const ny = clamp(cy, r.y, r.y + r.h);
  const dx = cx - nx, dy = cy - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 > cr * cr) return [0, 0];
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    return [(dx / d) * (cr - d), (dy / d) * (cr - d)];
  }
  const left = cx - r.x, right = r.x + r.w - cx;
  const top = cy - r.y, bottom = r.y + r.h - cy;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return [-(left + cr), 0];
  if (m === right) return [right + cr, 0];
  if (m === top) return [0, -(top + cr)];
  return [0, bottom + cr];
}

/* Colour ------------------------------------------------------------------ */
export function css(c: Hsl, dl = 0, alpha = 1, ds = 0): string {
  return `hsla(${c.h}, ${clamp(c.s + ds, 0, 100)}%, ${clamp(c.l + dl, 0, 100)}%, ${alpha})`;
}

/* Canvas helpers ----------------------------------------------------------- */
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

/* ---------------------------------------------------------------------- *
 * Chunky casual-mobile UI kit
 * ---------------------------------------------------------------------- */

/** A panel with a solid darker lip along the bottom — the classic mobile look. */
export function chunky(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
  top: string, bottom: string, depth = 6, stroke = 'rgba(12,16,28,0.55)',
): void {
  roundRect(ctx, x, y + depth * 0.4, w, h, r);
  ctx.fillStyle = bottom; ctx.fill();
  roundRect(ctx, x, y, w, h - depth, r);
  ctx.fillStyle = top; ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = stroke;
  roundRect(ctx, x, y, w, h, r); ctx.stroke();
}

/** White text with a heavy dark outline — readable over any background. */
export function outlined(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number,
  size: number, fill = UI_INK, weight = 900, lw = 0,
): void {
  ctx.font = `${weight} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw || Math.max(3, size * 0.26);
  ctx.strokeStyle = UI_OUTLINE;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** Wide banner with notched tails, used for VICTORY / DEFEAT. */
export function ribbon(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number,
  top: string, bottom: string,
): void {
  const tail = 30, x = cx - w / 2, y = cy - h / 2;
  ctx.fillStyle = bottom;
  ctx.beginPath();
  ctx.moveTo(x - tail, y + 6); ctx.lineTo(x + 14, y + 6);
  ctx.lineTo(x + 14, y + h + 2); ctx.lineTo(x - tail, y + h + 2);
  ctx.lineTo(x - tail + 14, y + (h + 8) / 2); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + w + tail, y + 6); ctx.lineTo(x + w - 14, y + 6);
  ctx.lineTo(x + w - 14, y + h + 2); ctx.lineTo(x + w + tail, y + h + 2);
  ctx.lineTo(x + w + tail - 14, y + (h + 8) / 2); ctx.closePath(); ctx.fill();
  chunky(ctx, x, y, w, h, 14, top, bottom, 7, 'rgba(12,16,28,0.4)');
}

/** Five-point star, used on the results screen. */
export function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string, edge: string): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = 2.6; ctx.lineJoin = 'round';
  ctx.strokeStyle = edge; ctx.stroke();
}

/* ---------------------------------------------------------------------- *
 * Arena — 180° rotationally symmetric so neither side gets better cover
 * ---------------------------------------------------------------------- */

export function buildWalls(): Wall[] {
  const half: Wall[] = [
    { x: 140, y: 200, w: 150, h: 36, kind: 'brick' },
    { x: 750, y: 200, w: 150, h: 36, kind: 'brick' },
    { x: 481, y: 110, w: 78, h: 78, kind: 'crate' },
    { x: 86, y: 420, w: 36, h: 180, kind: 'brick' },
    { x: 300, y: 450, w: 78, h: 78, kind: 'crate' },
    { x: 662, y: 450, w: 78, h: 78, kind: 'crate' },
    { x: 918, y: 420, w: 36, h: 180, kind: 'brick' },
    { x: 210, y: 640, w: 36, h: 150, kind: 'brick' },
    { x: 794, y: 640, w: 36, h: 150, kind: 'brick' },
    { x: 410, y: 680, w: 220, h: 36, kind: 'brick' },
    { x: 148, y: 320, w: 54, h: 54, kind: 'metal' },
    { x: 838, y: 320, w: 54, h: 54, kind: 'metal' },
  ];
  const walls: Wall[] = [
    { x: 0, y: 0, w: MAP_W, h: WALL_T, kind: 'brick' },
    { x: 0, y: MAP_H - WALL_T, w: MAP_W, h: WALL_T, kind: 'brick' },
    { x: 0, y: 0, w: WALL_T, h: MAP_H, kind: 'brick' },
    { x: MAP_W - WALL_T, y: 0, w: WALL_T, h: MAP_H, kind: 'brick' },
  ];
  for (const r of half) {
    walls.push(r);
    walls.push({ x: MAP_W - r.x - r.w, y: MAP_H - r.y - r.h, w: r.w, h: r.h, kind: r.kind });
  }
  return walls;
}

/** Painted floor zones. Purely decorative — nothing here blocks anything. */
export function buildFloor(): FloorPatch[] {
  const half: FloorPatch[] = [
    { x: 360, y: 0, w: 320, h: 860, kind: 'asphalt' },
    { x: 0, y: 236, w: 300, h: 150, kind: 'grass' },
    { x: 860, y: 560, w: 180, h: 210, kind: 'grass' },
    { x: 96, y: 700, w: 170, h: 120, kind: 'grass' },
  ];
  const out: FloorPatch[] = [{ x: 0, y: 760, w: MAP_W, h: 170, kind: 'asphalt' }];
  for (const p of half) {
    out.push(p);
    out.push({ x: MAP_W - p.x - p.w, y: MAP_H - p.y - p.h, w: p.w, h: p.h, kind: p.kind });
  }
  return out;
}

export function medkitSpots(): { x: number; y: number }[] {
  return [
    { x: 120, y: 840 }, { x: 920, y: 840 },
    { x: 520, y: 320 }, { x: 520, y: 1360 },
    { x: 520, y: 840 },
  ];
}

export function spawnPoints(team: 0 | 1): { x: number; y: number }[] {
  const y = team === 0 ? MAP_H - 130 : 130;
  return [{ x: 150, y }, { x: 380, y }, { x: 660, y }, { x: 890, y }];
}

export function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/* Upgrade pool ------------------------------------------------------------- */
export interface UpgradeDef { key: string; name: string; desc: string }

export const UPGRADES: UpgradeDef[] = [
  { key: 'dmg', name: 'HEAVY ROUNDS', desc: '+22% bullet damage' },
  { key: 'rate', name: 'HAIR TRIGGER', desc: '+18% fire rate' },
  { key: 'mag', name: 'EXTENDED MAG', desc: '+12 rounds per mag' },
  { key: 'reload', name: 'QUICK HANDS', desc: '-25% reload time' },
  { key: 'speed', name: 'LIGHT BOOTS', desc: '+14% move speed' },
  { key: 'hp', name: 'PLATE CARRIER', desc: '+25 max health' },
  { key: 'multi', name: 'SPLIT BARREL', desc: '+1 bullet per shot' },
  { key: 'pierce', name: 'AP ROUNDS', desc: 'Bullets pierce 1 more enemy' },
  { key: 'accuracy', name: 'STABILISER', desc: '-40% spread' },
  { key: 'lifesteal', name: 'ADRENALINE', desc: 'Heal 5 HP per hit landed' },
  { key: 'armor', name: 'CERAMIC VEST', desc: '-15% damage taken' },
  { key: 'range', name: 'LONG BARREL', desc: '+25% bullet range & speed' },
];
