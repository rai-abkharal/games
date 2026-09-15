import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import compression from "compression";
import path from "path";
import fs from "fs";
import crypto from "node:crypto";
import { CatalogService } from "./services/catalogService";
import { ensureManifest } from "./services/bundleService";
import { createAdminRouter } from "./routes/adminRoutes";
import { createPublicAnalyticsRouter, createAdminAnalyticsRouter } from "./routes/analyticsRoutes";
import { SecurityStore } from "./security/store";
import { SecurityConfig, securityConfig } from "./security/config";
import {
  securityMiddleware,
  errorHandler,
  requireSession,
  csrf,
} from "./security/http";
import { authRouter } from "./security/routes";
import { previewApp } from "./security/preview";
import { adminPolicy } from "./security/adminPolicy";

export function createApp(
  catalogPath?: string,
  baseUrl?: string,
  security?: {
    store: SecurityStore;
    config: SecurityConfig;
    publicDir?: string;
  },
): Express {
  const app = express();
  const config = security?.config || securityConfig();
  const store = security?.store || new SecurityStore(config.database);
  app.locals.securityStore = store;
  if (process.env.TRUST_PROXY)
    app.set(
      "trust proxy",
      process.env.TRUST_PROXY.split(",").map((x) => x.trim()),
    );
  const catalogService = new CatalogService(catalogPath, baseUrl);

  // Validate catalog on initialization
  try {
    const catalog = catalogService.loadAndValidateCatalog();
    console.log(
      `[Catalog] Successfully validated ${catalog.games.length} games in catalog.`,
    );
    console.log(`[Catalog] Runtime source: ${catalogService.getCatalogPath()}`);
  } catch (err) {
    console.error(
      `[Catalog Warning] ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Middlewares
  // Range requests are served uncompressed on purpose. A resumed download asks
  // for a byte offset into the *file*; compressing the slice would make the
  // offsets the client is tracking meaningless and break its hash check. Fresh
  // downloads carry no Range header and are still compressed normally.
  app.use(
    compression({
      level: 6,
      filter: (req, res) =>
        !req.headers.range && compression.filter(req, res),
    }),
  );
  const publicCors = cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "If-None-Match"],
  });
  app.use((req, res, next) =>
    /^\/(v1|api)\/admin(?:\/|$)/i.test(req.path)
      ? next()
      : publicCors(req, res, next),
  );
  app.use(express.json({ limit: "64kb" }));

  // Static Assets Hosting (CDN Simulation)
  const publicDir =
    security?.publicDir ||
    path.resolve(
      process.env.PUBLIC_DIR ||
        path.join(
          __dirname,
          __dirname.includes(`${path.sep}dist${path.sep}`)
            ? "../../public"
            : "../public",
        ),
    );
  const gamesDir = path.join(publicDir, "games");
  const thumbnailsDir = path.join(publicDir, "thumbnails");
  const sharedDir = path.join(publicDir, "shared");
  const catalogFile = catalogPath || catalogService.getCatalogPath();
  const preview = previewApp(publicDir, store, config);
  app.use((req, res, next) => {
    if (req.get("host") === new URL(config.previewOrigin).host)
      return preview(req, res, next);
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.path.startsWith("/admin")) {
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader(
        "Content-Security-Policy",
        `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; frame-src ${config.previewOrigin}; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`,
      );
    }
    if (
      req.get("host") === new URL(config.origin).host &&
      /^\/(games|shared|thumbnails)(\/|$)/i.test(req.path)
    )
      return res.redirect(307, config.previewOrigin + req.originalUrl);
    next();
  });

  app.use(
    "/shared",
    express.static(sharedDir, {
      maxAge: "1y",
      immutable: true,
      setHeaders: (res) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      },
    }),
  );

  // Register Admin Router
  const admin = express.Router();
  admin.use((req, res, next) => {
    if (!config.secure && req.get("host") !== new URL(config.origin).host)
      return res.status(403).json({ error: "Use the configured Admin hostname" });
    if (req.get("origin") && req.get("origin") !== config.origin)
      return res.status(403).json({ error: "Untrusted request origin" });
    // Same-origin UI/proxy is intentional: no credentialed cross-origin Admin API.
    next();
  });
  admin.use(securityMiddleware(store, config));
  admin.use((req, res, next) => {
    const publicAuth =
      (req.method === "GET" && req.path === "/auth/csrf") ||
      (req.method === "POST" &&
        ["/auth/login", "/auth/reset-request", "/auth/reset"].includes(
          req.path,
        ));
    if (publicAuth) return next();
    requireSession(store)(req, res, (error) =>
      error
        ? next(error)
        : adminPolicy(req, res, (policyError) =>
            policyError ? next(policyError) : csrf(config)(req, res, next),
          ),
    );
  });
  admin.use(authRouter(store, config));
  admin.use(
    "/analytics",
    createAdminAnalyticsRouter(store, catalogFile),
  );
  admin.use(
    createAdminRouter(catalogService, publicDir, catalogFile, store, config),
  );
  app.use("/v1/admin", admin);
  app.use("/api/admin", admin);

  // Only the sign-in document and its assets are public. All dashboard routes
  // require a server-validated session, including direct index.html requests.
  app.use("/admin", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.get("host") !== new URL(config.origin).host)
      return res.redirect(302, config.origin + "/admin/login");
    securityMiddleware(store, config)(req, res, (error) => {
      if (error) return next(error);
      if (req.path === "/login" || req.path.startsWith("/assets/")) return next();
      if (!res.locals.admin) return res.redirect(302, "/admin/login");
      return requireSession(store)(req, res, next);
    });
  });

  // Serve Admin Dashboard GUI if built
  const possibleAdminDirs = [
    path.resolve(__dirname, "../../admin/dist"),
    path.resolve(__dirname, "../../../admin/dist"),
    path.resolve(process.cwd(), "admin/dist"),
    path.resolve(process.cwd(), "../admin/dist"),
    "/var/www/games-platform/admin/dist",
  ];
  const adminDistDir = possibleAdminDirs.find(
    (d) => fs.existsSync(d) && fs.existsSync(path.join(d, "index.html")),
  );

  if (adminDistDir) {
    console.log(`[Admin] Serving Admin Dashboard from: ${adminDistDir}`);
    app.use("/admin", express.static(adminDistDir));
    app.get("/admin/*", (_req: Request, res: Response) => {
      res.sendFile(path.join(adminDistDir, "index.html"));
    });
  } else {
    console.warn(
      `[Admin Warning] Admin dist directory not found in checked paths.`,
    );
    app.get("/admin", (_req: Request, res: Response) => {
      res.send(
        `<h1>Admin Dashboard Building</h1><p>Please run <code>npx vite build</code> inside the admin directory.</p>`,
      );
    });
  }

  /**
   * Per-build manifest. Generated on demand the first time it is asked for, so
   * games deployed before bundles existed need no migration step. Revalidated
   * rather than cached outright: it is the one document whose whole job is to
   * tell a client whether its local copy is still current.
   */
  app.get(
    "/games/:id/:version/bundle.json",
    (req: Request, res: Response, next: NextFunction) => {
      if (
        !/^[a-z0-9-]+$/.test(req.params.id) ||
        !/^\d+\.\d+\.\d+$/.test(req.params.version)
      ) {
        return next();
      }
      try {
        const manifest = ensureManifest(gamesDir, req.params.id, req.params.version);
        if (!manifest) return next();
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        res.setHeader("Cache-Control", "no-cache");
        // Strong validator: the buildId already is a content hash of the build.
        res.setHeader("ETag", `"${manifest.buildId}"`);
        if (req.headers["if-none-match"] === `"${manifest.buildId}"`) {
          return res.status(304).end();
        }
        return res.json(manifest);
      } catch (error) {
        return next(error);
      }
    },
  );

  app.use(
    "/games",
    express.static(gamesDir, {
      setHeaders: (res, filePath) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        // A request that names the build it wants (`?b=<buildId>`) can never be
        // answered with the wrong bytes, so it is safe to cache forever. Plain
        // requests keep revalidating, because a re-upload can replace files
        // underneath an unchanged /games/<id>/<version>/ path.
        const req = (res as unknown as { req?: Request }).req;
        if (req && typeof req.query?.b === "string" && req.query.b.length > 0) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          return;
        }
        if (filePath.endsWith(".html") || filePath.endsWith(".json")) {
          res.setHeader("Cache-Control", "no-cache, must-revalidate");
          res.setHeader("Pragma", "no-cache");
        } else {
          res.setHeader("Cache-Control", "public, max-age=86400");
        }
      },
    }),
  );

  app.use(
    "/thumbnails",
    express.static(thumbnailsDir, {
      maxAge: "1d",
      setHeaders: (res) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
      },
    }),
  );

  // Health Endpoint
  app.get("/api/health", (req: Request, res: Response) => {
    res.json({
      status: "ok",
      service: "mini-games-backend",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  /** Attaches the build identity a client needs to decide "do I already have this?". */
  const withBuildIds = (games: any[]) =>
    games.map((game) => {
      try {
        const manifest = ensureManifest(gamesDir, game.id, game.version);
        if (!manifest) return game;
        const base = String(game.entryUrl || "").replace(/[^/]*$/, "");
        return {
          ...game,
          buildId: manifest.buildId,
          bundleUrl: base ? `${base}bundle.json` : undefined,
          bundleBytes: manifest.totalBytes,
        };
      } catch {
        // A game whose manifest cannot be built still plays from the network;
        // it just never becomes eligible for the on-device store.
        return game;
      }
    });

  const applyRequestBaseUrl = (req: Request) => {
    // Dynamic base URL detection if client host header differs (e.g. Android 10.0.2.2)
    const host = req.get("host");
    const protocol = req.protocol || "http";
    if (host && !process.env.BASE_URL) {
      catalogService.setBaseUrl(`${protocol}://${host}`);
    }
  };

  /**
   * Version probe. A client that already has every game on disk only needs to
   * know whether any build changed, and this answers that in a few hundred
   * bytes — or in a 304 with none at all — instead of the full catalogue.
   * Registered before `/api/games/:id` so it is not swallowed by that route.
   */
  app.get("/api/games/versions", (req: Request, res: Response, next: NextFunction) => {
    try {
      applyRequestBaseUrl(req);
      const catalog = catalogService.getCatalog(true);
      const games = withBuildIds(catalog.games as any[]).map((game: any) => ({
        id: game.id,
        version: game.version,
        buildId: game.buildId,
        updatedAt: game.updatedAt,
      }));
      const body = {
        version: catalog.version,
        updatedAt: catalog.updatedAt,
        games,
      };
      const etag = `"v${crypto
        .createHash("sha256")
        .update(JSON.stringify(games))
        .digest("hex")
        .slice(0, 32)}"`;
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("ETag", etag);
      if (req.headers["if-none-match"] === etag) {
        res.status(304).end();
        return;
      }
      res.json(body);
    } catch (err) {
      next(err);
    }
  });

  // Games Catalog Endpoint
  app.get("/api/games", (req: Request, res: Response, next: NextFunction) => {
    try {
      applyRequestBaseUrl(req);

      const catalog = catalogService.getCatalog(true);
      const payload = { ...catalog, games: withBuildIds(catalog.games as any[]) };

      // `no-cache` rather than `no-store`: the client must still revalidate on
      // every read, so an Admin Panel change is picked up just as immediately,
      // but an unchanged catalogue costs a 304 instead of a full re-download.
      const etag = `"c${crypto
        .createHash("sha256")
        .update(JSON.stringify(payload))
        .digest("hex")
        .slice(0, 32)}"`;
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("ETag", etag);
      if (req.headers["if-none-match"] === etag) {
        res.status(304).end();
        return;
      }
      res.json(payload);
    } catch (err) {
      next(err);
    }
  });

  // Single game metadata
  app.get("/api/games/:id", (req: Request, res: Response) => {
    const game = catalogService.getGameById(req.params.id);
    if (!game) {
      res.status(404).json({ error: "Game not found", id: req.params.id });
      return;
    }
    res.json(game);
  });

  // Public Analytics Event Ingestion for Mobile App
  const publicAnalytics = createPublicAnalyticsRouter(store, catalogFile);
  app.use("/api/analytics", publicAnalytics);
  app.use("/v1/analytics", publicAnalytics);

  // Ads Remote Configuration Endpoint for Mobile App
  app.get("/api/ads/config", (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const adsConfigPath = path.join(
      path.dirname(catalogFile),
      "ads_config.json",
    );
    if (fs.existsSync(adsConfigPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(adsConfigPath, "utf8"));
        res.json({
          defaultIntervalMinutes: 5,
          gaMeasurementId: process.env.GA4_MEASUREMENT_ID || "G-SWIPEPLAY1",
          ...config,
        });
        return;
      } catch (_) {}
    }
    // Official Google AdMob Test Default Fallback
    res.json({
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
    });
  });

  // Error handling middleware
  app.use(errorHandler);

  return app;
}
