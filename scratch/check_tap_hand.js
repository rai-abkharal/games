const fs = require('fs');
const html = fs.readFileSync('backend/public/games/arrow-puzzle/1.0.0/index.html', 'utf8');
const match = html.match(/tapHand\.src\s*=\s*"data:image\/png;base64,([^"]+)"/);
if (match) {
  const buf = Buffer.from(match[1], 'base64');
  fs.writeFileSync('scratch/test_tap_hand.png', buf);
  console.log('Saved scratch/test_tap_hand.png, bytes:', buf.length);
} else {
  console.log('No match for tapHand.src');
}
