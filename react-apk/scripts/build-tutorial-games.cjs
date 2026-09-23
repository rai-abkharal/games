// Build offline, single-level tutorial copies without altering the normal games.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'react-apk/android/app/src/main/assets/tutorial-games');
const sources = [
  ['arrow-puzzle', 'backend/public/games/arrow-puzzle/1.0.0/index.html'],
  ['knife-hit', 'react-apk/tutorial-games/knife-hit.source.html'],
  ['water-sort-3d', 'backend/public/games/water-sort-3d/1.0.0/index.html'],
];

function replaceOnce(html, before, after) {
  if (!html.includes(before)) throw new Error(`Tutorial source changed: ${before}`);
  return html.replace(before, after);
}

// Each WebView gets fresh, non-persistent storage. Never read/write the regular
// games' localStorage, even though both are served from the loopback origin.
const isolatedStorage = `<script>
window.__TUTORIAL_GAME__ = true;
Object.defineProperty(window, 'localStorage', { value: (() => {
  const values = new Map();
  return { getItem: key => values.get(String(key)) ?? null,
    setItem: (key, value) => values.set(String(key), String(value)),
    removeItem: key => values.delete(String(key)), clear: () => values.clear(),
    key: index => Array.from(values.keys())[index] ?? null,
    get length() { return values.size; } };
})() });
</script>`;

fs.mkdirSync(output, { recursive: true });
const manifest = sources.map(([id, source]) => {
  let html = fs.readFileSync(path.join(root, source), 'utf8');
  html = html.replace(/<link\b[^>]*href=["']https?:\/\/[^>]*>/g, '');
  html = replaceOnce(html, '<head>', '<head>' + isolatedStorage);
  if (id === 'arrow-puzzle') {
    html = replaceOnce(html, 'this.initAudioUnlock(),this.showSplash()', 'this.initAudioUnlock(),this.showGame(1)');
    html = replaceOnce(html, 'totalLevels:1e3', 'totalLevels:1');
    html = replaceOnce(html, 'showGame(t){', 'showGame(t){t=1;');
  } else if (id === 'knife-hit') {
    html = replaceOnce(html, 'const jump = this.registry.get("startStage");', 'const jump = 1;');
    // Register the engine with the host's explicit lifecycle controls. __kh
    // alone is used by the win detector, not by pause/resume or cleanup.
    html = replaceOnce(html, 'window.__kh = game;', 'window.__kh = game; window.__PHASER_GAME__ = game;');
    // A standby is frozen after two frames. Do not park the tutorial behind
    // the normal game's black fade with its input still locked in INTRO.
    html = replaceOnce(html, `      this.tweens.add({ targets: this.board, y: this.BY, duration: 620, ease: "Back.easeOut" });
      this.time.delayedCall(420, () => this.spawnHand());
      this.time.delayedCall(560, () => {
        if (this.state === "INTRO") this.state = "PLAY";
      });
      this.cameras.main.fadeIn(260, 0, 0, 0);`, `      this.board.y = this.BY;
      this.spawnHand();
      this.state = "PLAY";`);
    // The normal game offers progression after its win animation. In tutorial
    // mode restart always means replaying this one stage.
    html = replaceOnce(html, 'const lv = Math.max(1, Math.min(TOTAL_LEVELS, d.level ?? data().level));', 'const lv = 1;');
    html = replaceOnce(html, '          this.nextLevel();', '          // Wait for the host tutorial swipe; do not auto-advance.');
  } else {
    html = replaceOnce(html, 'this.startLevel(this.currentLevel + 1);', 'this.startLevel(1);');
  }
  const buildId = crypto.createHash('sha256').update(html).digest('hex').slice(0, 20);
  fs.writeFileSync(path.join(output, id + '.html'), html);
  return { gameId: id, buildId, bytes: Buffer.byteLength(html) };
});
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Bundled tutorial games:', manifest.map(game => `${game.gameId} (${game.bytes} bytes)`).join(', '));
