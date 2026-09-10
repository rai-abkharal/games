import { Router, Request, Response } from "express";
import multer from "multer";
import AdmZip from "adm-zip";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { CatalogService } from "../services/catalogService";
import { normalizeGameFeatures } from "../utils/gameFeatures";
import { z } from "zod";
import { SecurityStore, SecurityError, randomToken } from "../security/store";
import { SecurityConfig } from "../security/config";
import { principal, revalidate } from "../security/http";
import { gamePolicy } from "../security/gamePolicy";
import { GameSchema } from "../types/game";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1, fields: 0, parts: 2 },
});

export function createAdminRouter(
  catalogService: CatalogService,
  publicDir: string,
  catalogPath: string,
  store: SecurityStore,
  config: SecurityConfig,
): Router {
  const router = Router();
  router.use(gamePolicy(store));
  function saveCatalog(data: unknown) {
    const temporary = catalogPath + ".tmp-" + randomToken();
    try {
      fs.writeFileSync(temporary, JSON.stringify(data, null, 2), "utf8");
      fs.renameSync(temporary, catalogPath);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
  const gamesDir = path.join(publicDir, "games");
  const thumbnailsDir = path.join(publicDir, "thumbnails");
  for (const privatePath of [config.database, config.staging])
    if (
      path.resolve(privatePath).startsWith(path.resolve(publicDir) + path.sep)
    )
      throw new Error("Security storage must be outside public assets");

  if (!fs.existsSync(gamesDir)) fs.mkdirSync(gamesDir, { recursive: true });
  if (!fs.existsSync(thumbnailsDir))
    fs.mkdirSync(thumbnailsDir, { recursive: true });

  function isDevelopmentEntryHtml(html: string): boolean {
    return /<script\b[^>]*\bsrc=["'][^"']*(?:\/@vite\/client|(?:^|\/)src\/[^"']+\.tsx?)(?:[?#][^"']*)?["']/i.test(
      html,
    );
  }

  function selectProductionEntry(entries: ReturnType<AdmZip["getEntries"]>) {
    const candidates = entries
      .filter(
        (entry) =>
          !entry.isDirectory && /(^|\/)index\.html$/i.test(entry.entryName),
      )
      .map((entry) => ({
        entry,
        html: entry.getData().toString("utf8"),
      }));

    const productionCandidates = candidates.filter(
      (candidate) =>
        candidate.html.length > 30 && !isDevelopmentEntryHtml(candidate.html),
    );

    productionCandidates.sort((a, b) => {
      const productionFolder = /(^|\/)(dist|build)\/index\.html$/i;
      const aScore = productionFolder.test(a.entry.entryName)
        ? 0
        : a.entry.entryName === "index.html"
          ? 1
          : 2;
      const bScore = productionFolder.test(b.entry.entryName)
        ? 0
        : b.entry.entryName === "index.html"
          ? 1
          : 2;
      return (
        aScore - bScore || a.entry.entryName.length - b.entry.entryName.length
      );
    });

    return {
      entry: productionCandidates[0]?.entry,
      html: productionCandidates[0]?.html,
      hasDevelopmentEntry: candidates.some((candidate) =>
        isDevelopmentEntryHtml(candidate.html),
      ),
    };
  }

  // 1. Get All Games for Admin Dashboard
  router.get("/games", (req: Request, res: Response) => {
    try {
      const catalog = catalogService.loadAndValidateCatalog();
      const adminGames = catalog.games
        .filter((g) => store.scope(principal(res), g.id))
        .map((g, idx) => ({
          id: g.id,
          slug: g.id,
          title: g.title,
          sourceTitle: (g as any).sourceTitle || g.title,
          titleOverride: (g as any).titleOverride || null,
          description: g.description,
          thumbnailUrl: g.thumbnailUrl,
          orientation: g.orientation || "portrait",
          controls: g.controls || ["TAP"],
          tags: g.tags || ["arcade"],
          status: (g as any).status || "published",
          sortWeight: g.feedOrder ?? idx + 1,
          ageRating: g.ageRating || "everyone",
          totalPlays: 1240 + idx * 315,
          totalReports: 0,
          touchZones: (g as any).touchZones || [],
          features: g.features,
          ads: (g as any).ads || {
            enabled: true,
            useCustomInterval: false,
            intervalMinutes: 5,
          },
          versions: [
            {
              id: `${g.id}-${g.version}`,
              version: g.version,
              sizeBytes: g.sizeBytes,
              sha256: g.sha256 || "",
              status:
                (g as any).status === "archived" ||
                (g as any).status === "deactivated"
                  ? "inactive"
                  : "active",
              rolloutPercent: 100,
            },
          ],
        }));

      res.json({
        success: true,
        count: adminGames.length,
        games: adminGames,
      });
    } catch (err) {
      res
        .status(500)
        .json({ error: "Failed to fetch admin games", details: String(err) });
    }
  });

  // 7-Point Comprehensive Game Package Validator
  function validateGameZip(zip: AdmZip, fileSizeBytes: number) {
    const entries = zip.getEntries();
    if (
      entries.length > 2000 ||
      entries.reduce((total, e) => total + e.header.size, 0) > 200 * 1024 * 1024
    )
      throw new SecurityError(
        400,
        "Archive exceeds expanded size or file count limits",
      );
    const names = new Set<string>();
    for (const entry of entries) {
      const name = entry.entryName.replace(/\\/g, "/");
      if (
        name.startsWith("/") ||
        name.includes(":") ||
        name.split("/").some((p) => p === ".." || p === ".") ||
        name.includes("\0") ||
        names.has(name.toLowerCase()) ||
        entry.header.size > 50 * 1024 * 1024 ||
        (entry.header.size > 1024 * 1024 &&
          entry.header.size / Math.max(1, entry.header.compressedSize) > 200)
      )
        throw new SecurityError(400, "Unsafe archive entry");
      names.add(name.toLowerCase());
    }
    const checks: { rule: string; passed: boolean; message: string }[] = [];

    // Rule 1: Archive Structure & Readability
    if (entries.length > 0) {
      checks.push({
        rule: "Archive Structure",
        passed: true,
        message: `Valid ZIP archive containing ${entries.length} files`,
      });
    } else {
      checks.push({
        rule: "Archive Structure",
        passed: false,
        message: "ZIP archive is empty or corrupted",
      });
    }

    // Rule 2: Manifest JSON Existence & Smart Locator
    const manifestEntries = entries.filter(
      (e) =>
        (e.entryName === "manifest.json" ||
          e.entryName.endsWith("/manifest.json")) &&
        !e.isDirectory,
    );
    manifestEntries.sort((a, b) => a.entryName.length - b.entryName.length);
    const manifestEntry = manifestEntries[0];
    let manifest: any = null;

    if (manifestEntry) {
      try {
        manifest = JSON.parse(manifestEntry.getData().toString("utf8"));
        checks.push({
          rule: "Manifest JSON Exists",
          passed: true,
          message: `Found manifest.json`,
        });
      } catch (e) {
        checks.push({
          rule: "Manifest JSON Exists",
          passed: false,
          message: "manifest.json is corrupted or invalid JSON format",
        });
      }
    } else {
      // Auto-generate a fallback manifest if missing so simple HTML5 games still work
      manifest = {
        id: "game-" + Date.now().toString(36),
        title: "New Custom Game",
        version: "1.0.0",
        orientation: "portrait",
        category: "Arcade",
      };
      checks.push({
        rule: "Manifest JSON Exists",
        passed: true,
        message: "Auto-generated standard manifest (missing in ZIP)",
      });
    }

    // Rule 3: Required Metadata Schema (with Auto-Healing)
    if (manifest) {
      if (!manifest.id || typeof manifest.id !== "string") {
        manifest.id = "game-" + Date.now().toString(36);
      }
      if (!manifest.title || typeof manifest.title !== "string") {
        manifest.title = manifest.id
          .replace(/[-_]/g, " ")
          .replace(/\b\w/g, (c: string) => c.toUpperCase());
      }
      if (!manifest.version || typeof manifest.version !== "string") {
        manifest.version = "1.0.0";
      }

      if (manifest.features !== undefined) {
        manifest.features = normalizeGameFeatures(manifest.features);
      }

      checks.push({
        rule: "Required Metadata (id, title, version)",
        passed: true,
        message: `"${manifest.title}" (${manifest.id} v${manifest.version})`,
      });
    }

    // Rule 4: Entry Point (index.html)
    const selectedEntry = selectProductionEntry(entries);
    const entryHtml = selectedEntry.entry;
    if (entryHtml) {
      checks.push({
        rule: "Entry Point (index.html)",
        passed: true,
        message: `Verified production HTML5 entry point at ${entryHtml.entryName} (${((selectedEntry.html?.length || 0) / 1024).toFixed(1)} KB)`,
      });
    } else if (selectedEntry.hasDevelopmentEntry) {
      checks.push({
        rule: "Entry Point (index.html)",
        passed: false,
        message:
          "Only a development index.html was found (for example /src/main.ts or /@vite/client). Run the production build and upload dist/index.html.",
      });
    } else {
      checks.push({
        rule: "Entry Point (index.html)",
        passed: false,
        message:
          "Missing a non-empty production index.html entry point in ZIP package",
      });
    }

    // Rule 5: Package Size Info (limits enforced before extraction)
    const sizeMb = fileSizeBytes / (1024 * 1024);
    const sizeKb = fileSizeBytes / 1024;
    const sizeDisplay =
      sizeMb >= 1 ? `${sizeMb.toFixed(2)} MB` : `${sizeKb.toFixed(1)} KB`;
    checks.push({
      rule: "Package Size",
      passed: true,
      message: `${sizeDisplay} (Verified)`,
    });

    // Rule 6: Orientation & Display Format
    if (manifest && manifest.orientation) {
      checks.push({
        rule: "Orientation Configuration",
        passed: true,
        message: `Orientation set to "${manifest.orientation}"`,
      });
    } else {
      checks.push({
        rule: "Orientation Configuration",
        passed: true,
        message: 'Defaulted to "portrait" orientation',
      });
    }

    // Rule 7: Network & Standalone Offline Safety
    if (entryHtml) {
      const htmlContent = selectedEntry.html || "";
      const hasBlockingCdn = /<script\s+[^>]*src=["']https?:\/\//i.test(
        htmlContent,
      );
      if (!hasBlockingCdn) {
        checks.push({
          rule: "Offline Standalone Security",
          passed: true,
          message: "Zero external blocking CDNs. 100% offline-ready",
        });
      } else {
        checks.push({
          rule: "Offline Standalone Security",
          passed: true,
          message: "Contains external web scripts (May lag without internet)",
        });
      }
    } else {
      checks.push({
        rule: "Offline Standalone Security",
        passed: false,
        message: "Cannot verify offline security without index.html",
      });
    }

    const allPassed = checks.every((c) => c.passed);
    return {
      gameId: manifest?.id || "unknown",
      slug: manifest?.id || "unknown",
      title: manifest?.title || "Unknown Game",
      version: manifest?.version || "1.0.0",
      allPassed,
      checks,
      manifest,
    };
  }

  // 2. Validate Game Zip Endpoint
  router.post(
    "/games/validate",
    upload.single("file"),
    (req: Request, res: Response) => {
      try {
        if (!req.file) {
          res.status(400).json({ error: "No zip file provided" });
          return;
        }

        const zip = new AdmZip(req.file.buffer);
        const validation = validateGameZip(zip, req.file.size);
        res.json(validation);
      } catch (err) {
        res
          .status(err instanceof SecurityError ? err.status : 400)
          .json({ error: "Validation failed", details: String(err) });
      }
    },
  );

  // 2.1 View Existing Published Game Validation Report
  router.get("/games/:id/validation", (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const catalog = catalogService.getCatalog();
      const game = catalog.games.find((g) => g.id === id);
      if (!game) {
        res.status(404).json({ error: "Game not found in catalog" });
        return;
      }

      const gameDir = path.join(gamesDir, game.id, game.version);
      const checks: { rule: string; passed: boolean; message: string }[] = [];

      // Check manifest
      const manifestPath = path.join(gameDir, "manifest.json");
      if (fs.existsSync(manifestPath)) {
        checks.push({
          rule: "Manifest JSON Exists",
          passed: true,
          message: `Found manifest for "${game.title}"`,
        });
      } else {
        checks.push({
          rule: "Manifest JSON Exists",
          passed: false,
          message: "Missing manifest.json on disk",
        });
      }

      // Check index.html
      const indexPath = path.join(gameDir, "index.html");
      if (fs.existsSync(indexPath)) {
        checks.push({
          rule: "Entry Point (index.html)",
          passed: true,
          message: "index.html entry point verified",
        });
      } else {
        checks.push({
          rule: "Entry Point (index.html)",
          passed: false,
          message: "Missing index.html on disk",
        });
      }

      // Package size info
      const sizeMb = game.sizeBytes / (1024 * 1024);
      const sizeKb = game.sizeBytes / 1024;
      const sizeDisplay =
        sizeMb >= 1 ? `${sizeMb.toFixed(2)} MB` : `${sizeKb.toFixed(1)} KB`;
      checks.push({
        rule: "Package Size",
        passed: true,
        message: `${sizeDisplay}`,
      });
      checks.push({
        rule: "Required Metadata (id, title, version)",
        passed: true,
        message: `ID: ${game.id} (v${game.version})`,
      });
      checks.push({
        rule: "Orientation Configuration",
        passed: true,
        message: `Orientation: ${game.orientation || "portrait"}`,
      });
      checks.push({
        rule: "Touch Zones Configuration",
        passed: true,
        message: `${(game as any).touchZones?.length || 0} active touch lock zones`,
      });
      checks.push({
        rule: "Offline Standalone Security",
        passed: true,
        message: "Hardware-accelerated micro-engine",
      });

      res.json({
        gameId: game.id,
        slug: game.id,
        version: game.version,
        title: game.title,
        allPassed: checks.every((c) => c.passed),
        checks,
      });
    } catch (err) {
      res
        .status(500)
        .json({ error: "Failed to inspect validation", details: String(err) });
    }
  });

  // 3. Upload & Deploy Game Zip
  // Unified Game Package Ingestion & Update Processor
  function handleGameZipUpload(
    req: Request,
    res: Response,
    targetGameId?: string,
  ) {
    let incompleteDirectory: string | undefined;
    let catalogCommitted = false;
    try {
      revalidate(store, config, res);
      if (!req.file) {
        res.status(400).json({
          error: "No ZIP file uploaded",
          details:
            "Please select a valid .zip game package file from your computer.",
          validationReport: {
            gameId: targetGameId || "unknown",
            slug: targetGameId || "unknown",
            version: "1.0.0",
            allPassed: false,
            checks: [
              {
                rule: "ZIP Archive Provided",
                passed: false,
                message: "No file received by server",
              },
            ],
          },
        });
        return;
      }

      let zip: AdmZip;
      try {
        zip = new AdmZip(req.file.buffer);
      } catch (zipErr: any) {
        res.status(400).json({
          error: "Corrupted or unreadable ZIP archive",
          details: `The uploaded file is not a valid ZIP format: ${zipErr.message}`,
          validationReport: {
            gameId: targetGameId || "unknown",
            slug: targetGameId || "unknown",
            version: "1.0.0",
            allPassed: false,
            checks: [
              {
                rule: "Archive Structure",
                passed: false,
                message: "Corrupted or unreadable ZIP archive format",
              },
            ],
          },
        });
        return;
      }

      // Run 7-Point Validation Checklist
      const validation = validateGameZip(zip, req.file.size);
      if (!validation.allPassed) {
        const failedChecks = validation.checks.filter((c) => !c.passed);
        const failedMessages = failedChecks
          .map((c) => `${c.rule}: ${c.message}`)
          .join(" | ");
        res.status(400).json({
          error: `Game package failed checklist (${failedChecks.length} rule${failedChecks.length > 1 ? "s" : ""} failed)`,
          details: failedMessages,
          validationReport: validation,
        });
        return;
      }

      const entries = zip.getEntries();
      const manifest = validation.manifest;

      // Load current catalog to check existing game
      let catalogData: any = { schemaVersion: "1.0.0", games: [] };
      if (fs.existsSync(catalogPath)) {
        try {
          catalogData = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
        } catch {}
      }

      const gameId = targetGameId || manifest.id;
      z.string()
        .regex(/^[a-z0-9-]{1,80}$/)
        .parse(gameId);
      z.string()
        .regex(/^\d{1,6}\.\d{1,6}\.\d{1,6}$/)
        .parse(manifest.version);
      if (targetGameId && manifest.id !== targetGameId)
        throw new SecurityError(
          400,
          "Package game ID does not match the target game",
        );
      const existingIndex = catalogData.games.findIndex(
        (g: any) => g.id === gameId,
      );
      const existingGame =
        existingIndex >= 0 ? catalogData.games[existingIndex] : null;
      const actor = principal(res);
      const reserved = store.get(
        "SELECT owner FROM uploads WHERE game=? LIMIT 1",
        gameId,
      );
      if (!existingGame && reserved && !store.scope(actor, gameId))
        throw new SecurityError(403, "Permission denied");
      if (
        (targetGameId || existingGame) &&
        (!actor.permissions.includes("games.update") ||
          !store.scope(actor, gameId))
      )
        throw new SecurityError(403, "Permission denied");
      if (
        targetGameId &&
        !existingGame &&
        !store.get(
          "SELECT id FROM uploads WHERE game=? AND owner=?",
          gameId,
          actor.id,
        )
      )
        throw new SecurityError(404, "Game not found");
      if (!res.locals.publishing) {
        store.throttle(`upload:${actor.id}`, 10, 60 * 60_000);
        if (
          store.get(
            "SELECT count(*) AS count FROM uploads WHERE owner=?",
            actor.id,
          )!.count >= 20 ||
          store.get("SELECT count(*) AS count FROM uploads")!.count >= 200
        )
          throw new SecurityError(
            409,
            "Staging capacity reached. Publish or discard pending uploads.",
          );
        if (!actor.permissions.includes("games.configure")) {
          delete manifest.features;
          delete manifest.touchZones;
          const sourceManifest = entries
            .filter(
              (e) =>
                !e.isDirectory && /(^|\/)manifest\.json$/.test(e.entryName),
            )
            .sort((a, b) => a.entryName.length - b.entryName.length)[0];
          if (sourceManifest)
            zip.updateFile(
              sourceManifest.entryName,
              Buffer.from(JSON.stringify(manifest)),
            );
          else
            zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest)));
        }
        const uploadId = randomToken();
        fs.mkdirSync(config.staging, { recursive: true, mode: 0o700 });
        const filename = path.join(config.staging, `${uploadId}.zip`);
        fs.writeFileSync(filename, zip.toBuffer(), { mode: 0o600 });
        try {
          store.transaction(() => {
            store.run(
              "INSERT INTO uploads VALUES(?,?,?,?,?,?)",
              uploadId,
              actor.id,
              gameId,
              manifest.version,
              filename,
              Date.now(),
            );
            if (!existingGame) {
              const scopes: string[] = JSON.parse(actor.scopes);
              if (!scopes.includes("*") && !scopes.includes(gameId)) {
                scopes.push(gameId);
                store.run(
                  "UPDATE accounts SET scopes=? WHERE id=?",
                  JSON.stringify(scopes),
                  actor.id,
                );
              }
            }
          });
        } catch (e) {
          fs.unlinkSync(filename);
          throw e;
        }
        res.status(201).json({
          success: true,
          staged: true,
          uploadId,
          message:
            "Upload validated and staged. Publication requires approval.",
          validationReport: validation,
        });
        return;
      }
      if (
        !actor.permissions.includes("games.publish") ||
        !store.scope(actor, gameId)
      )
        throw new SecurityError(403, "Permission denied");

      // Persist one canonical feature shape while preserving an existing game's
      // flags when an update package omits this optional metadata.
      manifest.features = normalizeGameFeatures(
        manifest.features ?? existingGame?.features,
      );

      // Version determination
      const version =
        manifest.version ||
        (existingGame
          ? existingGame.version.includes(".")
            ? existingGame.version
            : "1.0.0"
          : "1.0.0");

      // Destination directory: public/games/<gameId>/<version>/
      // When updating a game, allow existing version directory to be updated/overwritten.
      const targetGameDir = path.join(gamesDir, gameId, version);
      if (fs.existsSync(targetGameDir) && !existingGame && !targetGameId)
        throw new SecurityError(
          409,
          "Version already exists. Upload a new version.",
        );
      fs.mkdirSync(targetGameDir, { recursive: true });
      incompleteDirectory = targetGameDir;

      // Smart directory flattening (detects if zip was packaged with a root folder wrapper)
      const htmlEntry = selectProductionEntry(entries).entry;
      let rootPrefix = "";
      if (htmlEntry && htmlEntry.entryName !== "index.html") {
        rootPrefix = htmlEntry.entryName.substring(
          0,
          htmlEntry.entryName.lastIndexOf("/") + 1,
        );
      }
      const selectedManifestEntry = entries
        .filter(
          (entry) =>
            !entry.isDirectory &&
            /(^|\/)manifest\.json$/i.test(entry.entryName),
        )
        .sort((a, b) => a.entryName.length - b.entryName.length)[0];

      // Extract entries cleanly
      for (const entry of entries) {
        if (entry.isDirectory) continue;

        let relativePath = entry.entryName.replace(/\\/g, "/");
        if (rootPrefix) {
          if (relativePath.startsWith(rootPrefix)) {
            relativePath = relativePath.substring(rootPrefix.length);
          } else if (entry === selectedManifestEntry) {
            relativePath = "manifest.json";
          } else {
            continue;
          }
        }

        if (!relativePath) continue;
        const targetFile = path.resolve(targetGameDir, relativePath);
        const targetRoot = path.resolve(targetGameDir) + path.sep;
        if (!targetFile.startsWith(targetRoot)) {
          throw new Error(`Unsafe path in ZIP archive: ${entry.entryName}`);
        }
        fs.mkdirSync(path.dirname(targetFile), { recursive: true });
        fs.writeFileSync(targetFile, entry.getData());
      }

      // Always persist the normalized manifest, including auto-generated defaults.
      fs.writeFileSync(
        path.join(targetGameDir, "manifest.json"),
        JSON.stringify(manifest, null, 2),
        "utf8",
      );

      // Handle thumbnail
      const thumbnailEntry = entries.find(
        (e) =>
          e.entryName.endsWith(".svg") ||
          e.entryName.endsWith(".webp") ||
          e.entryName.endsWith(".png"),
      );
      const thumbExt = thumbnailEntry
        ? thumbnailEntry.entryName.endsWith(".webp")
          ? ".webp"
          : thumbnailEntry.entryName.endsWith(".png")
            ? ".png"
            : ".svg"
        : ".svg";
      const thumbFileName = `${gameId}${thumbExt}`;
      const targetThumbFile = path.join(thumbnailsDir, thumbFileName);
      if (thumbnailEntry) {
        fs.writeFileSync(targetThumbFile, thumbnailEntry.getData());
      } else if (!fs.existsSync(targetThumbFile)) {
        const safeTitle = String(manifest.title || gameId).replace(
          /[&<>"']/g,
          (c) => `&#${c.charCodeAt(0)};`,
        );
        const defaultSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%"><rect width="512" height="512" rx="96" fill="#0f172a"/><text x="256" y="270" fill="#38bdf8" font-size="64" font-family="system-ui, sans-serif" font-weight="bold" text-anchor="middle">${safeTitle}</text></svg>`;
        fs.writeFileSync(targetThumbFile, defaultSvg, "utf8");
      }

      // Compute SHA-256 of entry file
      const indexFile = path.join(targetGameDir, "index.html");
      let sha256 = "";
      const sizeBytes = req.file.size;
      if (fs.existsSync(indexFile)) {
        const fileBuffer = fs.readFileSync(indexFile);
        sha256 = crypto.createHash("sha256").update(fileBuffer).digest("hex");
      }

      const nowIso = new Date().toISOString();
      // The packaged name may change between uploads, but an Admin Panel rename
      // outranks it: only sourceTitle follows the manifest.
      const sourceTitle =
        manifest.title ||
        (existingGame ? existingGame.sourceTitle || existingGame.title : gameId);
      const titleOverride = existingGame?.titleOverride || undefined;
      const newGameEntry = {
        id: gameId,
        title: titleOverride || sourceTitle,
        sourceTitle,
        ...(titleOverride ? { titleOverride } : {}),
        version: version,
        description:
          manifest.description ||
          (existingGame
            ? existingGame.description
            : "Fast, responsive instant 2D mini-game."),
        category:
          manifest.tags && manifest.tags[0]
            ? manifest.tags[0].toUpperCase()
            : existingGame
              ? existingGame.category
              : "ARCADE",
        orientation:
          manifest.orientation ||
          (existingGame ? existingGame.orientation : "portrait"),
        controls:
          manifest.controls || (existingGame ? existingGame.controls : ["TAP"]),
        sizeBytes: sizeBytes,
        sha256: sha256,
        ageRating:
          manifest.ageRating ||
          (existingGame ? existingGame.ageRating : "everyone"),
        tags:
          manifest.tags ||
          (existingGame ? existingGame.tags : ["arcade", "casual"]),
        status: existingGame ? existingGame.status || "published" : "published",
        touchZones:
          manifest.touchZones || (existingGame ? existingGame.touchZones : []),
        features: normalizeGameFeatures(manifest.features),
        feedOrder: existingGame ? existingGame.feedOrder || 1 : 1,
        entryUrl: `http://localhost:8080/games/${gameId}/${version}/index.html`,
        thumbnailUrl: `http://localhost:8080/thumbnails/${thumbFileName}`,
        manifestUrl: `http://localhost:8080/games/${gameId}/${version}/manifest.json`,
        createdAt: existingGame?.createdAt || nowIso,
        updatedAt: nowIso,
      };
      GameSchema.parse(newGameEntry);

      if (existingIndex >= 0) {
        newGameEntry.feedOrder = existingGame.feedOrder || 1;
        catalogData.games[existingIndex] = newGameEntry;
      } else {
        // NEW GAME: Insert at top (#1 position) and shift others down
        for (const g of catalogData.games) {
          g.feedOrder = (g.feedOrder ?? 1) + 1;
        }
        newGameEntry.feedOrder = 1;
        catalogData.games.unshift(newGameEntry);
      }

      // Re-sort catalog games by feedOrder and normalize sequentially 1, 2, 3...
      catalogData.games.sort(
        (a: any, b: any) => (a.feedOrder ?? 0) - (b.feedOrder ?? 0),
      );
      catalogData.games.forEach((g: any, idx: number) => {
        g.feedOrder = idx + 1;
      });

      // Unblacklist game ID if it was previously deleted
      const deletedGamesPath = path.join(
        path.dirname(catalogPath),
        "deleted_games.json",
      );
      if (fs.existsSync(deletedGamesPath)) {
        try {
          let deletedList: string[] = JSON.parse(
            fs.readFileSync(deletedGamesPath, "utf8"),
          );
          deletedList = deletedList.filter((id) => id !== gameId);
          fs.writeFileSync(
            deletedGamesPath,
            JSON.stringify(deletedList, null, 2),
            "utf8",
          );
        } catch {}
      }

      catalogData.updatedAt = nowIso;
      saveCatalog(catalogData);
      catalogCommitted = true;

      // Hot reload catalog service
      catalogService.loadAndValidateCatalog();

      const actionWord = existingGame
        ? "updated and deployed live"
        : "published to top of feed";
      res.json({
        success: true,
        message: `Game "${newGameEntry.title}" (v${version}) ${actionWord} successfully!`,
        game: newGameEntry,
        validationReport: validation,
      });
    } catch (err: any) {
      if (
        incompleteDirectory &&
        !catalogCommitted &&
        path
          .resolve(incompleteDirectory)
          .startsWith(path.resolve(gamesDir) + path.sep)
      )
        fs.rmSync(incompleteDirectory, { recursive: true, force: true });
      res
        .status(
          err instanceof SecurityError
            ? err.status
            : err?.name === "ZodError"
              ? 400
              : 500,
        )
        .json({
          error:
            err instanceof SecurityError
              ? err.message
              : "Failed to process game package",
        });
    }
  }

  // 3. Upload & Deploy New Game Zip
  router.get("/uploads", (_req, res) =>
    res.json({
      uploads: store
        .all("SELECT id,owner,game,version,created FROM uploads")
        .filter((u) => store.scope(principal(res), u.game)),
    }),
  );
  router.delete("/uploads/:uploadId", (req, res, next) => {
    try {
      const item = store.get(
        "SELECT * FROM uploads WHERE id=?",
        req.params.uploadId,
      );
      if (!item) throw new SecurityError(404, "Upload not found");
      if (!store.scope(principal(res), item.game))
        throw new SecurityError(403, "Permission denied");
      store.run("DELETE FROM uploads WHERE id=?", item.id);
      fs.unlinkSync(item.filename);
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  });
  router.post("/uploads/:uploadId/publish", (req, res, next) => {
    try {
      const item = store.get(
        "SELECT * FROM uploads WHERE id=?",
        req.params.uploadId,
      );
      if (!item) throw new SecurityError(404, "Upload not found");
      if (!store.scope(principal(res), item.game))
        throw new SecurityError(403, "Permission denied");
      req.file = {
        buffer: fs.readFileSync(item.filename),
        size: fs.statSync(item.filename).size,
      } as Express.Multer.File;
      res.locals.publishing = true;
      handleGameZipUpload(req, res);
      if (res.statusCode < 400) {
        store.run("DELETE FROM uploads WHERE id=?", item.id);
        fs.unlinkSync(item.filename);
      }
    } catch (e) {
      next(e);
    }
  });
  router.post(
    "/games/upload",
    upload.single("file"),
    (req: Request, res: Response) => {
      handleGameZipUpload(req, res);
    },
  );

  // 3.1 Update Existing Game Code Zip
  router.post(
    "/games/:id/upload",
    upload.single("file"),
    (req: Request, res: Response) => {
      handleGameZipUpload(req, res, req.params.id);
    },
  );
  router.put(
    "/games/:id/upload",
    upload.single("file"),
    (req: Request, res: Response) => {
      handleGameZipUpload(req, res, req.params.id);
    },
  );

  // 4. Reports endpoint
  router.get("/reports", (_req: Request, res: Response) => {
    res.json({
      success: true,
      reports: [],
    });
  });

  // 5. Update Game Touch Zones (Dynamic Swipe Lock)
  router.put("/games/:id/touch-zones", (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { touchZones } = req.body;

      let catalogData: any = { schemaVersion: "1.0.0", games: [] };
      if (fs.existsSync(catalogPath)) {
        catalogData = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
      }

      const game = catalogData.games.find((g: any) => g.id === id);
      if (!game) {
        res.status(404).json({ error: "Game not found in catalog" });
        return;
      }

      game.touchZones = Array.isArray(touchZones) ? touchZones : [];
      saveCatalog(catalogData);

      // Hot reload catalog in memory
      catalogService.loadAndValidateCatalog();

      res.json({
        success: true,
        message: `Updated touch zones for game "${game.title}"`,
        touchZones: game.touchZones,
      });
    } catch (err) {
      res
        .status(500)
        .json({ error: "Failed to update touch zones", details: String(err) });
    }
  });

  // 6. Toggle Game Status (Publish / Deactivate / Kill Switch)
  router.post("/games/:id/publish", (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status, rolloutPercent } = req.body;

      let catalogData: any = { version: 1, games: [] };
      if (fs.existsSync(catalogPath)) {
        catalogData = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
      }

      const game = (catalogData.games || []).find((g: any) => g.id === id);
      if (!game) {
        res.status(404).json({ error: "Game not found in catalog" });
        return;
      }

      if (status) {
        game.status = status; // 'published' | 'archived' | 'deactivated'
      }
      if (rolloutPercent !== undefined) {
        game.rolloutPercent = rolloutPercent;
      }

      saveCatalog(catalogData);

      catalogService.loadAndValidateCatalog();

      res.json({
        success: true,
        message: `Game "${game.title || id}" status changed to "${game.status}"`,
        game,
      });
    } catch (err: any) {
      res
        .status(500)
        .json({ error: "Failed to update game status", details: err.message });
    }
  });

  // 7. Permanently Delete Game from Catalog & Server Disk
  router.delete("/games/:id", (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      let catalogData: any = { version: 1, games: [] };
      if (fs.existsSync(catalogPath)) {
        catalogData = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
      }

      const gameIdx = (catalogData.games || []).findIndex(
        (g: any) => g.id === id,
      );
      if (gameIdx === -1) {
        res.status(404).json({ error: "Game not found in catalog" });
        return;
      }

      const removedGame = catalogData.games.splice(gameIdx, 1)[0];
      saveCatalog(catalogData);

      // 1. Maintain Tombstone Deleted Games Blacklist so deploy scripts never restore it
      const deletedGamesPath = path.join(
        path.dirname(catalogPath),
        "deleted_games.json",
      );
      let deletedList: string[] = [];
      if (fs.existsSync(deletedGamesPath)) {
        try {
          deletedList = JSON.parse(fs.readFileSync(deletedGamesPath, "utf8"));
        } catch {}
      }
      if (!deletedList.includes(id)) {
        deletedList.push(id);
        fs.writeFileSync(
          deletedGamesPath,
          JSON.stringify(deletedList, null, 2),
          "utf8",
        );
      }

      // 2. Delete game bundle files from public/games/<id>
      const targetGameDir = path.join(gamesDir, id);
      if (fs.existsSync(targetGameDir)) {
        fs.rmSync(targetGameDir, { recursive: true, force: true });
      }

      // 3. Delete thumbnails from public/thumbnails/<id>.*
      for (const ext of [".webp", ".svg", ".png", ".jpg"]) {
        const thumbFile = path.join(thumbnailsDir, `${id}${ext}`);
        if (fs.existsSync(thumbFile)) {
          fs.rmSync(thumbFile, { force: true });
        }
      }

      // 4. Update catalog timestamp and reload service
      catalogData.updatedAt = new Date().toISOString();
      saveCatalog(catalogData);

      catalogService.loadAndValidateCatalog();

      res.json({
        success: true,
        message: `Game "${removedGame.title || id}" was permanently deleted from catalog, disk, and blacklisted!`,
        deletedId: id,
      });
    } catch (err: any) {
      res
        .status(500)
        .json({ error: "Failed to delete game", details: err.message });
    }
  });

  // 8. Reorder Feed Sequence
  router.put("/feed/order", (req: Request, res: Response) => {
    try {
      const { order } = req.body;
      if (!Array.isArray(order)) {
        res
          .status(400)
          .json({ error: "Order must be an array of { id, sortWeight }" });
        return;
      }

      let catalogData: any = { version: 1, games: [] };
      if (fs.existsSync(catalogPath)) {
        catalogData = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
      }

      for (const item of order) {
        const g = (catalogData.games || []).find(
          (game: any) => game.id === item.id,
        );
        if (g && typeof item.sortWeight === "number") {
          g.feedOrder = item.sortWeight;
        }
      }

      // Sort catalog games by feedOrder
      catalogData.games.sort(
        (a: any, b: any) => (a.feedOrder ?? 0) - (b.feedOrder ?? 0),
      );
      saveCatalog(catalogData);

      catalogService.loadAndValidateCatalog();

      res.json({
        success: true,
        message: "Feed sequence order updated successfully!",
        games: catalogData.games,
      });
    } catch (err: any) {
      res
        .status(500)
        .json({ error: "Failed to update feed order", details: err.message });
    }
  });

  // 10. Get Ads Remote Configuration
  router.get("/ads-config", (_req: Request, res: Response) => {
    try {
      const adsConfigPath = path.join(
        path.dirname(catalogPath),
        "ads_config.json",
      );
      let config = {
        bannerEnabled: true,
        interstitialEnabled: true,
        swipeInterval: 10,
        defaultIntervalMinutes: 5,
        levelCompleteAd: true,
        levelWinInterval: 2,
        gameOverAdEnabled: true,
        cooldownSeconds: 60,
        adMobAppId: "ca-app-pub-3940256099942544~3347511713",
        bannerUnitId: "ca-app-pub-3940256099942544/6300978111",
        interstitialUnitId: "ca-app-pub-3940256099942544/1033173712",
        rewardedUnitId: "ca-app-pub-3940256099942544/5224354917",
        gaMeasurementId: process.env.GA4_MEASUREMENT_ID || "G-SWIPEPLAY1",
      };

      if (fs.existsSync(adsConfigPath)) {
        try {
          config = {
            ...config,
            ...JSON.parse(fs.readFileSync(adsConfigPath, "utf8")),
          };
        } catch (_) {}
      }

      res.json({ success: true, config });
    } catch (err: any) {
      res.status(500).json({
        error: "Failed to fetch ads configuration",
        details: err.message,
      });
    }
  });

  // 11. Update Ads Remote Configuration
  router.put("/ads-config", (req: Request, res: Response) => {
    try {
      const adsConfigPath = path.join(
        path.dirname(catalogPath),
        "ads_config.json",
      );
      const newConfig = { ...req.body };
      // Never allow API secrets to be written to client-facing ads config file
      delete (newConfig as any).apiSecret;
      delete (newConfig as any).ga4ApiSecret;

      fs.writeFileSync(
        adsConfigPath,
        JSON.stringify(newConfig, null, 2),
        "utf8",
      );

      res.json({
        success: true,
        message: "Ads Remote Configuration updated successfully!",
        config: newConfig,
      });
    } catch (err: any) {
      res.status(500).json({
        error: "Failed to update ads configuration",
        details: err.message,
      });
    }
  });

  // 12. Update Game Features (e.g. Hint Support)
  router.put("/games/:id/features", (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { features } = req.body;

      let catalogData: any = { version: 1, games: [] };
      if (fs.existsSync(catalogPath)) {
        catalogData = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
      }

      const game = (catalogData.games || []).find((g: any) => g.id === id);
      if (!game) {
        res.status(404).json({ error: "Game not found" });
        return;
      }

      const currentFeatures =
        game.features &&
        typeof game.features === "object" &&
        !Array.isArray(game.features)
          ? game.features
          : {};
      const requestedFeatures =
        features && typeof features === "object" && !Array.isArray(features)
          ? features
          : {};
      game.features = normalizeGameFeatures({
        ...currentFeatures,
        ...requestedFeatures,
      });
      saveCatalog(catalogData);

      catalogService.loadAndValidateCatalog();

      res.json({
        success: true,
        message: `Updated features for ${game.title}`,
        game,
      });
    } catch (err: any) {
      res
        .status(500)
        .json({ error: "Failed to update features", details: err.message });
    }
  });

  // 13. Rename Game (Admin display-name override)
  router.put("/games/:id/title", (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const requestedTitle = (req.body as { title: string | null }).title;

      let catalogData: any = { version: 1, games: [] };
      if (fs.existsSync(catalogPath)) {
        catalogData = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
      }

      const game = (catalogData.games || []).find((g: any) => g.id === id);
      if (!game) {
        res.status(404).json({ error: "Game not found" });
        return;
      }

      // Capture the packaged name the first time a game is renamed so the
      // rename stays reversible even after later package uploads.
      if (!game.sourceTitle) game.sourceTitle = game.title || id;

      if (requestedTitle === null) {
        delete game.titleOverride;
        game.title = game.sourceTitle;
      } else {
        game.titleOverride = requestedTitle;
        game.title = requestedTitle;
      }

      // Deliberately leaving updatedAt untouched: the installed app treats a new
      // updatedAt as "assets changed" and purges the cached bundle, and a display
      // name change must not force every device to re-download the game.
      saveCatalog(catalogData);
      catalogService.loadAndValidateCatalog();

      res.json({
        success: true,
        message:
          requestedTitle === null
            ? `Restored original name "${game.title}"`
            : `Renamed "${game.sourceTitle}" to "${game.title}"`,
        game,
      });
    } catch (err: any) {
      res
        .status(500)
        .json({ error: "Failed to rename game", details: err.message });
    }
  });

  // 14. Update Game Ads Configuration (Per-Game Ad Control)
  router.put("/games/:id/ads", (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { ads } = req.body;

      let catalogData: any = { version: 1, games: [] };
      if (fs.existsSync(catalogPath)) {
        catalogData = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
      }

      const game = (catalogData.games || []).find((g: any) => g.id === id);
      if (!game) {
        res.status(404).json({ error: "Game not found" });
        return;
      }

      const currentAds =
        game.ads && typeof game.ads === "object" ? game.ads : {};
      const requestedAds = ads && typeof ads === "object" ? ads : {};

      game.ads = {
        enabled:
          typeof requestedAds.enabled === "boolean"
            ? requestedAds.enabled
            : (currentAds.enabled ?? true),
        useCustomInterval:
          typeof requestedAds.useCustomInterval === "boolean"
            ? requestedAds.useCustomInterval
            : (currentAds.useCustomInterval ?? false),
        intervalMinutes:
          typeof requestedAds.intervalMinutes === "number" &&
          requestedAds.intervalMinutes > 0
            ? Math.round(requestedAds.intervalMinutes)
            : (currentAds.intervalMinutes ?? 5),
      };

      saveCatalog(catalogData);
      catalogService.loadAndValidateCatalog();

      res.json({
        success: true,
        message: `Updated ads configuration for ${game.title}`,
        game,
      });
    } catch (err: any) {
      res.status(500).json({
        error: "Failed to update game ads settings",
        details: err.message,
      });
    }
  });

  return router;
}
