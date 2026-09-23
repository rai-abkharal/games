const fs = require('fs');
const path = require('path');

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

for (const g of twenty) {
  const p = path.join('backend/public/games', g.id);
  if (fs.existsSync(p)) {
    const versions = fs.readdirSync(p);
    for (const v of versions) {
      const vDir = path.join(p, v);
      if (fs.statSync(vDir).isDirectory()) {
        const files = fs.readdirSync(vDir);
        console.log(`${g.name} [${g.id} / ${v}]: files count=${files.length}, index=${files.includes('index.html')}, bundle=${files.includes('bundle.json')}`);
      }
    }
  } else {
    console.log(`${g.name} [${g.id}]: NOT on local disk (on server)`);
  }
}
