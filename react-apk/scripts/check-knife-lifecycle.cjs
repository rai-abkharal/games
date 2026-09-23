// Generate a browser harness using the *actual* host scripts, not a direct game
// load. Open the printed file URL; __knifeCheck.resume() simulates selection.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const gameId = process.argv.includes('--water') ? 'water-sort-3d' : 'knife-hit';
const code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/services/gameBridge.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const exportsObject = {};
vm.runInNewContext(code, { exports: exportsObject, require: () => ({ toInt: Number }) });
const bridge = exportsObject;
const harness = `<script>
window.__messages = [];
window.ReactNativeWebView = {postMessage: value => window.__messages.push(JSON.parse(value))};
${bridge.BRIDGE_BOOTSTRAP_SCRIPT}
window.__knifeCheck = {
  pause: () => { ${bridge.buildPauseScript(2)} },
  resume: () => { ${bridge.buildResumeScript(false)} },
  state: () => {
    if (window.__GAME_ENGINE__) {
      const e = window.__GAME_ENGINE__;
      return {level:e.currentLevel,width:e.width,height:e.height,
        frames:window.__SP_RAF__.frames,gated:window.__SP_RAF__.active,
        pending:window.__SP_RAF__.pending.length};
    }
    const g = window.__kh, s = g?.scene.getScene('Game');
    return {state:s?.state, sceneStatus:s?.sys.settings.status, gamePaused:g?.isPaused,
      loopRunning:g?.loop.running, loopSleeping:g?.loop.sleeping,
      hasEngineAlias:!!window.__PHASER_GAME__, knives:s?.knivesLeft,
      input:s?.input.enabled, timePaused:s?.time.paused,
      fade:s?.cameras.main.fadeEffect.alpha, frame:g?.loop.frame,
      gated:window.__SP_RAF__.active, pending:window.__SP_RAF__.pending.length};
  }
};
window.addEventListener('load', () => setTimeout(window.__knifeCheck.${process.argv.includes('--selected') ? 'resume' : 'pause'}, 0));
</script>`;
const game = fs.readFileSync(path.join(root, 'android/app/src/main/assets/tutorial-games', gameId + '.html'), 'utf8');
const output = path.resolve(root, '../.tmp', gameId + '-lifecycle.html');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, game.replace('<head>', '<head>' + harness));
console.log('file:///' + output.replaceAll('\\', '/'));
