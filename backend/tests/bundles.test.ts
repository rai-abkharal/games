import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import AdmZip from "adm-zip";
import { createApp } from "../src/app";
import {
  buildManifest,
  ensureManifest,
  invalidateManifest,
} from "../src/services/bundleService";
import { ensureOfflinePackage, offlinePackageDir, readOfflinePackage, waitForOfflinePackages } from "../src/services/offlinePackageService";
import { SecurityStore } from "../src/security/store";
import type { SecurityConfig } from "../src/security/config";

let directory: string;
let publicDir: string;
let gamesDir: string;
let catalogPath: string;
let store: SecurityStore;
let config: SecurityConfig;

const origin = "https://admin.bundles.test";
const previewOrigin = "https://preview.bundles.test";

function binaryResponse(response: import("node:http").IncomingMessage,
  done: (error: Error | null, data?: Buffer) => void) {
  const chunks: Buffer[] = [];
  response.on("data", (chunk: Buffer) => chunks.push(chunk));
  response.on("end", () => done(null, Buffer.concat(chunks)));
  response.on("error", done);
}

function writeBuild(gameId: string, version: string, files: Record<string, string>) {
  const buildDir = path.join(gamesDir, gameId, version);
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(buildDir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents, "utf8");
  }
  invalidateManifest(gameId);
  return buildDir;
}

function writeCatalog(games: unknown[]) {
  fs.writeFileSync(
    catalogPath,
    JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), games }, null, 2),
    "utf8",
  );
}

function gameEntry(gameId: string, version: string) {
  return {
    id: gameId,
    title: gameId,
    version,
    entryUrl: `http://localhost:8080/games/${gameId}/${version}/index.html`,
    thumbnailUrl: `http://localhost:8080/thumbnails/${gameId}.svg`,
    manifestUrl: `http://localhost:8080/games/${gameId}/${version}/manifest.json`,
    sizeBytes: 1234,
    orientation: "portrait",
    engine: "canvas2d",
    feedOrder: 1,
    category: "Arcade",
    description: "",
    status: "published",
    updatedAt: "2026-09-10T00:00:00.000Z",
    features: { sound: true, vibration: false, hint: false },
  };
}

function makeApp() {
  return createApp(catalogPath, "http://localhost:8080", { store, config, publicDir });
}

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "bundles-"));
  publicDir = path.join(directory, "public");
  gamesDir = path.join(publicDir, "games");
  fs.mkdirSync(gamesDir, { recursive: true });
  fs.mkdirSync(path.join(publicDir, "thumbnails"), { recursive: true });
  fs.mkdirSync(path.join(publicDir, "shared"), { recursive: true });
  catalogPath = path.join(directory, "games.json");
  config = {
    origin,
    previewOrigin,
    database: path.join(directory, "admin.sqlite"),
    staging: path.join(directory, "uploads"),
    idleMs: 60_000,
    absoluteMs: 600_000,
    secure: true,
  };
  store = new SecurityStore(config.database);
});

afterEach(async () => {
  await waitForOfflinePackages();
  try {
    fs.rmSync(directory, { recursive: true, force: true });
  } catch {
    /* Windows sometimes holds the sqlite handle briefly */
  }
});

describe("bundle manifests", () => {
  it("lists every file with a hash and derives a build id from all of them", () => {
    const buildDir = writeBuild("alpha", "1.0.0", {
      "index.html": "<html>alpha</html>",
      "assets/app.js": "console.log(1)",
      "assets/sprites/hero.png": "not-really-a-png",
    });

    const manifest = buildManifest(buildDir, "alpha", "1.0.0");

    expect(manifest.files.map((file) => file.path)).toEqual([
      "assets/app.js",
      "assets/sprites/hero.png",
      "index.html",
    ]);
    expect(manifest.entry).toBe("index.html");
    expect(manifest.buildId).toMatch(/^[0-9a-f]{32}$/);
    expect(manifest.totalBytes).toBe(
      manifest.files.reduce((sum, file) => sum + file.bytes, 0),
    );
    for (const file of manifest.files) {
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("changes the build id when an asset changes, not just the entry document", () => {
    const buildDir = writeBuild("beta", "1.0.0", {
      "index.html": "<html>beta</html>",
      "assets/app.js": "console.log(1)",
    });
    const before = buildManifest(buildDir, "beta", "1.0.0").buildId;

    // The exact case the old index.html-only sha256 could not see.
    fs.writeFileSync(path.join(buildDir, "assets/app.js"), "console.log(2)", "utf8");
    const after = buildManifest(buildDir, "beta", "1.0.0").buildId;

    expect(after).not.toBe(before);
  });

  it("excludes the manifest itself so generating one does not change the build id", () => {
    writeBuild("gamma", "1.0.0", { "index.html": "<html>gamma</html>" });
    const first = ensureManifest(gamesDir, "gamma", "1.0.0");
    invalidateManifest("gamma");
    const second = ensureManifest(gamesDir, "gamma", "1.0.0");
    expect(first?.buildId).toBeTruthy();
    expect(second?.buildId).toBe(first?.buildId);
    expect(first?.files.some((file) => file.path === "bundle.json")).toBe(false);
  });

  it("returns null for a build that does not exist", () => {
    expect(ensureManifest(gamesDir, "missing", "1.0.0")).toBeNull();
  });

  it("rejects stale saved hashes after a same-size edit with unchanged file count", () => {
    const root = writeBuild("stale", "1.0.0", { "index.html": "aaaa", "app.js": "old!" });
    const before = ensureManifest(gamesDir, "stale", "1.0.0")!;
    fs.writeFileSync(path.join(root, "app.js"), "new!", "utf8");
    invalidateManifest("stale");
    const after = ensureManifest(gamesDir, "stale", "1.0.0")!;
    expect(after.buildId).not.toBe(before.buildId);
    expect(after.totalBytes).toBe(before.totalBytes);
  });

  it("does not confuse equal ids/versions in different game directories", () => {
    writeBuild("isolated", "1.0.0", { "index.html": "first" });
    const before = ensureManifest(gamesDir, "isolated", "1.0.0")!;
    const other = path.join(directory, "other-games");
    fs.mkdirSync(path.join(other, "isolated", "1.0.0"), { recursive: true });
    fs.writeFileSync(path.join(other, "isolated", "1.0.0", "index.html"), "second");
    expect(ensureManifest(other, "isolated", "1.0.0")!.buildId).not.toBe(before.buildId);
  });

  it("discovers bounded local startup dependencies without running JavaScript or fetching external URLs", () => {
    const root = writeBuild("startup", "1.0.0", {
      "index.html": '<script type="module" src="assets/app.js"></script><link rel="stylesheet" href="style.css"><img src="title.png"><script src="https://external.test/engine.js"></script>',
      "assets/app.js": 'import "./engine.js"; import("./level2.js");',
      "assets/engine.js": "/* engine */", "assets/level2.js": "/* lazy */",
      "style.css": 'body{background:url("back.png")}', "back.png": "background", "title.png": "title",
      "startup-assets.json": '["first-level.json"]', "first-level.json": "{}",
    });
    const manifest = buildManifest(root, "startup", "1.0.0");
    expect(manifest.startupFiles).toEqual(expect.arrayContaining(["index.html", "assets/app.js", "assets/engine.js", "style.css", "title.png", "back.png", "first-level.json"]));
    expect(manifest.startupFiles).not.toContain("assets/level2.js");
    expect(manifest.files.map(file => file.path)).not.toContain("startup-assets.json");
  });
  it("prioritizes engine dependencies over large optional startup hints", () => {
    const root = writeBuild("priority", "1.0.0", {
      "index.html": '<script src="engine.js"></script>',
      "engine.js": " ".repeat(5 * 1024 * 1024),
      "optional.bin": " ".repeat(2 * 1024 * 1024),
      "startup-assets.json": '["optional.bin"]',
    });
    const manifest = buildManifest(root, "priority", "1.0.0");
    expect(manifest.startupFiles).toContain("engine.js");
    expect(manifest.startupFiles).not.toContain("optional.bin");
  });
});

describe("bundle endpoints", () => {
  it("does not hijack an existing game asset named bundle.zip", async () => {
    writeBuild("collision", "1.0.0", { "index.html": "game", "bundle.zip": "original-game-data" });
    writeCatalog([gameEntry("collision", "1.0.0")]);
    const manifest = ensureManifest(gamesDir, "collision", "1.0.0")!;
    const archive = await ensureOfflinePackage(gamesDir, manifest);
    expect(archive!.path).not.toBe("bundle.zip");
    const app = makeApp();
    const file = await request(app).get(`/api/offline-bundles/collision/1.0.0/bundle.zip?b=${manifest.buildId}`)
      .buffer(true).parse(binaryResponse);
    expect(file.status).toBe(200);
    expect(file.body.toString()).toBe("original-game-data");
    const zip = await request(app).get(`/api/offline-bundles/collision/1.0.0/${archive!.path}?b=${manifest.buildId}`)
      .buffer(true).parse(binaryResponse);
    expect(zip.status).toBe(200);
    expect(new AdmZip(zip.body).readAsText("bundle.zip")).toBe("original-game-data");
  });

  it("creates a verified, resumable ZIP and publishes archive metadata without redirecting", async () => {
    writeBuild("zip", "1.0.0", { "index.html": "<html>ZIP</html>", "assets/é.js": "console.log(1)" });
    writeCatalog([gameEntry("zip", "1.0.0")]);
    const manifest = ensureManifest(gamesDir, "zip", "1.0.0")!;
    const archive = await ensureOfflinePackage(gamesDir, manifest);
    expect(archive!.bytes).toBeGreaterThan(0);
    const localZip = fs.readFileSync(path.join(offlinePackageDir(gamesDir, "zip", manifest.buildId), ".payload.zip"));
    expect(crypto.createHash("sha256").update(localZip).digest("hex")).toBe(archive!.sha256);
    const unpacked = new AdmZip(localZip);
    for (const file of manifest.files) {
      const bytes = unpacked.readFile(file.path)!;
      expect(bytes.length).toBe(file.bytes);
      expect(crypto.createHash("sha256").update(bytes).digest("hex")).toBe(file.sha256);
    }
    const app = makeApp();
    const metadata = await request(app).get("/api/offline-bundles/zip/1.0.0/bundle.json");
    expect(metadata.body.archive).toEqual(archive);
    expect(metadata.headers["cache-control"]).toContain("no-store");
    const zip = await request(app).get(`/api/offline-bundles/zip/1.0.0/bundle.zip?b=${manifest.buildId}`).set("Range", "bytes=0-9");
    expect(zip.status).toBe(206);
    expect(zip.headers.location).toBeUndefined();
    expect(zip.headers["content-type"]).toContain("application/zip");
    expect(zip.headers["content-range"]).toBe(`bytes 0-9/${archive!.bytes}`);
    expect(zip.headers["cache-control"]).toContain("max-age=2592000");
    expect(zip.headers["content-encoding"]).toBeUndefined();
  });

  it("cacheable snapshot URLs cannot change when a version is edited or redeployed", async () => {
    const source = writeBuild("immutable", "1.0.0", { "index.html": "old!" });
    writeCatalog([gameEntry("immutable", "1.0.0")]);
    const before = ensureManifest(gamesDir, "immutable", "1.0.0")!;
    await ensureOfflinePackage(gamesDir, before);
    fs.writeFileSync(path.join(source, "index.html"), "new!", "utf8");
    invalidateManifest("immutable");
    const after = ensureManifest(gamesDir, "immutable", "1.0.0")!;
    await ensureOfflinePackage(gamesDir, after);
    const app = makeApp();
    const old = await request(app).get(`/api/offline-bundles/immutable/1.0.0/index.html?b=${before.buildId}`);
    const next = await request(app).get(`/api/offline-bundles/immutable/1.0.0/index.html?b=${after.buildId}`);
    expect(old.text).toBe("old!");
    expect(next.text).toBe("new!");
    expect(old.headers["cache-control"]).toContain("immutable");
    expect(next.headers["cloudflare-cdn-cache-control"]).toBe("public, max-age=2592000");
    const plain = await request(app).get("/api/offline-bundles/immutable/1.0.0/index.html");
    expect(plain.text).toBe("new!");
    expect(plain.headers["cache-control"]).toContain("no-store");
    const metadata = await request(app).get("/api/offline-bundles/immutable/1.0.0/bundle.json");
    expect(metadata.body.buildId).toBe(after.buildId);
    expect(metadata.headers["cache-control"]).toContain("no-store");
  });

  it("rejects unknown build ids, unpinned ZIPs and unpublished files", async () => {
    writeBuild("safe", "1.0.0", { "index.html": "safe" });
    writeCatalog([gameEntry("safe", "1.0.0")]);
    const app = makeApp();
    expect((await request(app).get("/api/offline-bundles/safe/1.0.0/index.html?b=" + "a".repeat(32))).status).toBe(409);
    expect((await request(app).get("/api/offline-bundles/safe/1.0.0/bundle.zip")).status).toBe(400);
    expect((await request(app).get("/api/offline-bundles/safe/1.0.0/.package.json")).status).toBe(404);
  });

  it("refuses to publish a snapshot when source bytes do not match the manifest", async () => {
    const source = writeBuild("race", "1.0.0", { "index.html": "first" });
    const manifest = ensureManifest(gamesDir, "race", "1.0.0")!;
    fs.writeFileSync(path.join(source, "index.html"), "other");
    await expect(ensureOfflinePackage(gamesDir, manifest)).rejects.toThrow("Source changed");
    expect(readOfflinePackage(gamesDir, "race", manifest.buildId)).toBeNull();
  });

  it("serves manifest and range bytes on the canonical origin without a preview redirect", async () => {
    writeBuild("alpha", "1.0.0", {
      "index.html": "<html>alpha</html>",
      "assets/app.js": "console.log(1)",
    });
    writeCatalog([gameEntry("alpha", "1.0.0")]);
    const app = makeApp();
    const manifest = await request(app)
      .get("/api/offline-bundles/alpha/1.0.0/bundle.json")
      .set("Host", new URL(origin).host);
    expect(manifest.status).toBe(200);
    expect(manifest.headers.location).toBeUndefined();
    expect(manifest.body.files).toHaveLength(2);
    const file = await request(app)
      .get("/api/offline-bundles/alpha/1.0.0/assets/app.js")
      .set("Host", new URL(origin).host)
      .set("Range", "bytes=0-6");
    expect(file.status).toBe(206);
    expect(file.text).toBe("console");
    expect(file.headers["content-range"]).toBe("bytes 0-6/14");
    expect(file.headers["content-disposition"]).toContain("attachment");
    const html = await request(app)
      .get("/api/offline-bundles/alpha/1.0.0/index.html")
      .set("Host", new URL(origin).host);
    expect(html.status).toBe(200);
    expect(html.text).toBe("<html>alpha</html>");
    expect(crypto.createHash("sha256").update(html.text).digest("hex")).toBe(
      manifest.body.files.find((entry: { path: string }) => entry.path === "index.html").sha256,
    );
  });

  it("serves a manifest and revalidates it with the build id as the ETag", async () => {
    writeBuild("alpha", "1.0.0", {
      "index.html": "<html>alpha</html>",
      "assets/app.js": "console.log(1)",
    });
    writeCatalog([gameEntry("alpha", "1.0.0")]);
    const app = makeApp();

    const res = await request(app).get("/games/alpha/1.0.0/bundle.json");
    expect(res.status).toBe(200);
    expect(res.body.files).toHaveLength(2);
    expect(res.headers["cache-control"]).toBe("no-cache");
    expect(res.headers.etag).toBe(`"${res.body.buildId}"`);

    const conditional = await request(app)
      .get("/games/alpha/1.0.0/bundle.json")
      .set("If-None-Match", res.headers.etag);
    expect(conditional.status).toBe(304);
  });

  it("rejects manifest requests for malformed ids and versions", async () => {
    writeCatalog([]);
    const app = makeApp();
    expect((await request(app).get("/games/..%2F..%2Fetc/1.0.0/bundle.json")).status).toBe(404);
    expect((await request(app).get("/games/alpha/not-a-version/bundle.json")).status).toBe(404);
  });

  it("attaches buildId and bundleUrl to every catalogue entry", async () => {
    writeBuild("alpha", "1.0.0", { "index.html": "<html>alpha</html>" });
    writeCatalog([gameEntry("alpha", "1.0.0")]);
    const app = makeApp();

    const res = await request(app).get("/api/games");
    expect(res.status).toBe(200);
    const game = res.body.games.find((item: any) => item.id === "alpha");
    expect(game.buildId).toMatch(/^[0-9a-f]{32}$/);
    expect(game.bundleUrl).toBe("http://localhost:8080/api/offline-bundles/alpha/1.0.0/bundle.json");
    expect(game.bundleBytes).toBeGreaterThan(0);
  });

  it("publishes canonical URLs even when a stored catalogue points at an old host", async () => {
    writeBuild("alpha", "1.0.0", { "index.html": "<html>alpha</html>" });
    writeCatalog([{ ...gameEntry("alpha", "1.0.0"), entryUrl: "http://legacy.example.test/games/alpha/1.0.0/index.html" }]);
    const res = await request(makeApp()).get("/api/games").set("Host", new URL(origin).host);
    expect(res.status).toBe(200);
    expect(res.body.games[0].entryUrl).toBe(`${origin}/games/alpha/1.0.0/index.html`);
    expect(res.body.games[0].bundleUrl).toBe(`${origin}/api/offline-bundles/alpha/1.0.0/bundle.json`);
  });

  it("revalidates the catalogue with an ETag instead of forbidding caching", async () => {
    writeBuild("alpha", "1.0.0", { "index.html": "<html>alpha</html>" });
    writeCatalog([gameEntry("alpha", "1.0.0")]);
    const app = makeApp();

    const res = await request(app).get("/api/games");
    expect(res.headers["cache-control"]).toBe("no-cache");
    expect(res.headers.etag).toBeTruthy();

    const conditional = await request(app)
      .get("/api/games")
      .set("If-None-Match", res.headers.etag);
    expect(conditional.status).toBe(304);
  });

  it("answers a version probe with just ids and build ids", async () => {
    writeBuild("alpha", "1.0.0", { "index.html": "<html>alpha</html>" });
    writeCatalog([gameEntry("alpha", "1.0.0")]);
    const app = makeApp();

    const res = await request(app).get("/api/games/versions");
    expect(res.status).toBe(200);
    expect(res.body.games).toHaveLength(1);
    expect(Object.keys(res.body.games[0]).sort()).toEqual([
      "buildId",
      "id",
      "updatedAt",
      "version",
    ]);
    // The probe must not be swallowed by the /api/games/:id route.
    expect(res.body.games[0].id).toBe("alpha");

    const conditional = await request(app)
      .get("/api/games/versions")
      .set("If-None-Match", res.headers.etag);
    expect(conditional.status).toBe(304);
  });

  it("serves build files with byte ranges so a download can resume", async () => {
    writeBuild("alpha", "1.0.0", { "index.html": "0123456789" });
    writeCatalog([gameEntry("alpha", "1.0.0")]);
    const app = makeApp();

    const res = await request(app)
      .get("/games/alpha/1.0.0/index.html")
      .set("Range", "bytes=4-");
    expect(res.status).toBe(206);
    expect(res.headers["content-range"]).toBe("bytes 4-9/10");
    // Compression must stay off for ranges, or the offsets would be meaningless.
    expect(res.headers["content-encoding"]).toBeUndefined();
    expect(res.text).toBe("456789");
  });

  it("caches a build-addressed asset request forever and revalidates a plain one", async () => {
    writeBuild("alpha", "1.0.0", { "assets/app.js": "console.log(1)" });
    writeCatalog([gameEntry("alpha", "1.0.0")]);
    const app = makeApp();

    const addressed = await request(app).get("/games/alpha/1.0.0/assets/app.js?b=abc123");
    expect(addressed.status).toBe(200);
    expect(addressed.headers["cache-control"]).toBe(
      "public, max-age=31536000, immutable",
    );

    const plain = await request(app).get("/games/alpha/1.0.0/assets/app.js");
    expect(plain.headers["cache-control"]).toBe("public, max-age=86400");
  });
});
