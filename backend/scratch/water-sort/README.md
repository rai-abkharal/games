# Water Sort 3D - Hyper Casual Liquid Sorting Puzzle

A modern, fluid, and juicy liquid sorting puzzle game built with TypeScript and HTML5 Canvas 2D. 100% zero runtime dependencies, offline capable, and responsive across mobile and desktop browsers.

---

## 🎮 Game Features

- **Realistic 3D Glass & Fluid Physics**:
  - Test tubes with refractive glass gloss, specular streaks, and curved dome bottoms.
  - Interactive fluid surface with dynamic meniscus wave oscillations and bubbling foam.
  - Smooth 3D pouring tilt animation and flowing bezier fluid stream ribbons.
  - Wooden cork seal popping on completed sorted tubes.
- **Procedural Web Audio API Synthesis (`SoundSynth`)**:
  - Realistic multi-harmonic water trickle and pouring sounds.
  - Bubble pops, suction glass taps, crystal chime chords, and victory fanfares.
  - Zero external `.mp3` or `.wav` files required.
- **Guaranteed Solvable Levels**:
  - 100% solvable level generation powered by reverse-simulation.
  - Adaptive difficulty scaling from 3 colors to 10+ colors.
  - In-game BFS Hint solver to guide you through tricky puzzles.
- **Hyper-Casual UI/UX System**:
  - Top Stadium Capsule HUD with wave-animated bubble title (`WATER SORT`), coin score, and moves tracker.
  - Bottom 3D Squircle Action Buttons (`UNDO`, `RESET`, `+TUBE`, `HINT`) with custom Canvas vector path artwork (zero emojis inside action buttons).
  - 3-Star victory celebration modal with sparkling stars, coin tally, and confetti fireworks.

---

## 🕹️ Controls

- **Tap / Click Tube**: Select a flask to pour from (lifts up).
- **Tap Another Tube**: Pour liquid if the receiving tube has space and matching color or is empty.
- **UNDO Button**: Revert your last move.
- **RESET Button**: Restart current level.
- **+ TUBE Button**: Add an extra empty test tube booster when stuck.
- **HINT Button**: Highlight a guaranteed productive pour move.
- **Sound Icon (Top Right)**: Toggle sound synthesizer on/off.

---

## 🚀 How to Play

Open `index.html` directly in any web browser with a double-click. No web server, bundler, or installation required!
