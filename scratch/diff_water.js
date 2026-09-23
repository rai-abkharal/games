const fs = require('fs');

const f1 = fs.readFileSync('backend/public/games/water-sort/1.0.0/index.html', 'utf8');
const f2 = fs.readFileSync('backend/public/games/water-sort-3d/1.0.0/index.html', 'utf8');

console.log('f1 (water-sort) length:', f1.length, 'f2 (water-sort-3d) length:', f2.length);

// Compare line by line
const l1 = f1.split('\n');
const l2 = f2.split('\n');
console.log('l1 lines:', l1.length, 'l2 lines:', l2.length);

for (let i = 0; i < Math.max(l1.length, l2.length); i++) {
  if (l1[i] !== l2[i]) {
    console.log(`Diff at line ${i+1}:`);
    console.log('water-sort:   ', l1[i] ? l1[i].slice(0, 100) : '<EOF>');
    console.log('water-sort-3d:', l2[i] ? l2[i].slice(0, 100) : '<EOF>');
    break;
  }
}
