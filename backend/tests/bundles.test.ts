import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/app";
import {
  buildManifest,
  ensureManifest,
  invalidateManifest,
} from "../src/services/bundleService";
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

afterEach(() => {
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
});

describe("bundle endpoints", () => {
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
    expect(game.bundleUrl).toBe("http://localhost:8080/games/alpha/1.0.0/bundle.json");
    expect(game.bundleBytes).toBeGreaterThan(0);
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
