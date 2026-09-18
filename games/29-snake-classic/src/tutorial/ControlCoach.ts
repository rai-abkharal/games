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
 * It draws two things, no scrim or hand inside the controls:
 *   1. a soft breathing lime rim around the real pad ("look here"),
 *   2. one navy badge-style pill label above the pad.
 *
 * Honors `prefers-reduced-motion`: static rim and label, with the demo
 * direction held lit.
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

const ENTER_S = 0.35; // rim + label bloom before the hand appears
const CYCLE_S = 1.95;
const CYCLE_GAP_S = 0.35;
const CYCLES = 2;
const FADE_S = 0.28;


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

  // --------------------------------------------------------------------------
  // DRAWING (call after the game has drawn its own frame)
  // --------------------------------------------------------------------------
  public draw(ctx: CanvasRenderingContext2D): void {
    if (!this.active) return;
    const pad = this.getPad();
    const a = this.fade;

    this.drawRim(ctx, pad, a);
    this.drawLabel(ctx, pad, a);

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

}
