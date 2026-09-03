import Phaser from 'phaser';
import { DESIGN_WIDTH, DESIGN_HEIGHT } from './config/Constants';
import { GameplayScene } from './scenes/GameplayScene';
import { CompleteScene } from './scenes/CompleteScene';
import { FailedScene } from './scenes/FailedScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: DESIGN_WIDTH,
  height: DESIGN_HEIGHT,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  backgroundColor: '#0b1e36',
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: 1.15 },
      debug: false,
      runner: {
        fps: 60
      }
    }
  },
  scene: [GameplayScene, CompleteScene, FailedScene]
};

new Phaser.Game(config);
