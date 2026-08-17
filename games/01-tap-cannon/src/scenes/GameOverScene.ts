import Phaser from 'phaser';
import { GameBridge } from '../../shared/GameBridge';
import { SoundFx } from '../../shared/SoundFx';

export class GameOverScene extends Phaser.Scene {
  private finalScore: number = 0;

  constructor() {
    super({ key: 'GameOverScene' });
  }

  init(data: { score: number }) {
    this.finalScore = data.score || 0;
  }

  create() {
    const { width, height } = this.scale;

    this.add.text(width / 2, height * 0.28, 'TIME UP!', {
      fontSize: '42px',
      fontStyle: 'bold',
      color: '#dc2626',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.40, `FINAL SCORE`, {
      fontSize: '20px',
      color: '#64748b',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const scoreTxt = this.add.text(width / 2, height * 0.48, `${this.finalScore}`, {
      fontSize: '56px',
      fontStyle: 'bold',
      color: '#2563eb',
    }).setOrigin(0.5);

    this.tweens.add({
      targets: scoreTxt,
      scale: 1.1,
      duration: 600,
      yoyo: true,
      repeat: -1,
    });

    // Play Again Button
    const btn = this.add.rectangle(width / 2, height * 0.65, 220, 60, 0x2563eb)
      .setInteractive({ useHandCursor: true });
    btn.setStrokeStyle(3, 0x60a5fa);

    this.add.text(width / 2, height * 0.65, 'PLAY AGAIN', {
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    const restart = () => {
      SoundFx.playTap();
      GameBridge.gameStarted();
      this.scene.start('GameScene');
    };

    btn.on('pointerdown', restart);
    GameBridge.onRestart(restart);
  }
}
