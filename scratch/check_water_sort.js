const fs = require('fs');

const html = fs.readFileSync('backend/public/games/water-sort-3d/1.0.0/index.html', 'utf8');
const scriptStart = html.indexOf('<script>');
const scriptEnd = html.lastIndexOf('</script>');
const script = html.slice(scriptStart + 8, scriptEnd);
fs.writeFileSync('scratch/water_sort_script.js', script);

try {
  new Function(script);
  console.log('Script syntax OK!');
} catch (e) {
  console.error('Syntax Error in water sort:', e);
}
