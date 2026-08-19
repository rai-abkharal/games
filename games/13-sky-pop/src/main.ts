// Platform source entry. The platform's build_all.js uses Vite to bundle this entry.
// The standalone publishable build contains a browser-safe canvas implementation in index.html.
// This source preserves the required SDK contract for the official Vite pipeline.
import Phaser from 'phaser';
import { GameBridgeClient } from '../../sdk/bridge';
import { SoundSynthesizer } from '../../sdk/sound';

const GAME_ID = 'sky-pop';
const bridge = new GameBridgeClient(GAME_ID);
const sound = new SoundSynthesizer();

class MainScene extends Phaser.Scene {
  private score = 0;
  private started = false;

  constructor() { super('MainScene'); }

  create() {
    bridge.sendReady();
    bridge.onPause(() => this.scene.pause());
    bridge.onResume(() => this.scene.resume());
    bridge.onRestart(() => this.scene.restart());
    bridge.onMute((muted) => sound.setMuted(muted));

    this.input.on('pointerdown', () => {
      this.started = true;
      sound.play('pop');
      this.score += 1;
      bridge.sendScoreUpdated(this.score, 1);
    });
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-container',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 360, height: 640 },
  scene: [MainScene]
});
