const fs = require('fs');
let raw = fs.readFileSync('scratch/live_catalog.json', 'utf8');
if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
const data = JSON.parse(raw);
const games = data.games || data;
console.log('Total games on live server:', games.length);
games.forEach((g, i) => {
  console.log(`${i+1}. [${g.id}] "${g.title}" (source: "${g.sourceTitle || ''}", override: "${g.titleOverride || ''}")`);
});
