import Phaser from 'phaser';
import { DESIGN_WIDTH } from '../config/Constants';
import { AudioManager } from '../systems/AudioManager';
import { createSceneBackground } from '../ui/SceneBackground';
import { MAX_LEVELS } from '../levels';
import { GameBridge } from '../../../shared/GameBridge';

interface CompleteSceneData {
  level: number;
  theme?: 'blue' | 'pink';
}

export class CompleteScene extends Phaser.Scene {
  private level: number = 1;
  private theme: 'blue' | 'pink' = 'blue';
  private readonly handleSoundChange = (enabled: boolean): void => {
    AudioManager.enabled = enabled;
  };
  private readonly restartLevel = (): void => {
    this.scene.start('GameplayScene', { level: this.level });
  };

  constructor() {
    super('CompleteScene');
  }

  init(data: CompleteSceneData): void {
    this.level = data.level || 1;
    this.theme = data.theme || 'blue';
  }

  create(): void {
    AudioManager.playLevelComplete();
    GameBridge.onRestart(this.restartLevel);
    GameBridge.onSoundChange(this.handleSoundChange);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);

    createSceneBackground(this, this.theme);

    // 3. Celebratory Bottle Trio at Top
    const cx = DESIGN_WIDTH / 2;
    const topY = 220;

    // Left: Yellow bottle tilted left
    const yellowBottle = this.add.image(cx - 85, topY + 12, 'bottle_yellow_sealed')
      .setDepth(5)
      .setScale(0.80)
      .setRotation(Phaser.Math.DegToRad(-14));

    // Center: Green bottle upright
    const greenBottle = this.add.image(cx, topY, 'bottle_green_sealed')
      .setDepth(6)
      .setScale(0.85);

    // Right: Orange bottle tilted right
    const orangeBottle = this.add.image(cx + 85, topY + 12, 'bottle_orange_sealed')
      .setDepth(5)
      .setScale(0.80)
      .setRotation(Phaser.Math.DegToRad(14));

    // Celebratory gentle bobbing
    this.tweens.add({
      targets: [yellowBottle, orangeBottle],
      y: '+=10',
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    this.tweens.add({
      targets: greenBottle,
      y: '-=12',
      duration: 950,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // 4. "LEVEL COMPLETE" Text
    const textY = 365;
    const isFinalLevel = this.level >= MAX_LEVELS;
    const completeText = this.add.text(cx, textY, isFinalLevel ? 'ALL LEVELS CLEARED' : 'LEVEL COMPLETE', {
      fontFamily: 'Arial Black, Trebuchet MS, sans-serif',
      fontSize: isFinalLevel ? '28px' : '36px',
      color: '#FFFFFF',
      letterSpacing: 1
    }).setOrigin(0.5, 0.5).setDepth(10);

    this.add.text(cx, textY + 45, `${this.level} / ${MAX_LEVELS}`, {
      fontFamily: 'Trebuchet MS, sans-serif',
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#EFFFFF'
    }).setOrigin(0.5).setDepth(10);

    completeText.setScale(0.6);
    completeText.setAlpha(0);
    this.tweens.add({
      targets: completeText,
      scale: 1,
      alpha: 1,
      duration: 350,
      ease: 'Back.easeOut'
    });

    // 5. Smiling Red Soda Can
    const canY = 475;
    const can = this.add.image(cx, canY, 'can_red_sealed')
      .setDepth(8)
      .setScale(0.92);

    // Can celebratory bounce
    this.tweens.add({
      targets: can,
      y: canY - 18,
      duration: 480,
      yoyo: true,
      repeat: -1,
      ease: 'Quad.easeOut'
    });

    // 6. Large Green Play Next Button
    const btnY = 660;
    const nextBtn = this.add.image(cx, btnY, 'btn_next')
      .setDepth(12)
      .setScale(0.92)
      .setInteractive({ useHandCursor: true });

    // Subtle breathing button pulse
    this.tweens.add({
      targets: nextBtn,
      scaleX: 0.98,
      scaleY: 0.98,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    nextBtn.on('pointerdown', () => {
      AudioManager.playButton();
      this.tweens.add({
        targets: nextBtn,
        scale: 0.82,
        duration: 80,
        yoyo: true,
        onComplete: () => {
          const nextLevel = isFinalLevel ? 1 : this.level + 1;
          this.scene.start('GameplayScene', { level: nextLevel });
        }
      });
    });

    this.add.text(cx, btnY + 102, isFinalLevel ? 'PLAY AGAIN' : 'NEXT LEVEL', {
      fontFamily: 'Arial Black, Trebuchet MS, sans-serif',
      fontSize: '17px',
      color: '#FFFFFF'
    }).setOrigin(0.5).setDepth(12);
  }

  private shutdown(): void {
    GameBridge.offRestart(this.restartLevel);
    GameBridge.offSoundChange(this.handleSoundChange);
  }
}
