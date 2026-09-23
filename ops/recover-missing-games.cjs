// Run on the main server after pulling this file from Git.
// Dry-run by default; --apply restores only catalog builds missing index.html.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = '/var/www/games-platform';
const games = path.join(root, 'backend/public/games');
const source = 'root@162.243.197.241';
const apply = process.argv.includes('--apply');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'backend/catalog/games.runtime.json')));
const backup = apply ? fs.mkdtempSync('/var/backups/game-recovery-') : null;
const report = [];
for (const g of catalog.games) {
  if (!/^[a-z0-9-]{1,80}$/.test(g.id) || !/^\d+\.\d+\.\d+$/.test(g.version)) continue;
  const relative = `${g.id}/${g.version}`;
  const dest = path.join(games, relative);
  if (fs.existsSync(path.join(dest, 'index.html'))) continue;
  const row = { id: g.id, title: g.title, version: g.version, status: 'source-missing' };
  report.push(row);
  try {
    execFileSync('ssh', ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', source,
      `test -s ${games}/${relative}/index.html`], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 });
    row.status = 'recoverable';
    if (apply) {
      const staging = path.join(backup, 'source', relative);
      fs.mkdirSync(staging, { recursive: true });
      execFileSync('rsync', ['-a', '--safe-links', '-e', 'ssh -o BatchMode=yes -o StrictHostKeyChecking=yes',
        `${source}:${games}/${relative}/`, staging + '/'], { stdio: 'pipe', timeout: 300000 });
      if (!fs.statSync(path.join(staging, 'index.html')).size) throw Error('Empty source entry');
      // Never mix different existing assets with the recovered source.
      const files = [];
      function inspect(dir, prefix = '') {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const rel = path.join(prefix, e.name);
          if (e.isSymbolicLink()) throw Error('Symlink requires manual review');
          if (e.isDirectory()) { inspect(path.join(dir, e.name), rel); continue; }
          if (rel === 'bundle.json') continue;
          const target = path.join(dest, rel);
          if (fs.existsSync(target) && !fs.readFileSync(target).equals(fs.readFileSync(path.join(staging, rel))))
            throw Error(`Existing file differs: ${rel}`);
          files.push(rel);
        }
      }
      inspect(staging);
      if (fs.existsSync(dest)) fs.cpSync(dest, path.join(backup, 'before', relative), { recursive: true });
      // Publish the entry last, after every referenced asset is restored.
      files.sort((a, b) => Number(a === 'index.html') - Number(b === 'index.html'));
      for (const rel of files) {
        const target = path.join(dest, rel);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        if (!fs.existsSync(target)) fs.copyFileSync(path.join(staging, rel), target, fs.constants.COPYFILE_EXCL);
      }
      const bundle = path.join(dest, 'bundle.json');
      if (fs.existsSync(bundle)) fs.renameSync(bundle, path.join(backup, 'before', relative, 'bundle.json.retired'));
      const { ensureManifest } = require(path.join(root, 'backend/dist/src/services/bundleService.js'));
      ensureManifest(games, g.id, g.version);
      row.status = 'restored';
      row.files = files.length;
    }
  } catch (error) {
    if (row.status !== 'source-missing') { row.status = 'needs-review'; row.error = error.message; }
  }
  console.log(JSON.stringify(row));
}
if (backup) fs.writeFileSync(path.join(backup, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ backup, total: report.length, restored: report.filter(r => r.status === 'restored').length,
  recoverable: report.filter(r => r.status === 'recoverable').length, unresolved: report.filter(r => ['source-missing', 'needs-review'].includes(r.status)).length }));
