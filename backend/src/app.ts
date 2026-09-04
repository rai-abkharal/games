import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import { CatalogService } from './services/catalogService';
import { createAdminRouter } from './routes/adminRoutes';

export function createApp(catalogPath?: string, baseUrl?: string): Express {
  const app = express();
  const catalogService = new CatalogService(catalogPath, baseUrl);

  // Validate catalog on initialization
  try {
    const catalog = catalogService.loadAndValidateCatalog();
    console.log(`[Catalog] Successfully validated ${catalog.games.length} games in catalog.`);
    console.log(`[Catalog] Runtime source: ${catalogService.getCatalogPath()}`);
  } catch (err) {
    console.error(`[Catalog Warning] ${err instanceof Error ? err.message : String(err)}`);
  }

  // Middlewares
  app.use(compression({ level: 6 }));
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'If-None-Match'],
  }));
  app.use(express.json());

  // Static Assets Hosting (CDN Simulation)
  const publicDir = path.resolve(__dirname, '../public');
  const gamesDir = path.join(publicDir, 'games');
  const thumbnailsDir = path.join(publicDir, 'thumbnails');
  const sharedDir = path.join(publicDir, 'shared');
  const catalogFile = catalogPath || catalogService.getCatalogPath();

  app.use('/shared', express.static(sharedDir, {
    maxAge: '1y',
    immutable: true,
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  }));

  // Register Admin Router
  app.use('/v1/admin', createAdminRouter(catalogService, publicDir, catalogFile));
  app.use('/api/admin', createAdminRouter(catalogService, publicDir, catalogFile));

  // Serve Admin Dashboard GUI if built
  const possibleAdminDirs = [
    path.resolve(__dirname, '../../admin/dist'),
    path.resolve(__dirname, '../../../admin/dist'),
    path.resolve(process.cwd(), 'admin/dist'),
    path.resolve(process.cwd(), '../admin/dist'),
    '/var/www/games-platform/admin/dist',
  ];
  const adminDistDir = possibleAdminDirs.find(d => fs.existsSync(d) && fs.existsSync(path.join(d, 'index.html')));

  if (adminDistDir) {
    console.log(`[Admin] Serving Admin Dashboard from: ${adminDistDir}`);
    app.use('/admin', express.static(adminDistDir));
    app.get('/admin/*', (_req: Request, res: Response) => {
      res.sendFile(path.join(adminDistDir, 'index.html'));
    });
  } else {
    console.warn(`[Admin Warning] Admin dist directory not found in checked paths.`);
    app.get('/admin', (_req: Request, res: Response) => {
      res.send(`<h1>Admin Dashboard Building</h1><p>Please run <code>npx vite build</code> inside the admin directory.</p>`);
    });
  }

  app.use('/games', express.static(gamesDir, {
    setHeaders: (res, filePath) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      if (filePath.endsWith('.html') || filePath.endsWith('.json')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      }
    },
  }));

  app.use('/thumbnails', express.static(thumbnailsDir, {
    maxAge: '1d',
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
    },
  }));

  // Health Endpoint
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'mini-games-backend',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Games Catalog Endpoint
  app.get('/api/games', (req: Request, res: Response, next: NextFunction) => {
    try {
      // Dynamic base URL detection if client host header differs (e.g. Android 10.0.2.2)
      const host = req.get('host');
      const protocol = req.protocol || 'http';
      if (host && !process.env.BASE_URL) {
        catalogService.setBaseUrl(`${protocol}://${host}`);
      }

      const catalog = catalogService.getCatalog(true);

      // Instant live headers: Never cache catalog on client/intermediary
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.json(catalog);
    } catch (err) {
      next(err);
    }
  });

  // Single game metadata
  app.get('/api/games/:id', (req: Request, res: Response) => {
    const game = catalogService.getGameById(req.params.id);
    if (!game) {
      res.status(404).json({ error: 'Game not found', id: req.params.id });
      return;
    }
    res.json(game);
  });

  // Ads Remote Configuration Endpoint for Mobile App
  app.get('/api/ads/config', (_req: Request, res: Response) => {
    const adsConfigPath = path.join(path.dirname(catalogFile), 'ads_config.json');
    if (fs.existsSync(adsConfigPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(adsConfigPath, 'utf8'));
        res.json(config);
        return;
      } catch (_) {}
    }
    // Official Google AdMob Test Default Fallback
    res.json({
      bannerEnabled: true,
      interstitialEnabled: true,
      swipeInterval: 10,
      levelCompleteAd: true,
      levelWinInterval: 2,
      gameOverAdEnabled: true,
      cooldownSeconds: 60,
      adMobAppId: 'ca-app-pub-3940256099942544~3347511713',
      bannerUnitId: 'ca-app-pub-3940256099942544/6300978111',
      interstitialUnitId: 'ca-app-pub-3940256099942544/1033173712',
      rewardedUnitId: 'ca-app-pub-3940256099942544/5224354917',
    });
  });

  // Error handling middleware
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    console.error('[Server Error]', err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: err.message || 'Unknown error occurred',
    });
  });

  return app;
}
