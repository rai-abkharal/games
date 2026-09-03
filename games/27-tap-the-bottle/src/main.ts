import Phaser from 'phaser';
import { GameConfig } from './config/GameConfig';

window.addEventListener('DOMContentLoaded', () => {
  const game = new Phaser.Game(GameConfig);
  (window as typeof window & { __PHASER_GAME__?: Phaser.Game }).__PHASER_GAME__ = game;
});
