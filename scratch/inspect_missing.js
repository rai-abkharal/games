const fs = require('fs');
let raw = fs.readFileSync('scratch/live_catalog.json', 'utf8');
if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
const data = JSON.parse(raw);
const games = data.games || data;

const missingLocally = [
  "game-mudsy3a8",
  "game-mucbfekb",
  "knife-hit",
  "game-mtworlmu",
  "game-mtvj5sds",
  "gun-simulator",
  "game-mu51zff4",
  "deadzone-40"
];

for (const id of missingLocally) {
  const g = games.find(x => x.id === id);
  if (g) {
    console.log(`\nID: ${g.id} ("${g.title}")`);
    console.log(`  entryUrl: ${g.entryUrl}`);
    console.log(`  manifestUrl: ${g.manifestUrl}`);
    console.log(`  bundleUrl: ${g.bundleUrl || ''}`);
    console.log(`  sizeBytes: ${g.sizeBytes}`);
  } else {
    console.log(`NOT FOUND: ${id}`);
  }
}
