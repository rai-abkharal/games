const fs = require('fs');
const path = require('path');

const filesToPatch = [
  'backend/public/games/water-sort-3d/1.0.0/index.html',
  'backend/public/games/water-sort/1.0.0/index.html'
];

const bulletproofPolyfill = `  if (typeof CanvasRenderingContext2D !== 'undefined') {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, radii) {
      if (w === 0 || h === 0) return this;
      if (!radii) radii = 0;
      if (typeof radii === 'number') {
        radii = [radii, radii, radii, radii];
      } else if (Array.isArray(radii)) {
        if (radii.length === 1) radii = [radii[0], radii[0], radii[0], radii[0]];
        else if (radii.length === 2) radii = [radii[0], radii[1], radii[0], radii[1]];
        else if (radii.length === 3) radii = [radii[0], radii[1], radii[2], radii[1]];
        else if (radii.length >= 4) radii = [radii[0], radii[1], radii[2], radii[3]];
      } else {
        radii = [0, 0, 0, 0];
      }

      var maxR = Math.min(Math.abs(w) / 2, Math.abs(h) / 2);
      var rTL = Math.min(Math.max(0, Number(radii[0]) || 0), maxR);
      var rTR = Math.min(Math.max(0, Number(radii[1]) || 0), maxR);
      var rBR = Math.min(Math.max(0, Number(radii[2]) || 0), maxR);
      var rBL = Math.min(Math.max(0, Number(radii[3]) || 0), maxR);

      this.moveTo(x + rTL, y);
      this.lineTo(x + w - rTR, y);
      if (rTR > 0) this.quadraticCurveTo(x + w, y, x + w, y + rTR);
      this.lineTo(x + w, y + h - rBR);
      if (rBR > 0) this.quadraticCurveTo(x + w, y + h, x + w - rBR, y + h);
      this.lineTo(x + rBL, y + h);
      if (rBL > 0) this.quadraticCurveTo(x, y + h, x, y + h - rBL);
      this.lineTo(x + rTL);
      if (rTL > 0) this.quadraticCurveTo(x, y, x + rTL, y);
      this.closePath();
      return this;
    };

    CanvasRenderingContext2D.prototype.ellipse = function(x, y, radiusX, radiusY, rotation, startAngle, endAngle, counterclockwise) {
      var rx = Math.max(0.001, Math.abs(Number(radiusX) || 0));
      var ry = Math.max(0.001, Math.abs(Number(radiusY) || 0));
      this.save();
      this.translate(x, y);
      this.rotate(rotation || 0);
      this.scale(rx, ry);
      this.arc(0, 0, 1, startAngle || 0, endAngle !== undefined ? endAngle : Math.PI * 2, !!counterclockwise);
      this.restore();
      return this;
    };
  }`;

for (const relPath of filesToPatch) {
  const fullPath = path.resolve(relPath);
  if (!fs.existsSync(fullPath)) {
    console.log('Skipping missing file:', fullPath);
    continue;
  }
  let content = fs.readFileSync(fullPath, 'utf8');

  // 1. Replace the polyfill block
  const polyfillStart = content.indexOf('if (typeof CanvasRenderingContext2D !== \'undefined\') {');
  const polyfillEndMarker = '// ============================================================================';
  const polyfillEnd = content.indexOf(polyfillEndMarker, polyfillStart);

  if (polyfillStart !== -1 && polyfillEnd !== -1) {
    const before = content.slice(0, polyfillStart);
    const after = content.slice(polyfillEnd);
    content = before + bulletproofPolyfill + '\n\n  ' + after;
    console.log('Patched polyfills in', relPath);
  } else {
    console.warn('Could not locate polyfill block in', relPath);
  }

  // 2. Replace { alpha: false }
  if (content.includes("this.ctx = canvas.getContext('2d', { alpha: false });")) {
    content = content.replace(
      "this.ctx = canvas.getContext('2d', { alpha: false });",
      "this.ctx = canvas.getContext('2d');"
    );
    console.log('Patched getContext(2d) in', relPath);
  }

  // 3. Multi-stage layout passes to eliminate 0-height black screen
  if (!content.includes('setTimeout(resize, 400);')) {
    content = content.replace(
      'resize();\n\n    // Robust Touch',
      'resize();\n    setTimeout(resize, 50);\n    setTimeout(resize, 150);\n    setTimeout(resize, 400);\n\n    // Robust Touch'
    );
    // Also try CRLF version
    content = content.replace(
      'resize();\r\n\r\n    // Robust Touch',
      'resize();\r\n    setTimeout(resize, 50);\r\n    setTimeout(resize, 150);\r\n    setTimeout(resize, 400);\r\n\r\n    // Robust Touch'
    );
    console.log('Added multi-stage resize passes in', relPath);
  }

  // 4. Safe tube render try/catch
  const oldTubeRender = `            this.tubes[i].render(ctx, this.gameTime);`;
  const safeTubeRender = `            try {\n                this.tubes[i].render(ctx, this.gameTime);\n            } catch (tubeErr) {\n                console.warn('Tube render err:', tubeErr);\n            }`;
  if (content.includes(oldTubeRender)) {
    content = content.replace(oldTubeRender, safeTubeRender);
    console.log('Added safe tube render try/catch in', relPath);
  }

  fs.writeFileSync(fullPath, content, 'utf8');
  console.log('Successfully saved patched', relPath);
}
