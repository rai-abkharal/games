/**
 * ControlCoach — first-run coach mark for the swipe pad, drawn on the game's
 * own canvas in the game's own visual language.
 *
 * Deliberately generic: it knows nothing about snakes. It is given the pad's
 * live geometry (`getPad`), a label, and a storage key, and it reports which
 * direction its ghost finger is currently "swiping" (`getDemo`) so the HOST
 * game can feed that into its real control rendering — the actual pad arrows
 * light up through the exact same code path a real touch uses. Another game
 * can lift this file, hand it a different anchor and label, and bind
 * `getDemo()` to its own control feedback.
 *
 * It draws three things, no scrim:
 *   1. a soft breathing lime rim around the real pad ("look here"),
 *   2. a cartoon fingertip that presses, swipes right, then swipes up,
 *      with a touch ripple and a fading lime trail,
 *   3. one navy badge-style pill label above the pad.
 *
 * Honors `prefers-reduced-motion`: static rim, static label, static hand
 * frozen mid-swipe with the demo direction held lit.
 */

export type CoachDir = 'right' | 'up' | null;

export interface PadAnchor {
  cx: number;
  cy: number;
  w: number;
  h: number;
  r: number;
}

export interface ControlCoachOptions {
  storageKey: string;
  label: string;
  getPad: () => PadAnchor;
}

interface HandPose {
  x: number;
  y: number;
  press: number;
  alpha: number;
}

/** [time, x, y, press, alpha] keyframes for one demo cycle (local seconds). */
const HAND_KEYFRAMES: Array<[number, number, number, number, number]> = [
  [0.0, 26, -34, 0, 0], // enter from upper-right
  [0.18, 0, 0, 0, 1], // hover over the press point
  [0.24, 0, 0, 1, 1], // press (ripple)
  [0.62, 54, 0, 1, 1], // drag RIGHT
  [0.76, 54, 0, 1, 1], // hold
  [0.98, 0, 0, 0.35, 1], // glide back, half lifted (release)
  [1.08, 0, 0, 1, 1], // press again (ripple)
  [1.48, 0, -34, 1, 1], // drag UP (short: the lit UP arrow stays visible above the fingertip)
  [1.62, 0, -34, 1, 1], // hold
  [1.82, 12, -46, 0, 1], // lift away
  [1.95, 28, -56, 0, 0] // gone
];

const ENTER_S = 0.35; // rim + label bloom before the hand appears
const CYCLE_S = 1.95;
const CYCLE_GAP_S = 0.35;
const CYCLES = 2;
const FADE_S = 0.28;
const RIPPLE_S = 0.5;
const RIPPLE_TIMES = [0.24, 1.08];

const LIME = '131, 204, 67'; // THEME.snakeLight — the game's "active" color
const NAVY = '#14314E'; // the game's chrome color (badges, arena border)

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export class ControlCoach {
  private readonly storageKey: string;
  private readonly label: string;
  private readonly getPad: () => PadAnchor;
  private readonly reducedMotion: boolean;

  private active = false;
  private seen = false;
  private t = 0;
  /** 1 → 0 while fading out after complete(). */
  private fade = 1;
  private fading = false;
  /** Real finger arrived: the ghost hand yields immediately. */
  private handYielded = false;
  private trail: Array<{ x: number; y: number; age: number }> = [];

  constructor(options: ControlCoachOptions) {
    this.storageKey = options.storageKey;
    this.label = options.label;
    this.getPad = options.getPad;
    let reduced = false;
    try {
      reduced = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch {}
    this.reducedMotion = reduced;
    try {
      this.seen = localStorage.getItem(this.storageKey) === '1';
    } catch {}
  }

  /** True when the coach has never been completed on this device. */
  public shouldShow(): boolean {
    return !this.seen;
  }

  /** Coach is on screen and the run should stay held. */
  public isActive(): boolean {
    return this.active;
  }

  public start(): void {
    this.active = true;
    this.t = 0;
    this.fade = 1;
    this.fading = false;
    this.handYielded = false;
    this.trail = [];
  }

  /** The player's real finger touched the pad: the demo hand steps aside. */
  public onPadTouched(): void {
    this.handYielded = true;
  }

  /** The player performed a real swipe: persist and fade everything out. */
  public complete(): void {
    if (!this.active || this.fading) return;
    this.seen = true;
    this.fading = true;
    try {
      localStorage.setItem(this.storageKey, '1');
    } catch {}
  }

  public update(dt: number): void {
    if (!this.active) return;
    this.t += dt;
    if (this.fading) {
      this.fade = Math.max(0, this.fade - dt / FADE_S);
      if (this.fade <= 0) this.active = false;
    }
    for (const p of this.trail) p.age += dt;
    this.trail = this.trail.filter(p => p.age < 0.45);
  }

  /** What the host should feed into its real control feedback this frame. */
  public getDemo(): { active: boolean; dir: CoachDir } {
    if (!this.active || this.fading || this.handYielded) return { active: false, dir: null };
    if (this.reducedMotion) return { active: true, dir: 'right' };
    const c = this.cycleTime();
    if (c === null) return { active: false, dir: null };
    if (c >= 0.3 && c <= 0.95) return { active: true, dir: 'right' };
    if (c >= 1.14 && c <= 1.8) return { active: true, dir: 'up' };
    return { active: false, dir: null };
  }

  /** Local time inside the current demo cycle, or null outside the demo. */
  private cycleTime(): number | null {
    const demoT = this.t - ENTER_S;
    if (demoT < 0) return null;
    const period = CYCLE_S + CYCLE_GAP_S;
    if (demoT >= CYCLES * period) return null; // settled: rim + label only
    const c = demoT % period;
    return c <= CYCLE_S ? c : null;
  }

  private handPose(c: number): HandPose {
    const kfs = HAND_KEYFRAMES;
    if (c <= kfs[0][0]) return { x: kfs[0][1], y: kfs[0][2], press: kfs[0][3], alpha: kfs[0][4] };
    for (let i = 1; i < kfs.length; i++) {
      if (c <= kfs[i][0]) {
        const [t0, x0, y0, p0, a0] = kfs[i - 1];
        const [t1, x1, y1, p1, a1] = kfs[i];
        const k = smoothstep((c - t0) / (t1 - t0));
        return {
          x: x0 + (x1 - x0) * k,
          y: y0 + (y1 - y0) * k,
          press: p0 + (p1 - p0) * k,
          alpha: a0 + (a1 - a0) * k
        };
      }
    }
    const last = kfs[kfs.length - 1];
    return { x: last[1], y: last[2], press: last[3], alpha: last[4] };
  }

  // --------------------------------------------------------------------------
  // DRAWING (call after the game has drawn its own frame)
  // --------------------------------------------------------------------------
  public draw(ctx: CanvasRenderingContext2D): void {
    if (!this.active) return;
    const pad = this.getPad();
    const a = this.fade;

    this.drawRim(ctx, pad, a);
    this.drawLabel(ctx, pad, a);

    if (this.handYielded) return;

    if (this.reducedMotion) {
      // Static composition: hand frozen mid right-swipe with a short trail.
      const px = pad.cx - 8 + 34;
      const py = pad.cy + 6;
      for (let i = 0; i < 4; i++) {
        this.drawTrailDot(ctx, px - 12 - i * 10, py, (0.3 - i * 0.06) * a, 7 - i);
      }
      this.drawHand(ctx, px, py, 1, a);
      return;
    }

    const c = this.cycleTime();
    if (c === null) return;

    const pose = this.handPose(c);
    const baseX = pad.cx - 8;
    const baseY = pad.cy + 6;
    const hx = baseX + pose.x;
    const hy = baseY + pose.y;

    // Lime trail while the finger is down and moving.
    if (pose.press > 0.7) {
      const lastPoint = this.trail[this.trail.length - 1];
      if (!lastPoint || Math.hypot(lastPoint.x - hx, lastPoint.y - hy) > 4) {
        this.trail.push({ x: hx, y: hy, age: 0 });
        if (this.trail.length > 16) this.trail.shift();
      }
    }
    for (const p of this.trail) {
      const life = 1 - p.age / 0.45;
      this.drawTrailDot(ctx, p.x, p.y, life * 0.3 * a, 4 + life * 4);
    }

    // Touch ripples on each press.
    for (const rippleAt of RIPPLE_TIMES) {
      const rp = (c - rippleAt) / RIPPLE_S;
      if (rp > 0 && rp < 1) {
        const eased = smoothstep(rp);
        ctx.save();
        ctx.beginPath();
        ctx.arc(hx, hy, 12 + eased * 26, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 255, 255, ${(0.65 * (1 - eased) * a).toFixed(3)})`;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(hx, hy, 10 + eased * 18, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${LIME}, ${(0.16 * (1 - eased) * a).toFixed(3)})`;
        ctx.fill();
        ctx.restore();
      }
    }

    if (pose.alpha > 0) this.drawHand(ctx, hx, hy, pose.press, pose.alpha * a);
  }

  /** Soft breathing lime rim just outside the real pad's border. */
  private drawRim(ctx: CanvasRenderingContext2D, pad: PadAnchor, a: number): void {
    const enter = Math.min(1, this.t / 0.3);
    const breath = this.reducedMotion ? 0.4 : 0.32 + 0.16 * Math.sin((this.t * Math.PI * 2) / 1.7);
    const alpha = breath * smoothstep(enter) * a;
    const grow = 4;
    ctx.save();
    ctx.beginPath();
    (ctx as any).roundRect(
      pad.cx - pad.w / 2 - grow,
      pad.cy - pad.h / 2 - grow,
      pad.w + grow * 2,
      pad.h + grow * 2,
      pad.r + grow
    );
    ctx.strokeStyle = `rgba(${LIME}, ${alpha.toFixed(3)})`;
    ctx.lineWidth = 3;
    ctx.shadowColor = `rgba(${LIME}, ${(alpha * 0.9).toFixed(3)})`;
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.restore();
  }

  /** One compact navy badge-style pill above the pad. */
  private drawLabel(ctx: CanvasRenderingContext2D, pad: PadAnchor, a: number): void {
    const appear = Math.min(1, Math.max(0, (this.t - 0.2) / 0.3));
    if (appear <= 0) return;
    const eased = smoothstep(appear);
    // Entrance pop: 0.85 → 1.05 → 1, then a gentle idle float.
    const pop = this.reducedMotion ? 1 : appear < 0.7 ? 0.85 + 0.2 * smoothstep(appear / 0.7) : 1.05 - 0.05 * smoothstep((appear - 0.7) / 0.3);
    const float = this.reducedMotion ? 0 : Math.sin(this.t * 2.1) * 2;

    ctx.save();
    ctx.font = '700 13px Fredoka, Nunito, Inter, sans-serif';
    const tw = ctx.measureText(this.label).width;
    const pw = tw + 34;
    const ph = 30;
    const px = pad.cx;
    const py = Math.max(60, pad.cy - pad.h / 2 - 26) + float;

    ctx.translate(px, py);
    ctx.scale(pop, pop);
    ctx.globalAlpha = eased * a;

    ctx.beginPath();
    (ctx as any).roundRect(-pw / 2, -ph / 2, pw, ph, 9);
    ctx.shadowColor = 'rgba(20, 49, 78, 0.35)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = NAVY;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.label, 0, 1);
    ctx.restore();
  }

  private drawTrailDot(ctx: CanvasRenderingContext2D, x: number, y: number, alpha: number, radius: number): void {
    if (alpha <= 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${LIME}, ${alpha.toFixed(3)})`;
    ctx.fill();
    // White core keeps the trail readable when it crosses the snake's body.
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${(alpha * 0.9).toFixed(3)})`;
    ctx.fill();
    ctx.restore();
  }

  /**
   * Cartoon fingertip in the game's outline style: white fill, navy outline,
   * soft navy shadow. The finger TIP is at (tipX, tipY) — the contact point.
   */
  private drawHand(ctx: CanvasRenderingContext2D, tipX: number, tipY: number, press: number, alpha: number): void {
    const s = 1 - press * 0.07; // pressing squashes the hand slightly
    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(-0.14);
    ctx.scale(s, s);
    ctx.globalAlpha = alpha;

    ctx.shadowColor = 'rgba(20, 49, 78, 0.30)';
    ctx.shadowBlur = press > 0.5 ? 5 : 9;
    ctx.shadowOffsetY = press > 0.5 ? 2 : 5;

    const fill = '#FFFFFF';
    const outline = NAVY;
    const lw = 2.4;

    // Index finger — tip at origin, extending down.
    ctx.beginPath();
    (ctx as any).roundRect(-7, -1, 14, 33, 7);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = outline;
    ctx.lineWidth = lw;
    ctx.stroke();

    // Fist below the finger.
    ctx.beginPath();
    (ctx as any).roundRect(-12, 26, 33, 27, [10, 16, 15, 14]);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.stroke();

    // Knuckle creases.
    ctx.beginPath();
    ctx.moveTo(2, 29);
    ctx.lineTo(2, 37);
    ctx.moveTo(10, 30);
    ctx.lineTo(10, 38);
    ctx.strokeStyle = 'rgba(20, 49, 78, 0.28)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Thumb hugging the side.
    ctx.save();
    ctx.translate(17, 30);
    ctx.rotate(-0.6);
    ctx.beginPath();
    (ctx as any).roundRect(-5, -9, 10, 19, 5);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = lw;
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }
}
