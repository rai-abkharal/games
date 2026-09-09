import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import compression from "compression";
import path from "path";
import fs from "fs";
import { CatalogService } from "./services/catalogService";
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
  app.use(compression({ level: 6 }));
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

  app.use(
    "/games",
    express.static(gamesDir, {
      setHeaders: (res, filePath) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        if (filePath.endsWith(".html") || filePath.endsWith(".json")) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
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

  // Games Catalog Endpoint
  app.get("/api/games", (req: Request, res: Response, next: NextFunction) => {
    try {
      // Dynamic base URL detection if client host header differs (e.g. Android 10.0.2.2)
      const host = req.get("host");
      const protocol = req.protocol || "http";
      if (host && !process.env.BASE_URL) {
        catalogService.setBaseUrl(`${protocol}://${host}`);
      }

      const catalog = catalogService.getCatalog(true);

      // Instant live headers: Never cache catalog on client/intermediary
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.json(catalog);
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
