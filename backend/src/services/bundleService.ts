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
  /** Disk metadata fingerprint; not part of the content-derived build identity. */
  sourceSignature?: string;
  /** Conservative startup dependency order, without executing a game engine. */
  startupFiles?: string[];
  archive?: { path: string; bytes: number; sha256: string };
}

/** Never shipped to a device: build metadata, editor leftovers, the manifest itself. */
function isExcluded(relativePath: string): boolean {
  const segments = relativePath.split("/");
  if (segments.some((segment) => segment.startsWith("."))) return true;
  const name = segments[segments.length - 1];
  return (
    name === BUNDLE_MANIFEST_FILE ||
    name === "startup-assets.json" ||
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
    sourceSignature: directorySignature(buildDir),
    startupFiles: startupFiles(buildDir, files, pickEntry(files)),
  };
}

/** Only explicit local dependencies are prefetched. Never guess all game assets. */
function startupFiles(buildDir: string, files: BundleFileEntry[], entry: string): string[] {
  const known = new Map(files.map(file => [file.path, file]));
  const selected = new Set<string>();
  const pending = [entry];
  const hints: string[] = [];
  let bytes = 0;
  const addReference = (from: string, reference: string) => {
    try {
      const url = new URL(reference, `https://bundle.invalid/${from}`);
      if (url.origin !== "https://bundle.invalid") return;
      const relative = decodeURIComponent(url.pathname.slice(1));
      if (known.has(relative)) pending.push(relative);
    } catch { /* external or malformed reference */ }
  };
  // Authors can name actual first-screen assets without changing game code.
  try {
    const explicit = JSON.parse(fs.readFileSync(path.join(buildDir, "startup-assets.json"), "utf8"));
    if (Array.isArray(explicit)) for (const relative of explicit) {
      if (typeof relative === "string" && known.has(relative)) hints.push(relative);
    }
  } catch { /* optional author hints */ }
  while ((pending.length || hints.length) && selected.size < 24) {
    // HTML/engine dependencies take precedence over optional author hints.
    const relative = (pending.length ? pending : hints).shift()!;
    const file = known.get(relative);
    if (!file || selected.has(relative) || bytes + file.bytes > 6 * 1024 * 1024) continue;
    selected.add(relative);
    bytes += file.bytes;
    if (!/\.(html?|m?js|css)$/i.test(relative) || file.bytes > 4 * 1024 * 1024) continue;
    const source = fs.readFileSync(path.join(buildDir, relative), "utf8");
    if (/\.html?$/i.test(relative)) {
      for (const match of source.matchAll(/<(script|link|img|source)\b[^>]*>/gi)) {
        const tag = match[0];
        if (match[1].toLowerCase() === "link" && !/\brel\s*=\s*["'](?:stylesheet|preload|modulepreload)["']/i.test(tag)) continue;
        const attribute = /\b(?:src|href)\s*=\s*["']([^"']+)["']/i.exec(tag);
        if (attribute) addReference(relative, attribute[1]);
      }
    } else if (/\.css$/i.test(relative)) {
      for (const match of source.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/gi)) addReference(relative, match[1]);
    } else {
      // Static ES module dependencies only: dynamic imports stay lazy.
      for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*)["']([^"']+)["']/g)) {
        if (match[1].startsWith(".") || match[1].startsWith("/")) addReference(relative, match[1]);
      }
    }
  }
  return [...selected];
}

/** Never reserve a filename that is already part of a game's assets. */
export function archivePathFor(manifest: BundleManifest): string {
  const paths = new Set(manifest.files.map(file => file.path));
  let candidate = "bundle.zip";
  let attempt = 0;
  while (paths.has(candidate)) candidate = `bundle-${manifest.buildId}-${++attempt}.zip`;
  return candidate;
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
 * Cheap staleness check: every path, size, mtime and ctime across the build.
 * Hashing every file on each request would make the catalogue endpoint
 * proportional to the size of the games directory.
 */
function directorySignature(buildDir: string): string {
  const files: string[] = [];
  walk(buildDir, buildDir, files);
  // Include every path, size, mtime and ctime, not just the newest timestamp.
  // Also track optional startup hints even though they aren't shipped to clients.
  if (fs.existsSync(path.join(buildDir, "startup-assets.json"))) files.push("startup-assets.json");
  const digest = crypto.createHash("sha256");
  for (const relative of files.sort()) {
    const stats = fs.statSync(path.join(buildDir, relative));
    digest.update(JSON.stringify([relative, stats.size, stats.mtimeMs, stats.ctimeMs]));
  }
  return digest.digest("hex");
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

  const key = path.resolve(buildDir);
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
      // A saved manifest is trusted only with its exact source fingerprint.
      // Older manifests lacking this field are rehashed once, fixing stale
      // sizes/hashes even when the file count and total bytes stayed identical.
      if (
        onDisk?.schema === BUNDLE_SCHEMA &&
        onDisk.buildId &&
        Array.isArray(onDisk.files) &&
        onDisk.version === version &&
        onDisk.gameId === gameId &&
        onDisk.sourceSignature === signature
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
  for (const [key, cached] of memo) {
    if (cached.manifest.gameId === gameId && (!version || cached.manifest.version === version)) memo.delete(key);
  }
}
