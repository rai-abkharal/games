import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(scriptDir, '..');
const repoDir = path.resolve(backendDir, '..');
const catalogPath = path.join(backendDir, 'catalog', 'games.json');
const bundledCatalogPath = path.join(
  repoDir,
  'frontend',
  'assets',
  'catalog',
  'games.json',
);
const publicGamesDir = path.join(backendDir, 'public', 'games');
const productionMode = process.argv.includes('--production');
// Keep this aligned with the admin upload validation contract.
const maxPackageBytes = 10 * 1024 * 1024;

function hashPublishedPackage(directory) {
  const hash = crypto.createHash('sha256');
  let sizeBytes = 0;

  function walk(current) {
    for (const name of fs.readdirSync(current).sort()) {
      const fullPath = path.join(current, name);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
        continue;
      }

      // manifest.json is server metadata, not part of the downloaded game package.
      if (path.relative(directory, fullPath).replace(/\\/g, '/') === 'manifest.json') {
        continue;
      }

      const relativePath = path.relative(directory, fullPath).replace(/\\/g, '/');
      const bytes = fs.readFileSync(fullPath);
      hash.update(relativePath);
      hash.update(bytes);
      sizeBytes += bytes.length;
    }
  }

  walk(directory);
  return { sha256: hash.digest('hex'), sizeBytes };
}

function fail(message) {
  console.error(`❌ ${message}`);
  process.exitCode = 1;
}

const backendRaw = fs.readFileSync(catalogPath, 'utf8');
const bundledRaw = fs.readFileSync(bundledCatalogPath, 'utf8');
if (backendRaw !== bundledRaw) {
  fail('Backend and bundled Flutter catalogs are not identical.');
}

const catalog = JSON.parse(backendRaw);
const ids = new Set();

for (const game of catalog.games) {
  if (ids.has(game.id)) fail(`Duplicate game id: ${game.id}`);
  ids.add(game.id);

  const gameDirectory = path.join(publicGamesDir, game.id, game.version);
  if (!fs.existsSync(gameDirectory)) {
    fail(`Missing package directory for ${game.id} v${game.version}`);
    continue;
  }

  const actual = hashPublishedPackage(gameDirectory);
  if (actual.sha256 !== game.sha256) {
    fail(
      `${game.id}: checksum mismatch; catalog=${game.sha256}, actual=${actual.sha256}`,
    );
  }
  if (actual.sizeBytes !== game.sizeBytes) {
    fail(
      `${game.id}: size mismatch; catalog=${game.sizeBytes}, actual=${actual.sizeBytes}`,
    );
  }
  if (actual.sizeBytes > maxPackageBytes) {
    fail(`${game.id}: package exceeds the 10 MB upload budget.`);
  }

  for (const field of ['entryUrl', 'thumbnailUrl', 'manifestUrl']) {
    const url = new URL(game[field]);
    if (productionMode && url.protocol !== 'https:') {
      fail(`${game.id}: ${field} must use HTTPS in production (${url.href})`);
    }
  }

  console.log(
    `✅ ${game.id.padEnd(16)} ${(actual.sizeBytes / 1024 / 1024).toFixed(2)} MB ` +
      actual.sha256.slice(0, 12),
  );
}

if (!process.exitCode) {
  console.log(`\nCatalog verified: ${catalog.games.length} games.`);
}
