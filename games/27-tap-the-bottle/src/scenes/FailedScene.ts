import Phaser from 'phaser';
import { DESIGN_WIDTH } from '../config/Constants';
import { AudioManager } from '../systems/AudioManager';
import { createSceneBackground } from '../ui/SceneBackground';
import { GameBridge } from '../../../shared/GameBridge';

interface FailedSceneData {
  level: number;
  theme?: 'blue' | 'pink';
}

export class FailedScene extends Phaser.Scene {
  private level: number = 1;
  private theme: 'blue' | 'pink' = 'blue';
  private readonly handleSoundChange = (enabled: boolean): void => {
    AudioManager.enabled = enabled;
  };
  private readonly retryLevel = (): void => {
    this.scene.start('GameplayScene', { level: this.level });
  };

  constructor() {
    super('FailedScene');
  }

  init(data: FailedSceneData): void {
    this.level = data.level || 1;
    this.theme = data.theme || 'blue';
  }

  create(): void {
    AudioManager.playLevelFailed();
    GameBridge.onRestart(this.retryLevel);
    GameBridge.onSoundChange(this.handleSoundChange);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);

    createSceneBackground(this, this.theme);

    // 3. Shocked / Worried Bottle Trio at Top
    const cx = DESIGN_WIDTH / 2;
    const topY = 220;

    // Left: Yellow bottle opened
    const yellowBottle = this.add.image(cx - 85, topY + 12, 'bottle_yellow_opened')
      .setDepth(5)
      .setScale(0.80)
      .setRotation(Phaser.Math.DegToRad(-14));

    // Center: Green bottle opened upright
    const greenBottle = this.add.image(cx, topY, 'bottle_green_opened')
      .setDepth(6)
      .setScale(0.85);

    // Right: Orange bottle opened
    const orangeBottle = this.add.image(cx + 85, topY + 12, 'bottle_orange_opened')
      .setDepth(5)
      .setScale(0.80)
      .setRotation(Phaser.Math.DegToRad(14));

    // Worried shivering tween
    this.tweens.add({
      targets: [yellowBottle, orangeBottle, greenBottle],
      x: '+=3',
      duration: 80,
      yoyo: true,
      repeat: 6,
      ease: 'Sine.easeInOut'
    });

    // 4. "LEVEL FAILED" Text
    const textY = 365;
    const failedText = this.add.text(cx, textY, 'LEVEL FAILED', {
      fontFamily: 'Arial Black, Trebuchet MS, sans-serif',
      fontSize: '46px',
      color: '#FFFFFF',
      letterSpacing: 2
    }).setOrigin(0.5, 0.5).setDepth(10);

    failedText.setScale(0.6);
    failedText.setAlpha(0);
    this.tweens.add({
      targets: failedText,
      scale: 1,
      alpha: 1,
      duration: 350,
      ease: 'Back.easeOut'
    });

    // 5. Shocked / Sad Red Soda Can
    const canY = 475;
    this.add.image(cx, canY, 'can_red_opened')
      .setDepth(8)
      .setScale(0.92);

    // 6. Large Green Circular Retry Button
    const btnY = 660;
    const retryBtn = this.add.image(cx, btnY, 'btn_retry')
      .setDepth(12)
      .setScale(0.92)
      .setInteractive({ useHandCursor: true });

    // Subtle breathing pulse
    this.tweens.add({
      targets: retryBtn,
      scaleX: 0.98,
      scaleY: 0.98,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    retryBtn.on('pointerdown', () => {
      AudioManager.playButton();
      this.tweens.add({
        targets: retryBtn,
        scale: 0.82,
        duration: 80,
        yoyo: true,
        onComplete: () => {
          this.scene.start('GameplayScene', { level: this.level });
        }
      });
    });

    this.add.text(cx, btnY + 102, 'TRY AGAIN', {
      fontFamily: 'Arial Black, Trebuchet MS, sans-serif',
      fontSize: '17px',
      color: '#FFFFFF'
    }).setOrigin(0.5).setDepth(12);
  }

  private shutdown(): void {
    GameBridge.offRestart(this.retryLevel);
    GameBridge.offSoundChange(this.handleSoundChange);
  }
}
