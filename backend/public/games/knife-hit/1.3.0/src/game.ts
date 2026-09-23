import {
  W, VIEW, BOARD_X, BOARD_R, KNIFE_SPEED, KNIFE_DEPTH, KNIFE_GAP_DEG, APPLE_HIT_DEG, APPLE_DIST, boardY, handY,
  BOARDS, KNIVES, TOTAL_LEVELS, LevelDef, makeLevel, angDist, damp, DEG,
} from './config';
import { boardKey, knifeKey, BOARD_TEX, KNIFE_H, KNIFE_TIP_Y } from './art';
import { sfx, data, save } from './sfx';
import { setupCamera, applyViewport, drawBackground, makeText, makeButton, roundIconButton, pill, panel, punch, floatText, hex } from './ui';

type State = 'INTRO' | 'PLAY' | 'WIN' | 'LOSE';

interface Stuck { angle: number; img: Phaser.GameObjects.Image }
interface FruitObj { angle: number; kind: string; img: Phaser.GameObjects.Image }
interface Debris { c: Phaser.GameObjects.Container; vx: number; vy: number; va: number; t: number }
interface Flying { img: Phaser.GameObjects.Image; vx: number; vy: number; va: number }

const KNIFE_ORIGIN_Y = KNIFE_TIP_Y / KNIFE_H;

export class GameScene extends Phaser.Scene {
  private level!: LevelDef;
  private runScore = 0;
  private state: State = 'INTRO';
  private slow = 1;
  private slowT = 0;

  private board!: Phaser.GameObjects.Container;
  private boardImg!: Phaser.GameObjects.Image;
  private stuck: Stuck[] = [];
  private fruits: FruitObj[] = [];
  private segIdx = 0;
  private segTime = 0;
  private curSpeed = 0;

  private hand: Phaser.GameObjects.Image | null = null;
  private handTween: Phaser.Tweens.Tween | null = null;
  private flying = false;
  private queued = false;
  private fallers: Flying[] = [];
  private debris: Debris[] = [];
  private knivesLeft = 0;
  private stackIcons: Phaser.GameObjects.Image[] = [];

  private scoreText!: Phaser.GameObjects.Text;
  private appleText!: Phaser.GameObjects.Text;
  private appleIcon!: Phaser.GameObjects.Image;
  private chips!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private juice!: Phaser.GameObjects.Particles.ParticleEmitter;
  private trail!: Phaser.GameObjects.Particles.ParticleEmitter;
  private accent = 0xffffff;
  private BY = boardY();
  private HY = handY();

  constructor() { super('Game'); }

  init(d: { level?: number; score?: number }): void {
    const lv = Math.max(1, Math.min(TOTAL_LEVELS, d.level ?? data().level));
    this.level = makeLevel(lv);
    this.runScore = d.score ?? 0;
    this.state = 'INTRO';
    this.slow = 1;
    this.stuck = [];
    this.fruits = [];
    this.fallers = [];
    this.debris = [];
    this.stackIcons = [];
    this.hand = null;
    this.handTween = null;
    this.flying = false;
    this.queued = false;
    this.segIdx = 0;
    this.segTime = 0;
    this.curSpeed = 0;
    this.BY = boardY();
    this.HY = handY();
  }

  create(): void {
    setupCamera(this);
    const lv = this.level;
    const bd = BOARDS[lv.boardIdx];
    this.accent = bd.accent;
    drawBackground(this, bd.bg[0], bd.bg[1]);
    this.tweens.timeScale = 1;

    // ---- particles
    this.chips = this.add.particles(0, 0, 'chip', {
      speed: { min: 140, max: 420 }, angle: { min: 200, max: 340 }, gravityY: 1400,
      lifespan: { min: 350, max: 700 }, scale: { start: 0.9, end: 0.3 }, rotate: { min: 0, max: 360 },
      alpha: { start: 1, end: 0 }, tint: bd.accent, emitting: false,
    }).setDepth(30);
    this.sparks = this.add.particles(0, 0, 'dot', {
      speed: { min: 60, max: 320 }, angle: { min: 0, max: 360 }, lifespan: { min: 200, max: 500 },
      scale: { start: 0.7, end: 0 }, alpha: { start: 0.9, end: 0 }, blendMode: 'ADD', emitting: false,
    }).setDepth(31);
    this.juice = this.add.particles(0, 0, 'dot', {
      speed: { min: 80, max: 300 }, angle: { min: 0, max: 360 }, gravityY: 900, lifespan: { min: 300, max: 600 },
      scale: { start: 0.5, end: 0 }, alpha: { start: 1, end: 0 }, tint: [0xfff3cf, 0xff6a5c, 0xffe082], emitting: false,
    }).setDepth(31);
    this.trail = this.add.particles(0, 0, 'dot', {
      speed: 0, lifespan: 140, scale: { start: 0.55, end: 0 }, alpha: { start: 0.55, end: 0 }, blendMode: 'ADD',
      frequency: 8, emitting: false, tint: 0xffffff,
    }).setDepth(19);

    // ---- board
    this.board = this.add.container(BOARD_X, -260).setDepth(10);
    this.boardImg = this.add.image(0, 0, boardKey(lv.boardIdx)).setScale(0.5);
    this.board.add(this.boardImg);
    for (const a of lv.preKnives) this.addStuck(a, knifeKey(-1), true);
    for (const f of lv.fruits) {
      const a = f.angle, d = APPLE_DIST;
      const img = this.add.image(-Math.sin(a * DEG) * d, Math.cos(a * DEG) * d, f.kind).setScale(0.5).setRotation(a * DEG + Math.PI);
      this.board.add(img);
      this.fruits.push({ angle: a, kind: f.kind, img });
    }
    this.knivesLeft = lv.knives;

    // ---- HUD
    this.buildHud();

    // ---- intro: board drops in, knife pops up
    this.tweens.add({ targets: this.board, y: this.BY, duration: 620, ease: 'Back.easeOut' });
    this.time.delayedCall(420, () => this.spawnHand());
    this.time.delayedCall(560, () => { if (this.state === 'INTRO') this.state = 'PLAY'; });
    this.cameras.main.fadeIn(260, 0, 0, 0);

    if (lv.boss) this.bossIntro(bd.name);

    // ---- input
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      sfx.unlock();
      if (p.y < 110 * 2 && p.x > (W - 70) * 2) return; // hud buttons area (top-right, screen px)
      this.throwKnife();
    });
    this.input.keyboard?.on('keydown-SPACE', () => { sfx.unlock(); this.throwKnife(); });
    this.input.keyboard?.on('keydown-UP', () => { sfx.unlock(); this.throwKnife(); });
  }

  // ------------------------------------------------------------ HUD
  private buildHud(): void {
    const lv = this.level;
    // score
    this.scoreText = makeText(this, W / 2, 62, `${this.runScore}`, 46, { strokeWidth: 6 }).setDepth(50);
    // stage pill + progress dots
    pill(this, 78, 34, 128, 36).setDepth(50);
    makeText(this, 78, 34, `STAGE ${lv.n}`, 18, { strokeWidth: 3 }).setDepth(51);
    const g = this.add.graphics().setDepth(51);
    const start = ((lv.n - 1) - ((lv.n - 1) % 10));
    for (let i = 0; i < 10; i++) {
      const n = start + i + 1;
      const x = 24 + i * 12, y = 64;
      const boss = i === 9;
      if (n < lv.n) { g.fillStyle(this.accent, 1); g.fillCircle(x, y, boss ? 5 : 3.5); }
      else if (n === lv.n) { g.fillStyle(0xffffff, 1); g.fillCircle(x, y, boss ? 5.5 : 4.5); }
      else { g.fillStyle(0xffffff, 0.28); g.fillCircle(x, y, boss ? 5 : 3.5); }
      if (boss) { g.lineStyle(2, 0xffffff, 0.6); g.strokeCircle(x, y, 7.5); }
    }
    // apples
    pill(this, W - 62, 34, 96, 36).setDepth(50);
    this.appleIcon = this.add.image(W - 88, 34, 'apple').setScale(0.42).setDepth(51);
    this.appleText = makeText(this, W - 48, 34, `${data().apples}`, 20, { strokeWidth: 3 }).setDepth(51);
    // home button
    roundIconButton(this, W - 34, 84, 40, '⌂', () => this.goHome()).setDepth(52);
    // knife stack (bottom-left)
    this.drawStack();
  }

  private drawStack(): void {
    this.stackIcons.forEach((i) => i.destroy());
    this.stackIcons = [];
    const perCol = 8;
    for (let i = 0; i < this.knivesLeft; i++) {
      const col = Math.floor(i / perCol), row = i % perCol;
      const img = this.add.image(26 + col * 24, VIEW.h - 14 - row * 34, knifeKey(data().knife))
        .setScale(0.26).setOrigin(0.5, 1).setDepth(50).setAlpha(0.95);
      this.stackIcons.push(img);
    }
  }

  private popStack(): void {
    const img = this.stackIcons.pop();
    if (!img) return;
    this.tweens.add({ targets: img, alpha: 0, y: img.y - 18, scale: 0.15, duration: 160, onComplete: () => img.destroy() });
  }

  private bossIntro(name: string): void {
    const by = this.BY + BOARD_R + 40;
    const t1 = makeText(this, W / 2, by, 'BOSS', 62, { color: '#ff4d4d', strokeWidth: 8 }).setDepth(60).setScale(0.2).setAlpha(0);
    const t2 = makeText(this, W / 2, by + 52, name.toUpperCase(), 26, { color: hex(this.accent), strokeWidth: 4 }).setDepth(60).setAlpha(0);
    this.tweens.add({ targets: t1, scale: 1, alpha: 1, duration: 420, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t2, alpha: 1, y: by + 42, duration: 400, delay: 220 });
    this.tweens.add({ targets: [t1, t2], alpha: 0, duration: 300, delay: 1500, onComplete: () => { t1.destroy(); t2.destroy(); } });
    this.cameras.main.shake(300, 0.006);
  }

  // ------------------------------------------------------------ knives
  private addStuck(angleDeg: number, key: string, silent: boolean): Phaser.GameObjects.Image {
    const d = BOARD_R - KNIFE_DEPTH;
    const a = angleDeg * DEG;
    const img = this.add.image(-Math.sin(a) * d, Math.cos(a) * d, key).setScale(0.5).setOrigin(0.5, KNIFE_ORIGIN_Y).setRotation(a);
    this.board.addAt(img, 0);   // behind the board face: only guard + handle show, the blade is inside
    this.stuck.push({ angle: angleDeg, img });
    if (!silent) img.setAlpha(1);
    return img;
  }

  private spawnHand(): void {
    if (this.state === 'LOSE' || this.state === 'WIN') return;
    const img = this.add.image(BOARD_X, this.HY + 60, knifeKey(data().knife)).setScale(0.3).setOrigin(0.5, KNIFE_ORIGIN_Y).setDepth(20).setAlpha(0);
    this.hand = img;
    this.tweens.add({ targets: img, y: this.HY, scale: 0.5, alpha: 1, duration: 200, ease: 'Back.easeOut', onComplete: () => {
      if (this.hand !== img) return;
      this.handTween = this.tweens.add({ targets: img, y: this.HY - 5, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } });
    if (this.queued) { this.queued = false; this.throwKnife(); }
  }

  private throwKnife(): void {
    if (this.state !== 'PLAY' || this.flying || this.knivesLeft <= 0) return;
    if (!this.hand) { this.queued = true; return; }   // tapped during the ~50 ms respawn gap: fire as soon as it appears
    this.flying = true;
    this.handTween?.stop();
    this.handTween = null;
    this.tweens.killTweensOf(this.hand);
    this.hand.setScale(0.5).setAlpha(1);
    this.hand.y = this.HY;
    sfx.throwKnife();
    this.trail.startFollow(this.hand, 0, 40);
    this.trail.start();
  }

  private resolveHit(): void {
    const knife = this.hand!;
    this.trail.stop();
    this.trail.stopFollow();
    const rotDeg = Phaser.Math.RadToDeg(this.board.rotation);
    const a = ((-rotDeg % 360) + 360) % 360;

    // fruit first — it sits on the rim, the blade passes straight through it
    for (let i = this.fruits.length - 1; i >= 0; i--) {
      const fr = this.fruits[i];
      if (angDist(fr.angle, a) < APPLE_HIT_DEG) {
        this.fruits.splice(i, 1);
        this.sliceFruit(fr);
      }
    }

    // clash?
    for (const s of this.stuck) {
      if (angDist(s.angle, a) < KNIFE_GAP_DEG) {
        this.clash(knife, s);
        return;
      }
    }

    // stick
    knife.destroy();
    this.hand = null;
    this.flying = false;
    this.addStuck(a, knifeKey(data().knife), false);
    this.runScore++;
    this.scoreText.setText(`${this.runScore}`);
    punch(this, this.scoreText, 1.25, 160);
    this.knivesLeft--;
    this.popStack();
    sfx.hit();
    // board reacts
    this.tweens.killTweensOf(this.board);
    this.board.y = this.BY - 9;
    this.tweens.add({ targets: this.board, y: this.BY, duration: 140, ease: 'Quad.easeOut' });
    this.cameras.main.shake(70, 0.004);
    this.chips.explode(12, BOARD_X, this.BY + BOARD_R - 6);
    this.sparks.explode(6, BOARD_X, this.BY + BOARD_R - 4);

    if (this.knivesLeft <= 0) this.time.delayedCall(180, () => this.winLevel());
    else this.time.delayedCall(45, () => this.spawnHand());
  }

  private sliceFruit(ap: FruitObj): void {
    const m = ap.img.getWorldTransformMatrix();
    const wx = m.tx, wy = m.ty;
    const rot = ap.img.rotation + this.board.rotation;
    ap.img.destroy();
    sfx.apple();
    data().apples++;
    save();
    this.appleText.setText(`${data().apples}`);
    punch(this, this.appleIcon, 1.4);
    punch(this, this.appleText, 1.3);
    floatText(this, wx, wy - 20, '+1', '#ffe082', 24);
    this.juice.explode(14, wx, wy);
    const halves: [string, number][] = [[ap.kind + 'L', -1], [ap.kind + 'R', 1]];
    for (const [key, dir] of halves) {
      const h = this.add.image(wx, wy, key).setScale(0.5).setRotation(rot).setDepth(25);
      this.fallers.push({ img: h, vx: dir * (160 + Math.random() * 120) * (Math.cos(rot) >= 0 ? 1 : -1), vy: -260 - Math.random() * 160, va: dir * (4 + Math.random() * 4) });
    }
  }

  private clash(knife: Phaser.GameObjects.Image, hit: Stuck): void {
    this.state = 'LOSE';
    this.flying = false;
    sfx.clash();
    this.cameras.main.shake(260, 0.02);
    this.cameras.main.flash(180, 255, 60, 60);
    this.sparks.explode(18, knife.x, knife.y);
    // hit knife flashes
    hit.img.setTintFill(0xffffff);
    this.time.delayedCall(90, () => hit.img.clearTint());
    // bounce back
    knife.setDepth(26);
    this.hand = null;
    this.fallers.push({ img: knife, vx: (Math.random() - 0.5) * 240, vy: -420, va: (Math.random() < 0.5 ? -1 : 1) * (9 + Math.random() * 6) });
    this.time.delayedCall(220, () => sfx.fall());
    // slow motion, easing back
    this.slow = 0.22;
    this.slowT = 0;
    this.tweens.timeScale = 0.4;
    if (this.runScore > data().best) { data().best = this.runScore; save(); }
    this.time.delayedCall(1250, () => this.showGameOver());
  }

  // ------------------------------------------------------------ win / break
  private winLevel(): void {
    if (this.state !== 'PLAY') return;
    this.state = 'WIN';
    sfx.breakBoard();
    this.cameras.main.shake(220, 0.014);
    this.cameras.main.flash(120, 255, 255, 255, false);
    this.chips.explode(36, BOARD_X, this.BY);
    this.sparks.explode(30, BOARD_X, this.BY);
    this.hand?.destroy();
    this.hand = null;

    const rot = this.board.rotation;
    const half = BOARD_TEX / 2;
    const dirs: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    const parts: Phaser.GameObjects.Container[] = [];
    for (let q = 0; q < 4; q++) {
      const [dx, dy] = dirs[q];
      const c = this.add.container(BOARD_X, this.BY).setDepth(11).setRotation(rot);
      const piece = this.add.image(0, 0, boardKey(this.level.boardIdx)).setScale(0.5);
      piece.setCrop(dx < 0 ? 0 : half, dy < 0 ? 0 : half, half, half);
      c.add(piece);
      parts.push(c);
      // fling direction in world space (rotate local quadrant direction by board rotation)
      const ang = Math.atan2(dy, dx) + rot;
      const sp = 300 + Math.random() * 140;
      this.debris.push({ c, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 260, va: (Math.random() - 0.5) * 8, t: 0 });
    }
    // re-parent stuck knives + leftover apples to their quadrant
    const move = (img: Phaser.GameObjects.Image) => {
      const qx = img.x < 0 ? 0 : 1, qy = img.y < 0 ? 0 : 1;
      const c = parts[qy * 2 + qx];
      this.board.remove(img);
      if (this.stuck.some((k) => k.img === img)) c.addAt(img, 0); else c.add(img);
    };
    for (const s of this.stuck) move(s.img);
    for (const a of this.fruits) move(a.img);
    this.board.setVisible(false);

    const boss = this.level.boss;
    const t = makeText(this, W / 2, this.BY + 30, boss ? 'BOSS DEFEATED!' : 'STAGE CLEARED', boss ? 40 : 38, { color: boss ? '#ff6b6b' : '#7ef0b6', strokeWidth: 6 }).setDepth(60).setScale(0.3).setAlpha(0);
    this.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 380, ease: 'Back.easeOut', delay: 150 });
    this.time.delayedCall(700, () => sfx.win());

    if (this.runScore > data().best) data().best = this.runScore;
    const n = this.level.n;
    if (data().level === n) data().level = Math.min(TOTAL_LEVELS, n + 1);
    if (n === TOTAL_LEVELS) data().completed = true;
    save();

    this.time.delayedCall(1450, () => {
      t.destroy();
      const unlockIdx = KNIVES.findIndex((k) => k.unlock === n);
      if (boss && unlockIdx >= 0 && !data().unlocked.includes(unlockIdx)) {
        data().unlocked.push(unlockIdx);
        data().knife = unlockIdx;
        save();
        this.showUnlock(unlockIdx, () => this.nextLevel());
      } else if (n === TOTAL_LEVELS) {
        this.showComplete();
      } else {
        this.nextLevel();
      }
    });
  }

  private nextLevel(): void {
    const n = this.level.n;
    if (n >= TOTAL_LEVELS) { this.showComplete(); return; }
    this.cameras.main.fadeOut(220, 0, 0, 0);
    this.time.delayedCall(230, () => this.scene.restart({ level: n + 1, score: this.runScore }));
  }

  private overlay(): Phaser.GameObjects.Rectangle {
    const o = this.add.rectangle(W / 2, VIEW.h / 2, W * 3, VIEW.h * 2, 0x000000, 0).setDepth(90).setInteractive();
    this.tweens.add({ targets: o, fillAlpha: 0.66, duration: 300 });
    return o;
  }

  private showUnlock(idx: number, next: () => void): void {
    sfx.unlockJingle();
    this.overlay();
    const k = KNIVES[idx];
    const c = this.add.container(W / 2, VIEW.h / 2 + 40).setDepth(100).setScale(0.5).setAlpha(0);
    c.add(panel(this, 360, 470, 0x1a2135));
    c.add(makeText(this, 0, -190, 'NEW KNIFE!', 36, { color: '#ffd54a', strokeWidth: 5 }));
    const ring = this.add.image(0, -30, 'ring').setScale(2.2).setAlpha(0.35).setTint(this.accent);
    c.add(ring);
    const rays = this.add.graphics();
    rays.fillStyle(0xffffff, 0.08);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      rays.beginPath();
      rays.moveTo(0, -30);
      rays.lineTo(Math.cos(a) * 160, -30 + Math.sin(a) * 160);
      rays.lineTo(Math.cos(a + 0.14) * 160, -30 + Math.sin(a + 0.14) * 160);
      rays.closePath();
      rays.fillPath();
    }
    c.add(rays);
    this.tweens.add({ targets: rays, angle: 360, duration: 12000, repeat: -1 });
    const kn = this.add.image(0, -118, knifeKey(idx)).setScale(0.95).setOrigin(0.5, KNIFE_ORIGIN_Y);
    c.add(kn);
    this.tweens.add({ targets: kn, y: -110, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    c.add(makeText(this, 0, 92, k.name.toUpperCase(), 28, { strokeWidth: 4 }));
    c.add(makeText(this, 0, 126, 'Equipped', 16, { color: '#9be7ff', strokeWidth: 2, weight: '700' }));
    c.add(makeButton(this, 0, 190, 240, 58, 'AWESOME!', 0x2ecc71, () => {
      this.tweens.add({ targets: c, alpha: 0, scale: 0.7, duration: 180, onComplete: next });
    }));
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 420, ease: 'Back.easeOut' });
    this.sparks.explode(40, W / 2, VIEW.h / 2);
  }

  private showComplete(): void {
    this.overlay();
    const c = this.add.container(W / 2, VIEW.h / 2).setDepth(100).setScale(0.5).setAlpha(0);
    c.add(panel(this, 380, 400, 0x1a2135));
    c.add(makeText(this, 0, -150, 'KNIFE MASTER!', 38, { color: '#ffd54a', strokeWidth: 5 }));
    c.add(makeText(this, 0, -95, 'You cleared all 100 stages', 18, { color: '#cfd8e6', weight: '700', strokeWidth: 2 }));
    c.add(makeText(this, 0, -30, `Run score  ${this.runScore}`, 26, { strokeWidth: 3 }));
    c.add(makeText(this, 0, 12, `Best  ${data().best}`, 20, { color: '#9be7ff', strokeWidth: 3 }));
    c.add(makeButton(this, 0, 90, 240, 58, 'PLAY AGAIN', 0x2ecc71, () => { this.cameras.main.fadeOut(200); this.time.delayedCall(210, () => this.scene.restart({ level: 100, score: 0 })); }));
    c.add(makeButton(this, 0, 158, 240, 52, 'HOME', 0x546e7a, () => this.goHome(), 20));
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 420, ease: 'Back.easeOut' });
  }

  private showGameOver(): void {
    this.overlay();
    const c = this.add.container(W / 2, VIEW.h / 2 + 20).setDepth(100).setAlpha(0);
    c.y = VIEW.h / 2 + 120;
    c.add(panel(this, 380, 440, 0x1a1f2e));
    c.add(makeText(this, 0, -170, `STAGE ${this.level.n}`, 34, { color: '#ff6b6b', strokeWidth: 5 }));
    c.add(makeText(this, 0, -112, 'Missed!', 20, { color: '#cfd8e6', weight: '700', strokeWidth: 2 }));
    c.add(makeText(this, 0, -52, `${this.runScore}`, 60, { strokeWidth: 7 }));
    c.add(makeText(this, 0, -10, 'SCORE', 14, { color: '#9aa8bd', weight: '700', strokeWidth: 2 }));
    c.add(makeText(this, -70, 40, `Best ${data().best}`, 18, { color: '#9be7ff', strokeWidth: 3 }));
    c.add(this.add.image(40, 40, 'apple').setScale(0.4));
    c.add(makeText(this, 78, 40, `${data().apples}`, 18, { strokeWidth: 3 }).setOrigin(0, 0.5));
    c.add(makeButton(this, 0, 112, 250, 60, 'RESTART', 0x2ecc71, () => {
      this.cameras.main.fadeOut(180, 0, 0, 0);
      this.time.delayedCall(190, () => this.scene.restart({ level: this.level.n, score: 0 }));
    }));
    c.add(makeButton(this, 0, 180, 250, 52, 'HOME', 0x546e7a, () => this.goHome(), 20));
    this.tweens.add({ targets: c, alpha: 1, y: VIEW.h / 2 + 20, duration: 380, ease: 'Back.easeOut' });
    this.input.keyboard?.once('keydown-SPACE', () => this.scene.restart({ level: this.level.n, score: 0 }));
  }

  onResize(): void {
    if (!this.scene.isActive()) return;
    applyViewport(this);
  }

  private goHome(): void {
    if (this.runScore > data().best) { data().best = this.runScore; save(); }
    this.cameras.main.fadeOut(180, 0, 0, 0);
    this.time.delayedCall(190, () => this.scene.start('Menu'));
  }

  // ------------------------------------------------------------ loop
  override update(_t: number, deltaMs: number): void {
    const raw = Math.min(deltaMs / 1000, 0.05);
    if (this.state === 'LOSE') {
      this.slowT += raw;
      this.slow = damp(this.slow, 1, 2.2, raw);
      this.tweens.timeScale = 0.4 + 0.6 * Math.min(1, this.slowT / 1.2);
    }
    const dt = raw * this.slow;

    // board rotation pattern
    const rot = this.level.rot;
    if (this.state === 'PLAY' || this.state === 'INTRO') {
      this.segTime += dt;
      if (this.segTime >= rot[this.segIdx].dur) { this.segIdx = (this.segIdx + 1) % rot.length; this.segTime = 0; }
      this.curSpeed = damp(this.curSpeed, rot[this.segIdx].speed, 3.5, dt);   // gentle speed changes
    } else {
      this.curSpeed = damp(this.curSpeed, 0, 1.6, dt);
    }
    this.board.rotation += this.curSpeed * DEG * dt;

    // flying knife
    if (this.flying && this.hand) {
      this.hand.y -= KNIFE_SPEED * dt;
      if (this.hand.y <= this.BY + BOARD_R) {
        this.hand.y = this.BY + BOARD_R;
        this.resolveHit();
      }
    }

    // falling things (apple halves, bounced knife)
    for (let i = this.fallers.length - 1; i >= 0; i--) {
      const f = this.fallers[i];
      f.vy += 2000 * dt;
      f.img.x += f.vx * dt;
      f.img.y += f.vy * dt;
      f.img.rotation += f.va * dt;
      if (f.img.y > VIEW.h + 160) { f.img.destroy(); this.fallers.splice(i, 1); }
    }

    // board debris
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.t += dt;
      d.vy += 1700 * dt;
      d.c.x += d.vx * dt;
      d.c.y += d.vy * dt;
      d.c.rotation += d.va * dt;
      if (d.t > 0.55) d.c.alpha = Math.max(0, 1 - (d.t - 0.55) / 0.5);
      if (d.t > 1.2) { d.c.destroy(); this.debris.splice(i, 1); }
    }
  }
}
