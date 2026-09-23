const fs = require('fs');

// Create mock DOM environment
const scriptContent = fs.readFileSync('scratch/water_sort_script.js', 'utf8');

// Set up globals
global.window = global;
global.window.addEventListener = () => {};
global.window.removeEventListener = () => {};
global.window.innerWidth = 390;
global.window.innerHeight = 844;
global.window.devicePixelRatio = 2;
global.document = {
  readyState: 'complete',
  addEventListener: () => {},
  removeEventListener: () => {},
  getElementById: (id) => {
    if (id === 'gameCanvas') {
      return {
        width: 390,
        height: 844,
        style: {},
        addEventListener: () => {},
        getContext: () => mockCtx,
      };
    }
    return null;
  },
  createElement: () => ({
    getContext: () => mockCtx,
    addEventListener: () => {},
  }),
  dispatchEvent: () => {},
};

global.performance = { now: () => 1000 };
global.requestAnimationFrame = (cb) => { global.__nextRaf = cb; };
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
};

const mockCtx = {
  save: () => {},
  restore: () => {},
  setTransform: () => {},
  translate: () => {},
  scale: () => {},
  rotate: () => {},
  beginPath: () => {},
  closePath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  arc: () => {},
  arcTo: () => {},
  quadraticCurveTo: () => {},
  bezierCurveTo: () => {},
  rect: () => {},
  fillRect: () => {},
  strokeRect: () => {},
  clearRect: () => {},
  fill: () => {},
  stroke: () => {},
  clip: () => {},
  measureText: () => ({ width: 50 }),
  fillText: () => {},
  strokeText: () => {},
  createLinearGradient: () => ({ addColorStop: () => {} }),
  createRadialGradient: () => ({ addColorStop: () => {} }),
  roundRect: function() {},
  ellipse: function() {},
};

global.CanvasRenderingContext2D = function() {};
global.CanvasRenderingContext2D.prototype = mockCtx;

try {
  eval(scriptContent);
  console.log('Script loaded successfully. globalEngine:', !!global.window.__GAME_ENGINE__);
  const engine = global.window.__GAME_ENGINE__;
  if (engine) {
    console.log('Tubes count:', engine.tubes.length);
    console.log('Running engine.update(0.016)...');
    engine.update(0.016);
    console.log('Update finished without error.');
    console.log('Running engine.render()...');
    engine.render();
    console.log('Render finished without error.');
  }
} catch (e) {
  console.error('EXCEPTION:', e);
}
