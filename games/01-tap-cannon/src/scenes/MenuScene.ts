import Phaser from 'phaser';
import { GameBridge } from '../../shared/GameBridge';
import { SoundFx } from '../../shared/SoundFx';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create() {
    const { width, height } = this.scale;

    const title = this.add.text(width / 2, height * 0.28, 'TAP CANNON', {
      fontSize: '40px',
      fontStyle: 'bold',
      color: '#0f172a',
      align: 'center',
    }).setOrigin(0.5);

    this.tweens.add({
      targets: title,
      scale: 1.06,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.add.text(width / 2, height * 0.38, '🎯 30-Second Target Blitz', {
      fontSize: '20px',
      color: '#475569',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Play Button
    const btnBg = this.add.rectangle(width / 2, height * 0.6, 220, 60, 0x2563eb)
      .setInteractive({ useHandCursor: true });
    btnBg.setStrokeStyle(3, 0x60a5fa);

    this.add.text(width / 2, height * 0.6, 'START GAME', {
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5);

    const startGame = () => {
      SoundFx.playTap();
      GameBridge.gameStarted();
      this.scene.start('GameScene');
    };

    btnBg.on('pointerdown', startGame);

    // Instructions
    this.add.text(width / 2, height * 0.75, 'Tap anywhere to aim & blast targets!\nGold targets award +200 bonus pts.', {
      fontSize: '15px',
      color: '#64748b',
      align: 'center',
      lineSpacing: 8,
    }).setOrigin(0.5);
  }
}
