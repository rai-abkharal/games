import Phaser from 'phaser';
import { GameBridgeClient } from '../../sdk/bridge';
import { SoundSynthesizer } from '../../sdk/sound';

const GAME_ID = 'neon-switch';
const WIDTH = 360;
const HEIGHT = 640;
const bridge = new GameBridgeClient(GAME_ID);
const sound = new SoundSynthesizer();

type FallingOrb = Phaser.GameObjects.Container & {
  lane: number;
  speed: number;
  counted: boolean;
};

class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  create() {
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(4, 4, 4);
    g.generateTexture('particle', 8, 8);
    g.destroy();
    this.scene.start('MainScene');
  }
}

class MainScene extends Phaser.Scene {
  private score = 0;
  private best = 0;
  private combo = 0;
  private elapsed = 0;
  private lane = 1;
  private targetX = WIDTH / 2;
  private gameOver = false;
  private player!: Phaser.GameObjects.Container;
  private scoreText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private orbs: FallingOrb[] = [];
  private spawnTimer?: Phaser.Time.TimerEvent;

  private readonly laneX = [90, 180, 270];

  constructor() { super('MainScene'); }

  create() {
    this.best = Number(localStorage.getItem('neon-switch-best') || 0);

    this.drawBackground();
    this.createHUD();
    this.createPlayer();

    bridge.sendReady();

    bridge.onPause(() => this.scene.pause());
    bridge.onResume(() => this.scene.resume());
    bridge.onRestart(() => this.scene.restart());
    bridge.onMute((muted) => sound.setMuted(muted));

    this.input.on('pointerdown', () => {
      if (this.gameOver) {
        sound.play('pop');
        this.scene.restart();
        return;
      }
      this.switchLane();
    });

    this.spawnTimer = this.time.addEvent({
      delay: 820,
      loop: true,
      callback: this.spawnOrb,
      callbackScope: this
    });

    this.spawnOrb();
    this.showIntro();
  }

  update(_time: number, delta: number) {
    if (this.gameOver) return;

    this.elapsed += delta;
    const difficulty = Math.min(1.9, 1 + this.elapsed / 30000);

    this.player.x = Phaser.Math.Linear(this.player.x, this.targetX, 0.2);

    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const orb = this.orbs[i];
      orb.y += orb.speed * difficulty * delta / 16.67;

      if (!orb.counted && orb.y > HEIGHT - 115) {
        orb.counted = true;
        this.score++;
        this.combo++;
        this.scoreText.setText(String(this.score));
        this.comboText.setText(this.combo >= 3 ? `COMBO ×${this.combo}` : '');
        bridge.sendScoreUpdated(this.score, 1);
        this.scorePulse();
        this.burst(orb.x, orb.y, 10);
      }

      if (this.collides(this.player, orb)) {
        this.endGame();
        return;
      }

      if (orb.y > HEIGHT + 70) {
        orb.destroy();
        this.orbs.splice(i, 1);
      }
    }
  }

  private drawBackground() {
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x050816, 0x090b24, 0x111b45, 0x050816, 1);
    bg.fillRect(0, 0, WIDTH, HEIGHT);

    [0x2837ff, 0x9b35ff, 0x00d9ff].forEach((color, i) => {
      const glow = this.add.circle(
        Phaser.Math.Between(30, WIDTH - 30),
        Phaser.Math.Between(90, HEIGHT - 120),
        105 + i * 18,
        color,
        0.055
      );
      this.tweens.add({
        targets: glow,
        scale: 1.25,
        alpha: 0.015,
        duration: 2400 + i * 450,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    });

    for (const x of this.laneX) {
      this.add.rectangle(x, HEIGHT / 2 + 25, 2, HEIGHT - 145, 0x66eaff, 0.09);
      this.add.rectangle(x, HEIGHT - 105, 42, 2, 0x66eaff, 0.18);
    }

    for (let i = 0; i < 28; i++) {
      const star = this.add.circle(
        Phaser.Math.Between(8, WIDTH - 8),
        Phaser.Math.Between(55, HEIGHT - 75),
        Phaser.Math.Between(1, 2),
        0xffffff,
        Phaser.Math.FloatBetween(0.08, 0.32)
      );
      this.tweens.add({
        targets: star,
        alpha: 0.02,
        yoyo: true,
        repeat: -1,
        duration: Phaser.Math.Between(900, 2200),
        delay: Phaser.Math.Between(0, 1200)
      });
    }
  }

  private createHUD() {
    this.scoreText = this.add.text(WIDTH / 2, 34, '0', {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: '42px',
      color: '#ffffff',
      stroke: '#00eaff',
      strokeThickness: 7
    }).setOrigin(0.5).setDepth(20);

    this.bestText = this.add.text(16, 16, `BEST ${this.best}`, {
      fontFamily: 'Arial, sans-serif',
      fontSize: '12px',
      color: '#9fb5ff'
    }).setDepth(20);

    this.comboText = this.add.text(WIDTH - 16, 16, '', {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: '13px',
      color: '#ffe66d'
    }).setOrigin(1, 0).setDepth(20);
  }

  private createPlayer() {
    this.player = this.add.container(this.laneX[this.lane], HEIGHT - 94).setDepth(15);

    const aura = this.add.circle(0, 0, 31, 0x00eaff, 0.07);
    const glow = this.add.circle(0, 0, 22, 0x00eaff, 0.14);
    const ring = this.add.circle(0, 0, 19, 0x00eaff, 0);
    ring.setStrokeStyle(3, 0x00eaff, 0.95);
    const core = this.add.circle(0, 0, 10, 0xffffff, 1);

    this.player.add([aura, glow, ring, core]);

    this.tweens.add({
      targets: aura,
      scale: 1.35,
      alpha: 0.01,
      duration: 850,
      repeat: -1,
      ease: 'Sine.easeOut'
    });

    this.tweens.add({
      targets: this.player,
      y: HEIGHT - 100,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  private switchLane() {
    const next = this.lane === 0 ? 1 : this.lane === 2 ? 1 : (Math.random() < 0.5 ? 0 : 2);
    this.lane = next;
    this.targetX = this.laneX[next];

    sound.play('pop');

    this.tweens.add({
      targets: this.player,
      scaleX: 1.3,
      scaleY: 0.78,
      duration: 70,
      yoyo: true,
      ease: 'Quad.easeOut'
    });

    this.burst(this.targetX, this.player.y, 8);
  }

  private spawnOrb() {
    if (this.gameOver) return;

    const lane = Phaser.Math.Between(0, 2);
    const orb = this.add.container(this.laneX[lane], -55).setDepth(12) as FallingOrb;
    orb.lane = lane;
    orb.speed = Phaser.Math.Between(4, 5.5);
    orb.counted = false;

    const aura = this.add.circle(0, 0, 31, 0xff3d81, 0.08);
    const ring = this.add.circle(0, 0, 23, 0xff3d81, 0);
    ring.setStrokeStyle(4, 0xff3d81, 0.9);
    const core = this.add.circle(0, 0, 15, 0xff3d81, 0.95);
    const shine = this.add.circle(-5, -5, 5, 0xffffff, 0.75);
    orb.add([aura, ring, core, shine]);
    this.orbs.push(orb);

    this.tweens.add({
      targets: ring,
      angle: 360,
      duration: 1100,
      repeat: -1,
      ease: 'Linear'
    });

    this.tweens.add({
      targets: aura,
      scale: 1.3,
      alpha: 0.015,
      duration: 600,
      yoyo: true,
      repeat: -1
    });
  }

  private collides(a: Phaser.GameObjects.Container, b: FallingOrb) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy) < 31;
  }

  private scorePulse() {
    this.tweens.add({
      targets: this.scoreText,
      scale: 1.18,
      duration: 90,
      yoyo: true,
      ease: 'Back.easeOut'
    });
  }

  private burst(x: number, y: number, count: number) {
    const particles = this.add.particles(x, y, 'particle', {
      lifespan: 450,
      speed: { min: 35, max: 145 },
      scale: { start: 0.65, end: 0 },
      alpha: { start: 0.8, end: 0 },
      quantity: count,
      emitting: false
    });
    particles.explode(count);
    this.time.delayedCall(500, () => particles.destroy());
  }

  private showIntro() {
    const title = this.add.text(WIDTH / 2, HEIGHT * 0.39, 'TAP TO\nSWITCH', {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: '28px',
      color: '#ffffff',
      align: 'center',
      stroke: '#7a5cff',
      strokeThickness: 8
    }).setOrigin(0.5).setDepth(30);

    const hint = this.add.text(WIDTH / 2, HEIGHT * 0.52, 'DODGE THE NEON ORBS', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '11px',
      color: '#7defff'
    }).setOrigin(0.5).setDepth(30);

    this.tweens.add({
      targets: [title, hint],
      alpha: 0,
      y: '-=15',
      delay: 1100,
      duration: 650,
      ease: 'Quad.easeIn',
      onComplete: () => { title.destroy(); hint.destroy(); }
    });
  }

  private endGame() {
    this.gameOver = true;
    this.spawnTimer?.remove(false);
    sound.play('error');

    this.cameras.main.flash(180, 255, 60, 130);
    this.cameras.main.shake(260, 0.012);

    if (this.score > this.best) {
      this.best = this.score;
      localStorage.setItem('neon-switch-best', String(this.best));
      this.bestText.setText(`BEST ${this.best}`);
    }

    bridge.sendGameOver(this.score, 1, Math.max(1000, Math.round(this.elapsed)));

    this.time.delayedCall(320, () => this.showGameOver());
  }

  private showGameOver() {
    const panel = this.add.container(0, 0).setDepth(50);
    const dim = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x02030c, 0.74);
    const card = this.add.rectangle(WIDTH / 2, HEIGHT / 2 + 5, 286, 255, 0x101536, 0.97);
    card.setStrokeStyle(2, 0x5e72ff, 0.7);

    const title = this.add.text(WIDTH / 2, HEIGHT / 2 - 82, 'RUN OVER', {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: '28px',
      color: '#ffffff',
      stroke: '#ff3d81',
      strokeThickness: 6
    }).setOrigin(0.5);

    const score = this.add.text(WIDTH / 2, HEIGHT / 2 - 28, String(this.score), {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: '48px',
      color: '#00eaff'
    }).setOrigin(0.5);

    const best = this.add.text(WIDTH / 2, HEIGHT / 2 + 20, `BEST  ${this.best}`, {
      fontFamily: 'Arial, sans-serif',
      fontSize: '14px',
      color: '#b7c5ff'
    }).setOrigin(0.5);

    const button = this.add.rectangle(WIDTH / 2, HEIGHT / 2 + 78, 190, 48, 0x5e72ff)
      .setInteractive({ useHandCursor: true });

    const buttonText = this.add.text(WIDTH / 2, HEIGHT / 2 + 78, 'TAP TO RETRY', {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: '13px',
      color: '#ffffff'
    }).setOrigin(0.5);

    button.on('pointerdown', () => {
      sound.play('pop');
      this.scene.restart();
    });

    panel.add([dim, card, title, score, best, button, buttonText]);
    panel.setScale(0.82).setAlpha(0);

    this.tweens.add({
      targets: panel,
      scale: 1,
      alpha: 1,
      duration: 360,
      ease: 'Back.easeOut'
    });
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#050816',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: WIDTH,
    height: HEIGHT
  },
  render: {
    antialias: true,
    roundPixels: false
  },
  scene: [BootScene, MainScene]
});
