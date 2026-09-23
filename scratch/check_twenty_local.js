const fs = require('fs');

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
  const localDir = `backend/public/games/${g.id}`;
  const exists = fs.existsSync(localDir);
  let files = [];
  if (exists) {
    try {
      const v = fs.readdirSync(localDir);
      files = v;
    } catch(e) {}
  }
  console.log(`${g.name} [${g.id}]: localDir exists=${exists}, subdirs=${files.join(',')}`);
}
