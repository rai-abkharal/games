const http = require('http');
const fs = require('fs');
const { spawn } = require('child_process');

let html = fs.readFileSync('scratch/debug_water_sort.html', 'utf8');

// Simulate Android WebView:
// 1. No native roundRect
// 2. No native ellipse
// 3. alpha: false in getContext
const simScript = `
<script>
delete CanvasRenderingContext2D.prototype.roundRect;
delete CanvasRenderingContext2D.prototype.ellipse;
window.innerWidth = 0;
window.innerHeight = 0;
</script>
`;

html = html.replace('<head>', '<head>' + simScript);
fs.writeFileSync('scratch/debug_sim_webview.html', html);

const server = http.createServer((req, res) => {
  const content = fs.readFileSync('scratch/debug_sim_webview.html', 'utf8');
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(content);
});

server.listen(4568, () => {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const edge = spawn(edgePath, [
    '--headless=new',
    '--virtual-time-budget=2000',
    '--dump-dom',
    'http://localhost:4568'
  ]);

  let stdout = '';
  edge.stdout.on('data', data => { stdout += data.toString(); });
  edge.on('close', code => {
    const match = stdout.match(/<div id="__debug_output__">([\s\S]*?)<\/div>/);
    if (match) {
      console.log('SIMULATED WEBVIEW LOGS:', match[1]);
    } else {
      console.log('No debug output found');
    }
    server.close();
    process.exit(0);
  });
});
