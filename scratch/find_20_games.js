const fs = require('fs');

const targetNames = [
  "Arrow Flow", "Car Circle", "Knife Hit", "Color Maze", "Shooter Hitman",
  "Food Hunt", "Number Drop", "Cute Snake", "Gun Simulator", "Ludo",
  "Fruit Merge", "Bubble Shooter", "Passenger Parking", "Deadzone 40",
  "Dots and Boxes", "Take Off Bolt", "4 in a Row", "Ball Breaker",
  "Sudoku", "Color Match"
];

function loadGames(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(data) ? data : (data.games || []);
  } catch (e) {
    return [];
  }
}

const g1 = loadGames('scratch/games_api.json');
const g2 = loadGames('backend/catalog/games.json');
const g3 = loadGames('backend/catalog/games.runtime.json');
const g4 = loadGames('frontend/assets/catalog/games.json');

const map = new Map();
for (const g of [...g1, ...g2, ...g3, ...g4]) {
  if (g.id && !map.has(g.id)) {
    map.set(g.id, g);
  }
}
const allGames = Array.from(map.values());

console.log('Total unique games found:', allGames.length);

const results = {};
for (const name of targetNames) {
  const norm = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const matches = allGames.filter(g => {
    const id = (g.id || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const title = (g.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const sourceTitle = (g.sourceTitle || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const titleOverride = (g.titleOverride || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const desc = (g.description || '').toLowerCase();
    
    // exact or strong match
    if (id.includes(norm) || norm.includes(id)) return true;
    if (title.includes(norm) || norm.includes(title)) return true;
    if (sourceTitle.includes(norm) || norm.includes(sourceTitle)) return true;
    if (titleOverride.includes(norm) || norm.includes(titleOverride)) return true;

    // keyword parts
    const parts = name.toLowerCase().split(' ').filter(p => p.length > 2);
    if (parts.length > 1 && parts.every(p => (id + ' ' + title + ' ' + desc).includes(p))) return true;

    return false;
  });

  results[name] = matches.map(m => ({
    id: m.id,
    title: m.title,
    sourceTitle: m.sourceTitle,
    version: m.version,
    entryUrl: m.entryUrl,
    hasLocalDir: fs.existsSync(`backend/public/games/${m.id}`),
    hasGamesDir: fs.existsSync(`games/${m.id}`)
  }));
}

console.log(JSON.stringify(results, null, 2));
