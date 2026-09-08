import { CONFIG, clamp, smooth } from '../game/Config';
import { Match } from '../game/Match';
import { Layout } from './Layout';
import { star } from './Primitives';
export class ImpactEffects {
  private particles = Array.from({ length: 9 }, (_, i) => ({ angle: i * Math.PI * 2 / 9, radius: 0, size: 0, spin: 0 }));
  burst() {
    for (const p of this.particles) {
      p.radius = 38 + Math.random() * 37; p.size = 6 + Math.random() * 6; p.spin = (Math.random() - 0.5) * 6;
    }
  }
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, age: number, celebrate: boolean) {
    if (age < 0 || age > 0.85) return;
    const t = clamp(age / 0.85);
    ctx.save(); ctx.globalAlpha = 1 - t;
    ctx.beginPath(); ctx.arc(x, y, 8 + t * 68, 0, Math.PI * 2);
    ctx.strokeStyle = celebrate ? '#FFF2BD' : 'rgba(255,255,255,.55)'; ctx.lineWidth = 3 * (1 - t); ctx.stroke();
    if (celebrate) {
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i]; const distance = p.radius * (1 - (1 - t) ** 3);
        star(ctx, x + Math.cos(p.angle) * distance, y + Math.sin(p.angle) * distance + t * t * 22,
          p.size * (1 - t * 0.4), p.angle + t * p.spin, i % 3 === 0 ? '#FFB443' : '#FFE785');
      }
    }
    ctx.restore();
  }
}
export function cameraTransform(ctx: CanvasRenderingContext2D, match: Match, layout: Layout) {
  if (match.state !== 'IMPACT' && match.state !== 'SCORE_REVEAL') return;
  const age = match.elapsed - match.impactAt;
  const cfg = CONFIG.camera;
  const amount = age < cfg.in ? smooth(age / cfg.in) : age < cfg.in + cfg.hold ? 1 : 1 - smooth((age - cfg.in - cfg.hold) / cfg.out);
  const zoom = 1 + (cfg.zoom - 1) * amount * (match.hit.score ? 1 : 0.30);
  const focusX = layout.boardX + match.impact.x * layout.radius;
  const focusY = layout.boardY + match.impact.y * layout.radius;
  ctx.translate(layout.boardX, layout.boardY);
  ctx.scale(zoom, zoom);
  ctx.translate(-layout.boardX - match.impact.x * layout.radius * amount * 0.78,
    -layout.boardY - match.impact.y * layout.radius * amount * 0.78);
  // A short, damped subpixel impact shake. The focal point remains the actual hit.
  if (age < 0.13) ctx.translate(Math.sin(age * 120 + focusX) * (0.13 - age) * 8,
    Math.cos(age * 130 + focusY) * (0.13 - age) * 8);
}
