import { W, VIEW, BOARDS, KNIVES, TOTAL_LEVELS, DEG, BOARD_R, KNIFE_DEPTH } from './config';
import { buildAllTextures, boardKey, knifeKey, KNIFE_H, KNIFE_TIP_Y } from './art';
import { sfx, data, loadSave, save } from './sfx';
import { setupCamera, applyViewport, drawBackground, makeText, makeButton, roundIconButton, pill, panel, hex } from './ui';

const KO = KNIFE_TIP_Y / KNIFE_H;

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  create(): void {
    loadSave();
    sfx.setMuted(data().muted);
    buildAllTextures(this);
    const jump = this.registry.get('startStage') as number | undefined;
    if (jump) { this.registry.remove('startStage'); this.scene.start('Game', { level: jump, score: 0 }); return; }
    this.scene.start('Menu');
  }
}

export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  onResize(): void { if (this.scene.isActive()) applyViewport(this); }

  create(): void {
    setupCamera(this);
    const lv = Math.min(TOTAL_LEVELS, data().level);
    const bIdx = Math.min(BOARDS.length - 1, Math.floor((lv - 1) / 10));
    const bd = BOARDS[bIdx];
    drawBackground(this, bd.bg[0], bd.bg[1]);
    this.cameras.main.fadeIn(250, 0, 0, 0);

    // title
    const H = VIEW.h;
    const t1 = makeText(this, W / 2, H * 0.16, 'KNIFE', 78, { strokeWidth: 9 }).setDepth(50);
    const t2 = makeText(this, W / 2, H * 0.16 + 72, 'HIT', 78, { color: hex(bd.accent), strokeWidth: 9 }).setDepth(50);
    t1.setAngle(-3); t2.setAngle(-3);
    this.tweens.add({ targets: [t1, t2], y: '-=6', duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // showcase board with a few knives
    const board = this.add.container(W / 2, H * 0.5).setDepth(10);
    const kk = knifeKey(data().knife);
    for (const a of [0, 95, 200, 290]) {
      const r = a * DEG, d = BOARD_R - KNIFE_DEPTH;
      board.add(this.add.image(-Math.sin(r) * d, Math.cos(r) * d, kk).setScale(0.5).setOrigin(0.5, KO).setRotation(r));
    }
    board.add(this.add.image(0, 0, boardKey(bIdx)).setScale(0.5));
    board.add(this.add.image(-Math.sin(150 * DEG) * (BOARD_R + 4), Math.cos(150 * DEG) * (BOARD_R + 4), 'apple').setScale(0.5).setRotation(150 * DEG + Math.PI));
    board.add(this.add.image(-Math.sin(40 * DEG) * (BOARD_R + 4), Math.cos(40 * DEG) * (BOARD_R + 4), 'orange').setScale(0.5).setRotation(40 * DEG + Math.PI));
    this.tweens.add({ targets: board, rotation: Math.PI * 2, duration: 14000, repeat: -1 });

    // hand knife
    const hand = this.add.image(W / 2, H * 0.5 + BOARD_R + 92, kk).setScale(0.5).setOrigin(0.5, KO).setDepth(20);
    this.tweens.add({ targets: hand, y: hand.y - 6, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const tap = makeText(this, W / 2, H * 0.5 + BOARD_R + 30, 'TAP TO PLAY', 26, { strokeWidth: 4 }).setDepth(50);
    this.tweens.add({ targets: tap, alpha: 0.35, duration: 650, yoyo: true, repeat: -1 });

    // stage / best / apples
    pill(this, W / 2, H - 60, 200, 40).setDepth(50);
    makeText(this, W / 2, H - 60, data().completed && lv >= TOTAL_LEVELS ? 'ALL 100 CLEARED' : `STAGE ${lv}`, 20, { strokeWidth: 3 }).setDepth(51);
    makeText(this, W / 2, H - 24, `BEST ${data().best}`, 15, { color: '#9be7ff', strokeWidth: 2, weight: '700' }).setDepth(51);
    pill(this, W - 62, 34, 96, 36).setDepth(50);
    this.add.image(W - 88, 34, 'apple').setScale(0.42).setDepth(51);
    makeText(this, W - 48, 34, `${data().apples}`, 20, { strokeWidth: 3 }).setDepth(51);

    // buttons
    const knivesBtn = makeButton(this, 96, 40, 150, 46, 'KNIVES', 0x3a86ff, () => this.scene.start('Knives'), 18).setDepth(52);
    const snd = roundIconButton(this, W - 34, 88, 42, data().muted ? '🔇' : '🔊', () => {
      data().muted = !data().muted;
      sfx.setMuted(data().muted);
      save();
      (snd.list[1] as Phaser.GameObjects.Text).setText(data().muted ? '🔇' : '🔊');
    }).setDepth(52);

    // play on tap (anywhere outside buttons)
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      sfx.unlock();
      sfx.whoosh();
      this.tweens.add({ targets: hand, y: H * 0.42, duration: 140, ease: 'Quad.easeIn' });
      this.cameras.main.fadeOut(220, 0, 0, 0);
      this.time.delayedCall(240, () => this.scene.start('Game', { level: lv, score: 0 }));
    };
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      sfx.unlock();
      const hit = this.input.hitTestPointer(p);
      if (hit.includes(knivesBtn) || hit.includes(snd)) return;
      start();
    });
    this.input.keyboard?.on('keydown-SPACE', start);
  }
}

class ResizableScene extends Phaser.Scene {
  onResize(): void { if (this.scene.isActive()) applyViewport(this); }
}

export class KnivesScene extends Phaser.Scene {
  private cards: Phaser.GameObjects.Container[] = [];
  private selRing!: Phaser.GameObjects.Graphics;
  private equippedText!: Phaser.GameObjects.Text;

  constructor() { super('Knives'); }

  onResize(): void { if (this.scene.isActive()) applyViewport(this); }

  create(): void {
    setupCamera(this);
    drawBackground(this, 0x1e2440, 0x0b0e1a);
    this.cameras.main.fadeIn(200, 0, 0, 0);
    this.cards = [];

    makeText(this, W / 2, 52, 'KNIVES', 40, { strokeWidth: 6 }).setDepth(50);
    makeText(this, W / 2, 92, `${data().unlocked.length} / ${KNIVES.length} unlocked`, 15, { color: '#9aa8bd', weight: '700', strokeWidth: 2 }).setDepth(50);
    roundIconButton(this, 36, 44, 44, '‹', () => this.back()).setDepth(52);

    const cols = 4, cw = 104, ch = 156, gapX = 8, gapY = 12;
    const x0 = W / 2 - ((cols - 1) * (cw + gapX)) / 2;
    const y0 = 200;
    this.selRing = this.add.graphics().setDepth(45);

    KNIVES.forEach((k, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = x0 + col * (cw + gapX), y = y0 + row * (ch + gapY);
      const unlocked = data().unlocked.includes(i);
      const c = this.add.container(x, y).setDepth(40);
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.3);
      g.fillRoundedRect(-cw / 2, -ch / 2 + 6, cw, ch, 18);
      g.fillStyle(unlocked ? 0x2a3350 : 0x1a1f2e, 1);
      g.fillRoundedRect(-cw / 2, -ch / 2, cw, ch, 18);
      g.lineStyle(2, 0xffffff, 0.12);
      g.strokeRoundedRect(-cw / 2, -ch / 2, cw, ch, 18);
      c.add(g);
      const img = this.add.image(0, -ch / 2 + 14, knifeKey(i)).setScale(0.44).setOrigin(0.5, KO);
      c.add(img);
      if (!unlocked) {
        img.setTint(0x0a0c14).setAlpha(0.55);
        c.add(this.add.image(0, -8, 'lock').setScale(0.6));
        c.add(makeText(this, 0, ch / 2 - 18, `STAGE ${k.unlock}`, 12, { color: '#9aa8bd', strokeWidth: 2, weight: '800' }));
      } else {
        c.add(makeText(this, 0, ch / 2 - 18, k.name.toUpperCase(), 11, { strokeWidth: 2, weight: '800' }));
      }
      c.setSize(cw, ch).setInteractive({ useHandCursor: true });
      c.on('pointerdown', () => {
        sfx.unlock();
        if (!unlocked) {
          sfx.pop();
          this.tweens.add({ targets: c, x: x + 6, duration: 40, yoyo: true, repeat: 3 });
          return;
        }
        sfx.tap();
        data().knife = i;
        save();
        this.tweens.add({ targets: c, scale: 0.92, duration: 60, yoyo: true });
        this.refreshSel();
      });
      this.cards.push(c);
    });
    this.equippedText = makeText(this, W / 2, VIEW.h - 66, '', 18, { color: '#9be7ff', strokeWidth: 3 }).setDepth(50);
    makeButton(this, W / 2, VIEW.h - 30, 220, 52, 'PLAY', 0x2ecc71, () => this.back(true), 20).setDepth(52);
    this.refreshSel();
  }

  private refreshSel(): void {
    const c = this.cards[data().knife];
    this.selRing.clear();
    this.selRing.lineStyle(4, 0x7ef0b6, 1);
    this.selRing.strokeRoundedRect(c.x - 52, c.y - 78, 104, 156, 18);
    this.equippedText.setText(`Equipped: ${KNIVES[data().knife].name}`);
  }

  private back(play = false): void {
    this.cameras.main.fadeOut(180, 0, 0, 0);
    this.time.delayedCall(190, () => (play ? this.scene.start('Game', { level: data().level, score: 0 }) : this.scene.start('Menu')));
  }
}
