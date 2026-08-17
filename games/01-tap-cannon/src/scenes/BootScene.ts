import Phaser from 'phaser';
import { GameBridge } from '../../shared/GameBridge';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // Generate procedural textures
    const gfx = this.make.graphics({ x: 0, y: 0 });

    // Cannon base & barrel
    gfx.fillStyle(0x38bdf8, 1);
    gfx.fillCircle(30, 30, 26);
    gfx.fillStyle(0x0284c7, 1);
    gfx.fillRect(22, 0, 16, 32);
    gfx.generateTexture('cannon', 60, 60);
    gfx.clear();

    // Cannonball
    gfx.fillStyle(0xfacc15, 1);
    gfx.fillCircle(12, 12, 10);
    gfx.fillStyle(0xfef08a, 1);
    gfx.fillCircle(9, 9, 4);
    gfx.generateTexture('cannonball', 24, 24);
    gfx.clear();

    // Target (Red Bullseye)
    gfx.fillStyle(0xef4444, 1);
    gfx.fillCircle(24, 24, 22);
    gfx.fillStyle(0xffffff, 1);
    gfx.fillCircle(24, 24, 14);
    gfx.fillStyle(0xef4444, 1);
    gfx.fillCircle(24, 24, 7);
    gfx.generateTexture('target_red', 48, 48);
    gfx.clear();

    // Target (Gold Bonus)
    gfx.fillStyle(0xf59e0b, 1);
    gfx.fillCircle(20, 20, 18);
    gfx.fillStyle(0xfef3c7, 1);
    gfx.fillCircle(20, 20, 10);
    gfx.generateTexture('target_gold', 40, 40);
    gfx.clear();

    // Sparkle Particle
    gfx.fillStyle(0xffffff, 1);
    gfx.fillCircle(4, 4, 3);
    gfx.generateTexture('particle', 8, 8);
    gfx.clear();
  }

  create() {
    GameBridge.ready();
    GameBridge.gameStarted();
    this.scene.start('GameScene');
  }
}
