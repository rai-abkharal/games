const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const baseUrl = 'https://games.raiabdullah.tech';

const gamesToDownload = [
  { id: 'game-mudsy3a8', version: '1.0.0', name: 'Arrow Flow' },
  { id: 'game-mucbfekb', version: '1.0.0', name: 'Car Circle' },
  { id: 'knife-hit', version: '1.3.0', name: 'Knife Hit' },
  { id: 'game-mtworlmu', version: '1.0.0', name: 'Shooter Hitman' },
  { id: 'game-mtvj5sds', version: '1.0.0', name: 'Food Hunt' },
  { id: 'gun-simulator', version: '1.0.0', name: 'Gun Simulator' },
  { id: 'game-mu51zff4', version: '1.0.0', name: 'Passenger Parking' },
  { id: 'deadzone-40', version: '1.4.0', name: 'Deadzone 40' },
];

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const req = client.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchBuffer(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to fetch ${url} - Status ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    });
  });
}

async function run() {
  for (const game of gamesToDownload) {
    console.log(`\nProcessing ${game.name} (${game.id} v${game.version})...`);
    const gameDir = path.join('backend/public/games', game.id, game.version);
    fs.mkdirSync(gameDir, { recursive: true });

    const bundleUrl = `${baseUrl}/games/${game.id}/${game.version}/bundle.json`;
    console.log(`  Fetching bundle manifest from ${bundleUrl}...`);
    const bundleRaw = await fetchBuffer(bundleUrl);
    fs.writeFileSync(path.join(gameDir, 'bundle.json'), bundleRaw);

    const bundle = JSON.parse(bundleRaw.toString('utf8'));
    console.log(`  Bundle contains ${bundle.files.length} files (total bytes: ${bundle.totalBytes}). Downloading...`);

    for (const file of bundle.files) {
      const fileUrl = `${baseUrl}/games/${game.id}/${game.version}/${file.path}`;
      const filePath = path.join(gameDir, file.path);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });

      if (fs.existsSync(filePath) && fs.statSync(filePath).size === file.bytes) {
        // already downloaded
        continue;
      }

      console.log(`    -> ${file.path} (${file.bytes} bytes)...`);
      const content = await fetchBuffer(fileUrl);
      fs.writeFileSync(filePath, content);
    }
    console.log(`  ✓ Finished ${game.name}`);
  }
  console.log('\nAll 8 remote games downloaded successfully!');
}

run().catch(err => {
  console.error('Error downloading games:', err);
  process.exit(1);
});
