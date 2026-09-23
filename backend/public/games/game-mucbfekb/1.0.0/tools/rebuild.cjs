// Run with Node.js: node tools/rebuild.cjs (no packages or internet needed).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const packed = {}, manifest = [];
const types = { '.png': 'image/png', '.webm': 'audio/webm', '.json': 'application/json' };
for (const name of fs.readdirSync(path.join(root, 'original')).sort()) {
  const type = types[path.extname(name)];
  const bytes = fs.readFileSync(path.join(root, 'original', name));
  manifest.push({ file: 'original/' + name, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
  if (type) packed[name] = [type, bytes.toString('base64')];
}
for (const name of fs.readdirSync(path.join(root, 'source')).sort()) {
  const bytes = fs.readFileSync(path.join(root, 'source', name));
  manifest.push({ file: 'source/' + name, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
}
let body = read('source/body.html');
body = body.replace(/src="(hand\.png|arrow\.png)"/g, (_, name) => `src="data:${packed[name][0]};base64,${packed[name][1]}"`);
const scriptSafe = text => text.replace(/<\/script/gi, '<\\/script');
const html = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src blob: data:; media-src blob: data:; base-uri 'none'; form-action 'none'">
<title>Car Circle — Offline</title>
<style>${read('source/style.css')}</style></head><body>
${body}
<script type="application/json" id="offline-files">${JSON.stringify(packed)}</script>
<script>${scriptSafe(read('offline-loader.js'))}</script>
<script>${scriptSafe(read('source/game.js'))}</script>
</body></html>`;
fs.writeFileSync(path.join(root, 'game-page.html'), html);
fs.writeFileSync(path.join(root, 'asset-manifest.json'), JSON.stringify({ embeddedResources: Object.keys(packed).length, files: manifest }, null, 2));
console.log(`Built game-page.html: ${Buffer.byteLength(html)} bytes, ${Object.keys(packed).length} embedded resources.`);
