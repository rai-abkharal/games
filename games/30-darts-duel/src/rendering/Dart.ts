import { CONFIG, Side } from '../game/Config';
import { circle } from './Primitives';
// Tip at the origin; all geometry extends toward the camera along local +Y.
export function drawDart(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, angle: number, side: Side, alpha = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(scale, scale); ctx.globalAlpha *= alpha;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = '#111518'; ctx.lineWidth = 3.2;
  const color = CONFIG.colors[side];
  // Steel tip and ribbed barrel.
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-3.3, 23); ctx.lineTo(3.3, 23); ctx.closePath();
  ctx.fillStyle = '#F4FFFF'; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, 37, 11, 22, 0, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); ctx.stroke();
  for (let i = 0; i < 5; i++) {
    ctx.beginPath(); ctx.ellipse(0, 25 + i * 6, 9.6, 3.5, 0, Math.PI, Math.PI * 2); ctx.stroke();
  }
  // Four broad flights form the reference's outlined, foreshortened X.
  for (const sideSign of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(0, 66);
    ctx.lineTo(sideSign * 35, 39); ctx.quadraticCurveTo(sideSign * 40, 36, sideSign * 43, 43);
    ctx.lineTo(sideSign * 48, 55); ctx.quadraticCurveTo(sideSign * 49, 60, sideSign * 44, 64);
    ctx.lineTo(0, 95); ctx.lineTo(-sideSign * 42, 126);
    ctx.quadraticCurveTo(-sideSign * 49, 131, -sideSign * 45, 120);
    ctx.lineTo(-sideSign * 36, 99); ctx.closePath();
    ctx.fillStyle = color; ctx.fill(); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(-2, 48); ctx.quadraticCurveTo(-7, 53, -3, 61); ctx.lineTo(-2, 75);
  ctx.lineTo(2, 75); ctx.lineTo(3, 61); ctx.quadraticCurveTo(7, 53, 2, 48); ctx.closePath();
  ctx.fillStyle = '#F5FFFF'; ctx.fill(); ctx.lineWidth = 2.4; ctx.stroke();
  circle(ctx, -3, 28, 1.7, 'rgba(255,255,255,.8)');
  ctx.restore();
}
