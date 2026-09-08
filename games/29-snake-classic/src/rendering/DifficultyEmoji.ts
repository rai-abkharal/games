import type { DifficultyConfig } from '../game/Types';

// Font-independent artwork for the same 🌱 / 😎 / 😈 difficulty emojis.
// Used at every size: selector, gameplay badge, and result banner.
export function drawDifficultyEmoji(
  ctx: CanvasRenderingContext2D, emblem: DifficultyConfig['emblem'], x: number, y: number, size: number
): void {
  ctx.save();
  ctx.translate(x, y); ctx.scale(size / 48, size / 48);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (emblem === 'sprout') {
    ctx.strokeStyle = '#419D39'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, 21); ctx.quadraticCurveTo(3, 5, -1, -5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 3); ctx.bezierCurveTo(-20, 4, -24, -8, -22, -16);
    ctx.bezierCurveTo(-7, -18, 1, -10, 0, 3); ctx.fillStyle = '#64BF45'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(1, -2); ctx.bezierCurveTo(0, -17, 10, -23, 23, -19);
    ctx.bezierCurveTo(23, -5, 14, 2, 1, -2); ctx.fillStyle = '#82CF4D'; ctx.fill();
    ctx.strokeStyle = '#429B37'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-15, -10); ctx.lineTo(0, 3); ctx.lineTo(16, -14); ctx.stroke();
  } else {
    const devil = emblem === 'devil';
    if (devil) {
      ctx.fillStyle = '#9857C7';
      for (const sign of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(sign * 7, -14);
        ctx.quadraticCurveTo(sign * 17, -16, sign * 21, -23);
        ctx.quadraticCurveTo(sign * 24, -8, sign * 16, -4); ctx.closePath(); ctx.fill();
      }
    }
    ctx.beginPath(); ctx.arc(0, 1, devil ? 20 : 22, 0, Math.PI * 2);
    ctx.fillStyle = devil ? '#AF6DDB' : '#FFCE39'; ctx.fill();
    ctx.strokeStyle = devil ? '#8A49B9' : '#EDAF22'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.strokeStyle = '#302636'; ctx.fillStyle = '#302636';
    if (devil) {
      for (const sign of [-1, 1]) {
        ctx.beginPath(); ctx.ellipse(sign * 8, 0, 2.2, 3.4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 2.7; ctx.beginPath(); ctx.moveTo(sign * 4, -6); ctx.lineTo(sign * 12, -10); ctx.stroke();
      }
    } else {
      ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-21, -7); ctx.lineTo(21, -7); ctx.stroke();
      for (const sign of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(sign * 3, -7); ctx.lineTo(sign * 19, -7);
        ctx.lineTo(sign * 17, 2); ctx.quadraticCurveTo(sign * 10, 9, sign * 4, 2);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#77919E'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sign * 7, -4); ctx.lineTo(sign * 13, -4); ctx.stroke();
        ctx.strokeStyle = '#302636';
      }
    }
    ctx.lineWidth = 2.7; ctx.beginPath(); ctx.moveTo(-9, 10);
    ctx.quadraticCurveTo(0, devil ? 20 : 18, 9, 10); ctx.stroke();
  }
  ctx.restore();
}
