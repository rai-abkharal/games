import { RINGS, SECTORS } from '../game/Config';
import { circle, text } from './Primitives';
export class Dartboard {
  private texture = document.createElement('canvas');
  private resolution = 0;
  prepare(radius: number, pixelScale: number) {
    const size = Math.ceil(radius * 2.55 * pixelScale);
    if (size === this.resolution) return;
    this.resolution = size;
    this.texture.width = this.texture.height = size;
    const ctx = this.texture.getContext('2d')!;
    ctx.scale(size / 2.55, size / 2.55); ctx.translate(1.275, 1.275);
    circle(ctx, 0.025, 0.045, 1.205, 'rgba(25,29,32,.24)');
    circle(ctx, 0, 0, RINGS.numbers, '#14171A');
    circle(ctx, 0, 0, 1.165, '#070909');
    const drawRing = (inner: number, outer: number, i: number, fill: string) => {
      const a = -Math.PI / 2 + i * Math.PI / 10 - Math.PI / 20;
      ctx.beginPath(); ctx.arc(0, 0, outer, a, a + Math.PI / 10);
      ctx.arc(0, 0, inner, a + Math.PI / 10, a, true); ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
    };
    for (let i = 0; i < 20; i++) {
      const field = i % 2 === 0 ? '#101313' : '#FFF8E4';
      const ring = i % 2 === 0 ? '#FF4848' : '#09B85F';
      drawRing(RINGS.bull, RINGS.doubleOut, i, field);
      drawRing(RINGS.tripleIn, RINGS.tripleOut, i, ring);
      drawRing(RINGS.doubleIn, RINGS.doubleOut, i, ring);
      const a = -Math.PI / 2 + i * Math.PI / 10;
      text(ctx, `${SECTORS[i]}`, Math.cos(a) * 1.088, Math.sin(a) * 1.088, 0.155, '#FFFFFF');
    }
    // Hairline wires keep the mathematically shared scoring boundaries legible.
    ctx.strokeStyle = 'rgba(220,233,222,.23)'; ctx.lineWidth = 0.003;
    for (const r of [RINGS.bull, RINGS.tripleIn, RINGS.tripleOut, RINGS.doubleIn, RINGS.doubleOut]) {
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    }
    circle(ctx, 0, 0, RINGS.bull, '#0BB364', '#EAE9D6', 0.012);
    circle(ctx, 0, 0, RINGS.bullseye, '#FF4946', '#FBEFDA', 0.013);
  }
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
    const size = radius * 2.55;
    ctx.drawImage(this.texture, x - size / 2, y - size / 2, size, size);
  }
  invalidate() { this.resolution = 0; }
}
