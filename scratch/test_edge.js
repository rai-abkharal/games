const http = require('http');
const fs = require('fs');
const { spawn } = require('child_process');

const server = http.createServer((req, res) => {
  const content = fs.readFileSync('scratch/debug_water_sort.html', 'utf8');
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(content);
});

server.listen(4567, () => {
  console.log('Server listening on port 4567');
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const edge = spawn(edgePath, [
    '--headless=new',
    '--virtual-time-budget=2000',
    '--dump-dom',
    'http://localhost:4567'
  ]);

  let stdout = '';
  let stderr = '';

  edge.stdout.on('data', data => {
    stdout += data.toString();
  });

  edge.stderr.on('data', data => {
    stderr += data.toString();
  });

  edge.on('close', code => {
    console.log('Edge exited with code', code);
    const match = stdout.match(/<div id="__debug_output__">([\s\S]*?)<\/div>/);
    if (match) {
      console.log('Captured debug logs:', match[1]);
    } else {
      console.log('No debug output found. Stdout length:', stdout.length, 'Stderr:', stderr);
    }
    server.close();
    process.exit(0);
  });
});
