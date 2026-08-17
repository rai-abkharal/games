import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { CatalogService } from './services/catalogService';

export function createApp(catalogPath?: string, baseUrl?: string): Express {
  const app = express();
  const catalogService = new CatalogService(catalogPath, baseUrl);

  // Validate catalog on initialization
  try {
    const catalog = catalogService.loadAndValidateCatalog();
    console.log(`[Catalog] Successfully validated ${catalog.games.length} games in catalog.`);
  } catch (err) {
    console.error(`[Catalog Warning] ${err instanceof Error ? err.message : String(err)}`);
  }

  // Middlewares
  app.use(cors({
    origin: '*',
    methods: ['GET', 'HEAD', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'If-None-Match'],
  }));
  app.use(express.json());

  // Static Assets Hosting (CDN Simulation)
  const publicDir = path.resolve(__dirname, '../public');
  const gamesDir = path.join(publicDir, 'games');
  const thumbnailsDir = path.join(publicDir, 'thumbnails');

  app.use('/games', express.static(gamesDir, {
    maxAge: '1h',
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
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

      const catalog = catalogService.getCatalog();

      // Caching headers
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
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
