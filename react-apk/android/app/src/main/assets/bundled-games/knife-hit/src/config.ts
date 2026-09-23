// All tuning constants and content definitions live here.
export const W = 480;              // logical width — fixed; the world always spans exactly this wide
export const H = 800;              // reference/min logical height (portrait). Actual height is set at runtime.
// Live viewport, filled in by the scale handler. Everything that needs the real screen height reads VIEW.h.
export const VIEW = { w: W, h: H };
export const TOTAL_LEVELS = 100;

export const BOARD_X = 240;
export const BOARD_Y = 320;        // reference; recomputed per screen as boardY()
export const BOARD_R = 128;          // collision radius (display px)
export const KNIFE_HAND_Y = 690;     // reference; recomputed per screen as handY()
export const KNIFE_SPEED = 2900;     // px / s
export const KNIFE_DEPTH = 52;       // how deep the blade sinks into the board (blade is hidden behind it)
export const KNIFE_GAP_DEG = 14;     // min angular gap between knives (clash if closer)
export const APPLE_HIT_DEG = 19;
export const APPLE_DIST = BOARD_R + 4;
export const FRUITS = ['apple', 'orange', 'lemon', 'strawberry', 'kiwi'] as const;
export type FruitKind = typeof FRUITS[number];
export interface FruitSlot { angle: number; kind: FruitKind }

export interface RotSeg { speed: number; dur: number }   // speed in deg/s, dur in s
export interface LevelDef {
  n: number;
  boardIdx: number;
  boss: boolean;
  knives: number;
  preKnives: number[];   // angles in degrees (board frame)
  fruits: FruitSlot[];   // fruit on the rim (board frame angles)
  rot: RotSeg[];
}

export interface BoardDef { name: string; bg: [number, number]; accent: number }
export const BOARDS: BoardDef[] = [
  { name: 'The Log',        bg: [0x2b2137, 0x120d1c], accent: 0xf2a541 },
  { name: 'Cheese Wheel',   bg: [0x2a2f45, 0x0f1220], accent: 0xffd166 },
  { name: 'Cookie Crumble', bg: [0x3a2620, 0x150c0a], accent: 0xd88c4a },
  { name: 'Pizza Night',    bg: [0x3b1f2a, 0x160a10], accent: 0xff6b4a },
  { name: 'Big Wheel',      bg: [0x1f2a33, 0x0a0f14], accent: 0x8ecae6 },
  { name: 'Melon Slice',    bg: [0x1c3326, 0x08140d], accent: 0xff5c7a },
  { name: 'Donut Day',      bg: [0x3a2044, 0x150a1c], accent: 0xff8fcf },
  { name: 'Tick Tock',      bg: [0x25304a, 0x0c1020], accent: 0xffe08a },
  { name: 'Iron Gear',      bg: [0x2c2c34, 0x101014], accent: 0xb8c4d8 },
  { name: 'Frost Crystal',  bg: [0x1a3550, 0x081422], accent: 0x9be7ff },
];

export interface KnifeDef {
  name: string;
  unlock: number;                 // stage that must be cleared to unlock (0 = free)
  shape: 'dagger' | 'chef' | 'cleaver' | 'kunai' | 'katana' | 'crystal';
  blade: [string, string, string];   // edge, center, edge
  handle: [string, string];
  guard: string;
  glow?: string;
}
export const KNIVES: KnifeDef[] = [
  { name: 'Starter',      unlock: 0,   shape: 'dagger',  blade: ['#9aa3ad', '#f4f7fb', '#7d8792'], handle: ['#8b5a2b', '#4a2d14'], guard: '#c9a75a' },
  { name: 'Chef',         unlock: 10,  shape: 'chef',    blade: ['#8f9aa6', '#eef3f8', '#6f7b88'], handle: ['#2b2b2b', '#0e0e0e'], guard: '#e0e0e0' },
  { name: 'Golden Fang',  unlock: 20,  shape: 'dagger',  blade: ['#c98a1a', '#ffe58a', '#a86d0a'], handle: ['#6a1b1b', '#2e0a0a'], guard: '#ffd54a' },
  { name: 'Shadow Kunai', unlock: 30,  shape: 'kunai',   blade: ['#3a3f4a', '#8c95a6', '#23272f'], handle: ['#1c1f26', '#08090c'], guard: '#5b6270' },
  { name: 'Butcher',      unlock: 40,  shape: 'cleaver', blade: ['#a3aab3', '#f0f3f6', '#7c848d'], handle: ['#a0522d', '#5c2e14'], guard: '#3a3a3a' },
  { name: 'Katana',       unlock: 50,  shape: 'katana',  blade: ['#b5bcc6', '#ffffff', '#8b929c'], handle: ['#c0392b', '#7b1f15'], guard: '#d4af37' },
  { name: 'Neon Blade',   unlock: 60,  shape: 'katana',  blade: ['#0e7c9c', '#9ff4ff', '#0a5c74'], handle: ['#1a1f3a', '#0a0c1c'], guard: '#5ff0ff', glow: '#4ee8ff' },
  { name: 'Bone Splitter',unlock: 70,  shape: 'cleaver', blade: ['#cfc4a8', '#fff8e6', '#b3a688'], handle: ['#4b3a2a', '#241a10'], guard: '#8a7a5a' },
  { name: 'Inferno',      unlock: 80,  shape: 'kunai',   blade: ['#c62d0e', '#ffb347', '#8f1a05'], handle: ['#2f0d05', '#120402'], guard: '#ff7a1a', glow: '#ff6a1a' },
  { name: 'Frost Edge',   unlock: 90,  shape: 'crystal', blade: ['#4fa8e0', '#e6f9ff', '#2e7cb8'], handle: ['#173c5c', '#0a1c2e'], guard: '#bfeeff', glow: '#8fe3ff' },
  { name: 'Legend',       unlock: 100, shape: 'crystal', blade: ['#b07cff', '#ffffff', '#7a3ce0'], handle: ['#2a1150', '#120627'], guard: '#ffd54a', glow: '#c99cff' },
];

// ---------- deterministic RNG ----------
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickSlots(rng: () => number, count: number, used: number[], minGap: number): number[] {
  const out: number[] = [];
  let tries = 0;
  while (out.length < count && tries < 400) {
    tries++;
    const a = Math.floor(rng() * 24) * 15 + (rng() < 0.5 ? 0 : 7.5);
    const ok = [...used, ...out].every((u) => angDist(u, a) >= minGap);
    if (ok) out.push(a);
  }
  return out;
}

export function angDist(a: number, b: number): number {
  let d = Math.abs(((a - b) % 360 + 540) % 360 - 180);
  return d;
}

export function makeLevel(n: number): LevelDef {
  const rng = mulberry32(1337 + n * 7919);
  const t = (n - 1) / (TOTAL_LEVELS - 1);           // 0..1 difficulty
  const boss = n % 10 === 0;
  const boardIdx = Math.min(BOARDS.length - 1, Math.floor((n - 1) / 10));

  const knives = boss ? 8 + Math.round(t * 4) : 5 + Math.round(t * 4);
  const preCount = n < 8 ? 0 : Math.min(4, Math.floor((n - 4) / 16) + (boss ? 1 : 0) + (rng() < 0.35 ? 1 : 0));
  const preKnives = pickSlots(rng, preCount, [], 24);
  const fruitCount = 1 + Math.floor(rng() * (n < 6 ? 1 : n < 25 ? 2 : 3));
  const fruits: FruitSlot[] = pickSlots(rng, fruitCount, preKnives, 30).map((angle) => ({
    angle, kind: FRUITS[Math.floor(rng() * FRUITS.length)],
  }));

  // ---- rotation pattern. Rules: the board NEVER stops (|speed| >= MIN_SPEED), direction
  // changes are rare and every segment is long enough to read as rotation, never as a swing.
  const MIN_SPEED = 42;
  const base = 48 + t * 125;                       // 48 deg/s at stage 1 -> ~173 at stage 100
  const dir = rng() < 0.5 ? 1 : -1;
  const sp = (mult: number) => Math.max(MIN_SPEED, base * mult);
  let rot: RotSeg[] = [];
  const style = n <= 10 ? 0 : boss ? 3 : Math.floor(rng() * 3);
  switch (style) {
    case 0:  // steady, one direction
      rot = [{ speed: sp(1) * dir, dur: 10 }];
      break;
    case 1:  // cruise then a quicker stretch, same direction
      rot = [
        { speed: sp(0.85) * dir, dur: 2.2 + rng() * 1.0 },
        { speed: sp(1.55) * dir, dur: 1.0 + rng() * 0.5 },
      ];
      break;
    case 2:  // long run one way, then a long run the other way
      rot = [
        { speed: sp(1) * dir, dur: 3.2 + rng() * 1.5 },
        { speed: -sp(0.9) * dir, dur: 2.6 + rng() * 1.2 },
      ];
      break;
    default: // boss: varied speed, one reversal, never below MIN_SPEED
      rot = [
        { speed: sp(1) * dir, dur: 2.4 + rng() * 0.8 },
        { speed: sp(1.7) * dir, dur: 0.9 },
        { speed: sp(0.8) * dir, dur: 1.6 },
        { speed: -sp(1.1) * dir, dur: 3.0 + rng() * 0.8 },
      ];
  }
  return { n, boardIdx, boss, knives, preKnives, fruits, rot };
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const DEG = Math.PI / 180;

// Layout anchored to the LIVE height so nothing letterboxes and the board stays centred on any phone.
export const boardY = () => VIEW.h * 0.42;
export const handY  = () => VIEW.h - 118;
