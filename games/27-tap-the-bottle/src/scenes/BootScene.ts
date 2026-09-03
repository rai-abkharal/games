import Phaser from 'phaser';
import { GeneratedTextures } from '../art/GeneratedTextures';
import { GameBridge } from '../../../shared/GameBridge';
import { MAX_LEVELS } from '../levels';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    GeneratedTextures.generateAll(this);
    GameBridge.ready();
    GameBridge.setSwipeEnabled(false);

    // Support instant level testing via ?level=X query string
    const params = new URLSearchParams(window.location.search);
    const levelParam = params.get('level');
    const savedLevel = Number.parseInt(localStorage.getItem('tap-the-bottle-unlocked-level') || '1', 10);
    const requestedLevel = levelParam ? parseInt(levelParam, 10) : savedLevel;
    const startLevel = Phaser.Math.Clamp(Number.isFinite(requestedLevel) ? requestedLevel : 1, 1, MAX_LEVELS);

    this.scene.start('GameplayScene', { level: startLevel });
  }
}
