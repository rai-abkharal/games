import Phaser from 'phaser';
import { DESIGN_WIDTH, GAME_HEIGHT, DESIGN_GRAVITY } from './Constants';
import { BootScene } from '../scenes/BootScene';
import { GameplayScene } from '../scenes/GameplayScene';
import { CompleteScene } from '../scenes/CompleteScene';
import { FailedScene } from '../scenes/FailedScene';

export const GameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: DESIGN_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#0b1e36',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: DESIGN_WIDTH,
    height: GAME_HEIGHT
  },
  render: {
    antialias: true,
    roundPixels: false,
    powerPreference: 'high-performance'
  },
  fps: {
    target: 60,
    min: 30,
    smoothStep: true
  },
  physics: {
    default: 'matter',
    matter: {
      gravity: { x: 0, y: DESIGN_GRAVITY },
      debug: false
    }
  },
  scene: [BootScene, GameplayScene, CompleteScene, FailedScene]
};
