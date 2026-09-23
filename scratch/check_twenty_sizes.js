const fs = require('fs');
let raw = fs.readFileSync('scratch/live_catalog.json', 'utf8');
if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
const data = JSON.parse(raw);
const games = data.games || data;

const twenty = [
  { name: "Arrow Flow", id: "game-mudsy3a8" },
  { name: "Car Circle", id: "game-mucbfekb" },
  { name: "Knife Hit", id: "knife-hit" },
  { name: "Color Maze", id: "maze-paint" },
  { name: "Shooter Hitman", id: "game-mtworlmu" },
  { name: "Food Hunt", id: "game-mtvj5sds" },
  { name: "Number Drop", id: "number-drop" },
  { name: "Cute Snake", id: "snake-classic" },
  { name: "Gun Simulator", id: "gun-simulator" },
  { name: "Ludo", id: "ludo-race" },
  { name: "Fruit Merge", id: "fruit-merge" },
  { name: "Bubble Shooter", id: "bubble-shooter" },
  { name: "Passenger Parking", id: "game-mu51zff4" },
  { name: "Deadzone 40", id: "deadzone-40" },
  { name: "Dots and Boxes", id: "dots-and-boxes" },
  { name: "Take Off Bolt", id: "takeoff-bolts" },
  { name: "4 in a Row", id: "four-in-a-row" },
  { name: "Ball Breaker", id: "ball-breaker" },
  { name: "Sudoku", id: "sudoku-pro" },
  { name: "Color Match", id: "color-match" },
];

let totalBytes = 0;
for (const item of twenty) {
  const g = games.find(x => x.id === item.id);
  if (g) {
    const bytes = g.bundleBytes || g.sizeBytes || 0;
    totalBytes += bytes;
    console.log(`${item.name} (${g.id}): version=${g.version}, size=${(bytes/1024).toFixed(1)} KB, bundleUrl=${g.bundleUrl ? 'yes' : 'no'}`);
  } else {
    console.log(`${item.name} (${item.id}): NOT IN CATALOG`);
  }
}
console.log(`\nTotal estimated size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
