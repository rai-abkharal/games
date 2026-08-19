import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Catalog, CatalogSchema, Game, GameSchema } from '../src/types/game';

interface DeployOptions {
  gameDir: string;
  dryRun?: boolean;
  force?: boolean;
  publicDir?: string;
  catalogPath?: string;
  bundledCatalogPath?: string;
  baseUrl?: string;
}

function calculateDirectoryHash(dirPath: string): { hash: string; size: number } {
  const hash = crypto.createHash('sha256');
  let totalSize = 0;

  function walk(current: string) {
    const files = fs.readdirSync(current).sort();
    for (const file of files) {
      const fullPath = path.join(current, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else {
        totalSize += stat.size;
        const relative = path.relative(dirPath, fullPath).replace(/\\/g, '/');
        hash.update(relative);
        const fileContent = fs.readFileSync(fullPath);
        hash.update(fileContent);
      }
    }
  }

  walk(dirPath);
  return { hash: hash.digest('hex'), size: totalSize };
}

function copyRecursiveSync(src: string, dest: string) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

export function deployGame(options: DeployOptions): { success: boolean; message: string; game?: any } {
  const { gameDir, dryRun = false, force = false } = options;
  const publicDir = options.publicDir || path.resolve(__dirname, '../public');
  const catalogPath = options.catalogPath || path.resolve(__dirname, '../catalog/games.json');
  const bundledCatalogPath = options.bundledCatalogPath ||
    path.resolve(__dirname, '../../frontend/assets/catalog/games.json');
  const baseUrl = (options.baseUrl || process.env.BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');

  console.log(`\n📦 Processing game deployment from: ${gameDir}`);

  // Step 1: Validate manifest.json exists
  const manifestPath = path.join(gameDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`manifest.json missing in ${gameDir}`);
  }

  const manifestRaw = fs.readFileSync(manifestPath, 'utf-8');
  let manifest: any;
  try {
    manifest = JSON.parse(manifestRaw);
  } catch (err) {
    throw new Error(`Invalid JSON in manifest.json: ${(err as Error).message}`);
  }

  // Check dist directory
  const distDir = path.join(gameDir, 'dist');
  if (!fs.existsSync(distDir)) {
    throw new Error(`dist directory missing in ${gameDir}. Run 'npm run build' first.`);
  }

  const indexHtml = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    throw new Error(`index.html missing in ${distDir}`);
  }

  // Step 2 & 3: Read package size and compute SHA-256
  const { hash: sha256, size: sizeBytes } = calculateDirectoryHash(distDir);

  const gameId = manifest.id;
  const version = manifest.version;
  const title = manifest.title || gameId;
  const orientation = manifest.orientation || 'portrait';
  const engine = manifest.engine || 'phaser';
  const category = manifest.category || 'Arcade';
  const description = manifest.description || '';
  const feedOrder = typeof manifest.feedOrder === 'number' ? manifest.feedOrder : 99;
  const features = manifest.features || { sound: true, vibration: false };

  console.log(`🎮 Game: ${title} (${gameId} v${version})`);
  console.log(`📊 Size: ${(sizeBytes / 1024 / 1024).toFixed(2)} MB (${sizeBytes} bytes) | SHA-256: ${sha256.substring(0, 12)}...`);

  // Destination paths
  const targetGameDir = path.join(publicDir, 'games', gameId, version);
  const targetThumbnailsDir = path.join(publicDir, 'thumbnails');
  const targetThumbnailFile = path.join(targetThumbnailsDir, `${gameId}.webp`);

  // Published versions are immutable. A development force deploy must first
  // delete the old directory; copying over it leaves obsolete hashed bundles.
  if (fs.existsSync(targetGameDir)) {
    if (!force) {
      throw new Error(
        `Version ${version} of ${gameId} already exists. Bump the version, or use --force only in development.`,
      );
    }
    fs.rmSync(targetGameDir, { recursive: true, force: true });
  }

  const entryUrl = `${baseUrl}/games/${gameId}/${version}/index.html`;
  const thumbnailUrl = `${baseUrl}/thumbnails/${gameId}.webp`;
  const manifestUrl = `${baseUrl}/games/${gameId}/${version}/manifest.json`;

  const existingGame = fs.existsSync(catalogPath)
    ? (() => {
        try {
          return (JSON.parse(fs.readFileSync(catalogPath, 'utf-8')).games || []).find((g: any) => g.id === gameId);
        } catch {
          return null;
        }
      })()
    : null;

  const gameEntry: Game = {
    id: gameId,
    title,
    version,
    entryUrl,
    thumbnailUrl,
    sizeBytes,
    orientation,
    engine,
    manifestUrl,
    feedOrder,
    category,
    description,
    sha256,
    touchZones: (manifest as any).touchZones || existingGame?.touchZones || [],
    features,
  };

  // Validate game schema
  const validateResult = GameSchema.safeParse(gameEntry);
  if (!validateResult.success) {
    throw new Error(`Invalid game metadata: ${validateResult.error.message}`);
  }

  if (dryRun) {
    console.log(`🔍 [DRY RUN] Would copy files to: ${targetGameDir}`);
    console.log(`🔍 [DRY RUN] Generated entry:`, gameEntry);
    return { success: true, message: 'Dry run completed successfully', game: gameEntry };
  }

  // Copy dist to public/games/{gameId}/{version}/
  fs.mkdirSync(targetGameDir, { recursive: true });
  copyRecursiveSync(distDir, targetGameDir);
  // Also copy manifest.json into the published folder
  fs.writeFileSync(path.join(targetGameDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  // Copy or generate thumbnail
  fs.mkdirSync(targetThumbnailsDir, { recursive: true });
  const publicThumb = path.join(gameDir, 'public', 'thumbnail.webp');
  const rootThumb = path.join(gameDir, 'thumbnail.webp');
  const localThumb = fs.existsSync(publicThumb) ? publicThumb : rootThumb;
  if (fs.existsSync(localThumb)) {
    fs.copyFileSync(localThumb, targetThumbnailFile);
  } else if (!fs.existsSync(targetThumbnailFile)) {
    // Generate simple placeholder thumbnail if not exists
    fs.writeFileSync(targetThumbnailFile, Buffer.from('RIFF....WEBPVP8 ...'));
  }

  // Update catalog/games.json
  let catalog: Catalog = { version: 1, updatedAt: new Date().toISOString(), games: [] };
  if (fs.existsSync(catalogPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'));
      if (existing.games && Array.isArray(existing.games)) {
        catalog = existing;
      }
    } catch {
      // Create new
    }
  }

  // Replace or add game in catalog
  const existingIdx = catalog.games.findIndex((g) => g.id === gameId);
  if (existingIdx >= 0) {
    catalog.games[existingIdx] = gameEntry;
  } else {
    catalog.games.push(gameEntry);
  }

  // Sort games by feedOrder
  catalog.games.sort((a, b) => a.feedOrder - b.feedOrder);
  catalog.updatedAt = new Date().toISOString();

  // Validate full catalog
  CatalogSchema.parse(catalog);

  const catalogJson = `${JSON.stringify(catalog, null, 2)}\n`;
  for (const outputPath of [catalogPath, bundledCatalogPath]) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const temporaryPath = `${outputPath}.tmp-${process.pid}`;
    fs.writeFileSync(temporaryPath, catalogJson);
    fs.renameSync(temporaryPath, outputPath);
  }

  console.log(`✅ Deployed ${gameId} v${version} successfully!`);
  console.log(`🌐 Entry URL: ${entryUrl}`);
  console.log(`📋 Catalog updated: ${catalogPath} (${catalog.games.length} games)`);

  return { success: true, message: `Deployed ${gameId} v${version}`, game: gameEntry };
}

// CLI Execution if run directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const targetDir = args[0] || path.resolve(__dirname, '../../games/01-tap-cannon');
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');

  try {
    deployGame({ gameDir: targetDir, dryRun, force });
  } catch (err) {
    console.error(`❌ Deployment failed: ${(err as Error).message}`);
    process.exit(1);
  }
}
