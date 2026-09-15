import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Per-build bundle manifests.
 *
 * A game's catalogue entry used to identify a build by `version` plus a
 * `sha256` of `index.html` alone, which says nothing about the assets beside
 * it: swapping a sprite or an audio file without touching the entry document
 * produced a byte-for-byte identical identity. That is fine while every client
 * re-downloads the game on each launch, and wrong the moment a client keeps a
 * copy on disk.
 *
 * `bundle.json` closes that gap. It lists every file a build is made of with
 * its size and SHA-256, and derives a `buildId` from the whole list, so:
 *
 *  - a client can ask "do I already have build X of game Y?" and answer it
 *    locally, with no download and no guesswork;
 *  - a downloader knows the exact file list up front instead of scraping
 *    `<script src>` out of the HTML and missing stylesheets, images and audio;
 *  - every downloaded byte can be verified against a hash before the build is
 *    allowed to replace a working one.
 *
 * Manifests are generated on demand and cached on disk next to the build, so
 * no deploy step is required for existing games; `scripts/build-bundles.ts`
 * pre-generates them when you would rather pay the cost at deploy time.
 */

export const BUNDLE_MANIFEST_FILE = "bundle.json";
export const BUNDLE_SCHEMA = 1;

export interface BundleFileEntry {
  /** Forward-slash path relative to the build directory. */
  path: string;
  bytes: number;
  sha256: string;
}

export interface BundleManifest {
  schema: number;
  gameId: string;
  version: string;
  /** Identity of the whole build: changes when any file's content changes. */
  buildId: string;
  entry: string;
  totalBytes: number;
  files: BundleFileEntry[];
  generatedAt: string;
}

/** Never shipped to a device: build metadata, editor leftovers, the manifest itself. */
function isExcluded(relativePath: string): boolean {
  const segments = relativePath.split("/");
  if (segments.some((segment) => segment.startsWith("."))) return true;
  const name = segments[segments.length - 1];
  return (
    name === BUNDLE_MANIFEST_FILE ||
    name === "Thumbs.db" ||
    name === "desktop.ini" ||
    name.endsWith(".map")
  );
}

function walk(root: string, current: string, out: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(current, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    // Symlinks are skipped rather than followed: a build directory must not be
    // able to publish files from elsewhere on the server.
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      walk(root, absolute, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const relative = path.relative(root, absolute).split(path.sep).join("/");
    if (isExcluded(relative)) continue;
    out.push(relative);
  }
}

function hashFile(absolute: string): string {
  // Streamed in chunks: a 30 MB+ bundle must never be held in memory whole.
  const hash = crypto.createHash("sha256");
  const handle = fs.openSync(absolute, "r");
  try {
    const buffer = Buffer.allocUnsafe(1 << 20);
    for (;;) {
      const read = fs.readSync(handle, buffer, 0, buffer.length, null);
      if (read <= 0) break;
      hash.update(buffer.subarray(0, read));
    }
  } finally {
    fs.closeSync(handle);
  }
  return hash.digest("hex");
}

/** The entry document, preferring the one at the build root. */
function pickEntry(files: BundleFileEntry[]): string {
  const candidates = files.filter((file) => file.path.endsWith("index.html"));
  if (candidates.length === 0) return "index.html";
  candidates.sort(
    (a, b) =>
      a.path.split("/").length - b.path.split("/").length ||
      a.path.length - b.path.length,
  );
  return candidates[0].path;
}

export function buildManifest(
  buildDir: string,
  gameId: string,
  version: string,
): BundleManifest {
  const relativePaths: string[] = [];
  walk(buildDir, buildDir, relativePaths);
  relativePaths.sort();

  const files: BundleFileEntry[] = relativePaths.map((relative) => {
    const absolute = path.join(buildDir, relative.split("/").join(path.sep));
    const stats = fs.statSync(absolute);
    return { path: relative, bytes: stats.size, sha256: hashFile(absolute) };
  });

  // Order-independent only because `files` is sorted by path above. The game id
  // and version are folded in so two games that happen to ship identical bytes
  // still get distinct identities.
  const digest = crypto.createHash("sha256");
  digest.update(`bundle/1\n${gameId}\n${version}\n`);
  for (const file of files) {
    // Length-prefixed so no path can be confused with the field beside it.
    digest.update(`${file.path.length}:${file.path}\n${file.sha256}\n${file.bytes}\n`);
  }

  return {
    schema: BUNDLE_SCHEMA,
    gameId,
    version,
    buildId: digest.digest("hex").slice(0, 32),
    entry: pickEntry(files),
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    files,
    generatedAt: new Date().toISOString(),
  };
}

interface CacheEntry {
  signature: string;
  manifest: BundleManifest;
  checkedAt: number;
}

const memo = new Map<string, CacheEntry>();

/**
 * How long a cached manifest is trusted without re-walking its directory. The
 * catalogue endpoint asks for every game's manifest on every request; without
 * this, each request would stat the whole games tree. An Admin Panel upload
 * calls invalidateManifest() directly, so this delay only ever applies to
 * files changed on disk behind the server's back (a deploy, an rsync).
 */
const SIGNATURE_TTL_MS = 5_000;

/**
 * Cheap staleness check: the newest mtime and the file count across the build.
 * Hashing every file on each request would make the catalogue endpoint
 * proportional to the size of the games directory.
 */
function directorySignature(buildDir: string): string {
  let newest = 0;
  let count = 0;
  const stack = [buildDir];
  while (stack.length) {
    const current = stack.pop() as string;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        stack.push(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      if (entry.name === BUNDLE_MANIFEST_FILE) continue;
      try {
        const stats = fs.statSync(absolute);
        newest = Math.max(newest, stats.mtimeMs);
        count += 1;
      } catch {
        /* a file that vanished mid-walk simply does not count */
      }
    }
  }
  return `${count}:${Math.round(newest)}`;
}

function writeAtomically(target: string, contents: string): void {
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(temporary, contents, "utf8");
    fs.renameSync(temporary, target);
  } catch {
    try {
      fs.rmSync(temporary, { force: true });
    } catch {
      /* ignore */
    }
  }
}

/**
 * Returns the manifest for a build, generating and caching it when missing or
 * stale. `null` when the build directory does not exist.
 */
export function ensureManifest(
  gamesDir: string,
  gameId: string,
  version: string,
): BundleManifest | null {
  const buildDir = path.join(gamesDir, gameId, version);
  if (!fs.existsSync(buildDir) || !fs.statSync(buildDir).isDirectory()) {
    return null;
  }

  const key = `${gameId}/${version}`;
  const now = Date.now();
  const cached = memo.get(key);
  if (cached && now - cached.checkedAt < SIGNATURE_TTL_MS) return cached.manifest;

  const signature = directorySignature(buildDir);
  if (cached && cached.signature === signature) {
    cached.checkedAt = now;
    return cached.manifest;
  }

  const manifestPath = path.join(buildDir, BUNDLE_MANIFEST_FILE);
  if (fs.existsSync(manifestPath)) {
    try {
      const onDisk = JSON.parse(
        fs.readFileSync(manifestPath, "utf8"),
      ) as BundleManifest;
      // A manifest written before the build changed is worse than none: trust
      // it only when it still describes the same file count and byte total.
      if (
        onDisk?.schema === BUNDLE_SCHEMA &&
        onDisk.buildId &&
        Array.isArray(onDisk.files) &&
        onDisk.version === version &&
        onDisk.gameId === gameId &&
        onDisk.files.length === Number(signature.split(":")[0])
      ) {
        const total = onDisk.files.reduce(
          (sum, file) => sum + (Number(file.bytes) || 0),
          0,
        );
        if (total === onDisk.totalBytes) {
          memo.set(key, { signature, manifest: onDisk, checkedAt: now });
          return onDisk;
        }
      }
    } catch {
      /* fall through and regenerate */
    }
  }

  const manifest = buildManifest(buildDir, gameId, version);
  writeAtomically(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  memo.set(key, { signature, manifest, checkedAt: now });
  return manifest;
}

/** Drops a cached manifest, e.g. right after an Admin Panel re-upload. */
export function invalidateManifest(gameId: string, version?: string): void {
  if (version) {
    memo.delete(`${gameId}/${version}`);
    return;
  }
  for (const key of Array.from(memo.keys())) {
    if (key.startsWith(`${gameId}/`)) memo.delete(key);
  }
}
