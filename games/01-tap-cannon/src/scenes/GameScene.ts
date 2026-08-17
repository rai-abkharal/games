import Phaser from 'phaser';
import { GameBridge } from '../../shared/GameBridge';
import { SoundFx } from '../../shared/SoundFx';

interface TargetItem {
  sprite: Phaser.GameObjects.Sprite;
  type: 'red' | 'gold';
  points: number;
  speed: number;
  dir: number;
}

export class GameScene extends Phaser.Scene {
  private cannon!: Phaser.GameObjects.Sprite;
  private cannonballs!: Phaser.GameObjects.Group;
  private targets: TargetItem[] = [];
  private particles!: Phaser.GameObjects.Particles.ParticleEmitter;
  
  private score: number = 0;
  private timeLeft: number = 30;
  private timerEvent!: Phaser.Time.TimerEvent;
  private spawnEvent!: Phaser.Time.TimerEvent;
  
  private scoreText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private comboCount: number = 0;
  private isGameOver: boolean = false;

  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    this.score = 0;
    this.timeLeft = 30;
    this.comboCount = 0;
    this.isGameOver = false;
    this.targets = [];

    const { width, height } = this.scale;

    // Background soft dots
    for (let i = 0; i < 25; i++) {
      const x = Phaser.Math.Between(10, width - 10);
      const y = Phaser.Math.Between(10, height - 10);
      this.add.circle(x, y, Phaser.Math.Between(2, 3), 0xd6d1c7);
    }

    // UI Header
    this.scoreText = this.add.text(24, 28, 'SCORE: 0', {
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#0f172a',
    });

    this.timerText = this.add.text(width - 24, 28, 'TIME: 30', {
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#d97706',
    }).setOrigin(1, 0);

    // Particle Emitter
    this.particles = this.add.particles(0, 0, 'particle', {
      speed: { min: 80, max: 200 },
      scale: { start: 1, end: 0 },
      blendMode: 'ADD',
      lifespan: 400,
      emitting: false,
    });

    // Cannonball Group
    this.cannonballs = this.add.group();

    // Cannon positioned at bottom center
    this.cannon = this.add.sprite(width / 2, height - 60, 'cannon').setDepth(10);

    // Tap to Shoot
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.isGameOver) return;
      this.shootAt(pointer.x, pointer.y);
    });

    // Timer (1 second countdown)
    this.timerEvent = this.time.addEvent({
      delay: 1000,
      callback: this.tickTimer,
      callbackScope: this,
      loop: true,
    });

    // Target Spawner
    this.spawnEvent = this.time.addEvent({
      delay: 900,
      callback: this.spawnTarget,
      callbackScope: this,
      loop: true,
    });

    // Spawn first targets
    this.spawnTarget();
    this.spawnTarget();

    // Register bridge pause/resume
    GameBridge.onPause(() => this.scene.pause());
    GameBridge.onResume(() => this.scene.resume());
  }

  private shootAt(targetX: number, targetY: number) {
    const angle = Phaser.Math.Angle.Between(this.cannon.x, this.cannon.y, targetX, targetY);
    this.cannon.setRotation(angle + Math.PI / 2);

    SoundFx.playShoot();
    GameBridge.haptic('light');

    const ball = this.add.sprite(this.cannon.x, this.cannon.y, 'cannonball');
    this.cannonballs.add(ball);

    const speed = 900;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    (ball as any).vx = vx;
    (ball as any).vy = vy;

    // Small cannon recoil tween
    this.tweens.add({
      targets: this.cannon,
      scaleX: 1.15,
      scaleY: 0.85,
      duration: 60,
      yoyo: true,
    });
  }

  private spawnTarget() {
    if (this.isGameOver) return;
    const { width } = this.scale;
    const isGold = Math.random() < 0.25;
    const type = isGold ? 'gold' : 'red';
    const texture = isGold ? 'target_gold' : 'target_red';
    const points = isGold ? 200 : 100;

    const y = Phaser.Math.Between(100, 480);
    const startFromLeft = Math.random() < 0.5;
    const x = startFromLeft ? -30 : width + 30;
    const dir = startFromLeft ? 1 : -1;
    const speed = Phaser.Math.Between(90, 180);

    const sprite = this.add.sprite(x, y, texture);
    this.targets.push({ sprite, type, points, speed, dir });
  }

  private tickTimer() {
    this.timeLeft--;
    this.timerText.setText(`TIME: ${this.timeLeft}`);

    if (this.timeLeft <= 5) {
      this.timerText.setColor('#ef4444');
      SoundFx.playTap();
    }

    if (this.timeLeft <= 0) {
      this.endGame();
    }
  }

  update(_time: number, delta: number) {
    if (this.isGameOver) return;

    const dt = delta / 1000;
    const { width, height } = this.scale;

    // Move Cannonballs
    const balls = this.cannonballs.getChildren() as Phaser.GameObjects.Sprite[];
    for (let i = balls.length - 1; i >= 0; i--) {
      const ball = balls[i];
      ball.x += (ball as any).vx * dt;
      ball.y += (ball as any).vy * dt;

      // Check offscreen
      if (ball.y < -20 || ball.x < -20 || ball.x > width + 20) {
        ball.destroy();
        continue;
      }

      // Check collision with targets
      for (let j = this.targets.length - 1; j >= 0; j--) {
        const target = this.targets[j];
        const dist = Phaser.Math.Distance.Between(ball.x, ball.y, target.sprite.x, target.sprite.y);
        const radius = target.type === 'gold' ? 24 : 28;

        if (dist < radius) {
          // HIT!
          SoundFx.playHit();
          SoundFx.playScore();
          GameBridge.haptic('medium');

          this.particles.emitParticleAt(target.sprite.x, target.sprite.y, 16);
          this.comboCount++;
          const comboBonus = Math.min(this.comboCount * 10, 100);
          const earned = target.points + comboBonus;
          this.score += earned;
          this.scoreText.setText(`SCORE: ${this.score}`);

          // Floating score text
          const popup = this.add.text(target.sprite.x, target.sprite.y, `+${earned}`, {
            fontSize: '20px',
            fontStyle: 'bold',
            color: target.type === 'gold' ? '#facc15' : '#38bdf8',
          }).setOrigin(0.5);

          this.tweens.add({
            targets: popup,
            y: popup.y - 40,
            alpha: 0,
            duration: 600,
            onComplete: () => popup.destroy(),
          });

          target.sprite.destroy();
          this.targets.splice(j, 1);
          ball.destroy();
          break;
        }
      }
    }

    // Move targets
    for (let i = this.targets.length - 1; i >= 0; i--) {
      const target = this.targets[i];
      target.sprite.x += target.speed * target.dir * dt;

      if ((target.dir === 1 && target.sprite.x > width + 50) || (target.dir === -1 && target.sprite.x < -50)) {
        target.sprite.destroy();
        this.targets.splice(i, 1);
      }
    }
  }

  private endGame() {
    this.isGameOver = true;
    this.timerEvent.remove();
    this.spawnEvent.remove();
    SoundFx.playGameOver();

    GameBridge.gameOver({
      score: this.score,
      timeSpentSeconds: 30,
      stats: { finalScore: this.score },
    });

    this.scene.start('GameOverScene', { score: this.score });
  }
}
