/**
 * Pre-generates `bundle.json` for every deployed game build.
 *
 * The server generates manifests on demand, so this script is never required —
 * it just moves the cost from the first player's request to deploy time, which
 * is where you want it once the games directory is large.
 *
 *   npx tsx scripts/build-bundles.ts [--public-dir <path>] [--force]
 */
import fs from "node:fs";
import path from "node:path";
import {
  BUNDLE_MANIFEST_FILE,
  buildManifest,
  ensureManifest,
} from "../src/services/bundleService";

function resolvePublicDir(explicit?: string): string {
  const candidates = [
    explicit,
    process.env.PUBLIC_DIR,
    path.resolve(process.cwd(), "public"),
    path.resolve(process.cwd(), "backend/public"),
    "/var/www/games-platform/backend/public",
  ].filter(Boolean) as string[];
  const found = candidates.find((candidate) =>
    fs.existsSync(path.join(candidate, "games")),
  );
  if (!found) {
    throw new Error(
      `Could not find a public/games directory. Tried:\n  ${candidates.join("\n  ")}`,
    );
  }
  return found;
}

function main(): void {
  const argv = process.argv.slice(2);
  const force = argv.includes("--force");
  const dirFlag = argv.indexOf("--public-dir");
  const publicDir = resolvePublicDir(
    dirFlag >= 0 ? argv[dirFlag + 1] : undefined,
  );
  const gamesDir = path.join(publicDir, "games");

  let builds = 0;
  let bytes = 0;
  const started = Date.now();

  for (const gameEntry of fs.readdirSync(gamesDir, { withFileTypes: true })) {
    if (!gameEntry.isDirectory()) continue;
    const gameId = gameEntry.name;
    const gameDir = path.join(gamesDir, gameId);
    for (const versionEntry of fs.readdirSync(gameDir, {
      withFileTypes: true,
    })) {
      if (!versionEntry.isDirectory()) continue;
      const version = versionEntry.name;
      if (!/^\d+\.\d+\.\d+$/.test(version)) continue;
      const buildDir = path.join(gameDir, version);
      try {
        let manifest;
        if (force) {
          manifest = buildManifest(buildDir, gameId, version);
          fs.writeFileSync(
            path.join(buildDir, BUNDLE_MANIFEST_FILE),
            `${JSON.stringify(manifest, null, 2)}\n`,
            "utf8",
          );
        } else {
          manifest = ensureManifest(gamesDir, gameId, version);
        }
        if (!manifest) continue;
        builds += 1;
        bytes += manifest.totalBytes;
        console.log(
          `  ${gameId}@${version}  ${manifest.files.length} files  ` +
            `${(manifest.totalBytes / 1024).toFixed(0)} KB  build ${manifest.buildId}`,
        );
      } catch (error) {
        console.error(
          `  ${gameId}@${version}  FAILED: ${(error as Error).message}`,
        );
      }
    }
  }

  console.log(
    `\nGenerated ${builds} bundle manifests (${(bytes / 1048576).toFixed(1)} MB of game files) ` +
      `in ${Date.now() - started} ms.`,
  );
}

main();
