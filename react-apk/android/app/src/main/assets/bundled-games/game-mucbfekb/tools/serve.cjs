// Optional local preview. The game itself is self-contained.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.argv[2] || 4200);
http.createServer((req, res) => {
  if (req.url !== '/' && req.url !== '/game-page.html') { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  fs.createReadStream(path.join(root, 'game-page.html')).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`Car Circle: http://127.0.0.1:${port}/`));
