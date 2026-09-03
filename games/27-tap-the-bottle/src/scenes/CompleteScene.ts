import Phaser from 'phaser';
import { DESIGN_WIDTH, DESIGN_HEIGHT } from '../config/Constants';
import { AudioManager } from '../systems/AudioManager';

interface CompleteSceneData {
  level: number;
  theme?: 'blue' | 'pink';
}

export class CompleteScene extends Phaser.Scene {
  private level: number = 1;
  private theme: 'blue' | 'pink' = 'blue';

  constructor() {
    super('CompleteScene');
  }

  init(data: CompleteSceneData): void {
    this.level = data.level || 1;
    this.theme = data.theme || 'blue';
  }

  create(): void {
    AudioManager.playLevelComplete();

    // 1. Background Gradient
    const bgGraphics = this.add.graphics().setDepth(0);
    if (this.theme === 'pink') {
      bgGraphics.fillGradientStyle(0xFEE1E4, 0xFEE1E4, 0xFE9ADF, 0xFE9ADF, 1);
    } else {
      bgGraphics.fillGradientStyle(0x12B9D6, 0x12B9D6, 0x0077D1, 0x0077D1, 1);
    }
    bgGraphics.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);

    // 2. Subtle Faint Bottle Pattern
    this.add.tileSprite(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2, DESIGN_WIDTH, DESIGN_HEIGHT, 'bg_pattern')
      .setDepth(1)
      .setAlpha(0.65);

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
    const completeText = this.add.text(cx, textY, 'LEVEL COMPLETE', {
      fontFamily: 'Bebas Neue, Outfit, sans-serif',
      fontSize: '46px',
      color: '#FFFFFF',
      letterSpacing: 2
    }).setOrigin(0.5, 0.5).setDepth(10);

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
          const nextLevel = this.level + 1;
          this.scene.start('GameplayScene', { level: nextLevel });
        }
      });
    });
  }
}
