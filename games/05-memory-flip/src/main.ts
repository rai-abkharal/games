import Phaser from 'phaser';
import { GameBridge } from '../../shared/GameBridge';
import { SoundFx } from '../../shared/SoundFx';

const CARD_SYMBOLS = ['💎', '🔥', '⚡', '🌟', '🍀', '🍎'];

interface CardItem {
  id: number;
  symbol: string;
  container: Phaser.GameObjects.Container;
  cardBack: Phaser.GameObjects.Rectangle;
  cardFront: Phaser.GameObjects.Rectangle;
  symbolText: Phaser.GameObjects.Text;
  isFlipped: boolean;
  isMatched: boolean;
}

class BootScene extends Phaser.Scene {
  constructor() { super({ key: 'BootScene' }); }
  create() {
    GameBridge.ready();
    GameBridge.gameStarted();
    this.scene.start('GameScene');
  }
}

class MenuScene extends Phaser.Scene {
  constructor() { super({ key: 'MenuScene' }); }
  create() {
    const { width, height } = this.scale;
    const title = this.add.text(width / 2, height * 0.28, 'MEMORY FLIP', {
      fontSize: '38px', fontStyle: 'bold', color: '#0f172a',
    }).setOrigin(0.5);

    this.tweens.add({ targets: title, scale: 1.06, duration: 800, yoyo: true, repeat: -1 });

    this.add.text(width / 2, height * 0.38, '🧠 Card Match Challenge', {
      fontSize: '20px', color: '#0d9488', fontStyle: 'bold',
    }).setOrigin(0.5);

    const btn = this.add.rectangle(width / 2, height * 0.6, 220, 60, 0x0d9488).setInteractive({ useHandCursor: true });
    btn.setStrokeStyle(3, 0x5eead4);

    this.add.text(width / 2, height * 0.6, 'START GAME', { fontSize: '22px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);

    btn.on('pointerdown', () => {
      SoundFx.playTap();
      GameBridge.gameStarted();
      this.scene.start('GameScene');
    });

    this.add.text(width / 2, height * 0.75, 'Flip 2 cards to find pairs.\nComplete all pairs in least time & moves!', {
      fontSize: '15px', color: '#64748b', align: 'center', lineSpacing: 6,
    }).setOrigin(0.5);
  }
}

class GameScene extends Phaser.Scene {
  private cards: CardItem[] = [];
  private flippedCards: CardItem[] = [];
  private matchesFound: number = 0;
  private moves: number = 0;
  private seconds: number = 0;
  private isLocked: boolean = false;
  
  private movesText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private timerEvent!: Phaser.Time.TimerEvent;

  constructor() { super({ key: 'GameScene' }); }

  create() {
    this.cards = [];
    this.flippedCards = [];
    this.matchesFound = 0;
    this.moves = 0;
    this.seconds = 0;
    this.isLocked = false;

    const { width, height } = this.scale;

    // Header UI
    this.movesText = this.add.text(24, 24, 'MOVES: 0', { fontSize: '20px', fontStyle: 'bold', color: '#0f172a' });
    this.timerText = this.add.text(width - 24, 24, 'TIME: 0s', { fontSize: '20px', fontStyle: 'bold', color: '#d97706' }).setOrigin(1, 0);

    this.timerEvent = this.time.addEvent({
      delay: 1000,
      callback: () => {
        this.seconds++;
        this.timerText.setText(`TIME: ${this.seconds}s`);
      },
      loop: true,
    });

    // Create 12 cards (6 pairs) in a 3x4 grid
    const deck = [...CARD_SYMBOLS, ...CARD_SYMBOLS].sort(() => Math.random() - 0.5);

    const cols = 3;
    const rows = 4;
    const cardW = 100;
    const cardH = 110;
    const gap = 16;
    const gridW = cols * cardW + (cols - 1) * gap;
    const startX = (width - gridW) / 2 + cardW / 2;
    const startY = height * 0.18 + cardH / 2;

    deck.forEach((sym, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = startX + col * (cardW + gap);
      const y = startY + row * (cardH + gap);

      // Card Back (Warm Slate Blue)
      const cardBack = this.add.rectangle(0, 0, cardW, cardH, 0x2563eb)
        .setStrokeStyle(3, 0x93c5fd);
      const cardBackPattern = this.add.text(0, 0, '❓', { fontSize: '32px' }).setOrigin(0.5);

      // Card Front (Pure White Card)
      const cardFront = this.add.rectangle(0, 0, cardW, cardH, 0xffffff)
        .setStrokeStyle(3, 0x0d9488).setVisible(false);
      const symbolText = this.add.text(0, 0, sym, { fontSize: '42px' }).setOrigin(0.5).setVisible(false);

      const container = this.add.container(x, y, [cardBack, cardBackPattern, cardFront, symbolText]);
      container.setSize(cardW, cardH);
      container.setInteractive({ useHandCursor: true });

      const cardItem: CardItem = {
        id: idx,
        symbol: sym,
        container,
        cardBack,
        cardFront,
        symbolText,
        isFlipped: false,
        isMatched: false,
      };

      container.on('pointerdown', () => this.handleCardFlip(cardItem));
      this.cards.push(cardItem);
    });

    GameBridge.onPause(() => this.scene.pause());
    GameBridge.onResume(() => this.scene.resume());
  }

  private handleCardFlip(card: CardItem) {
    if (this.isLocked || card.isFlipped || card.isMatched) return;

    SoundFx.playTap();
    GameBridge.haptic('light');

    // Flip card animation
    card.isFlipped = true;
    this.tweens.add({
      targets: card.container,
      scaleX: 0,
      duration: 100,
      onComplete: () => {
        card.cardBack.setVisible(false);
        (card.container.getAt(1) as Phaser.GameObjects.Text).setVisible(false);
        card.cardFront.setVisible(true);
        card.symbolText.setVisible(true);

        this.tweens.add({
          targets: card.container,
          scaleX: 1,
          duration: 100,
        });
      },
    });

    this.flippedCards.push(card);

    if (this.flippedCards.length === 2) {
      this.moves++;
      this.movesText.setText(`MOVES: ${this.moves}`);
      this.checkMatch();
    }
  }

  private checkMatch() {
    const [card1, card2] = this.flippedCards;
    this.isLocked = true;

    if (card1.symbol === card2.symbol) {
      // MATCH!
      SoundFx.playScore();
      GameBridge.haptic('medium');
      card1.isMatched = true;
      card2.isMatched = true;
      this.matchesFound++;

      this.tweens.add({
        targets: [card1.container, card2.container],
        scale: 1.12,
        duration: 150,
        yoyo: true,
        onComplete: () => {
          this.flippedCards = [];
          this.isLocked = false;

          if (this.matchesFound === 6) {
            this.handleVictory();
          }
        },
      });
    } else {
      // MISMATCH
      SoundFx.playHit();
      this.time.delayedCall(700, () => {
        [card1, card2].forEach((c) => {
          this.tweens.add({
            targets: c.container,
            scaleX: 0,
            duration: 100,
            onComplete: () => {
              c.cardBack.setVisible(true);
              (c.container.getAt(1) as Phaser.GameObjects.Text).setVisible(true);
              c.cardFront.setVisible(false);
              c.symbolText.setVisible(false);
              c.isFlipped = false;

              this.tweens.add({
                targets: c.container,
                scaleX: 1,
                duration: 100,
              });
            },
          });
        });

        this.flippedCards = [];
        this.isLocked = false;
      });
    }
  }

  private handleVictory() {
    this.timerEvent.remove();
    SoundFx.playSuccess();
    GameBridge.haptic('success');

    // Score calculation
    const baseScore = 2000;
    const timePenalty = this.seconds * 15;
    const movesPenalty = Math.max(0, (this.moves - 6) * 40);
    const finalScore = Math.max(100, baseScore - timePenalty - movesPenalty);

    GameBridge.completed({
      score: finalScore,
      level: 1,
      stats: { moves: this.moves, seconds: this.seconds },
    });

    this.time.delayedCall(600, () => {
      this.scene.start('GameOverScene', { score: finalScore, moves: this.moves, seconds: this.seconds });
    });
  }
}

class GameOverScene extends Phaser.Scene {
  private score: number = 0;
  private moves: number = 0;
  private seconds: number = 0;

  constructor() { super({ key: 'GameOverScene' }); }
  init(data: any) {
    this.score = data.score || 0;
    this.moves = data.moves || 0;
    this.seconds = data.seconds || 0;
  }

  create() {
    const { width, height } = this.scale;
    this.add.text(width / 2, height * 0.26, 'CLEARED!', { fontSize: '42px', fontStyle: 'bold', color: '#0d9488' }).setOrigin(0.5);
    this.add.text(width / 2, height * 0.36, `⏱️ ${this.seconds}s   •   🎯 ${this.moves} moves`, { fontSize: '18px', color: '#64748b', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(width / 2, height * 0.46, `${this.score} PTS`, { fontSize: '52px', fontStyle: 'bold', color: '#2563eb' }).setOrigin(0.5);

    const btn = this.add.rectangle(width / 2, height * 0.65, 220, 60, 0x0d9488).setInteractive({ useHandCursor: true });
    btn.setStrokeStyle(3, 0x5eead4);
    this.add.text(width / 2, height * 0.65, 'PLAY AGAIN', { fontSize: '22px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);

    const restart = () => {
      SoundFx.playTap();
      GameBridge.gameStarted();
      this.scene.start('GameScene');
    };
    btn.on('pointerdown', restart);
    GameBridge.onRestart(restart);
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  parent: 'game-container',
  width: 480,
  height: 800,
  backgroundColor: '#f8f6f0',
  transparent: false,
  roundPixels: true,
  autoRound: true,
  antialias: false,
  fps: {
    target: 60,
    min: 30,
    forceSetTimeOut: false,
    deltaHistory: 10,
    smoothStep: true,
  },
  render: {
    powerPreference: 'high-performance',
    batchSize: 2048,
    clearBeforeRender: true,
  },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, MenuScene, GameScene, GameOverScene],
};

const game = new Phaser.Game(config);
(window as any).__PHASER_GAME__ = game;
