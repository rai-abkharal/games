import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

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

function referencesDevelopmentSource(html: string): boolean {
  return /<script\b[^>]*\bsrc=["'][^"']*(?:\/@vite\/client|(?:^|\/)src\/[^"']+\.tsx?)(?:[?#][^"']*)?["']/i.test(html);
}

async function buildAll() {
  const gameDirectories = getGameDirectories();
  console.log(`Starting compilation of all ${gameDirectories.length} mini-games...\n`);

  for (const dirName of gameDirectories) {
    const gameDir = path.resolve(__dirname, '..', dirName);
    const rootIndex = path.join(gameDir, 'index.html');
    const distDir = path.join(gameDir, 'dist');
    const distIndex = path.join(distDir, 'index.html');
    const packagePath = path.join(gameDir, 'package.json');

    console.log(`Building ${dirName}...`);

    try {
      if (!fs.existsSync(rootIndex)) {
        throw new Error(`Missing root index.html in ${dirName}`);
      }

      const packageJson = fs.existsSync(packagePath)
        ? JSON.parse(fs.readFileSync(packagePath, 'utf8'))
        : null;
      const hasBuildScript = typeof packageJson?.scripts?.build === 'string';

      if (hasBuildScript) {
        // TypeScript/Vite games must be compiled. Copying their root HTML would
        // deploy references such as /src/main.ts, which do not exist live.
        const isWindows = process.platform === 'win32';
        const command = isWindows ? 'cmd.exe' : 'npm';
        const args = isWindows
          ? ['/d', '/s', '/c', 'npm.cmd', 'run', 'build']
          : ['run', 'build'];
        const result = spawnSync(command, args, {
          cwd: gameDir,
          stdio: 'inherit',
        });
        if (result.status !== 0) {
          const reason = result.error?.message || `exit ${result.status ?? 'unknown'}`;
          throw new Error(`Production build failed in ${dirName} (${reason})`);
        }
      } else {
        fs.mkdirSync(distDir, { recursive: true });
        fs.copyFileSync(rootIndex, distIndex);

        // Standalone HTML games may keep runtime art beside index.html.
        const sourceAssets = path.join(gameDir, 'assets');
        const distAssets = path.join(distDir, 'assets');
        if (fs.existsSync(distAssets)) {
          fs.rmSync(distAssets, { recursive: true, force: true });
        }
        if (fs.existsSync(sourceAssets)) {
          fs.cpSync(sourceAssets, distAssets, { recursive: true });
        }
      }

      if (!fs.existsSync(distIndex)) {
        throw new Error(`Production build did not create dist/index.html in ${dirName}`);
      }

      const builtHtml = fs.readFileSync(distIndex, 'utf8');
      if (referencesDevelopmentSource(builtHtml)) {
        throw new Error(
          `${dirName} dist/index.html still references development source files. Configure a real production build.`,
        );
      }

      const packageBytes = listFilesRecursive(distDir)
        .reduce((total, filePath) => total + fs.statSync(filePath).size, 0);
      if (packageBytes > MAX_GAME_PACKAGE_BYTES) {
        throw new Error(
          `${dirName} package is ${(packageBytes / 1024 / 1024).toFixed(2)} MB; the MVP budget is ${MAX_GAME_PACKAGE_BYTES / 1024 / 1024} MB.`,
        );
      }

      console.log(`${dirName}: ${(packageBytes / 1024).toFixed(1)} KB production package\n`);
    } catch (err) {
      console.error(`Failed building ${dirName}:`, err);
      process.exit(1);
    }
  }

  console.log(`All ${gameDirectories.length} mini-games successfully built!`);
}

buildAll();
