import { CONFIG, clamp, lerp, smooth } from '../game/Config';
import { Match } from '../game/Match';
import { Dartboard } from './Dartboard';
import { drawDart } from './Dart';
import { ImpactEffects, cameraTransform } from './Effects';
import { Layout } from './Layout';
import { circle, mixColor, rounded, text } from './Primitives';
export class Renderer {
  layout = new Layout();
  effects = new ImpactEffects();
  private board = new Dartboard();
  private ctx: CanvasRenderingContext2D;
  constructor(private canvas: HTMLCanvasElement) { this.ctx = canvas.getContext('2d', { alpha: false })!; }
  resize() {
    this.layout.resize(this.canvas);
    this.board.prepare(this.layout.radius, this.layout.pixelScale * CONFIG.camera.zoom);
  }
  fontsReady() { this.board.invalidate(); this.resize(); }
  draw(match: Match) {
    const ctx = this.ctx, l = this.layout;
    ctx.setTransform(l.pixelScale, 0, 0, l.pixelScale, 0, 0);
    this.background(ctx, match);
    ctx.save();
    cameraTransform(ctx, match, l);
    this.board.draw(ctx, l.boardX, l.boardY, l.radius);
    for (const dart of match.embedded) {
      const age = match.elapsed - dart.at;
      const wobble = age < 0.23 ? Math.sin(age * 95) * 0.06 * (1 - age / 0.23) : 0;
      const x = l.boardX + dart.point.x * l.radius, y = l.boardY + dart.point.y * l.radius;
      const angle = (dart.side === 'player' ? -0.6 : 2.55) + wobble;
      // A small cast shadow makes the embedded flight sit above the board.
      ctx.save(); ctx.globalAlpha = 0.16;
      drawDart(ctx, x + 7, y + 9, 0.25, angle, dart.side); ctx.restore();
      drawDart(ctx, x, y, 0.25, angle, dart.side, Math.max(0.38, 1 - age * 0.025));
    }
    if (match.aiming) this.reticle(ctx, l.boardX + match.aim.x * l.radius, l.boardY + match.aim.y * l.radius);
    this.effects.draw(ctx, l.boardX + match.impact.x * l.radius, l.boardY + match.impact.y * l.radius,
      match.elapsed - match.impactAt, match.hit.score > 0 && !match.bust);
    ctx.restore();
    if (!match.result && match.state !== 'IMPACT' && match.state !== 'SCORE_REVEAL' && match.state !== 'CHECK_RESULT') {
      this.meters(ctx, match);
      this.activeDart(ctx, match);
    }
    this.turnLabels(ctx, match);
    this.feedback(ctx, match);
  }
  private background(ctx: CanvasRenderingContext2D, match: Match) {
    const l = this.layout;
    let bot = match.side === 'bot' ? 1 : 0;
    if (match.state === 'TURN_SWAP') bot = lerp(bot, 1 - bot, smooth(match.stateTime / CONFIG.timing.swap));
    ctx.fillStyle = mixColor('#F69777', '#61ABCE', bot); ctx.fillRect(0, 0, l.width, l.height);
    ctx.fillStyle = mixColor('#EF987A', '#5A9FC2', bot);
    for (let i = 0; i < 12; i += 2) ctx.fillRect(i * 35, 0, 35, l.floorY);
    if (bot > 0 && bot < 1) { ctx.fillStyle = `rgba(180,180,180,${Math.sin(bot * Math.PI) * 0.16})`; ctx.fillRect(0, 0, l.width, l.floorY); }
    const light = ctx.createRadialGradient(l.width / 2, l.height * 0.4, 10, l.width / 2, l.height * 0.4, l.height * 0.6);
    light.addColorStop(0, 'rgba(255,255,255,.07)'); light.addColorStop(1, 'rgba(20,29,30,.06)');
    ctx.fillStyle = light; ctx.fillRect(0, 0, l.width, l.floorY);
    ctx.fillStyle = '#A75943'; ctx.fillRect(0, l.floorY, l.width, l.height - l.floorY);
    for (let i = -4; i < 12; i++) {
      ctx.beginPath(); ctx.moveTo(l.width / 2 + (i * 60 - l.width / 2) * 0.53, l.floorY);
      ctx.lineTo(l.width / 2 + ((i + 1) * 60 - l.width / 2) * 0.53, l.floorY);
      ctx.lineTo((i + 1) * 60, l.height); ctx.lineTo(i * 60, l.height); ctx.closePath();
      ctx.fillStyle = i % 2 ? '#AC6046' : '#A35A40'; ctx.fill();
    }
    ctx.fillStyle = 'rgba(91,51,39,.22)'; ctx.fillRect(0, l.floorY - 8, l.width, 10);
    ctx.fillStyle = 'rgba(255,200,150,.14)'; ctx.fillRect(0, l.floorY + 2, l.width, 2);
  }
  private meters(ctx: CanvasRenderingContext2D, match: Match) {
    if (!match.aiming) return;
    const l = this.layout;
    const extent = l.radius * CONFIG.aim.extent;
    const horizontal = match.aim.axis === 'x';
    const active = '#3C3943', locked = 'rgba(255,248,232,.34)';
    const x = l.boardX - extent, y = l.meterY;
    rounded(ctx, x, y - 6, extent * 2, 12, 6, horizontal ? active : locked);
    rounded(ctx, 17, l.boardY - extent, 12, extent * 2, 6, horizontal ? locked : active);
    ctx.strokeStyle = 'rgba(255,255,255,.42)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(l.boardX, y - 10); ctx.lineTo(l.boardX, y + 10);
    ctx.moveTo(15, l.boardY); ctx.lineTo(31, l.boardY); ctx.stroke();
    const hx = l.boardX + match.aim.x * l.radius;
    ctx.save(); ctx.shadowBlur = horizontal ? 9 : 0; ctx.shadowColor = '#FFFFFF';
    rounded(ctx, hx - 1.8, y - 11, 3.6, 22, 2, horizontal ? '#FFFFFF' : '#3C3943'); ctx.restore();
    if (!horizontal) {
      ctx.save(); ctx.shadowBlur = 9; ctx.shadowColor = '#FFFFFF';
      rounded(ctx, 11, l.boardY + match.aim.y * l.radius - 1.8, 24, 3.6, 2, '#FFFFFF'); ctx.restore();
    }
  }
  private reticle(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.save(); ctx.shadowBlur = 8; ctx.shadowColor = '#53D9F4';
    circle(ctx, x, y, 8, 'rgba(58,176,217,.58)', 'rgba(200,247,255,.6)', 1.2);
    circle(ctx, x, y, 2.9, '#F56B52');
    ctx.restore();
  }
  private activeDart(ctx: CanvasRenderingContext2D, match: Match) {
    const l = this.layout;
    if (match.state === 'TURN_SWAP' || match.state === 'MATCH_START' || match.state === 'BOT_INTRO') return;
    const player = match.side === 'player';
    const startX = l.boardX;
    const startY = player ? l.floorY - 102 : l.boardY - l.radius * 1.19 - 5;
    const readyScale = player ? 0.93 : Math.min(0.66, Math.max(0.30, (startY - l.height * 0.056 - 55) / 130));
    const angle = player ? 0 : Math.PI;
    if (!match.flying) {
      const breathing = Math.sin(match.elapsed * 2.3) * 2;
      drawDart(ctx, startX, startY + breathing, readyScale, angle, match.side);
      return;
    }
    const t = clamp(match.stateTime / CONFIG.difficulty[match.difficulty].flight);
    const flight = 1 - (1 - t) ** 2;
    const targetX = l.boardX + match.impact.x * l.radius, targetY = l.boardY + match.impact.y * l.radius;
    const x = lerp(startX, targetX, flight);
    const y = lerp(startY, targetY, flight) - Math.sin(t * Math.PI) * (player ? 32 : -22);
    ctx.save(); ctx.strokeStyle = '#FFFFFF'; ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const offset = (i - 2.5) * 15;
      ctx.globalAlpha = Math.sin(t * Math.PI) * (0.4 + (i % 3) * 0.15);
      ctx.lineWidth = 1.5 + (i % 2);
      ctx.beginPath(); ctx.moveTo(x + offset, y + (player ? 35 : -35));
      ctx.lineTo(x + offset * 1.4, y + (player ? 1 : -1) * (60 + (i % 3) * 17)); ctx.stroke();
    }
    ctx.restore();
    drawDart(ctx, x, y, lerp(readyScale, 0.25, flight), lerp(angle, player ? -0.6 : 2.55, flight), match.side);
  }
  private turnLabels(ctx: CanvasRenderingContext2D, match: Match) {
    const l = this.layout;
    if (match.state === 'BOT_INTRO') {
      ctx.save(); ctx.globalAlpha = Math.min(1, match.stateTime / 0.13, (CONFIG.timing.intro - match.stateTime) / 0.18);
      const panelY = Math.max(98, Math.min(132, l.boardY - l.radius * 1.19 - 50));
      rounded(ctx, 52, panelY, 316, 42, 15, 'rgba(39,71,84,.78)');
      text(ctx, 'Bot thinking', 210, panelY + 21, 26, '#FFFFFF'); ctx.restore();
    }
    if (match.side === 'bot' && match.aiming) {
      const shade = ctx.createLinearGradient(0, l.meterY + 10, 0, l.floorY);
      shade.addColorStop(0, 'rgba(28,65,81,0)'); shade.addColorStop(1, 'rgba(28,65,81,.38)');
      ctx.fillStyle = shade; ctx.fillRect(0, l.meterY + 10, l.width, Math.max(0, l.floorY - l.meterY - 10));
      text(ctx, 'BOTS TURN', 210, l.meterY + 66, 23, '#F7FCFF');
    }
    if (match.state === 'PLAYER_INTRO') {
      const t = match.stateTime / CONFIG.timing.intro;
      const rise = t < 0.28 ? 1 - (1 - t / 0.28) ** 3 : t > 0.70 ? 1 - smooth((t - 0.70) / 0.30) : 1;
      const y = l.height + 135 - rise * 150;
      circle(ctx, 210, y, 172, '#ED9472', '#FFF9EE', 5);
      text(ctx, 'Your turn', 210, y - 55, 38, '#FFFFFF');
    }
    if (match.side === 'player' && match.aiming) {
      text(ctx, match.aim.axis === 'x' ? 'Tap to lock horizontal aim' : 'Tap to lock vertical aim', 210, l.meterY + 42, 15, '#633E36');
    }
  }
  private feedback(ctx: CanvasRenderingContext2D, match: Match) {
    if (match.state !== 'SCORE_REVEAL') return;
    const age = match.stateTime;
    const t = clamp(age / 0.25);
    const pop = t < 1 ? 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2 : 1;
    ctx.save(); ctx.translate(210, this.layout.boardY - 155); ctx.scale(Math.max(0.01, pop), Math.max(0.01, pop));
    ctx.globalAlpha = Math.min(1, (CONFIG.timing.scoreReveal - age) / 0.12);
    const hit = match.hit;
    const color = CONFIG.colors[match.side];
    const label = match.bust ? 'BUST!' : hit.hitType === 'SINGLE' ? '' : hit.hitType === 'MISS' ? 'MISS' : `${hit.hitType}!`;
    if (label) text(ctx, label, 0, 0, hit.hitType === 'BULLSEYE' ? 39 : 45, match.bust ? '#FFF0C2' : color, 6);
    if (hit.score && !match.bust) {
      text(ctx, `${hit.score}`, 0, label ? 47 : 15, 51, '#FFF8E6', 5);
      if (hit.multiplier > 1 && hit.segment <= 20) text(ctx, `${hit.multiplier} × ${hit.segment}`, 0, 84, 20, '#FFFFFF', 3);
    }
    if (match.bust) text(ctx, 'Score stays the same', 0, 43, 18, '#FFFFFF', 3);
    ctx.restore();
  }
}
