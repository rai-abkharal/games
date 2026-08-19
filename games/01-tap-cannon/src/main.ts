import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { GameOverScene } from './scenes/GameOverScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  parent: 'game-container',
  width: 480,
  height: 800,
  backgroundColor: '#f8f6f0',
  transparent: false,
  roundPixels: false,
  antialias: false,
  fps: {
    target: 120,
    min: 30,
    forceSetTimeOut: false,
    deltaHistory: 10,
    smoothStep: true,
  },
  render: {
    powerPreference: 'high-performance',
    desynchronized: true,
    batchSize: 2048,
    clearBeforeRender: true,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
      fps: 60,
      fixedStep: true,
    },
  },
  scene: [BootScene, MenuScene, GameScene, GameOverScene],
};

const game = new Phaser.Game(config);
(window as any).__PHASER_GAME__ = game;
