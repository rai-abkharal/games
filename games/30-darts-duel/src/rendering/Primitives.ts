export function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, stroke?: string, width = 2) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}
export function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}
export function text(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, size: number, fill: string, outline = 0) {
  ctx.font = `700 ${size}px Fredoka, 'Arial Rounded MT Bold', sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  if (outline) { ctx.strokeStyle = '#252630'; ctx.lineWidth = outline; ctx.strokeText(label, x, y); }
  ctx.fillStyle = fill; ctx.fillText(label, x, y);
}
export function star(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rotation: number, color: string) {
  ctx.beginPath();
  for (let j = 0; j < 10; j++) {
    const a = rotation + j * Math.PI / 5 - Math.PI / 2;
    const r = size * (j % 2 ? 0.46 : 1);
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath(); ctx.fillStyle = color; ctx.fill();
}
export function mixColor(a: string, b: string, t: number) {
  const aN = parseInt(a.slice(1), 16), bN = parseInt(b.slice(1), 16);
  const r = Math.round((aN >> 16) * (1 - t) + (bN >> 16) * t);
  const g = Math.round(((aN >> 8) & 255) * (1 - t) + ((bN >> 8) & 255) * t);
  const blue = Math.round((aN & 255) * (1 - t) + (bN & 255) * t);
  return `rgb(${r},${g},${blue})`;
}
