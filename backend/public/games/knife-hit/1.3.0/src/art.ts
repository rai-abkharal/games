import { BOARD_R, KNIVES, KnifeDef, mulberry32 } from './config';

export const S = 2;                       // texture oversampling (drawn at 2x, displayed at 0.5)
export const BOARD_TEX = (BOARD_R + 26) * 2 * S;
export const KNIFE_W = 30 * S;
export const KNIFE_H = 116 * S;
export const KNIFE_TIP_Y = 4 * S;

type Ctx = CanvasRenderingContext2D;

function canvasTex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: Ctx) => void): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  ctx.save();
  draw(ctx);
  ctx.restore();
  tex.refresh();
}

function circle(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.closePath();
}

function radial(ctx: Ctx, x: number, y: number, r: number, stops: [number, string][]): CanvasGradient {
  const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.05, x, y, r);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** soft drop shadow + rim glow applied to whatever path is current */
function shadowedFill(ctx: Ctx, fill: string | CanvasGradient, blur: number, color = 'rgba(0,0,0,0.45)'): void {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = blur * 0.35;
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

function glossy(ctx: Ctx, cx: number, cy: number, r: number, strength = 0.28): void {
  // top-left specular sheen
  ctx.save();
  circle(ctx, cx, cy, r);
  ctx.clip();
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.45, r * 0.05, cx - r * 0.2, cy - r * 0.2, r * 1.1);
  g.addColorStop(0, `rgba(255,255,255,${strength})`);
  g.addColorStop(0.5, 'rgba(255,255,255,0.03)');
  g.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

// ------------------------------------------------------------------ boards
type BoardPainter = (ctx: Ctx, cx: number, cy: number, r: number, rng: () => number) => void;

const paintLog: BoardPainter = (ctx, cx, cy, r, rng) => {
  // --- chunky bark ring with a jagged cartoon edge
  const edge = (rr: number, amp: number, n: number, seed: number) => {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const w = rr * (1 + Math.sin(i * 2.7 + seed) * amp * 0.5 + Math.sin(i * 5.3 + seed * 2) * amp * 0.5);
      const x = cx + Math.cos(a) * w, y = cy + Math.sin(a) * w;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
  };
  edge(r, 0.035, 56, 1);
  shadowedFill(ctx, radial(ctx, cx, cy, r, [[0, '#7a4a27'], [0.75, '#5a3118'], [1, '#3a1d0d']]), 22);
  ctx.save();
  edge(r, 0.035, 56, 1);
  ctx.clip();
  // bark plates
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2 + rng() * 0.05;
    const len = r * (0.12 + rng() * 0.05);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    roundRect(ctx, r - len - 6, -9 - rng() * 4, len, 14 + rng() * 6, 5);
    ctx.fillStyle = rng() < 0.5 ? 'rgba(120,75,40,0.55)' : 'rgba(40,18,6,0.5)';
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  edge(r, 0.035, 56, 1);
  ctx.strokeStyle = '#2a1408';
  ctx.lineWidth = 7;
  ctx.stroke();

  // --- wood face (slightly wobbly cut) with bold cartoon rings
  const face = r * 0.86;
  edge(face, 0.012, 64, 3);
  ctx.fillStyle = radial(ctx, cx, cy, face, [[0, '#f6d29a'], [0.55, '#e9b872'], [1, '#c98f4c']]);
  ctx.fill();
  ctx.save();
  edge(face, 0.012, 64, 3);
  ctx.clip();
  // ring bands
  const bands = 9;
  for (let i = bands; i >= 1; i--) {
    const rr = (i / bands) * face * 0.96;
    ctx.beginPath();
    for (let k = 0; k <= 80; k++) {
      const a = (k / 80) * Math.PI * 2;
      const w = rr + Math.sin(a * 2 + i * 0.7) * rr * 0.03 + Math.cos(a * 5 - i) * rr * 0.015;
      const x = cx + Math.cos(a) * w, y = cy + Math.sin(a) * w;
      k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = i % 2 ? 'rgba(200,140,80,0.32)' : 'rgba(255,230,180,0.35)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,70,30,0.6)';
    ctx.lineWidth = i % 2 ? 5 : 3;
    ctx.stroke();
  }
  // heart knot
  circle(ctx, cx, cy, face * 0.07);
  ctx.fillStyle = '#a5683a';
  ctx.fill();
  // cracks
  ctx.strokeStyle = 'rgba(80,40,15,0.75)';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (let i = 0; i < 2; i++) {
    const a = rng() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * face * 0.2, cy + Math.sin(a) * face * 0.2);
    ctx.quadraticCurveTo(cx + Math.cos(a + 0.18) * face * 0.5, cy + Math.sin(a + 0.18) * face * 0.5, cx + Math.cos(a + 0.06) * face * 0.96, cy + Math.sin(a + 0.06) * face * 0.96);
    ctx.stroke();
  }
  // fine grain flecks
  for (let i = 0; i < 160; i++) {
    const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * face * 0.95;
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 4 + rng() * 6, 1.2, a + Math.PI / 2, 0, Math.PI * 2);
    ctx.fillStyle = rng() < 0.5 ? 'rgba(255,240,200,0.35)' : 'rgba(110,60,20,0.2)';
    ctx.fill();
  }
  ctx.restore();
  // inner face outline + inner shadow lip
  edge(face, 0.012, 64, 3);
  ctx.strokeStyle = '#4a2a12';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.save();
  edge(face, 0.012, 64, 3);
  ctx.clip();
  const lip = ctx.createRadialGradient(cx, cy, face * 0.8, cx, cy, face);
  lip.addColorStop(0, 'rgba(0,0,0,0)');
  lip.addColorStop(1, 'rgba(60,30,10,0.45)');
  ctx.fillStyle = lip;
  ctx.fillRect(cx - face, cy - face, face * 2, face * 2);
  ctx.restore();
  glossy(ctx, cx, cy, face, 0.2);
};

const paintCheese: BoardPainter = (ctx, cx, cy, r, rng) => {
  circle(ctx, cx, cy, r);
  shadowedFill(ctx, radial(ctx, cx, cy, r, [[0, '#f7c94a'], [1, '#c98f1c']]), 18);
  circle(ctx, cx, cy, r * 0.93);
  ctx.fillStyle = radial(ctx, cx, cy, r * 0.93, [[0, '#ffe680'], [0.7, '#fdd75a'], [1, '#e8b93a']]);
  ctx.fill();
  // holes
  const holes = 11;
  for (let i = 0; i < holes; i++) {
    const a = rng() * Math.PI * 2, d = rng() * r * 0.75, hr = 12 + rng() * 22;
    const hx = cx + Math.cos(a) * d, hy = cy + Math.sin(a) * d;
    circle(ctx, hx, hy, hr);
    const g = ctx.createRadialGradient(hx + hr * 0.3, hy + hr * 0.35, hr * 0.1, hx, hy, hr);
    g.addColorStop(0, '#fbd66a');
    g.addColorStop(0.7, '#d9a52e');
    g.addColorStop(1, '#b8841a');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,240,170,0.6)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  glossy(ctx, cx, cy, r * 0.93, 0.3);
};

const paintCookie: BoardPainter = (ctx, cx, cy, r, rng) => {
  ctx.beginPath();
  const n = 60;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.97 + Math.sin(i * 2.3) * 0.02 + rng() * 0.015);
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
  shadowedFill(ctx, radial(ctx, cx, cy, r, [[0, '#e3a85e'], [0.7, '#cf8d43'], [1, '#a5642a']]), 18);
  // crumb texture
  for (let i = 0; i < 260; i++) {
    const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * r * 0.95;
    circle(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1.5 + rng() * 2.5);
    ctx.fillStyle = rng() < 0.5 ? 'rgba(255,220,160,0.35)' : 'rgba(120,60,20,0.25)';
    ctx.fill();
  }
  // choc chips
  for (let i = 0; i < 16; i++) {
    const a = rng() * Math.PI * 2, d = rng() * r * 0.82;
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d, cr = 10 + rng() * 9;
    ctx.beginPath();
    for (let k = 0; k <= 8; k++) {
      const aa = (k / 8) * Math.PI * 2;
      const rr = cr * (0.8 + rng() * 0.35);
      k ? ctx.lineTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr) : ctx.moveTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr);
    }
    ctx.closePath();
    shadowedFill(ctx, radial(ctx, x, y, cr, [[0, '#6a3a1f'], [1, '#2d150a']]), 6, 'rgba(0,0,0,0.5)');
  }
  glossy(ctx, cx, cy, r, 0.18);
};

const paintPizza: BoardPainter = (ctx, cx, cy, r, rng) => {
  circle(ctx, cx, cy, r);
  shadowedFill(ctx, radial(ctx, cx, cy, r, [[0, '#f0c070'], [0.8, '#d9973f'], [1, '#a66622']]), 18);
  // crust bubbles
  for (let i = 0; i < 40; i++) {
    const a = rng() * Math.PI * 2, d = r * (0.86 + rng() * 0.1);
    circle(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 3 + rng() * 5);
    ctx.fillStyle = rng() < 0.5 ? 'rgba(120,60,10,0.35)' : 'rgba(255,230,170,0.4)';
    ctx.fill();
  }
  // sauce
  circle(ctx, cx, cy, r * 0.83);
  ctx.fillStyle = '#c8321c';
  ctx.fill();
  // cheese mottled
  circle(ctx, cx, cy, r * 0.79);
  ctx.fillStyle = radial(ctx, cx, cy, r * 0.79, [[0, '#ffe58a'], [1, '#f2b93c']]);
  ctx.fill();
  for (let i = 0; i < 90; i++) {
    const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * r * 0.76;
    circle(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 4 + rng() * 10);
    ctx.fillStyle = rng() < 0.6 ? 'rgba(255,245,200,0.45)' : 'rgba(210,120,30,0.28)';
    ctx.fill();
  }
  // pepperoni
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rng() * 0.4, d = r * (0.28 + rng() * 0.42);
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d, pr = 22 + rng() * 6;
    circle(ctx, x, y, pr);
    shadowedFill(ctx, radial(ctx, x, y, pr, [[0, '#d64b3a'], [1, '#8f1f14']]), 6, 'rgba(0,0,0,0.4)');
    for (let k = 0; k < 6; k++) {
      circle(ctx, x + (rng() - 0.5) * pr * 1.2, y + (rng() - 0.5) * pr * 1.2, 1.8 + rng() * 2);
      ctx.fillStyle = 'rgba(80,10,5,0.55)';
      ctx.fill();
    }
  }
  // basil
  for (let i = 0; i < 7; i++) {
    const a = rng() * Math.PI * 2, d = rng() * r * 0.7;
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rng() * Math.PI);
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 7, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#3f8f3a';
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,60,20,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.lineTo(12, 0);
    ctx.stroke();
    ctx.restore();
  }
  glossy(ctx, cx, cy, r, 0.14);
};

const paintTire: BoardPainter = (ctx, cx, cy, r) => {
  circle(ctx, cx, cy, r);
  shadowedFill(ctx, radial(ctx, cx, cy, r, [[0, '#4a4f57'], [0.8, '#23262b'], [1, '#111214']]), 20);
  // tread notches
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    roundRect(ctx, r * 0.84, -7, r * 0.15, 14, 5);
    ctx.fill();
    ctx.restore();
  }
  // sidewall ring
  circle(ctx, cx, cy, r * 0.8);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 4;
  ctx.stroke();
  // rim
  circle(ctx, cx, cy, r * 0.6);
  shadowedFill(ctx, radial(ctx, cx, cy, r * 0.6, [[0, '#f3f5f8'], [0.5, '#bfc6d0'], [1, '#6e7682']]), 10);
  // spokes
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const n = a + Math.PI / 5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.18, cy + Math.sin(a) * r * 0.18);
    ctx.lineTo(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55);
    ctx.lineTo(cx + Math.cos(n) * r * 0.55, cy + Math.sin(n) * r * 0.55);
    ctx.lineTo(cx + Math.cos(n) * r * 0.18, cy + Math.sin(n) * r * 0.18);
    ctx.closePath();
    ctx.fillStyle = 'rgba(40,45,55,0.85)';
    ctx.fill();
  }
  circle(ctx, cx, cy, r * 0.17);
  shadowedFill(ctx, radial(ctx, cx, cy, r * 0.17, [[0, '#e8ebef'], [1, '#8a919c']]), 8);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    circle(ctx, cx + Math.cos(a) * r * 0.1, cy + Math.sin(a) * r * 0.1, 4);
    ctx.fillStyle = '#3a3f47';
    ctx.fill();
  }
  glossy(ctx, cx, cy, r, 0.16);
};

const paintMelon: BoardPainter = (ctx, cx, cy, r, rng) => {
  circle(ctx, cx, cy, r);
  shadowedFill(ctx, radial(ctx, cx, cy, r, [[0, '#4faa4a'], [1, '#1f6b2a']]), 18);
  // rind stripes
  ctx.save();
  circle(ctx, cx, cy, r);
  ctx.clip();
  ctx.strokeStyle = 'rgba(15,70,25,0.55)';
  ctx.lineWidth = 9;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * 0.88, cy + Math.sin(a) * r * 0.88);
    ctx.quadraticCurveTo(cx + Math.cos(a + 0.12) * r * 0.95, cy + Math.sin(a + 0.12) * r * 0.95, cx + Math.cos(a + 0.05) * r * 1.05, cy + Math.sin(a + 0.05) * r * 1.05);
    ctx.stroke();
  }
  ctx.restore();
  circle(ctx, cx, cy, r * 0.87);
  ctx.fillStyle = '#eaf7d8';
  ctx.fill();
  circle(ctx, cx, cy, r * 0.8);
  ctx.fillStyle = radial(ctx, cx, cy, r * 0.8, [[0, '#ff7d8a'], [0.6, '#f4485e'], [1, '#e0304a']]);
  ctx.fill();
  // seeds
  for (let i = 0; i < 22; i++) {
    const a = rng() * Math.PI * 2, d = r * (0.25 + rng() * 0.5);
    ctx.save();
    ctx.translate(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
    ctx.rotate(a + Math.PI / 2);
    ctx.beginPath();
    ctx.ellipse(0, 0, 4.5, 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#2a1a1a';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-1.5, -2.5, 1.5, 2.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fill();
    ctx.restore();
  }
  glossy(ctx, cx, cy, r * 0.8, 0.22);
};

const paintDonut: BoardPainter = (ctx, cx, cy, r, rng) => {
  circle(ctx, cx, cy, r);
  shadowedFill(ctx, radial(ctx, cx, cy, r, [[0, '#f0c27c'], [1, '#c08a3e']]), 18);
  // frosting with wavy inner + outer edge
  ctx.beginPath();
  const n = 64;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.9 + Math.sin(a * 9) * 0.035);
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
  shadowedFill(ctx, radial(ctx, cx, cy, r * 0.9, [[0, '#ffb6dc'], [0.7, '#ff86c6'], [1, '#e85aa6']]), 8, 'rgba(120,20,80,0.4)');
  // sprinkles
  const cols = ['#fff35c', '#5ce1ff', '#7bff8a', '#ff6b6b', '#ffffff', '#b28dff'];
  for (let i = 0; i < 60; i++) {
    const a = rng() * Math.PI * 2, d = r * (0.36 + rng() * 0.48);
    ctx.save();
    ctx.translate(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
    ctx.rotate(rng() * Math.PI);
    roundRect(ctx, -9, -3, 18, 6, 3);
    ctx.fillStyle = cols[Math.floor(rng() * cols.length)];
    ctx.fill();
    ctx.restore();
  }
  // hole (punch through)
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  circle(ctx, cx, cy, r * 0.27);
  ctx.fill();
  ctx.restore();
  circle(ctx, cx, cy, r * 0.3);
  ctx.strokeStyle = 'rgba(120,40,90,0.35)';
  ctx.lineWidth = 6;
  ctx.stroke();
  glossy(ctx, cx, cy, r * 0.9, 0.25);
};

const paintClock: BoardPainter = (ctx, cx, cy, r) => {
  circle(ctx, cx, cy, r);
  shadowedFill(ctx, radial(ctx, cx, cy, r, [[0, '#ffe9a8'], [0.6, '#e0b04a'], [1, '#8c621a']]), 18);
  circle(ctx, cx, cy, r * 0.88);
  ctx.fillStyle = radial(ctx, cx, cy, r * 0.88, [[0, '#ffffff'], [0.85, '#f1f1f4'], [1, '#c9ccd6']]);
  ctx.fill();
  // ticks
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
    const big = i % 5 === 0;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r * (big ? 0.72 : 0.78), cy + Math.sin(a) * r * (big ? 0.72 : 0.78));
    ctx.lineTo(cx + Math.cos(a) * r * 0.83, cy + Math.sin(a) * r * 0.83);
    ctx.strokeStyle = big ? '#222' : '#888';
    ctx.lineWidth = big ? 5 : 2;
    ctx.stroke();
  }
  ctx.fillStyle = '#1c1c22';
  ctx.font = `bold ${Math.round(r * 0.2)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const nums: [string, number][] = [['12', -Math.PI / 2], ['3', 0], ['6', Math.PI / 2], ['9', Math.PI]];
  for (const [t, a] of nums) ctx.fillText(t, cx + Math.cos(a) * r * 0.58, cy + Math.sin(a) * r * 0.58);
  // hands
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1c1c22';
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(-Math.PI / 2 + 0.9) * r * 0.42, cy + Math.sin(-Math.PI / 2 + 0.9) * r * 0.42);
  ctx.stroke();
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(-Math.PI / 2 - 2.2) * r * 0.62, cy + Math.sin(-Math.PI / 2 - 2.2) * r * 0.62);
  ctx.stroke();
  ctx.strokeStyle = '#d63b3b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(-Math.PI / 2 + 2.6) * r * 0.7, cy + Math.sin(-Math.PI / 2 + 2.6) * r * 0.7);
  ctx.stroke();
  circle(ctx, cx, cy, 10);
  ctx.fillStyle = '#d63b3b';
  ctx.fill();
  glossy(ctx, cx, cy, r * 0.88, 0.3);
};

const paintGear: BoardPainter = (ctx, cx, cy, r) => {
  const teeth = 18;
  ctx.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const step = (Math.PI * 2) / teeth;
    const pts: [number, number][] = [
      [a0, r * 0.9], [a0 + step * 0.18, r], [a0 + step * 0.5, r], [a0 + step * 0.68, r * 0.9],
    ];
    for (const [a, rr] of pts) {
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      i === 0 && a === a0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  shadowedFill(ctx, radial(ctx, cx, cy, r, [[0, '#d7dde6'], [0.6, '#98a3b3'], [1, '#4f5a68']]), 18);
  // brushed rings
  for (let i = 0; i < 18; i++) {
    circle(ctx, cx, cy, r * (0.3 + i * 0.03));
    ctx.strokeStyle = i % 2 ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  // cut-outs
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const x = cx + Math.cos(a) * r * 0.55, y = cy + Math.sin(a) * r * 0.55;
    circle(ctx, x, y, r * 0.11);
    const g = ctx.createRadialGradient(x, y, 2, x, y, r * 0.11);
    g.addColorStop(0, '#2b3038');
    g.addColorStop(1, '#151920');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  circle(ctx, cx, cy, r * 0.24);
  shadowedFill(ctx, radial(ctx, cx, cy, r * 0.24, [[0, '#eef2f7'], [1, '#7b8593']]), 8);
  circle(ctx, cx, cy, r * 0.09);
  ctx.fillStyle = '#20252d';
  ctx.fill();
  glossy(ctx, cx, cy, r, 0.2);
};

const paintCrystal: BoardPainter = (ctx, cx, cy, r, rng) => {
  const sides = 12;
  const pts: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const rr = r * (i % 2 ? 0.94 : 1);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  shadowedFill(ctx, radial(ctx, cx, cy, r, [[0, '#dff8ff'], [0.5, '#7fd3f7'], [1, '#2a7fc0']]), 22, 'rgba(60,180,255,0.6)');
  // facets
  for (let i = 0; i < sides; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % sides];
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.closePath();
    ctx.fillStyle = `rgba(255,255,255,${0.04 + (i % 3) * 0.08})`;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  // inner core
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const x = cx + Math.cos(a) * r * 0.42, y = cy + Math.sin(a) * r * 0.42;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = radial(ctx, cx, cy, r * 0.42, [[0, 'rgba(255,255,255,0.9)'], [1, 'rgba(120,200,255,0.2)']]);
  ctx.fill();
  // sparkles
  for (let i = 0; i < 14; i++) {
    const a = rng() * Math.PI * 2, d = rng() * r * 0.85;
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d, s = 4 + rng() * 8;
    ctx.beginPath();
    ctx.moveTo(x - s, y); ctx.lineTo(x, y - s * 0.3); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s * 0.3);
    ctx.closePath();
    ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.3, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.3, y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fill();
  }
  glossy(ctx, cx, cy, r, 0.3);
};

const PAINTERS: BoardPainter[] = [paintLog, paintCheese, paintCookie, paintPizza, paintTire, paintMelon, paintDonut, paintClock, paintGear, paintCrystal];

export function boardKey(i: number): string { return `board${i}`; }

export function buildBoard(scene: Phaser.Scene, i: number): void {
  canvasTex(scene, boardKey(i), BOARD_TEX, BOARD_TEX, (ctx) => {
    PAINTERS[i](ctx, BOARD_TEX / 2, BOARD_TEX / 2, BOARD_R * S, mulberry32(101 + i));
  });
}

// ------------------------------------------------------------------ knives
function bladePath(ctx: Ctx, shape: KnifeDef['shape'], w: number, tip: number, end: number): void {
  const c = w / 2;
  ctx.beginPath();
  switch (shape) {
    case 'dagger':
      ctx.moveTo(c, tip);
      ctx.quadraticCurveTo(c + 16 * S, end * 0.45, c + 14 * S, end);
      ctx.lineTo(c - 14 * S, end);
      ctx.quadraticCurveTo(c - 16 * S, end * 0.45, c, tip);
      break;
    case 'chef':
      ctx.moveTo(c - 2 * S, tip);
      ctx.quadraticCurveTo(c + 20 * S, end * 0.45, c + 15 * S, end);
      ctx.lineTo(c - 12 * S, end);
      ctx.lineTo(c - 12 * S, tip + 30 * S);
      ctx.quadraticCurveTo(c - 12 * S, tip + 8 * S, c - 2 * S, tip);
      break;
    case 'cleaver':
      ctx.moveTo(c - 8 * S, tip + 2 * S);
      ctx.lineTo(c + 8 * S, tip);
      ctx.lineTo(c + 19 * S, tip + 22 * S);
      ctx.lineTo(c + 19 * S, end);
      ctx.lineTo(c - 15 * S, end);
      ctx.lineTo(c - 15 * S, tip + 16 * S);
      break;
    case 'kunai':
      ctx.moveTo(c, tip);
      ctx.lineTo(c + 17 * S, end * 0.72);
      ctx.lineTo(c + 7 * S, end);
      ctx.lineTo(c - 7 * S, end);
      ctx.lineTo(c - 17 * S, end * 0.72);
      break;
    case 'katana':
      ctx.moveTo(c + 2 * S, tip);
      ctx.quadraticCurveTo(c + 12 * S, end * 0.5, c + 10 * S, end);
      ctx.lineTo(c - 8 * S, end);
      ctx.quadraticCurveTo(c - 9 * S, end * 0.5, c + 2 * S, tip);
      break;
    case 'crystal':
      ctx.moveTo(c, tip);
      ctx.lineTo(c + 12 * S, tip + 26 * S);
      ctx.lineTo(c + 15 * S, end * 0.6);
      ctx.lineTo(c + 11 * S, end);
      ctx.lineTo(c - 11 * S, end);
      ctx.lineTo(c - 15 * S, end * 0.6);
      ctx.lineTo(c - 12 * S, tip + 26 * S);
      break;
  }
  ctx.closePath();
}

export function knifeKey(i: number): string { return i < 0 ? 'knife_pre' : `knife${i}`; }

export function buildKnife(scene: Phaser.Scene, i: number): void {
  const def: KnifeDef = i < 0
    ? { name: 'pre', unlock: 0, shape: 'dagger', blade: ['#6b727b', '#c3c9d1', '#565c64'], handle: ['#4a4e55', '#24272c'], guard: '#7b828b' }
    : KNIVES[i];
  canvasTex(scene, knifeKey(i), KNIFE_W, KNIFE_H, (ctx) => {
    const w = KNIFE_W, c = w / 2;
    const tip = KNIFE_TIP_Y;
    const bladeEnd = 66 * S;
    const guardH = 7 * S;
    const handleEnd = KNIFE_H - 4 * S;

    // drop shadow for whole knife
    ctx.save();
    ctx.shadowColor = def.glow ? def.glow : 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = def.glow ? 18 : 8;
    ctx.shadowOffsetY = def.glow ? 0 : 4;

    // handle
    const hg = ctx.createLinearGradient(c - 12 * S, 0, c + 12 * S, 0);
    hg.addColorStop(0, def.handle[1]);
    hg.addColorStop(0.35, def.handle[0]);
    hg.addColorStop(0.65, def.handle[0]);
    hg.addColorStop(1, def.handle[1]);
    roundRect(ctx, c - 10 * S, bladeEnd + guardH - 2 * S, 20 * S, handleEnd - bladeEnd - guardH, 7 * S);
    ctx.fillStyle = hg;
    ctx.fill();
    ctx.restore();

    // handle detail: wraps or rivets
    ctx.save();
    roundRect(ctx, c - 10 * S, bladeEnd + guardH - 2 * S, 20 * S, handleEnd - bladeEnd - guardH, 7 * S);
    ctx.clip();
    if (def.shape === 'katana') {
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 3 * S;
      for (let y = bladeEnd + guardH + 6 * S; y < handleEnd; y += 8 * S) {
        ctx.beginPath();
        ctx.moveTo(c - 12 * S, y);
        ctx.lineTo(c + 12 * S, y + 6 * S);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(c + 12 * S, y);
        ctx.lineTo(c - 12 * S, y + 6 * S);
        ctx.stroke();
      }
    } else {
      for (let k = 0; k < 3; k++) {
        const y = bladeEnd + guardH + 12 * S + k * 13 * S;
        circle(ctx, c, y, 2.6 * S);
        ctx.fillStyle = def.guard;
        ctx.fill();
        circle(ctx, c - 0.7 * S, y - 0.7 * S, 1.1 * S);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fill();
      }
    }
    // handle sheen
    const sheen = ctx.createLinearGradient(c - 10 * S, 0, c + 10 * S, 0);
    sheen.addColorStop(0, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.3, 'rgba(255,255,255,0.22)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, KNIFE_H);
    ctx.restore();

    // pommel
    roundRect(ctx, c - 11 * S, handleEnd - 6 * S, 22 * S, 8 * S, 4 * S);
    ctx.fillStyle = def.guard;
    ctx.fill();

    // guard
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 3;
    roundRect(ctx, c - 14 * S, bladeEnd - 2 * S, 28 * S, guardH, 3 * S);
    const gg = ctx.createLinearGradient(0, bladeEnd, 0, bladeEnd + guardH);
    gg.addColorStop(0, '#ffffff');
    gg.addColorStop(0.3, def.guard);
    gg.addColorStop(1, '#000000');
    ctx.fillStyle = gg;
    ctx.globalAlpha = 1;
    ctx.fill();
    ctx.restore();
    roundRect(ctx, c - 14 * S, bladeEnd - 2 * S, 28 * S, guardH, 3 * S);
    ctx.fillStyle = def.guard;
    ctx.globalAlpha = 0.75;
    ctx.fill();
    ctx.globalAlpha = 1;

    // blade
    ctx.save();
    ctx.shadowColor = def.glow ? def.glow : 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = def.glow ? 22 : 8;
    ctx.shadowOffsetY = def.glow ? 0 : 3;
    bladePath(ctx, def.shape, w, tip, bladeEnd);
    const bg = ctx.createLinearGradient(c - 18 * S, 0, c + 18 * S, 0);
    bg.addColorStop(0, def.blade[0]);
    bg.addColorStop(0.42, def.blade[1]);
    bg.addColorStop(0.58, def.blade[1]);
    bg.addColorStop(1, def.blade[2]);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.restore();

    // blade ridge + edge highlight
    ctx.save();
    bladePath(ctx, def.shape, w, tip, bladeEnd);
    ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 1.6 * S;
    ctx.beginPath();
    ctx.moveTo(c, tip + 6 * S);
    ctx.lineTo(c, bladeEnd);
    ctx.stroke();
    const eg = ctx.createLinearGradient(c - 18 * S, 0, c, 0);
    eg.addColorStop(0, 'rgba(255,255,255,0.75)');
    eg.addColorStop(0.35, 'rgba(255,255,255,0)');
    ctx.fillStyle = eg;
    ctx.fillRect(0, 0, w, KNIFE_H);
    // sheen stripe
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(c - 6 * S, tip + 12 * S);
    ctx.lineTo(c - 2 * S, tip + 12 * S);
    ctx.lineTo(c - 8 * S, bladeEnd);
    ctx.lineTo(c - 12 * S, bladeEnd);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    bladePath(ctx, def.shape, w, tip, bladeEnd);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.2 * S;
    ctx.stroke();
  });
}

// ------------------------------------------------------------------ fruits & misc
export const APPLE_R = 21;

type FruitPainter = (ctx: Ctx, cx: number, cy: number, r: number, half: 0 | -1 | 1) => void;

/** clip helper for halves: -1 = left half, 1 = right half */
function halfClip(ctx: Ctx, cx: number, cy: number, r: number, half: -1 | 1): void {
  ctx.beginPath();
  if (half < 0) ctx.rect(cx - r * 1.4, cy - r * 1.4, r * 1.4, r * 2.8);
  else ctx.rect(cx, cy - r * 1.4, r * 1.4, r * 2.8);
  ctx.clip();
}

const fruitApple: FruitPainter = (ctx, cx, cy, r, half) => {
  if (!half) {
    ctx.strokeStyle = '#5b3a1e';
    ctx.lineWidth = 3.2 * S;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.7);
    ctx.quadraticCurveTo(cx + 2 * S, cy - r * 1.05, cx + 4 * S, cy - r * 1.18);
    ctx.stroke();
    ctx.save();
    ctx.translate(cx + 6 * S, cy - r * 0.98);
    ctx.rotate(-0.5);
    ctx.beginPath();
    ctx.ellipse(0, 0, 8 * S, 3.6 * S, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#4caf50';
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  if (half) halfClip(ctx, cx, cy, r, half);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 4;
  ctx.beginPath();
  ctx.arc(cx - r * 0.32, cy, r * 0.72, 0, Math.PI * 2);
  ctx.arc(cx + r * 0.32, cy, r * 0.72, 0, Math.PI * 2);
  ctx.fillStyle = radial(ctx, cx, cy, r, [[0, '#ff6a5c'], [0.55, '#e8322a'], [1, '#9c1210']]);
  ctx.fill();
  ctx.restore();
  if (half) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.86, 0, Math.PI * 2);
    ctx.fillStyle = '#fff3cf';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + half * 5 * S, cy, 2.6 * S, 4.6 * S, half * -0.4, 0, Math.PI * 2);
    ctx.fillStyle = '#5b3a1e';
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.35, cy - r * 0.35, r * 0.2, r * 0.3, -0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();
  }
  ctx.restore();
};

const fruitOrange: FruitPainter = (ctx, cx, cy, r, half) => {
  ctx.save();
  if (half) halfClip(ctx, cx, cy, r, half);
  circle(ctx, cx, cy, r);
  shadowedFill(ctx, radial(ctx, cx, cy, r, [[0, '#ffb547'], [0.6, '#ff8c1a'], [1, '#c95e05']]), 8);
  if (half) {
    circle(ctx, cx, cy, r * 0.86);
    ctx.fillStyle = '#ffe1a6';
    ctx.fill();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, b = a + Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r * 0.78, a + 0.08, b - 0.08);
      ctx.closePath();
      ctx.fillStyle = '#ffa63a';
      ctx.fill();
    }
  } else {
    // peel pores
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r * 0.9;
      circle(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1.1 * S);
      ctx.fillStyle = 'rgba(160,70,0,0.35)';
      ctx.fill();
    }
    circle(ctx, cx, cy - r * 0.75, 2.6 * S);
    ctx.fillStyle = '#4caf50';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.35, cy - r * 0.35, r * 0.2, r * 0.3, -0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fill();
  }
  ctx.restore();
};

const fruitLemon: FruitPainter = (ctx, cx, cy, r, half) => {
  ctx.save();
  if (half) halfClip(ctx, cx, cy, r, half);
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.85, r, 0, 0, Math.PI * 2);
  shadowedFill(ctx, radial(ctx, cx, cy, r, [[0, '#fff36b'], [0.6, '#ffd21f'], [1, '#c99a00']]), 8);
  if (half) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.72, r * 0.86, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fff9d6';
    ctx.fill();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, b = a + Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r * 0.66, a + 0.09, b - 0.09);
      ctx.closePath();
      ctx.fillStyle = '#ffe75a';
      ctx.fill();
    }
  } else {
    circle(ctx, cx, cy - r * 0.95, 3 * S);
    ctx.fillStyle = '#e8c21a';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.3, cy - r * 0.4, r * 0.18, r * 0.3, -0.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();
  }
  ctx.restore();
};

const fruitStrawberry: FruitPainter = (ctx, cx, cy, r, half) => {
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(cx, cy + r * 1.05);
    ctx.bezierCurveTo(cx - r * 1.15, cy + r * 0.2, cx - r * 0.95, cy - r * 0.9, cx, cy - r * 0.7);
    ctx.bezierCurveTo(cx + r * 0.95, cy - r * 0.9, cx + r * 1.15, cy + r * 0.2, cx, cy + r * 1.05);
    ctx.closePath();
  };
  ctx.save();
  if (half) halfClip(ctx, cx, cy, r, half);
  body();
  shadowedFill(ctx, radial(ctx, cx, cy, r, [[0, '#ff6b7a'], [0.6, '#e5203a'], [1, '#9b0a1e']]), 8);
  if (half) {
    ctx.save();
    body();
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(cx, cy + r * 0.85);
    ctx.bezierCurveTo(cx - r * 0.85, cy + r * 0.15, cx - r * 0.7, cy - r * 0.6, cx, cy - r * 0.5);
    ctx.bezierCurveTo(cx + r * 0.7, cy - r * 0.6, cx + r * 0.85, cy + r * 0.15, cx, cy + r * 0.85);
    ctx.fillStyle = '#ffd9df';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.22, r * 0.45, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fff5f6';
    ctx.fill();
    ctx.restore();
  } else {
    ctx.save();
    body();
    ctx.clip();
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r * 0.85;
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1.6 * S, 2.3 * S, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#ffe58a';
      ctx.fill();
    }
    ctx.restore();
    // leaves
    ctx.fillStyle = '#3ea34a';
    for (let i = -2; i <= 2; i++) {
      ctx.save();
      ctx.translate(cx, cy - r * 0.6);
      ctx.rotate(i * 0.55);
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.28, r * 0.16, r * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
};

const fruitKiwi: FruitPainter = (ctx, cx, cy, r, half) => {
  ctx.save();
  if (half) halfClip(ctx, cx, cy, r, half);
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.9, r, 0, 0, Math.PI * 2);
  shadowedFill(ctx, radial(ctx, cx, cy, r, [[0, '#a7815a'], [0.7, '#7d5a38'], [1, '#4f351c']]), 8);
  if (half) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.8, r * 0.9, 0, 0, Math.PI * 2);
    ctx.fillStyle = radial(ctx, cx, cy, r * 0.85, [[0, '#dff08a'], [0.3, '#9bd63a'], [1, '#5fa81e']]);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.3, r * 0.36, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#f4f7c8';
    ctx.fill();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * r * 0.48, cy + Math.sin(a) * r * 0.54, 1.4 * S, 2.4 * S, a, 0, Math.PI * 2);
      ctx.fillStyle = '#1d1a0d';
      ctx.fill();
    }
  } else {
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r * 0.85;
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2.5 * S, 0.8 * S, Math.random() * 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(60,35,15,0.5)';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.3, cy - r * 0.4, r * 0.18, r * 0.3, -0.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fill();
  }
  ctx.restore();
};

const FRUIT_PAINTERS: Record<string, FruitPainter> = {
  apple: fruitApple, orange: fruitOrange, lemon: fruitLemon, strawberry: fruitStrawberry, kiwi: fruitKiwi,
};
export const FRUIT_TEX = (APPLE_R * 2 + 14) * S;

export function buildMisc(scene: Phaser.Scene): void {
  const ar = APPLE_R * S;
  const size = FRUIT_TEX;
  for (const name of Object.keys(FRUIT_PAINTERS)) {
    const paint = FRUIT_PAINTERS[name];
    canvasTex(scene, name, size, size, (ctx) => paint(ctx, size / 2, size / 2 + 3 * S, ar, 0));
    canvasTex(scene, name + 'L', size, size, (ctx) => paint(ctx, size / 2, size / 2 + 3 * S, ar, -1));
    canvasTex(scene, name + 'R', size, size, (ctx) => paint(ctx, size / 2, size / 2 + 3 * S, ar, 1));
  }

  canvasTex(scene, 'px', 8, 8, (ctx) => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 8, 8); });
  canvasTex(scene, 'dot', 32, 32, (ctx) => {
    const g = ctx.createRadialGradient(16, 16, 2, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
  });
  canvasTex(scene, 'chip', 14, 10, (ctx) => {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(1, 5); ctx.lineTo(5, 0); ctx.lineTo(13, 3); ctx.lineTo(10, 10); ctx.lineTo(3, 9);
    ctx.closePath();
    ctx.fill();
  });
  canvasTex(scene, 'lock', 48, 56, (ctx) => {
    ctx.strokeStyle = '#cfd6e0';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(24, 20, 12, Math.PI, 0);
    ctx.stroke();
    roundRect(ctx, 6, 22, 36, 30, 7);
    ctx.fillStyle = '#e6ebf2';
    ctx.fill();
    circle(ctx, 24, 36, 4);
    ctx.fillStyle = '#3b4250';
    ctx.fill();
    ctx.fillRect(22, 36, 4, 8);
  });
  canvasTex(scene, 'ring', 64, 64, (ctx) => {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 5;
    circle(ctx, 32, 32, 28);
    ctx.stroke();
  });
}

export function buildAllTextures(scene: Phaser.Scene): void {
  for (let i = 0; i < 10; i++) buildBoard(scene, i);
  buildKnife(scene, -1);
  for (let i = 0; i < KNIVES.length; i++) buildKnife(scene, i);
  buildMisc(scene);
}
