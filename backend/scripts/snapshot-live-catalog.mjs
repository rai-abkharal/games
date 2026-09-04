import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const liveBaseUrl = String(process.argv[2] || '').replace(/\/+$/, '');
if (!/^https?:\/\//.test(liveBaseUrl)) {
  throw new Error('Usage: node scripts/snapshot-live-catalog.mjs <server-base-url>');
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(scriptDir, '..');
const workspaceDir = path.resolve(backendDir, '..');
const publicDir = path.join(backendDir, 'public');
const catalogTargets = [
  path.join(backendDir, 'catalog', 'games.json'),
  path.join(workspaceDir, 'frontend', 'assets', 'catalog', 'games.json'),
];

const response = await fetch(`${liveBaseUrl}/api/games?_snapshot=${Date.now()}`, {
  headers: { 'Cache-Control': 'no-cache' },
});
if (!response.ok) throw new Error(`Catalogue request failed: HTTP ${response.status}`);

const catalog = await response.json();
if (!catalog || !Array.isArray(catalog.games) || catalog.games.length === 0) {
  throw new Error('Live catalogue is empty or invalid; refusing to overwrite local data.');
}

function localizeUrl(value) {
  const url = new URL(value, liveBaseUrl);
  return `http://localhost:8080${url.pathname}`;
}

function packageDigest(directory) {
  const hash = crypto.createHash('sha256');
  let sizeBytes = 0;

  function walk(currentDirectory) {
    for (const name of fs.readdirSync(currentDirectory).sort()) {
      const fullPath = path.join(currentDirectory, name);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
        continue;
      }

      const relativePath = path.relative(directory, fullPath).replace(/\\/g, '/');
      if (relativePath === 'manifest.json') continue;
      const bytes = fs.readFileSync(fullPath);
      hash.update(relativePath);
      hash.update(bytes);
      sizeBytes += bytes.length;
    }
  }

  walk(directory);
  return { sha256: hash.digest('hex'), sizeBytes };
}

async function downloadReferencedAssets(game, indexPath, versionDir) {
  const html = fs.readFileSync(indexPath, 'utf8');
  const tagPattern = /<(?:script|link|img|audio|video|source)\b[^>]*(?:src|href)\s*=\s*["']([^"']+)["'][^>]*>/gi;
  const liveOrigin = new URL(liveBaseUrl).origin;
  const liveEntryUrl = new URL(new URL(game.entryUrl).pathname, liveBaseUrl);
  const gamePathPrefix = `/games/${game.id}/${game.version}/`;

  for (const match of html.matchAll(tagPattern)) {
    const reference = match[1];
    if (/^(?:data:|blob:|https?:|\/\/|#|javascript:|about:)/i.test(reference)) continue;

    const assetUrl = new URL(reference, liveEntryUrl);
    if (assetUrl.origin !== liveOrigin || !assetUrl.pathname.startsWith(gamePathPrefix)) continue;

    const relativePath = decodeURIComponent(assetUrl.pathname.slice(gamePathPrefix.length));
    const targetPath = path.resolve(versionDir, relativePath);
    const targetRoot = `${path.resolve(versionDir)}${path.sep}`;
    if (!targetPath.startsWith(targetRoot) || fs.existsSync(targetPath)) continue;

    const assetResponse = await fetch(assetUrl);
    if (!assetResponse.ok) {
      throw new Error(`${game.id}: asset ${reference} download failed (${assetResponse.status})`);
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, Buffer.from(await assetResponse.arrayBuffer()));
  }
}

catalog.games = catalog.games.map((game, index) => ({
  ...game,
  feedOrder: index + 1,
  entryUrl: localizeUrl(game.entryUrl),
  thumbnailUrl: localizeUrl(game.thumbnailUrl),
  manifestUrl: localizeUrl(game.manifestUrl),
}));

for (const game of catalog.games) {
  const versionDir = path.join(publicDir, 'games', game.id, game.version);
  const indexPath = path.join(versionDir, 'index.html');
  const manifestPath = path.join(versionDir, 'manifest.json');
  fs.mkdirSync(versionDir, { recursive: true });

  if (!fs.existsSync(indexPath)) {
    const indexResponse = await fetch(new URL(game.entryUrl).pathname.replace(/^/, liveBaseUrl));
    if (!indexResponse.ok) throw new Error(`${game.id}: index download failed (${indexResponse.status})`);
    fs.writeFileSync(indexPath, Buffer.from(await indexResponse.arrayBuffer()));
  }

  if (!fs.existsSync(manifestPath)) {
    const manifestResponse = await fetch(new URL(game.manifestUrl).pathname.replace(/^/, liveBaseUrl));
    if (!manifestResponse.ok) throw new Error(`${game.id}: manifest download failed (${manifestResponse.status})`);
    fs.writeFileSync(manifestPath, Buffer.from(await manifestResponse.arrayBuffer()));
  }

  await downloadReferencedAssets(game, indexPath, versionDir);

  let thumbnailUrl = new URL(game.thumbnailUrl);
  let thumbnailPath = path.join(publicDir, thumbnailUrl.pathname.replace(/^\/+/, ''));
  if (!fs.existsSync(thumbnailPath)) {
    for (const extension of ['.webp', '.svg', '.png', '.jpg']) {
      const candidateUrl = new URL(`/thumbnails/${game.id}${extension}`, liveBaseUrl);
      const candidatePath = path.join(publicDir, candidateUrl.pathname.replace(/^\/+/, ''));
      if (fs.existsSync(candidatePath)) {
        thumbnailUrl = candidateUrl;
        thumbnailPath = candidatePath;
        game.thumbnailUrl = `http://localhost:8080${candidateUrl.pathname}`;
        break;
      }
    }
  }

  if (!fs.existsSync(thumbnailPath)) {
    let thumbnailResponse = await fetch(`${liveBaseUrl}${thumbnailUrl.pathname}`);
    if (!thumbnailResponse.ok) {
      const baseThumbnailPath = `/thumbnails/${game.id}`;
      for (const extension of ['.webp', '.svg', '.png', '.jpg']) {
        const candidateUrl = new URL(`${baseThumbnailPath}${extension}`, liveBaseUrl);
        const candidateResponse = await fetch(candidateUrl);
        if (candidateResponse.ok) {
          thumbnailUrl = candidateUrl;
          thumbnailResponse = candidateResponse;
          game.thumbnailUrl = `http://localhost:8080${candidateUrl.pathname}`;
          break;
        }
      }
    }

    thumbnailPath = path.join(publicDir, thumbnailUrl.pathname.replace(/^\/+/, ''));
    if (!thumbnailResponse.ok) throw new Error(`${game.id}: thumbnail download failed (${thumbnailResponse.status})`);
    fs.mkdirSync(path.dirname(thumbnailPath), { recursive: true });
    fs.writeFileSync(thumbnailPath, Buffer.from(await thumbnailResponse.arrayBuffer()));
  }

  const digest = packageDigest(versionDir);
  game.sha256 = digest.sha256;
  game.sizeBytes = digest.sizeBytes;
}

const output = `${JSON.stringify(catalog, null, 2)}\n`;
for (const target of catalogTargets) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporaryPath = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, output, 'utf8');
  fs.renameSync(temporaryPath, target);
}

console.log(`Snapshotted ${catalog.games.length} games from ${liveBaseUrl}.`);
