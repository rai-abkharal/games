const fs = require('fs');

const targetNames = [
  "Arrow Flow",
  "Car Circle",
  "Knife Hit",
  "Color Maze",
  "Shooter Hitman",
  "Food Hunt",
  "Number Drop",
  "Cute Snake",
  "Gun Simulator",
  "Ludo",
  "Fruit Merge",
  "Bubble Shooter",
  "Passenger Parking",
  "Deadzone 40",
  "Dots and Boxes",
  "Take Off Bolt",
  "4 in a Row",
  "Ball Breaker",
  "Sudoku",
  "Color Match"
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

const allGames = [
  ...loadGames('scratch/games_api.json'),
  ...loadGames('backend/catalog/games.json'),
  ...loadGames('backend/catalog/games.runtime.json')
];

for (const name of targetNames) {
  console.log(`\n>>> Search: "${name}"`);
  const exact = allGames.filter(g => {
    const t = (g.title || '').trim().toLowerCase();
    const st = (g.sourceTitle || '').trim().toLowerCase();
    const to = (g.titleOverride || '').trim().toLowerCase();
    const id = (g.id || '').trim().toLowerCase();
    const n = name.trim().toLowerCase();
    return t === n || st === n || to === n || id === n ||
           t.includes(n) || id.includes(n.replace(/\s+/g, '-'));
  });
  
  if (exact.length > 0) {
    // print unique by id
    const seen = new Set();
    for (const g of exact) {
      if (!seen.has(g.id)) {
        seen.add(g.id);
        console.log(`  MATCH: id="${g.id}", title="${g.title}", sourceTitle="${g.sourceTitle || ''}", version="${g.version}"`);
      }
    }
  } else {
    // try word fuzzy
    const words = name.toLowerCase().split(' ');
    const fuzzy = allGames.filter(g => {
      const full = `${g.id} ${g.title} ${g.sourceTitle || ''} ${g.description || ''}`.toLowerCase();
      return words.every(w => full.includes(w));
    });
    const seen = new Set();
    for (const g of fuzzy) {
      if (!seen.has(g.id)) {
        seen.add(g.id);
        console.log(`  FUZZY: id="${g.id}", title="${g.title}", sourceTitle="${g.sourceTitle || ''}"`);
      }
    }
    if (seen.size === 0) console.log('  NOT FOUND AT ALL!');
  }
}
