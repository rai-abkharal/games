const fs = require('fs');

const html = fs.readFileSync('backend/public/games/water-sort-3d/1.0.0/index.html', 'utf8');
const debugScript = `
<script>
window.__logs = [];
window.onerror = function(msg, url, line, col, err) {
  window.__logs.push({type: "WINDOW_ERROR", msg: String(msg), line, col, stack: err ? err.stack : null});
};
const origWarn = console.warn.bind(console);
console.warn = function(...args) {
  window.__logs.push({type: "WARN", args: args.map(a => (a && a.stack) ? a.stack : String(a))});
  origWarn(...args);
};
const origError = console.error.bind(console);
console.error = function(...args) {
  window.__logs.push({type: "ERROR", args: args.map(a => (a && a.stack) ? a.stack : String(a))});
  origError(...args);
};
window.addEventListener("load", () => {
  setTimeout(() => {
    const el = document.createElement("div");
    el.id = "__debug_output__";
    el.textContent = JSON.stringify(window.__logs, null, 2);
    document.body.appendChild(el);
  }, 1200);
});
</script>
`;

const instrumented = html.replace('<head>', '<head>' + debugScript);
fs.writeFileSync('scratch/debug_water_sort.html', instrumented);
console.log('Written scratch/debug_water_sort.html successfully');
