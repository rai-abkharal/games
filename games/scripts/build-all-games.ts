import path from 'path';
import fs from 'fs';

const MAX_GAME_PACKAGE_BYTES = 5 * 1024 * 1024;

function listFilesRecursive(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFilesRecursive(fullPath) : [fullPath];
  });
}

function getGameDirectories(): string[] {
  const gamesRoot = path.resolve(__dirname, '..');
  return fs.readdirSync(gamesRoot, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory() && fs.existsSync(path.join(gamesRoot, dirent.name, 'manifest.json')))
    .map(dirent => dirent.name)
    .sort();
}

async function buildAll() {
  const GAME_DIRS = getGameDirectories();
  console.log(`🚀 Starting compilation of all ${GAME_DIRS.length} Mini-Games...\n`);

  for (const dirName of GAME_DIRS) {
    const gameDir = path.resolve(__dirname, '..', dirName);
    const rootIndex = path.join(gameDir, 'index.html');
    const distDir = path.join(gameDir, 'dist');
    const distIndex = path.join(distDir, 'index.html');

    console.log(`🔨 Building ${dirName}...`);

    try {
      if (!fs.existsSync(rootIndex)) {
        throw new Error(`Missing root index.html in ${dirName}`);
      }

      fs.mkdirSync(distDir, { recursive: true });
      fs.copyFileSync(rootIndex, distIndex);

      // Preserve game-local runtime art in the versioned package so relative
      // asset URLs keep working after deployment.
      const sourceAssets = path.join(gameDir, 'assets');
      if (fs.existsSync(sourceAssets)) {
        fs.cpSync(sourceAssets, path.join(distDir, 'assets'), { recursive: true });
      }

      const packageBytes = listFilesRecursive(distDir)
        .reduce((total, filePath) => total + fs.statSync(filePath).size, 0);
      if (packageBytes > MAX_GAME_PACKAGE_BYTES) {
        throw new Error(
          `${dirName} package is ${(packageBytes / 1024 / 1024).toFixed(2)} MB; the MVP budget is ${MAX_GAME_PACKAGE_BYTES / 1024 / 1024} MB.`,
        );
      }

      console.log(
        `✅ ${dirName}: ${(packageBytes / 1024).toFixed(1)} KB standalone micro-engine package\n`,
      );
    } catch (err) {
      console.error(`❌ Failed building ${dirName}:`, err);
      process.exit(1);
    }
  }

  console.log(`🎉 All ${GAME_DIRS.length} Mini-Games successfully built!`);
}

buildAll();
