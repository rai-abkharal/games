const fs = require('fs');

const p1 = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <title>Sudoku Pro</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700;800;900&family=Inter:wght@400;500;600;700;800;900&family=Nunito:wght@700;800;900&display=swap" rel="stylesheet">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
    }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #F8FAFC;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      touch-action: none;
    }
    #game-container {
      position: relative;
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
      touch-action: none;
    }
  </style>
</head>
<body>
  <div id="game-container">
    <canvas id="gameCanvas"></canvas>
  </div>

  <script>
    'use strict';

    // 1. THEME & PALETTE (Modern Editorial Light Theme)
    const THEME = {
      bgTop: '#F8FAFC',
      bgBottom: '#EEF2F6',
      cardBg: '#FFFFFF',
      cardBorder: '#CBD5E1',
      outerBorder: '#1E293B',
      cardShadow: 'rgba(15, 23, 42, 0.08)',
      majorGrid: '#334155',
      minorGrid: '#E2E8F0',
      clueDigit: '#0F172A',
      userDigit: '#2563EB',
      errorDigit: '#DC2626',
      errorBg: '#FEE2E2',
      selectedFill: '#EEF2FF',
      selectedBorder: '#6366F1',
      relatedFill: '#F8FAFC',
      sameNumFill: '#DBEAFE',
      sameNumText: '#1E40AF',
      btnDefaultBg: '#FFFFFF',
      btnDefaultBorder: '#E2E8F0',
      btnDefaultText: '#334155',
      accentGreen: '#22C55E',
      accentYellow: '#F59E0B',
      accentRed: '#EF4444',
      accentPurple: '#8B5CF6'
    };

    // 4 Difficulty tiers matching the custom avatars & colors
    const DIFFICULTIES = [
      { id: 'easy', label: 'EASY', clues: 60, coins: 25, color: '#22C55E', type: 'easy', subtitle: 'Relaxed & Fun' },
      { id: 'medium', label: 'MEDIUM', clues: 50, coins: 50, color: '#F59E0B', type: 'medium', subtitle: 'Balanced Logic' },
      { id: 'hard', label: 'HARD', clues: 40, coins: 75, color: '#EF4444', type: 'hard', subtitle: 'Deep Strategy' },
      { id: 'expert', label: 'EXPERT', clues: 32, coins: 100, color: '#8B5CF6', type: 'expert', subtitle: 'Master Level' }
    ];

    // 2. SOUND SYNTHESIZER
    class SoundSynth {
      constructor() {
        this.ctx = null;
        this.muted = false;
        this.notes = [523.25, 587.33, 659.25, 698.46, 783.99, 880.00, 987.77, 1046.50, 1174.66];
      }

      init() {
        if (!this.ctx) {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (AudioContext) this.ctx = new AudioContext();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
      }

      playDigit(num) {
        if (this.muted || !this.ctx) return;
        this.init();
        const t = this.ctx.currentTime;
        const freq = this.notes[(num - 1) % this.notes.length];

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);

        const osc2 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(freq * 2, t);

        gain.gain.setValueAtTime(0.24, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

        gain2.gain.setValueAtTime(0.08, t);
        gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

        osc.connect(gain);
        osc2.connect(gain2);
        gain.connect(this.ctx.destination);
        gain2.connect(this.ctx.destination);

        osc.start(t);
        osc2.start(t);
        osc.stop(t + 0.36);
        osc2.stop(t + 0.23);
      }

      playTap() {
        if (this.muted || !this.ctx) return;
        this.init();
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, t);
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.05);
      }

      playErase() {
        if (this.muted || !this.ctx) return;
        this.init();
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, t);
        osc.frequency.exponentialRampToValueAtTime(220, t + 0.12);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.13);
      }

      playError() {
        if (this.muted || !this.ctx) return;
        this.init();
        const t = this.ctx.currentTime;
        [180, 150].forEach((f, i) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(f, t + i * 0.08);
          gain.gain.setValueAtTime(0.14, t + i * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.12);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t + i * 0.08);
          osc.stop(t + i * 0.08 + 0.13);
        });
      }

      playBlockComplete() {
        if (this.muted || !this.ctx) return;
        this.init();
        const t = this.ctx.currentTime;
        const chord = [523.25, 659.25, 783.99, 1046.50];
        chord.forEach((freq, i) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t + i * 0.06);
          gain.gain.setValueAtTime(0.18, t + i * 0.06);
          gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.65);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t + i * 0.06);
          osc.stop(t + i * 0.06 + 0.66);
        });
      }

      playVictory() {
        if (this.muted || !this.ctx) return;
        this.init();
        const t = this.ctx.currentTime;
        const melody = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98];
        melody.forEach((freq, i) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, t + i * 0.09);
          gain.gain.setValueAtTime(0.20, t + i * 0.09);
          gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.55);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t + i * 0.09);
          osc.stop(t + i * 0.09 + 0.56);
        });
      }

      playButton() {
        this.playTap();
      }
    }
`;
const p2 = `
    // 3. MATHEMATICAL SUDOKU GENERATOR & SOLVER
    class SudokuCore {
      static createEmptyGrid() {
        return Array.from({ length: 9 }, () => Array(9).fill(0));
      }

      static copyGrid(grid) {
        return grid.map(row => [...row]);
      }

      static isValid(grid, r, c, val) {
        for (let i = 0; i < 9; i++) {
          if (grid[r][i] === val && i !== c) return false;
          if (grid[i][c] === val && i !== r) return false;
        }
        const br = Math.floor(r / 3) * 3;
        const bc = Math.floor(c / 3) * 3;
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 3; j++) {
            const tr = br + i;
            const tc = bc + j;
            if (grid[tr][tc] === val && (tr !== r || tc !== c)) return false;
          }
        }
        return true;
      }

      static countSolutions(board, limit = 2) {
        let count = 0;
        const helper = (b) => {
          for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
              if (b[r][c] === 0) {
                for (let n = 1; n <= 9; n++) {
                  if (this.isValid(b, r, c, n)) {
                    b[r][c] = n;
                    helper(b);
                    b[r][c] = 0;
                    if (count >= limit) return;
                  }
                }
                return;
              }
            }
          }
          count++;
        };
        helper(this.copyGrid(board));
        return count;
      }

      static generateSolved() {
        const board = this.createEmptyGrid();
        const fill = (b) => {
          for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
              if (b[r][c] === 0) {
                const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => Math.random() - 0.5);
                for (const n of nums) {
                  if (this.isValid(b, r, c, n)) {
                    b[r][c] = n;
                    if (fill(b)) return true;
                    b[r][c] = 0;
                  }
                }
                return false;
              }
            }
          }
          return true;
        };
        fill(board);
        return board;
      }

      static generatePuzzle(difficultyId) {
        const diff = DIFFICULTIES.find(d => d.id === difficultyId) || DIFFICULTIES[0];
        const solution = this.generateSolved();
        const puzzle = this.copyGrid(solution);

        const targetClues = diff.clues;
        const totalToRemove = 81 - targetClues;

        const positions = [];
        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            positions.push({ r, c });
          }
        }
        positions.sort(() => Math.random() - 0.5);

        let removed = 0;
        for (const pos of positions) {
          if (removed >= totalToRemove) break;
          const temp = puzzle[pos.r][pos.c];
          puzzle[pos.r][pos.c] = 0;

          if (this.countSolutions(puzzle, 2) === 1) {
            removed++;
          } else {
            puzzle[pos.r][pos.c] = temp;
          }
        }

        return { puzzle, solution, diff };
      }

      static findHint(currentGrid, solutionGrid) {
        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            if (currentGrid[r][c] === 0) {
              const validCandidates = [];
              for (let n = 1; n <= 9; n++) {
                if (this.isValid(currentGrid, r, c, n)) validCandidates.push(n);
              }
              if (validCandidates.length === 1) {
                const val = validCandidates[0];
                return {
                  r, c, val,
                  type: 'naked_single',
                  reason: 'Only ' + val + ' can fit in this cell without conflicting with its row, column, or 3x3 box.'
                };
              }
            }
          }
        }

        for (let b = 0; b < 9; b++) {
          const br = Math.floor(b / 3) * 3;
          const bc = (b % 3) * 3;
          for (let n = 1; n <= 9; n++) {
            let possibleCells = [];
            for (let i = 0; i < 3; i++) {
              for (let j = 0; j < 3; j++) {
                const r = br + i;
                const c = bc + j;
                if (currentGrid[r][c] === 0 && this.isValid(currentGrid, r, c, n)) {
                  possibleCells.push({ r, c });
                }
              }
            }
            if (possibleCells.length === 1) {
              const pos = possibleCells[0];
              return {
                r: pos.r, c: pos.c, val: n,
                type: 'hidden_single_box',
                reason: n + ' can only appear in this single cell within its 3x3 box.'
              };
            }
          }
        }

        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            if (currentGrid[r][c] === 0) {
              return {
                r, c, val: solutionGrid[r][c],
                type: 'direct',
                reason: 'The correct number for this cell is ' + solutionGrid[r][c] + '.'
              };
            }
          }
        }
        return null;
      }
    }

    // 4. PARTICLE SYSTEM (Graceful slower floating stars)
    class ParticleSystem {
      constructor() { this.items = []; }
      clear() { this.items = []; }

      addBlockBurst(x, y, w, h) {
        const colors = ['#06B6D4', '#38BDF8', '#22D3EE', '#F59E0B', '#22C55E', '#67E8F9', '#A5F3FC'];
        for (let i = 0; i < 18; i++) {
          const px = x + Math.random() * w;
          const py = y + Math.random() * h;
          const a = Math.random() * Math.PI * 2;
          const speed = 14 + Math.random() * 22; // Slower, graceful floating
          this.items.push({
            type: 'STAR',
            x: px, y: py,
            vx: Math.cos(a) * speed,
            vy: Math.sin(a) * speed - 10,
            size: 4 + Math.random() * 4.5,
            rot: Math.random() * Math.PI * 2,
            vRot: (Math.random() - 0.5) * 2.2,
            life: 1.1 + Math.random() * 0.45,
            maxLife: 1.55,
            color: colors[Math.floor(Math.random() * colors.length)]
          });
        }
      }

      addVictoryConfetti(w, h) {
        const colors = ['#3B82F6', '#22C55E', '#F59E0B', '#06B6D4', '#8B5CF6', '#EC4899'];
        for (let i = 0; i < 64; i++) {
          this.items.push({
            type: 'CONFETTI',
            x: Math.random() * w,
            y: -20 - Math.random() * 100,
            vx: (Math.random() - 0.5) * 50,
            vy: 70 + Math.random() * 110,
            size: 6 + Math.random() * 6,
            rot: Math.random() * Math.PI * 2,
            vRot: (Math.random() - 0.5) * 4,
            life: 2.5 + Math.random() * 1.5,
            maxLife: 4.0,
            color: colors[Math.floor(Math.random() * colors.length)]
          });
        }
      }

      update(dt) {
        for (let i = this.items.length - 1; i >= 0; i--) {
          const p = this.items[i];
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.vRot * dt;
          p.life -= dt;
          if (p.type === 'CONFETTI') p.vx += Math.sin(p.life * 3) * 1.0;
          if (p.life <= 0) this.items.splice(i, 1);
        }
      }

      render(ctx) {
        for (const p of this.items) {
          const k = Math.max(0, p.life / p.maxLife);
          ctx.save();
          ctx.globalAlpha = Math.min(1, k * 1.4);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;

          if (p.type === 'CONFETTI') {
            ctx.fillRect(-p.size * 0.5, -p.size * 0.25, p.size, p.size * 0.5);
          } else {
            const s = p.size;
            ctx.beginPath();
            ctx.moveTo(0, -s);
            ctx.quadraticCurveTo(0, 0, s, 0);
            ctx.quadraticCurveTo(0, 0, 0, s);
            ctx.quadraticCurveTo(0, 0, -s, 0);
            ctx.quadraticCurveTo(0, 0, 0, -s);
            ctx.fill();
          }
          ctx.restore();
        }
      }
    }

    // 5. HOST PLATFORM BRIDGE
    const Host = {
      post(action, payload) {
        const body = payload || {};
        const msg = JSON.stringify({ action: action, payload: body });
        try {
          if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
            window.flutter_inappwebview.callHandler('GameBridgeChannel', msg);
          }
        } catch (e) {}
        try {
          if (window.FlutterGameBridge && window.FlutterGameBridge.postMessage) {
            window.FlutterGameBridge.postMessage(msg);
          }
        } catch (e) {}
        try {
          if (window.parent && window.parent !== window) {
            window.parent.postMessage({ source: 'GameBridge', action: action, payload: body }, '*');
          }
        } catch (e) {}
      }
    };
`;
const p3 = `
    // 6. MAIN GAME CONTROLLER
    class SudokuGame {
      constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.synth = new SoundSynth();
        this.particles = new ParticleSystem();

        this.difficulty = 'easy';
        this.sliderPos = 0; // 0 (Easy) to 3 (Expert)
        this.isDraggingSlider = false;

        this.given = SudokuCore.createEmptyGrid();
        this.user = SudokuCore.createEmptyGrid();
        this.solution = SudokuCore.createEmptyGrid();

        this.selected = null;
        this.isPaused = false;
        this.state = 'DIFF_SELECT'; // Starts on the custom difficulty slider screen

        this.mistakes = 0;
        this.maxMistakes = 3;
        this.timer = 0;
        this.history = [];
        this.remainingHints = 3;
        this.activeHint = null;

        // Tutorial Modal state
        this.tutorialSlide = 0;
        this.maxTutorialSlides = 5;
        this.tutorialAnimT = 0;

        this.sweeps = []; // Cyan light beam scans across completed lines/boxes
        this.lastTime = performance.now();
        this.shakeTimer = 0;
        this.errorCell = null;
        this.toast = null;
        this.keyPressTimer = Array(10).fill(0);

        this.SAVE_KEY = 'sudoku_pro_saved_game_v4';
        this.STATS_KEY = 'sudoku_pro_stats_v4';

        this.stats = this.loadStats();
        this.initLayout();
        this.bindEvents();

        if (this.loadGame()) {
          this.state = 'PLAYING';
        }

        requestAnimationFrame((t) => this.loop(t));
      }

      loadStats() {
        try {
          const s = localStorage.getItem(this.STATS_KEY);
          return s ? JSON.parse(s) : { gamesWon: 0, bestTimes: {} };
        } catch (e) {
          return { gamesWon: 0, bestTimes: {} };
        }
      }

      saveStats() {
        try {
          localStorage.setItem(this.STATS_KEY, JSON.stringify(this.stats));
        } catch (e) {}
      }

      saveGame() {
        if (this.state === 'VICTORY' || this.state === 'GAMEOVER' || this.state === 'DIFF_SELECT' || this.state === 'TUTORIAL') {
          try { localStorage.removeItem(this.SAVE_KEY); } catch (e) {}
          return;
        }
        try {
          const data = {
            difficulty: this.difficulty,
            given: this.given,
            user: this.user,
            solution: this.solution,
            timer: this.timer,
            mistakes: this.mistakes,
            remainingHints: this.remainingHints
          };
          localStorage.setItem(this.SAVE_KEY, JSON.stringify(data));
        } catch (e) {}
      }

      loadGame() {
        try {
          const s = localStorage.getItem(this.SAVE_KEY);
          if (!s) return false;
          const data = JSON.parse(s);
          this.difficulty = data.difficulty || 'easy';
          const idx = DIFFICULTIES.findIndex(d => d.id === this.difficulty);
          this.sliderPos = idx >= 0 ? idx : 0;
          this.given = data.given;
          this.user = data.user;
          this.solution = data.solution;
          this.timer = data.timer || 0;
          this.mistakes = data.mistakes || 0;
          this.remainingHints = data.remainingHints !== undefined ? data.remainingHints : 3;
          this.state = 'PLAYING';
          this.history = [];
          this.selected = null;
          return true;
        } catch (e) {
          return false;
        }
      }

      startNewGame(diffId) {
        this.difficulty = diffId || this.difficulty;
        const idx = DIFFICULTIES.findIndex(d => d.id === this.difficulty);
        this.sliderPos = idx >= 0 ? idx : 0;

        const generated = SudokuCore.generatePuzzle(this.difficulty);
        this.given = generated.puzzle;
        this.solution = generated.solution;
        this.user = SudokuCore.createEmptyGrid();
        this.selected = null;
        this.mistakes = 0;
        this.timer = 0;
        this.isPaused = false;
        this.state = 'PLAYING';
        this.history = [];
        this.remainingHints = 3;
        this.activeHint = null;
        this.sweeps = [];
        this.particles.clear();
        this.saveGame();
        Host.post('onGameStarted', { difficulty: this.difficulty });
      }

      initLayout() {
        const dpr = window.devicePixelRatio || 1;
        this.dpr = dpr;
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = Math.round(this.width * dpr);
        this.canvas.height = Math.round(this.height * dpr);

        const minDim = Math.min(this.width, this.height);
        this.scale = Math.min(1.2, Math.max(0.8, minDim / 400));

        // Maximize board size
        const maxBoardSize = Math.min(this.width - 20, this.height * 0.58);
        this.boardSize = Math.floor(maxBoardSize);
        this.cellSize = this.boardSize / 9;
        this.boardX = Math.round((this.width - this.boardSize) / 2);
        this.boardY = Math.round(this.height * 0.13);

        this.headerY = Math.max(14, this.boardY - 54);
        this.toolbarY = this.boardY + this.boardSize + 16;
        this.keypadY = this.toolbarY + 54;
      }

      getDifficultySliderBounds() {
        const trackW = Math.min(270, this.width - 80);
        const trackX = (this.width - trackW) / 2;
        const trackY = this.height * 0.60;
        const trackH = 34;
        return { trackX, trackY, trackW, trackH };
      }

      bindEvents() {
        window.addEventListener('resize', () => this.initLayout());

        const getPos = (e) => {
          const rect = this.canvas.getBoundingClientRect();
          const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
          const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
          return { px: clientX - rect.left, py: clientY - rect.top };
        };

        const handlePointerDown = (e) => {
          e.preventDefault();
          this.synth.init();
          const { px, py } = getPos(e);

          if (this.state === 'DIFF_SELECT') {
            const { trackX, trackW, trackY, trackH } = this.getDifficultySliderBounds();
            if (py >= trackY - 20 && py <= trackY + trackH + 20 && px >= trackX - 25 && px <= trackX + trackW + 25) {
              this.isDraggingSlider = true;
              const ratio = Math.max(0, Math.min(1, (px - trackX) / trackW));
              this.sliderPos = ratio * 3;
              return;
            }
          }

          this.handleClick(px, py);
        };

        const handlePointerMove = (e) => {
          if (!this.isDraggingSlider || this.state !== 'DIFF_SELECT') return;
          e.preventDefault();
          const { px } = getPos(e);
          const { trackX, trackW } = this.getDifficultySliderBounds();
          const ratio = Math.max(0, Math.min(1, (px - trackX) / trackW));
          this.sliderPos = ratio * 3;
        };

        const handlePointerUp = (e) => {
          if (this.isDraggingSlider && this.state === 'DIFF_SELECT') {
            this.isDraggingSlider = false;
            const nearestIdx = Math.round(this.sliderPos);
            this.sliderPos = nearestIdx;
            this.difficulty = DIFFICULTIES[nearestIdx].id;
            this.synth.playButton();
          }
        };

        this.canvas.addEventListener('pointerdown', handlePointerDown);
        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);

        window.addEventListener('keydown', (e) => {
          this.synth.init();
          if (e.key >= '1' && e.key <= '9') {
            this.handleInputNumber(parseInt(e.key));
          } else if (e.key === 'Backspace' || e.key === 'Delete') {
            this.handleErase();
          } else if (e.key === 'u' || e.key === 'U' || (e.ctrlKey && e.key === 'z')) {
            this.handleUndo();
          } else if (e.key === 'h' || e.key === 'H') {
            this.handleHint();
          } else if (e.key === 'ArrowLeft') {
            if (this.state === 'DIFF_SELECT') {
              this.sliderPos = Math.max(0, Math.round(this.sliderPos) - 1);
              this.difficulty = DIFFICULTIES[Math.round(this.sliderPos)].id;
              this.synth.playButton();
            } else if (this.state === 'TUTORIAL') {
              this.tutorialSlide = Math.max(0, this.tutorialSlide - 1);
              this.synth.playButton();
            } else if (this.selected) {
              this.selected.c = Math.max(0, this.selected.c - 1);
            }
          } else if (e.key === 'ArrowRight') {
            if (this.state === 'DIFF_SELECT') {
              this.sliderPos = Math.min(3, Math.round(this.sliderPos) + 1);
              this.difficulty = DIFFICULTIES[Math.round(this.sliderPos)].id;
              this.synth.playButton();
            } else if (this.state === 'TUTORIAL') {
              this.tutorialSlide = Math.min(this.maxTutorialSlides - 1, this.tutorialSlide + 1);
              this.synth.playButton();
            } else if (this.selected) {
              this.selected.c = Math.min(8, this.selected.c + 1);
            }
          } else if (e.key === 'Enter') {
            if (this.state === 'DIFF_SELECT') {
              this.startNewGame(DIFFICULTIES[Math.round(this.sliderPos)].id);
            } else if (this.state === 'TUTORIAL') {
              this.state = 'DIFF_SELECT';
            }
          } else if (e.key === 'ArrowUp' && this.selected) {
            this.selected.r = Math.max(0, this.selected.r - 1);
          } else if (e.key === 'ArrowDown' && this.selected) {
            this.selected.r = Math.min(8, this.selected.r + 1);
          }
        });
      }

      handleClick(px, py) {
        if (this.state === 'VICTORY') {
          const btnW = 220, btnH = 50;
          const btnX = (this.width - btnW) / 2;
          const btnY = this.height * 0.74;
          if (px >= btnX && px <= btnX + btnW && py >= btnY && py <= btnY + btnH) {
            this.synth.playButton();
            this.state = 'DIFF_SELECT';
          }
          return;
        }

        if (this.state === 'GAMEOVER') {
          const btnW = 200, btnH = 48;
          const btnX = (this.width - btnW) / 2;
          const btnY = this.height * 0.68;
          if (px >= btnX && px <= btnX + btnW && py >= btnY && py <= btnY + btnH) {
            this.synth.playButton();
            this.startNewGame(this.difficulty);
          }
          return;
        }

        // TUTORIAL / HOW TO PLAY MODAL
        if (this.state === 'TUTORIAL') {
          const modalW = Math.min(340, this.width - 32);
          const modalH = Math.min(520, this.height * 0.84);
          const modalX = (this.width - modalW) / 2;
          const modalY = (this.height - modalH) / 2;

          const btnY = modalY + modalH - 58;

          // Prev Button
          if (px >= modalX + 16 && px <= modalX + 64 && py >= btnY && py <= btnY + 44) {
            this.tutorialSlide = Math.max(0, this.tutorialSlide - 1);
            this.synth.playButton();
            return;
          }

          // OK / Close Button
          const okW = modalW - 144;
          const okX = modalX + 72;
          if (px >= okX && px <= okX + okW && py >= btnY && py <= btnY + 44) {
            this.synth.playButton();
            this.state = 'DIFF_SELECT';
            return;
          }

          // Next Button
          const nextX = modalX + modalW - 64;
          if (px >= nextX && px <= nextX + 48 && py >= btnY && py <= btnY + 44) {
            if (this.tutorialSlide < this.maxTutorialSlides - 1) {
              this.tutorialSlide++;
              this.synth.playButton();
            } else {
              this.state = 'DIFF_SELECT';
              this.synth.playButton();
            }
            return;
          }

          // Pagination Dots Click
          const dotY = btnY - 24;
          for (let i = 0; i < this.maxTutorialSlides; i++) {
            const dx = this.width / 2 + (i - (this.maxTutorialSlides - 1) / 2) * 22;
            if (px >= dx - 10 && px <= dx + 10 && py >= dotY - 10 && py <= dotY + 10) {
              this.tutorialSlide = i;
              this.synth.playButton();
              return;
            }
          }
          return;
        }

        // DIFFICULTY SELECTION SCREEN (Reference Match)
        if (this.state === 'DIFF_SELECT') {
          const { trackX, trackW, trackY, trackH } = this.getDifficultySliderBounds();

          // Slider Track click/jump
          if (py >= trackY - 20 && py <= trackY + trackH + 20 && px >= trackX - 20 && px <= trackX + trackW + 20) {
            const ratio = Math.max(0, Math.min(1, (px - trackX) / trackW));
            const nearest = Math.round(ratio * 3);
            this.sliderPos = nearest;
            this.difficulty = DIFFICULTIES[nearest].id;
            this.synth.playButton();
            return;
          }

          const btnRowY = this.height * 0.74;
          const playW = Math.min(190, this.width * 0.50);
          const playH = 54;
          const playX = (this.width - playW) / 2;

          // PLAY Button
          if (px >= playX && px <= playX + playW && py >= btnRowY && py <= btnRowY + playH) {
            this.synth.playButton();
            this.startNewGame(DIFFICULTIES[Math.round(this.sliderPos)].id);
            return;
          }

          // Tutorial Question Mark "?" Button
          const qSize = 52;
          const qX = playX + playW + 14;
          if (px >= qX && px <= qX + qSize && py >= btnRowY && py <= btnRowY + qSize) {
            this.synth.playButton();
            this.tutorialSlide = 0;
            this.state = 'TUTORIAL';
            return;
          }

          // Stats Button (Left of Play)
          const sSize = 52;
          const sX = playX - sSize - 14;
          if (px >= sX && px <= sX + sSize && py >= btnRowY && py <= btnRowY + sSize) {
            this.synth.playButton();
            const bestTime = this.stats.bestTimes[this.difficulty];
            const text = 'Best Time: ' + (bestTime ? this.formatTime(bestTime) : 'None') + ' • Won: ' + (this.stats.gamesWon || 0);
            this.toast = { text, t: 2.2, max: 2.2 };
            return;
          }
          return;
        }

        if (this.state === 'PAUSED') {
          const btnW = 190, btnH = 46;
          const btnX = (this.width - btnW) / 2;
          const resumeY = this.height * 0.48;
          const restartY = this.height * 0.56;

          if (px >= btnX && px <= btnX + btnW && py >= resumeY && py <= resumeY + btnH) {
            this.synth.playButton();
            this.state = 'PLAYING';
            this.isPaused = false;
          } else if (px >= btnX && px <= btnX + btnW && py >= restartY && py <= restartY + btnH) {
            this.synth.playButton();
            this.state = 'DIFF_SELECT';
          }
          return;
        }

        if (this.activeHint) {
          this.activeHint = null;
          return;
        }

        // Header Buttons: Difficulty pill, Pause, Sound
        if (py >= this.headerY - 8 && py <= this.headerY + 38) {
          if (px >= 12 && px <= 112) {
            this.synth.playButton();
            this.state = 'DIFF_SELECT';
            return;
          }
          if (px >= this.width - 82 && px <= this.width - 48) {
            this.synth.playButton();
            this.state = 'PAUSED';
            this.isPaused = true;
            return;
          }
          if (px >= this.width - 44 && px <= this.width - 10) {
            this.synth.muted = !this.synth.muted;
            this.synth.playButton();
            return;
          }
        }

        // Board Cell Selection
        if (px >= this.boardX && px <= this.boardX + this.boardSize &&
            py >= this.boardY && py <= this.boardY + this.boardSize) {
          const c = Math.floor((px - this.boardX) / this.cellSize);
          const r = Math.floor((py - this.boardY) / this.cellSize);
          if (r >= 0 && r < 9 && c >= 0 && c < 9) {
            this.selected = { r, c };
            this.synth.playTap();
          }
          return;
        }

        // Action Toolbar (ONLY Undo and Hint)
        const toolW = Math.min(130, (this.width - 48) / 2);
        const undoX = 20;
        const hintX = this.width - 20 - toolW;

        if (px >= undoX && px <= undoX + toolW && py >= this.toolbarY && py <= this.toolbarY + 44) {
          this.handleUndo();
          return;
        }

        if (px >= hintX && px <= hintX + toolW && py >= this.toolbarY && py <= this.toolbarY + 44) {
          this.handleHint();
          return;
        }

        // Keypad Buttons (1 to 9)
        const keyW = Math.min(38, (this.width - 24) / 9);
        const keyGap = (this.width - 24 - keyW * 9) / 8;
        for (let num = 1; num <= 9; num++) {
          const kx = 12 + (num - 1) * (keyW + keyGap);
          if (px >= kx && px <= kx + keyW && py >= this.keypadY && py <= this.keypadY + 54) {
            this.keyPressTimer[num] = 0.12;
            this.handleInputNumber(num);
            return;
          }
        }
      }

      handleInputNumber(num) {
        if (!this.selected || this.state !== 'PLAYING') return;
        const { r, c } = this.selected;
        if (this.given[r][c] !== 0) return;

        const prevVal = this.user[r][c];

        // Tapping same number clears cell
        if (prevVal === num) {
          this.user[r][c] = 0;
          this.synth.playErase();
          this.saveGame();
          return;
        }

        const isCorrect = (this.solution[r][c] === num);

        if (!isCorrect) {
          this.mistakes++;
          this.shakeTimer = 0.35;
          this.errorCell = { r, c, num };
          this.synth.playError();
          this.haptic('error');

          if (this.mistakes >= this.maxMistakes) {
            this.state = 'GAMEOVER';
            Host.post('onGameOver', { score: 0, reason: 'mistakes_exceeded' });
            return;
          }
        } else {
          this.user[r][c] = num;
          this.synth.playDigit(num);
          this.haptic('light');

          this.checkCompletions(r, c);

          if (this.checkVictory()) {
            this.triggerVictory();
          }
        }

        this.history.push({
          type: 'digit', r, c,
          prevVal: prevVal,
          newVal: num
        });
        this.saveGame();
      }

      checkCompletions(r, c) {
        // 1. Check Row Completion (3-cell wide cyan laser beam sweeping across row)
        let rowDone = true;
        for (let i = 0; i < 9; i++) {
          const val = this.given[r][i] || this.user[r][i];
          if (val !== this.solution[r][i]) { rowDone = false; break; }
        }
        if (rowDone) {
          this.sweeps.push({ type: 'row', index: r, t: 0, maxT: 1.35 });
          this.particles.addBlockBurst(this.boardX, this.boardY + r * this.cellSize, this.boardSize, this.cellSize);
          this.synth.playBlockComplete();
        }

        // 2. Check Column Completion (3-cell wide cyan laser beam sweeping across column)
        let colDone = true;
        for (let i = 0; i < 9; i++) {
          const val = this.given[i][c] || this.user[i][c];
          if (val !== this.solution[i][c]) { colDone = false; break; }
        }
        if (colDone) {
          this.sweeps.push({ type: 'col', index: c, t: 0, maxT: 1.35 });
          this.particles.addBlockBurst(this.boardX + c * this.cellSize, this.boardY, this.cellSize, this.boardSize);
          this.synth.playBlockComplete();
        }

        // 3. Check 3x3 Box Completion (Full 3x3 major block cyan wave)
        const br = Math.floor(r / 3) * 3;
        const bc = Math.floor(c / 3) * 3;
        let boxDone = true;
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 3; j++) {
            const val = this.given[br + i][bc + j] || this.user[br + i][bc + j];
            if (val !== this.solution[br + i][bc + j]) { boxDone = false; break; }
          }
        }
        if (boxDone) {
          const boxIdx = Math.floor(r / 3) * 3 + Math.floor(c / 3);
          this.sweeps.push({ type: 'box', index: boxIdx, br, bc, t: 0, maxT: 1.35 });
          this.particles.addBlockBurst(this.boardX + bc * this.cellSize, this.boardY + br * this.cellSize, this.cellSize * 3, this.cellSize * 3);
          this.synth.playBlockComplete();
        }
      }

      handleErase() {
        if (!this.selected || this.state !== 'PLAYING') return;
        const { r, c } = this.selected;
        if (this.given[r][c] !== 0) return;

        if (this.user[r][c] !== 0) {
          const prevVal = this.user[r][c];
          this.user[r][c] = 0;
          this.history.push({
            type: 'erase', r, c,
            prevVal, newVal: 0
          });
          this.synth.playErase();
          this.saveGame();
        }
      }

      handleUndo() {
        if (this.history.length === 0 || this.state !== 'PLAYING') return;
        const act = this.history.pop();
        if (act.type === 'digit' || act.type === 'erase') {
          this.user[act.r][act.c] = act.prevVal;
        }
        this.selected = { r: act.r, c: act.c };
        this.synth.playButton();
        this.saveGame();
      }

      handleHint() {
        if (this.state !== 'PLAYING') return;
        if (this.remainingHints <= 0) {
          this.synth.playError();
          this.toast = { text: 'No hints remaining!', t: 1.5, max: 1.5 };
          return;
        }
        const currentGrid = this.createCombinedGrid();
        const hint = SudokuCore.findHint(currentGrid, this.solution);
        if (!hint) return;

        this.remainingHints--;
        this.activeHint = hint;
        this.selected = { r: hint.r, c: hint.c };

        this.user[hint.r][hint.c] = hint.val;
        this.synth.playDigit(hint.val);
        this.haptic('success');

        this.checkCompletions(hint.r, hint.c);
        if (this.checkVictory()) this.triggerVictory();
        this.saveGame();
      }

      createCombinedGrid() {
        const g = SudokuCore.createEmptyGrid();
        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            g[r][c] = this.given[r][c] || this.user[r][c] || 0;
          }
        }
        return g;
      }

      checkVictory() {
        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            const val = this.given[r][c] || this.user[r][c];
            if (val !== this.solution[r][c]) return false;
          }
        }
        return true;
      }

      triggerVictory() {
        this.state = 'VICTORY';
        this.particles.addVictoryConfetti(this.width, this.height);
        this.synth.playVictory();
        this.haptic('success');

        this.stats.gamesWon = (this.stats.gamesWon || 0) + 1;
        const best = this.stats.bestTimes[this.difficulty];
        if (!best || this.timer < best) {
          this.stats.bestTimes[this.difficulty] = Math.round(this.timer);
        }
        this.saveStats();
        this.saveGame();

        const earnedCoins = (DIFFICULTIES.find(d => d.id === this.difficulty) || DIFFICULTIES[0]).coins;
        Host.post('onGameCompleted', {
          score: Math.max(10, 1000 - Math.round(this.timer)),
          level: 1,
          time: this.timer,
          coins: earnedCoins
        });
      }

      haptic(type) {
        try {
          if (navigator.vibrate) {
            if (type === 'light') navigator.vibrate(12);
            else if (type === 'error') navigator.vibrate([25, 40, 25]);
            else if (type === 'success') navigator.vibrate([15, 30, 45]);
          }
        } catch (e) {}
      }

      getRemainingCounts() {
        const counts = Array(10).fill(9);
        counts[0] = 0;
        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            const val = this.given[r][c] || this.user[r][c];
            if (val >= 1 && val <= 9) counts[val]--;
          }
        }
        return counts;
      }

      formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return mins.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0');
      }

      loop(timestamp) {
        const dt = Math.min(0.1, (timestamp - this.lastTime) / 1000);
        this.lastTime = timestamp;

        if (this.state === 'PLAYING' && !this.isPaused) {
          this.timer += dt;
        }

        if (this.state === 'TUTORIAL') {
          this.tutorialAnimT += dt;
        }

        if (this.shakeTimer > 0) this.shakeTimer = Math.max(0, this.shakeTimer - dt);
        if (this.toast) {
          this.toast.t -= dt;
          if (this.toast.t <= 0) this.toast = null;
        }
        for (let n = 1; n <= 9; n++) {
          if (this.keyPressTimer[n] > 0) this.keyPressTimer[n] = Math.max(0, this.keyPressTimer[n] - dt);
        }

        for (let i = this.sweeps.length - 1; i >= 0; i--) {
          this.sweeps[i].t += dt;
          if (this.sweeps[i].t >= this.sweeps[i].maxT) this.sweeps.splice(i, 1);
        }

        this.particles.update(dt);
        this.render();

        requestAnimationFrame((t) => this.loop(t));
      }
`;
