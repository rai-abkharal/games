import Phaser from 'phaser';
import { GeneratedTextures } from '../art/GeneratedTextures';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    GeneratedTextures.generateAll(this);

    // Support instant level testing via ?level=X query string
    const params = new URLSearchParams(window.location.search);
    const levelParam = params.get('level');
    const startLevel = levelParam ? parseInt(levelParam, 10) : 1;

    this.scene.start('GameplayScene', { level: isNaN(startLevel) ? 1 : startLevel });
  }
}
