/* ============================================================
   CROWN ARENA - logic prototype
   P1 = human, P2 = AI (grid A* + state machine)
   Win = hold the crown for TARGET seconds in total (not in a row)
   ============================================================ */

/* ---------- types ---------- */
type Vec = { x: number; y: number };
type Phase = "menu" | "intro" | "play" | "pause" | "over";
type AiState = "seek" | "chase" | "evade";

/* ---------- arena ---------- */
const TILE = 40;
const MAP = [
  "########################",
  "#......................#",
  "#..###............###..#",
  "#....#...#....#...#....#",
  "#....#...#....#...#....#",
  "#........#....#........#",
  "#..####..#....#..####..#",
  "#........#....#........#",
  "#..####..#....#..####..#",
  "#........#....#........#",
  "#....#...#....#...#....#",
  "#....#...#....#...#....#",
  "#..###............###..#",
  "#......................#",
  "########################",
];
const ROWS = MAP.length;
const COLS = MAP[0].length;
const W = COLS * TILE;
const H = ROWS * TILE;

const grid: number[][] = MAP.map((row) =>
  row.split("").map((ch) => (ch === "#" ? 1 : 0))
);

function isWall(c: number, r: number): boolean {
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return true;
  return grid[r][c] === 1;
}
function tileCenter(c: number, r: number): Vec {
  return { x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 };
}
function toTile(p: Vec): { c: number; r: number } {
  return { c: Math.floor(p.x / TILE), r: Math.floor(p.y / TILE) };
}

/* walkable tiles, used by the AI to pick escape spots */
const openTiles: { c: number; r: number }[] = [];
for (let r = 0; r < ROWS; r++)
  for (let c = 0; c < COLS; c++) if (!isWall(c, r)) openTiles.push({ c, r });

/* ---------- small math ---------- */
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
function norm(v: Vec): Vec {
  const m = Math.hypot(v.x, v.y);
  return m < 0.0001 ? { x: 0, y: 0 } : { x: v.x / m, y: v.y / m };
}
function easeOut(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

/* line of sight, used to shortcut A* paths */
function lineClear(a: Vec, b: Vec): boolean {
  const d = dist(a, b);
  const steps = Math.max(2, Math.ceil(d / (TILE * 0.4)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = lerp(a.x, b.x, t);
    const y = lerp(a.y, b.y, t);
    const c = Math.floor(x / TILE);
    const r = Math.floor(y / TILE);
    if (isWall(c, r)) return false;
    /* keep a little clearance so the body does not scrape corners */
    if (isWall(Math.floor((x - 12) / TILE), r)) return false;
    if (isWall(Math.floor((x + 12) / TILE), r)) return false;
    if (isWall(c, Math.floor((y - 12) / TILE))) return false;
    if (isWall(c, Math.floor((y + 12) / TILE))) return false;
  }
  return true;
}

/* ---------- A* on the tile grid (this is the "navmesh" for a 2D arena) ---------- */
function nearestOpen(c: number, r: number): { c: number; r: number } {
  if (!isWall(c, r)) return { c, r };
  let best = openTiles[0];
  let bd = Infinity;
  for (const t of openTiles) {
    const d = (t.c - c) * (t.c - c) + (t.r - r) * (t.r - r);
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  return best;
}

function astar(from: Vec, to: Vec): Vec[] {
  const s = toTile(from);
  const g0 = toTile(to);
  const start = nearestOpen(s.c, s.r);
  const goal = nearestOpen(g0.c, g0.r);
  const key = (c: number, r: number) => r * COLS + c;

  const gScore = new Float64Array(COLS * ROWS).fill(Infinity);
  const fScore = new Float64Array(COLS * ROWS).fill(Infinity);
  const cameFrom = new Int32Array(COLS * ROWS).fill(-1);
  const closed = new Uint8Array(COLS * ROWS);
  const open: number[] = [];

  const hh = (c: number, r: number) =>
    Math.hypot(c - goal.c, r - goal.r);

  const sk = key(start.c, start.r);
  gScore[sk] = 0;
  fScore[sk] = hh(start.c, start.r);
  open.push(sk);

  const NB = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ];

  while (open.length) {
    /* grid is tiny (360 nodes) so a linear scan is cheaper than a heap */
    let bi = 0;
    for (let i = 1; i < open.length; i++)
      if (fScore[open[i]] < fScore[open[bi]]) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur === key(goal.c, goal.r)) break;
    closed[cur] = 1;
    const cc = cur % COLS;
    const cr = (cur - cc) / COLS;

    for (const [dc, dr] of NB) {
      const nc = cc + dc;
      const nr = cr + dr;
      if (isWall(nc, nr)) continue;
      /* no diagonal squeezing between two walls */
      if (dc !== 0 && dr !== 0 && (isWall(cc + dc, cr) || isWall(cc, cr + dr)))
        continue;
      const nk = key(nc, nr);
      if (closed[nk]) continue;
      const step = dc !== 0 && dr !== 0 ? 1.414 : 1;
      const tg = gScore[cur] + step;
      if (tg < gScore[nk]) {
        cameFrom[nk] = cur;
        gScore[nk] = tg;
        fScore[nk] = tg + hh(nc, nr);
        if (open.indexOf(nk) === -1) open.push(nk);
      }
    }
  }

  /* rebuild */
  const out: Vec[] = [];
  let k = key(goal.c, goal.r);
  if (gScore[k] === Infinity) return out;
  while (k !== -1) {
    const c = k % COLS;
    const r = (k - c) / COLS;
    out.push(tileCenter(c, r));
    if (k === sk) break;
    k = cameFrom[k];
  }
  out.reverse();

  /* string pull: drop waypoints we can walk past in a straight line */
  const pulled: Vec[] = [];
  let i = 0;
  while (i < out.length) {
    let j = out.length - 1;
    while (j > i + 1 && !lineClear(out[i], out[j])) j--;
    pulled.push(out[j]);
    i = j;
    if (j === out.length - 1) break;
  }
  return pulled;
}

/* ---------- fighters ---------- */
class Fighter {
  pos: Vec;
  vel: Vec = { x: 0, y: 0 };
  desired: Vec = { x: 0, y: 0 };
  r = 15;
  speed = 178; /* overwritten per fighter in resetMatch */
  held = 0;
  face = 1;
  bob = Math.random() * 6;
  trail: { x: number; y: number; a: number }[] = [];
  dustT = 0;
  flash = 0;
  constructor(public id: 1 | 2, x: number, y: number, public tint: string, public deep: string) {
    this.pos = { x, y };
  }
  get moving() {
    return Math.hypot(this.vel.x, this.vel.y) > 20;
  }
}

/* ---------- particles ---------- */
type P = {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; col: string;
  kind: "spark" | "dust" | "ring" | "confetti" | "mote";
  spin?: number; rot?: number;
};
let parts: P[] = [];

function spark(x: number, y: number, col: string, n = 18, power = 260) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = rand(power * 0.25, power);
    parts.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: rand(0.3, 0.7), max: 0.7, size: rand(2, 4.5), col, kind: "spark",
    });
  }
}
function ring(x: number, y: number, col: string, size = 20) {
  parts.push({ x, y, vx: 0, vy: 0, life: 0.55, max: 0.55, size, col, kind: "ring" });
}
function dust(x: number, y: number) {
  parts.push({
    x, y, vx: rand(-18, 18), vy: rand(-26, -6),
    life: rand(0.35, 0.7), max: 0.7, size: rand(2, 5),
    col: "rgba(206,186,255,0.5)", kind: "dust",
  });
}
function confetti(x: number, y: number, col: string) {
  for (let i = 0; i < 60; i++) {
    const a = rand(-Math.PI, 0);
    const s = rand(120, 520);
    parts.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: rand(0.9, 1.9), max: 1.9, size: rand(3, 7), col,
      kind: "confetti", spin: rand(-12, 12), rot: rand(0, 6),
    });
  }
}
for (let i = 0; i < 40; i++) {
  /* ambient motes floating in the arena */
  parts.push({
    x: rand(0, W), y: rand(0, H), vx: rand(-8, 8), vy: rand(-14, -3),
    life: 99, max: 99, size: rand(1, 2.4),
    col: "rgba(255,220,150,0.35)", kind: "mote",
  });
}

/* ---------- game state ---------- */
const P1 = new Fighter(1, tileCenter(2, 7).x, tileCenter(2, 7).y, "#ff4d6d", "#7a0f26");
const P2 = new Fighter(2, tileCenter(21, 7).x, tileCenter(21, 7).y, "#2fd6a5", "#0b5a45");

const S = {
  phase: "menu" as Phase,
  target: 60,
  diff: "normal" as "easy" | "normal" | "hard",
  holder: 0 as 0 | 1 | 2,
  crown: { ...tileCenter(11, 7) } as Vec,
  cooldown: 0,
  shake: 0,
  flashWhite: 0,
  timeScale: 1,
  intro: 0,
  winner: 0 as 0 | 1 | 2,
  t: 0,
  debug: false,
};

/* speed: the human is always 10% faster than the AI */
const PLAYER_SPEED = 178;
const AI_SPEED = PLAYER_SPEED / 1.1;

const DIFF = {
  easy: { react: 0.5, repath: 0.4 },
  normal: { react: 0.3, repath: 0.26 },
  hard: { react: 0.13, repath: 0.16 },
};

/* ---------- AI brain ---------- */
const ai = {
  state: "seek" as AiState,
  path: [] as Vec[],
  repathT: 0,
  reactT: 0,
  pendingState: "seek" as AiState,
  goal: null as Vec | null,
};

function wantedState(): AiState {
  if (S.holder === 0) return "seek";
  if (S.holder === 2) return "evade";
  return "chase";
}

function pickEscapeSpot(): Vec {
  let best = { ...P2.pos };
  let bestScore = -Infinity;
  for (const t of openTiles) {
    const p = tileCenter(t.c, t.r);
    const dEnemy = dist(p, P1.pos);
    const dSelf = dist(p, P2.pos);
    if (dSelf < 60) continue;
    /* far from the human, but not on the far side of him */
    const score = dEnemy * 1.0 - dSelf * 0.45 + rand(0, 40);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

function aiThink(dt: number) {
  const d = DIFF[S.diff];

  /* reaction delay when the situation changes */
  const want = wantedState();
  if (want !== ai.pendingState) {
    ai.pendingState = want;
    ai.reactT = d.react;
  }
  if (ai.reactT > 0) {
    ai.reactT -= dt;
    if (ai.reactT <= 0 && ai.state !== ai.pendingState) {
      ai.state = ai.pendingState;
      ai.repathT = 0;
      ai.path = [];
    }
  }

  ai.repathT -= dt;
  const needNewGoal =
    ai.repathT <= 0 ||
    ai.path.length === 0 ||
    (ai.state === "evade" && ai.goal !== null && dist(P2.pos, ai.goal) < 50);

  if (needNewGoal) {
    ai.repathT = ai.state === "evade" ? 0.55 : d.repath;
    if (ai.state === "seek") ai.goal = { ...S.crown };
    else if (ai.state === "chase") ai.goal = { ...P1.pos };
    else ai.goal = pickEscapeSpot();
    ai.path = astar(P2.pos, ai.goal);
  }

  /* follow the path */
  let dir: Vec = { x: 0, y: 0 };
  if (ai.goal && lineClear(P2.pos, ai.goal)) {
    dir = norm({ x: ai.goal.x - P2.pos.x, y: ai.goal.y - P2.pos.y });
    ai.path = [];
  } else {
    while (ai.path.length && dist(P2.pos, ai.path[0]) < 22) ai.path.shift();
    if (ai.path.length) {
      const wp = ai.path[0];
      dir = norm({ x: wp.x - P2.pos.x, y: wp.y - P2.pos.y });
    }
  }

  /* while running away, push a bit harder straight away from the human */
  if (ai.state === "evade") {
    const away = norm({ x: P2.pos.x - P1.pos.x, y: P2.pos.y - P1.pos.y });
    const near = clamp(1 - dist(P1.pos, P2.pos) / 260, 0, 1);
    dir = norm({ x: dir.x + away.x * near * 0.9, y: dir.y + away.y * near * 0.9 });
  }

  P2.desired = dir;
  P2.speed = AI_SPEED;
}

/* ---------- human input ---------- */
const keys: Record<string, boolean> = {};
const joystick = {
  active: false,
  pointerId: null as number | null,
  baseEl: document.getElementById("joystick-base") as HTMLElement,
  thumbEl: document.getElementById("joystick-thumb") as HTMLElement,
  baseCenter: { x: 0, y: 0 },
  maxRadius: 46,
  x: 0,
  y: 0,
};

function humanInput() {
  let kx = 0, ky = 0;
  if (keys["arrowleft"] || keys["a"]) kx -= 1;
  if (keys["arrowright"] || keys["d"]) kx += 1;
  if (keys["arrowup"] || keys["w"]) ky -= 1;
  if (keys["arrowdown"] || keys["s"]) ky += 1;

  let x = kx;
  let y = ky;
  if (joystick.active) {
    x += joystick.x;
    y += joystick.y;
  }

  const mag = Math.hypot(x, y);
  if (mag > 0.001) {
    const f = Math.min(1, mag);
    P1.desired = { x: (x / mag) * f, y: (y / mag) * f };
  } else {
    P1.desired = { x: 0, y: 0 };
  }
}

/* ---------- physics ---------- */
function moveFighter(f: Fighter, dt: number) {
  const tx = f.desired.x * f.speed;
  const ty = f.desired.y * f.speed;
  const k = Math.min(1, dt * 13);
  f.vel.x = lerp(f.vel.x, tx, k);
  f.vel.y = lerp(f.vel.y, ty, k);

  f.pos.x += f.vel.x * dt;
  resolve(f, "x");
  f.pos.y += f.vel.y * dt;
  resolve(f, "y");

  if (Math.abs(f.vel.x) > 12) f.face = f.vel.x > 0 ? 1 : -1;
  f.bob += dt * (f.moving ? 11 : 3.5);

  /* trail + footstep dust */
  f.trail.unshift({ x: f.pos.x, y: f.pos.y, a: 1 });
  if (f.trail.length > 9) f.trail.pop();
  for (const t of f.trail) t.a -= dt * 2.6;

  if (f.moving) {
    f.dustT -= dt;
    if (f.dustT <= 0) {
      f.dustT = 0.09;
      dust(f.pos.x, f.pos.y + f.r * 0.9);
    }
  }
  if (f.flash > 0) f.flash -= dt * 3;
}

function resolve(f: Fighter, axis: "x" | "y") {
  const half = f.r * 0.88;
  const c0 = Math.floor((f.pos.x - half) / TILE);
  const c1 = Math.floor((f.pos.x + half) / TILE);
  const r0 = Math.floor((f.pos.y - half) / TILE);
  const r1 = Math.floor((f.pos.y + half) / TILE);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (!isWall(c, r)) continue;
      const left = c * TILE, top = r * TILE;
      const right = left + TILE, bottom = top + TILE;
      if (
        f.pos.x + half <= left || f.pos.x - half >= right ||
        f.pos.y + half <= top || f.pos.y - half >= bottom
      ) continue;
      if (axis === "x") {
        if (f.vel.x > 0) f.pos.x = left - half;
        else if (f.vel.x < 0) f.pos.x = right + half;
        f.vel.x = 0;
      } else {
        if (f.vel.y > 0) f.pos.y = top - half;
        else if (f.vel.y < 0) f.pos.y = bottom + half;
        f.vel.y = 0;
      }
    }
  }
}

/* ---------- crown rules ---------- */
function crownPos(): Vec {
  if (S.holder === 0) {
    return { x: S.crown.x, y: S.crown.y + Math.sin(S.t * 2.4) * 5 };
  }
  const f = S.holder === 1 ? P1 : P2;
  return {
    x: f.pos.x - f.vel.x * 0.035,
    y: f.pos.y - f.r - 15 + Math.sin(f.bob) * 2.2,
  };
}

function giveCrown(to: 1 | 2, from: 0 | 1 | 2) {
  S.holder = to;
  S.cooldown = 1.0;
  const f = to === 1 ? P1 : P2;
  f.flash = 1;
  spark(f.pos.x, f.pos.y - 20, "#ffd469", from === 0 ? 16 : 26, from === 0 ? 200 : 320);
  ring(f.pos.x, f.pos.y, "#ffd469", from === 0 ? 16 : 22);
  S.shake = from === 0 ? 4 : 11;
  S.flashWhite = from === 0 ? 0.12 : 0.32;
  if (from !== 0) S.timeScale = 0.12;
  if (navigator.vibrate) {
    try { navigator.vibrate(to === 1 ? [15, 30, 20] : 15); } catch (_) {}
  }
}

function crownRules() {
  if (S.cooldown > 0) return;
  if (S.holder === 0) {
    const d1 = dist(P1.pos, S.crown);
    const d2 = dist(P2.pos, S.crown);
    if (d1 < P1.r + 16 && d1 <= d2) giveCrown(1, 0);
    else if (d2 < P2.r + 16) giveCrown(2, 0);
    return;
  }
  if (dist(P1.pos, P2.pos) < P1.r + P2.r + 2) {
    giveCrown(S.holder === 1 ? 2 : 1, S.holder);
  }
}

/* ---------- update ---------- */
function update(raw: number) {
  S.t += raw;

  /* hit stop easing back to normal speed */
  S.timeScale = lerp(S.timeScale, 1, Math.min(1, raw * 9));
  if (S.timeScale > 0.985) S.timeScale = 1;
  const dt = raw * S.timeScale;

  S.shake = Math.max(0, S.shake - raw * 26);
  S.flashWhite = Math.max(0, S.flashWhite - raw * 2.2);

  /* particles always run */
  for (const p of parts) {
    p.x += p.vx * raw;
    p.y += p.vy * raw;
    if (p.kind === "spark") { p.vy += 620 * raw; p.vx *= 0.94; }
    if (p.kind === "confetti") { p.vy += 500 * raw; p.vx *= 0.98; p.rot! += p.spin! * raw; }
    if (p.kind === "dust") { p.vy -= 20 * raw; }
    if (p.kind === "mote") {
      if (p.y < -10) { p.y = H + 8; p.x = rand(0, W); }
      continue;
    }
    p.life -= raw;
  }
  parts = parts.filter((p) => p.life > 0);

  if (S.phase === "intro") {
    S.intro -= raw;
    if (S.intro <= 0) S.phase = "play";
    return;
  }
  if (S.phase !== "play") return;

  humanInput();
  aiThink(dt);
  moveFighter(P1, dt);
  moveFighter(P2, dt);

  if (S.cooldown > 0) S.cooldown -= dt;
  crownRules();

  if (S.holder === 1) P1.held += dt;
  if (S.holder === 2) P2.held += dt;

  if (P1.held >= S.target) endMatch(1);
  else if (P2.held >= S.target) endMatch(2);
}

function endMatch(who: 1 | 2) {
  S.phase = "over";
  S.winner = who;
  const f = who === 1 ? P1 : P2;
  confetti(f.pos.x, f.pos.y, "#ffd469");
  confetti(f.pos.x, f.pos.y, f.tint);
  S.shake = 14;
  ui.overName.textContent = who === 1 ? "YOU WIN" : "AI WINS";
  ui.overName.style.color = f.tint;
  ui.overSub.textContent =
    "Crown held  " + P1.held.toFixed(1) + "s  vs  " + P2.held.toFixed(1) + "s";
  show(ui.over);
  if (navigator.vibrate) {
    try { navigator.vibrate([30, 50, 30, 50, 100]); } catch (_) {}
  }
}

/* ---------- rendering ---------- */
const cv = document.getElementById("cv") as HTMLCanvasElement;
const ctx = cv.getContext("2d")!;
cv.width = W;
cv.height = H;

const TORCH = [
  { x: TILE * 1.5, y: TILE * 1.5 },
  { x: W - TILE * 1.5, y: TILE * 1.5 },
  { x: TILE * 1.5, y: H - TILE * 1.5 },
  { x: W - TILE * 1.5, y: H - TILE * 1.5 },
];

/* pre-render the static arena once, it never changes */
const floor = document.createElement("canvas");
floor.width = W;
floor.height = H;
(function bakeFloor() {
  const g = floor.getContext("2d")!;
  const bg = g.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.7);
  bg.addColorStop(0, "#231a42");
  bg.addColorStop(1, "#120c26");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  /* floor slabs */
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (isWall(c, r)) continue;
      const x = c * TILE, y = r * TILE;
      g.fillStyle = (c + r) % 2 ? "rgba(255,255,255,0.018)" : "rgba(0,0,0,0.05)";
      g.fillRect(x, y, TILE, TILE);
      g.strokeStyle = "rgba(160,130,255,0.06)";
      g.lineWidth = 1;
      g.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
    }
  }

  /* mosaic ring in the middle, where the crown starts */
  const cx = tileCenter(11, 7).x + TILE / 2;
  const cy = tileCenter(11, 7).y;
  for (let i = 3; i >= 1; i--) {
    g.beginPath();
    g.arc(cx, cy, 26 * i, 0, Math.PI * 2);
    g.strokeStyle = "rgba(255,196,88," + 0.16 / i + ")";
    g.lineWidth = 2;
    g.stroke();
  }

  /* walls: stone block, gold cap, dropped shadow */
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!isWall(c, r)) continue;
      const x = c * TILE, y = r * TILE;
      if (!isWall(c, r + 1)) {
        g.fillStyle = "rgba(0,0,0,0.35)";
        g.fillRect(x, y + TILE, TILE, 12);
      }
      const grad = g.createLinearGradient(x, y, x, y + TILE);
      grad.addColorStop(0, "#463273");
      grad.addColorStop(1, "#2a1c4c");
      g.fillStyle = grad;
      g.fillRect(x, y, TILE, TILE);
      if (!isWall(c, r - 1)) {
        g.fillStyle = "rgba(255,199,102,0.5)";
        g.fillRect(x, y, TILE, 3);
      }
      g.strokeStyle = "rgba(0,0,0,0.25)";
      g.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
    }
  }
})();

function drawTorches() {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < TORCH.length; i++) {
    const t = TORCH[i];
    const fl = 0.82 + Math.sin(S.t * 9 + i * 2.1) * 0.09 + Math.sin(S.t * 23 + i) * 0.05;
    const g = ctx.createRadialGradient(t.x, t.y, 4, t.x, t.y, 250 * fl);
    g.addColorStop(0, "rgba(255,190,110,0.5)");
    g.addColorStop(0.4, "rgba(255,140,60,0.14)");
    g.addColorStop(1, "rgba(255,120,40,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(t.x, t.y, 250 * fl, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,226,170," + (0.7 * fl) + ")";
    ctx.beginPath();
    ctx.arc(t.x, t.y, 4.5 + fl, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFighter(f: Fighter) {
  const isHolder = S.holder === f.id;

  /* motion trail */
  for (const t of f.trail) {
    if (t.a <= 0) continue;
    ctx.globalAlpha = t.a * 0.16;
    ctx.fillStyle = f.tint;
    ctx.beginPath();
    ctx.arc(t.x, t.y, f.r * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  /* ground shadow */
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.ellipse(f.pos.x, f.pos.y + f.r * 0.95, f.r * 0.95, f.r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();

  const squash = f.moving ? 1 + Math.sin(f.bob) * 0.06 : 1;
  const y = f.pos.y - (f.moving ? Math.abs(Math.sin(f.bob)) * 3 : 0);

  /* aura when holding the crown */
  if (isHolder) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(f.pos.x, y, 4, f.pos.x, y, 60);
    g.addColorStop(0, "rgba(255,205,110,0.35)");
    g.addColorStop(1, "rgba(255,205,110,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(f.pos.x, y, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* body */
  ctx.save();
  ctx.translate(f.pos.x, y);
  ctx.scale(1 / squash, squash);
  const bg = ctx.createLinearGradient(0, -f.r, 0, f.r);
  bg.addColorStop(0, f.tint);
  bg.addColorStop(1, f.deep);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(0, 0, f.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.stroke();
  /* eyes look where it walks */
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(f.face * 4 - 2.5, -3, 3, 0, Math.PI * 2);
  ctx.arc(f.face * 4 + 4.5, -3, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a1030";
  ctx.beginPath();
  ctx.arc(f.face * 4 - 2 + f.face, -3, 1.5, 0, Math.PI * 2);
  ctx.arc(f.face * 4 + 5 + f.face, -3, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  /* protection ring right after a steal */
  if (isHolder && S.cooldown > 0) {
    const t = S.cooldown / 1.0;
    ctx.strokeStyle = "rgba(255,255,255," + (0.15 + t * 0.5) + ")";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = -S.t * 40;
    ctx.beginPath();
    ctx.arc(f.pos.x, y, f.r + 8 + (1 - t) * 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (f.flash > 0) {
    ctx.globalAlpha = clamp(f.flash, 0, 1) * 0.8;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(f.pos.x, y, f.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawCrown() {
  const p = crownPos();
  const s = S.holder === 0 ? 1.15 : 1;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 46);
  g.addColorStop(0, "rgba(255,214,120,0.55)");
  g.addColorStop(1, "rgba(255,214,120,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 46, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(s, s);
  if (S.holder === 0) ctx.rotate(Math.sin(S.t * 1.6) * 0.16);
  const gg = ctx.createLinearGradient(0, -10, 0, 8);
  gg.addColorStop(0, "#ffeaa8");
  gg.addColorStop(1, "#e0a52c");
  ctx.fillStyle = gg;
  ctx.beginPath();
  ctx.moveTo(-13, 6);
  ctx.lineTo(-13, -6);
  ctx.lineTo(-6.5, 0);
  ctx.lineTo(0, -10);
  ctx.lineTo(6.5, 0);
  ctx.lineTo(13, -6);
  ctx.lineTo(13, 6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(120,70,10,0.8)";
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = "#ff5d7a";
  ctx.beginPath();
  ctx.arc(0, 2.5, 2.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawParts() {
  for (const p of parts) {
    const a = p.kind === "mote" ? 1 : clamp(p.life / p.max, 0, 1);
    if (p.kind === "ring") {
      const t = 1 - p.life / p.max;
      ctx.strokeStyle = p.col;
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.lineWidth = 4 * (1 - t) + 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size + easeOut(t) * 90, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      continue;
    }
    ctx.globalAlpha = a;
    ctx.fillStyle = p.col;
    if (p.kind === "confetti") {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot!);
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (p.kind === "spark" ? a : 1), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawHud() {
  const barW = 320, barH = 16;
  const rows: [Fighter, number, string][] = [
    [P1, 24, "left"],
    [P2, W - 24 - barW, "right"],
  ];
  ctx.font = "700 16px 'Barlow Condensed', system-ui, sans-serif";
  for (const [f, x, align] of rows) {
    const pct = clamp(f.held / S.target, 0, 1);
    ctx.fillStyle = "rgba(10,6,22,0.7)";
    ctx.fillRect(x, 24, barW, barH);
    const g = ctx.createLinearGradient(x, 0, x + barW, 0);
    g.addColorStop(0, f.deep);
    g.addColorStop(1, f.tint);
    ctx.fillStyle = g;
    ctx.fillRect(x, 24, barW * pct, barH);
    if (pct > 0.8) {
      ctx.globalAlpha = 0.35 + Math.sin(S.t * 12) * 0.3;
      ctx.fillStyle = "#fff";
      ctx.fillRect(x, 24, barW * pct, barH);
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, 24.5, barW - 1, barH - 1);

    ctx.fillStyle = f.tint;
    ctx.textAlign = align as CanvasTextAlign;
    const lx = align === "left" ? x : x + barW;
    ctx.fillText(
      (f.id === 1 ? "YOU" : "AI [" + ai.state.toUpperCase() + "]") +
        "   " + f.held.toFixed(1) + " / " + S.target + "s",
      lx, 18
    );
    if (S.holder === f.id) {
      ctx.fillStyle = "#ffd469";
      ctx.textAlign = "center";
      ctx.font = "700 15px 'Cinzel', Georgia, serif";
      ctx.fillText("★ WEARING THE CROWN ★", x + barW / 2, 58);
      ctx.font = "700 16px 'Barlow Condensed', system-ui, sans-serif";
    }
  }
  ctx.textAlign = "center";
}

function drawIntro() {
  const left = S.intro;
  let txt = "";
  let k = 0;
  if (left > 2) { txt = "3"; k = left - 2; }
  else if (left > 1) { txt = "2"; k = left - 1; }
  else if (left > 0.35) { txt = "1"; k = left - 0.35; }
  else { txt = "CLAIM THE CROWN"; k = left / 0.35; }
  const t = 1 - clamp(k, 0, 1);
  ctx.save();
  ctx.globalAlpha = clamp(1 - t * t, 0, 1);
  ctx.translate(W / 2, H / 2);
  ctx.scale(1 + t * 0.9, 1 + t * 0.9);
  ctx.fillStyle = "#ffe9b0";
  ctx.font = "700 " + (txt.length > 2 ? 46 : 120) + "px 'Cinzel', Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(255,180,60,0.8)";
  ctx.shadowBlur = 40;
  ctx.fillText(txt, 0, 0);
  ctx.restore();
  ctx.textBaseline = "alphabetic";
}

function drawDebug() {
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 2;
  if (ai.path.length) {
    ctx.beginPath();
    ctx.moveTo(P2.pos.x, P2.pos.y);
    for (const p of ai.path) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    for (const p of ai.path) {
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
  }
  if (ai.goal) {
    ctx.strokeStyle = "#2fd6a5";
    ctx.beginPath();
    ctx.arc(ai.goal.x, ai.goal.y, 10, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const sx = S.shake ? rand(-S.shake, S.shake) : 0;
  const sy = S.shake ? rand(-S.shake, S.shake) : 0;
  ctx.translate(sx, sy);

  ctx.drawImage(floor, 0, 0);
  drawTorches();

  drawParts();

  if (S.holder === 0) drawCrown();
  const order = S.holder === 1 ? [P2, P1] : [P1, P2];
  for (const f of order) drawFighter(f);
  if (S.holder !== 0) drawCrown();

  /* vignette */
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.72);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.62)");
  ctx.fillStyle = v;
  ctx.fillRect(-40, -40, W + 80, H + 80);

  if (S.debug) drawDebug();
  drawHud();
  if (S.phase === "intro") drawIntro();

  if (S.flashWhite > 0) {
    ctx.fillStyle = "rgba(255,255,255," + S.flashWhite + ")";
    ctx.fillRect(-40, -40, W + 80, H + 80);
  }
}

/* ---------- ui plumbing ---------- */
const stageEl = document.getElementById("stage") as HTMLElement;
const ui = {
  menu: document.getElementById("menu")!,
  over: document.getElementById("over")!,
  pause: document.getElementById("pause")!,
  overName: document.getElementById("overName")!,
  overSub: document.getElementById("overSub")!,
};
function show(el: HTMLElement) { el.classList.add("on"); }
function hide(el: HTMLElement) { el.classList.remove("on"); }

function resetMatch() {
  P1.pos = { ...tileCenter(2, 7) };
  P2.pos = { ...tileCenter(21, 7) };
  P1.vel = { x: 0, y: 0 };
  P2.vel = { x: 0, y: 0 };
  P1.held = 0;
  P2.held = 0;
  P1.speed = PLAYER_SPEED;
  P2.speed = AI_SPEED;
  P1.trail = [];
  P2.trail = [];
  S.holder = 0;
  S.crown = { ...tileCenter(11, 7), x: tileCenter(11, 7).x + TILE / 2 };
  S.cooldown = 0;
  S.winner = 0;
  S.timeScale = 1;
  ai.state = "seek";
  ai.pendingState = "seek";
  ai.path = [];
  ai.goal = null;
  ai.reactT = 0;
  ai.repathT = 0;
  parts = parts.filter((p) => p.kind === "mote");
  S.intro = 3.35;
  S.phase = "intro";
  hide(ui.menu);
  hide(ui.over);
  hide(ui.pause);
  ring(S.crown.x, S.crown.y, "#ffd469", 10);
  if (navigator.vibrate) {
    try { navigator.vibrate(20); } catch (_) {}
  }
}

document.querySelectorAll<HTMLElement>("[data-target]").forEach((b) => {
  b.onclick = () => {
    S.target = Number(b.dataset.target);
    document.querySelectorAll("[data-target]").forEach((o) => o.classList.remove("sel"));
    b.classList.add("sel");
    if (navigator.vibrate) try { navigator.vibrate(10); } catch (_) {}
  };
});
document.querySelectorAll<HTMLElement>("[data-diff]").forEach((b) => {
  b.onclick = () => {
    S.diff = b.dataset.diff as any;
    document.querySelectorAll("[data-diff]").forEach((o) => o.classList.remove("sel"));
    b.classList.add("sel");
    if (navigator.vibrate) try { navigator.vibrate(10); } catch (_) {}
  };
});
(document.getElementById("play") as HTMLElement).onclick = resetMatch;
(document.getElementById("again") as HTMLElement).onclick = resetMatch;
(document.getElementById("resume") as HTMLElement).onclick = () => {
  S.phase = "play";
  hide(ui.pause);
};
(document.getElementById("quit") as HTMLElement).onclick = () => {
  S.phase = "menu";
  hide(ui.pause);
  show(ui.menu);
};

/* In-game Touch HUD Actions */
const pauseBtn = document.getElementById("btn-pause") as HTMLElement;
pauseBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
pauseBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (S.phase === "play" || S.phase === "intro") {
    S.phase = "pause";
    show(ui.pause);
  } else if (S.phase === "pause") {
    S.phase = "play";
    hide(ui.pause);
  }
  if (navigator.vibrate) try { navigator.vibrate(10); } catch (_) {}
});

const fullscreenBtn = document.getElementById("btn-fullscreen") as HTMLElement;
fullscreenBtn.addEventListener("pointerdown", (e) => e.stopPropagation());
fullscreenBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (!document.fullscreenElement) {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }
  if (navigator.vibrate) try { navigator.vibrate(10); } catch (_) {}
});

addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (k === "g") S.debug = !S.debug;
  if (k === "r" && S.phase !== "menu") resetMatch();
  if (k === "escape" || k === "p") {
    if (S.phase === "play") { S.phase = "pause"; show(ui.pause); }
    else if (S.phase === "pause") { S.phase = "play"; hide(ui.pause); }
  }
  if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].indexOf(k) >= 0)
    e.preventDefault();
});
addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });

/* ---------- Virtual Joystick Controller ---------- */
function initJoystick() {
  const base = joystick.baseEl;
  const thumb = joystick.thumbEl;

  function resetStickVisuals() {
    joystick.active = false;
    joystick.pointerId = null;
    joystick.x = 0;
    joystick.y = 0;
    base.classList.remove("active");
    thumb.classList.add("released");
    thumb.style.transform = "translate(0px, 0px)";
    base.style.left = "";
    base.style.bottom = "";
    base.style.top = "";
    base.style.right = "";
  }

  function onPointerDown(e: PointerEvent) {
    if ((e.target as HTMLElement).closest(".hud-btn") || (e.target as HTMLElement).closest(".layer.on"))
      return;

    const stageRect = stageEl.getBoundingClientRect();
    const touchX = e.clientX - stageRect.left;
    const touchY = e.clientY - stageRect.top;

    /* Allow joystick engagement on left 65% of the stage or directly on the joystick base */
    const isNearBase = e.target === base || base.contains(e.target as Node);
    const isLeftZone = touchX <= stageRect.width * 0.65;

    if (!isNearBase && !isLeftZone)
      return;

    joystick.active = true;
    joystick.pointerId = e.pointerId;
    base.classList.add("active");
    thumb.classList.remove("released");

    /* If touching left zone away from base, dynamically position joystick base centered under thumb */
    if (!isNearBase && isLeftZone) {
      const baseW = base.offsetWidth || 120;
      const baseH = base.offsetHeight || 120;
      const clampedCenterX = clamp(touchX, baseW / 2 + 10, stageRect.width * 0.65 - baseW / 2);
      const clampedCenterY = clamp(touchY, baseH / 2 + 10, stageRect.height - baseH / 2 - 10);
      base.style.left = (clampedCenterX - baseW / 2) + "px";
      base.style.top = (clampedCenterY - baseH / 2) + "px";
      base.style.bottom = "auto";
    }

    const baseRect = base.getBoundingClientRect();
    joystick.baseCenter = {
      x: baseRect.left + baseRect.width / 2,
      y: baseRect.top + baseRect.height / 2,
    };
    joystick.maxRadius = (baseRect.width / 2) * 0.78;

    updateThumb(e.clientX, e.clientY);
    stageEl.setPointerCapture(e.pointerId);

    if (navigator.vibrate) {
      try { navigator.vibrate(10); } catch (_) {}
    }
  }

  function updateThumb(clientX: number, clientY: number) {
    const dx = clientX - joystick.baseCenter.x;
    const dy = clientY - joystick.baseCenter.y;
    const distance = Math.hypot(dx, dy);
    const maxR = joystick.maxRadius || 46;
    const clampedDist = Math.min(distance, maxR);
    const angle = Math.atan2(dy, dx);

    const tx = Math.cos(angle) * clampedDist;
    const ty = Math.sin(angle) * clampedDist;
    thumb.style.transform = "translate(" + tx.toFixed(1) + "px, " + ty.toFixed(1) + "px)";

    const normDist = clampedDist / maxR;
    if (normDist > 0.08) {
      joystick.x = Math.cos(angle) * normDist;
      joystick.y = Math.sin(angle) * normDist;
    } else {
      joystick.x = 0;
      joystick.y = 0;
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!joystick.active || e.pointerId !== joystick.pointerId)
      return;
    updateThumb(e.clientX, e.clientY);
  }

  function onPointerUp(e: PointerEvent) {
    if (!joystick.active || e.pointerId !== joystick.pointerId)
      return;
    resetStickVisuals();
  }

  stageEl.addEventListener("pointerdown", onPointerDown, { passive: false });
  stageEl.addEventListener("pointermove", onPointerMove, { passive: false });
  stageEl.addEventListener("pointerup", onPointerUp, { passive: false });
  stageEl.addEventListener("pointercancel", onPointerUp, { passive: false });
}
initJoystick();

/* ---------- loop ---------- */
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}
show(ui.menu);
requestAnimationFrame(frame);
