import { Router, Request, Response } from 'express';
import multer from 'multer';
import AdmZip from 'adm-zip';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { CatalogService } from '../services/catalogService';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB max
});

export function createAdminRouter(catalogService: CatalogService, publicDir: string, catalogPath: string): Router {
  const router = Router();
  const gamesDir = path.join(publicDir, 'games');
  const thumbnailsDir = path.join(publicDir, 'thumbnails');

  if (!fs.existsSync(gamesDir)) fs.mkdirSync(gamesDir, { recursive: true });
  if (!fs.existsSync(thumbnailsDir)) fs.mkdirSync(thumbnailsDir, { recursive: true });

  // 1. Get All Games for Admin Dashboard
  router.get('/games', (req: Request, res: Response) => {
    try {
      const catalog = catalogService.loadAndValidateCatalog();
      const adminGames = catalog.games.map((g, idx) => ({
        id: g.id,
        slug: g.id,
        title: g.title,
        description: g.description,
        thumbnailUrl: g.thumbnailUrl,
        orientation: g.orientation || 'portrait',
        controls: g.controls || ['TAP'],
        tags: g.tags || ['arcade'],
        status: 'published',
        sortWeight: g.feedOrder ?? (idx + 1),
        ageRating: g.ageRating || 'everyone',
        totalPlays: 1240 + idx * 315,
        totalReports: 0,
        touchZones: (g as any).touchZones || [],
        versions: [
          {
            id: `${g.id}-${g.version}`,
            version: g.version,
            sizeBytes: g.sizeBytes,
            sha256: g.sha256 || '',
            status: 'active',
            rolloutPercent: 100
          }
        ]
      }));

      res.json({
        success: true,
        count: adminGames.length,
        games: adminGames
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch admin games', details: String(err) });
    }
  });

  // 2. Validate Game Zip
  router.post('/games/validate', upload.single('file'), (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No zip file provided' });
        return;
      }

      const zip = new AdmZip(req.file.buffer);
      const entries = zip.getEntries();
      
      const checks: { rule: string; passed: boolean; message: string }[] = [];
      
      // Check 1: Manifest existence
      const manifestEntry = entries.find(e => e.entryName === 'manifest.json' || e.entryName.endsWith('/manifest.json'));
      let manifest: any = null;
      if (manifestEntry) {
        try {
          manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
          checks.push({ rule: 'Manifest Exists', passed: true, message: `Found manifest.json for game "${manifest.title || manifest.id}"` });
        } catch (e) {
          checks.push({ rule: 'Manifest Valid JSON', passed: false, message: 'manifest.json is corrupted or invalid JSON' });
        }
      } else {
        checks.push({ rule: 'Manifest Exists', passed: false, message: 'Missing manifest.json in root of zip' });
      }

      // Check 2: Entry point existence
      const entryHtml = entries.find(e => e.entryName === 'index.html' || e.entryName.endsWith('/index.html'));
      if (entryHtml) {
        checks.push({ rule: 'Entry HTML Exists', passed: true, message: 'index.html entry point verified' });
      } else {
        checks.push({ rule: 'Entry HTML Exists', passed: false, message: 'Missing index.html' });
      }

      // Check 3: File size constraint (< 10MB)
      const sizeMb = req.file.size / (1024 * 1024);
      if (sizeMb <= 10) {
        checks.push({ rule: 'Bundle Size (<10MB)', passed: true, message: `Package size is ${sizeMb.toFixed(2)} MB (Passed)` });
      } else {
        checks.push({ rule: 'Bundle Size (<10MB)', passed: false, message: `Package size is ${sizeMb.toFixed(2)} MB (Exceeds 10MB limit)` });
      }

      // Check 4: Portrait Orientation check
      if (manifest && manifest.orientation) {
        checks.push({ rule: 'Orientation Configured', passed: true, message: `Orientation: ${manifest.orientation}` });
      }

      const allPassed = checks.every(c => c.passed);
      res.json({
        gameId: manifest?.id || 'unknown',
        slug: manifest?.id || 'unknown',
        version: manifest?.version || '1.0.0',
        allPassed,
        checks
      });
    } catch (err) {
      res.status(500).json({ error: 'Validation failed', details: String(err) });
    }
  });

  // 3. Upload & Deploy Game Zip
  router.post('/games/upload', upload.single('file'), (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No zip file uploaded' });
        return;
      }

      const zip = new AdmZip(req.file.buffer);
      const entries = zip.getEntries();

      // Read manifest
      const manifestEntry = entries.find(e => e.entryName === 'manifest.json' || e.entryName.endsWith('/manifest.json'));
      if (!manifestEntry) {
        res.status(400).json({ error: 'ZIP file missing manifest.json' });
        return;
      }

      const manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
      const gameId = manifest.id;
      const version = manifest.version || '1.1.0';

      // Destination directory: public/games/<gameId>/<version>/
      const targetGameDir = path.join(gamesDir, gameId, version);
      if (fs.existsSync(targetGameDir)) {
        fs.rmSync(targetGameDir, { recursive: true, force: true });
      }
      fs.mkdirSync(targetGameDir, { recursive: true });

      // Extract entries
      for (const entry of entries) {
        if (entry.isDirectory) continue;
        
        let relativePath = entry.entryName;
        // Strip leading parent directory if zipped with folder root
        const slashIdx = relativePath.indexOf('/');
        if (slashIdx !== -1 && !relativePath.startsWith('assets/')) {
          const firstPart = relativePath.substring(0, slashIdx);
          if (firstPart === gameId || firstPart === 'files (2)' || firstPart === 'dist' || firstPart === 'build') {
            relativePath = relativePath.substring(slashIdx + 1);
          }
        }

        const targetFile = path.join(targetGameDir, relativePath);
        fs.mkdirSync(path.dirname(targetFile), { recursive: true });
        fs.writeFileSync(targetFile, entry.getData());
      }

      // Handle thumbnail SVG
      const thumbnailEntry = entries.find(e => e.entryName.endsWith('.svg') || e.entryName.endsWith('.png'));
      const thumbFileName = `${gameId}.svg`;
      const targetThumbFile = path.join(thumbnailsDir, thumbFileName);
      if (thumbnailEntry) {
        fs.writeFileSync(targetThumbFile, thumbnailEntry.getData());
      } else if (!fs.existsSync(targetThumbFile)) {
        // Generate a fallback clean SVG thumbnail
        const defaultSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%"><rect width="512" height="512" rx="96" fill="#1e1b4b"/><text x="256" y="270" fill="#a5b4fc" font-size="64" font-family="system-ui, sans-serif" font-weight="bold" text-anchor="middle">${manifest.title || gameId}</text></svg>`;
        fs.writeFileSync(targetThumbFile, defaultSvg, 'utf8');
      }

      // Calculate SHA256 of entry index.html or package
      const indexFile = path.join(targetGameDir, 'index.html');
      let sha256 = '';
      let sizeBytes = req.file.size;
      if (fs.existsSync(indexFile)) {
        const fileBuffer = fs.readFileSync(indexFile);
        sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      }

      // Update catalog/games.json
      let catalogData: any = { schemaVersion: '1.0.0', games: [] };
      if (fs.existsSync(catalogPath)) {
        catalogData = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
      }

      const existingIndex = catalogData.games.findIndex((g: any) => g.id === gameId);
      const newGameEntry = {
        id: gameId,
        title: manifest.title || gameId,
        version: version,
        description: manifest.description || 'Fast, responsive instant 2D mini-game.',
        category: (manifest.tags && manifest.tags[0]) ? manifest.tags[0].toUpperCase() : 'ARCADE',
        orientation: manifest.orientation || 'portrait',
        controls: manifest.controls || ['TAP'],
        sizeBytes: sizeBytes,
        sha256: sha256,
        ageRating: manifest.ageRating || 'everyone',
        tags: manifest.tags || ['arcade', 'casual'],
        feedOrder: existingIndex >= 0 ? catalogData.games[existingIndex].feedOrder : (catalogData.games.length + 1),
        entryUrl: `http://localhost:8080/games/${gameId}/${version}/index.html`,
        thumbnailUrl: `http://localhost:8080/thumbnails/${gameId}.svg`,
        manifestUrl: `http://localhost:8080/games/${gameId}/${version}/manifest.json`
      };

      if (existingIndex >= 0) {
        catalogData.games[existingIndex] = newGameEntry;
      } else {
        catalogData.games.push(newGameEntry);
      }

      fs.writeFileSync(catalogPath, JSON.stringify(catalogData, null, 2), 'utf8');
      
      // Also sync to frontend catalog if it exists
      const frontendCatalogPath = path.resolve(__dirname, '../../../frontend/assets/catalog/games.json');
      if (fs.existsSync(path.dirname(frontendCatalogPath))) {
        fs.writeFileSync(frontendCatalogPath, JSON.stringify(catalogData, null, 2), 'utf8');
      }

      // Hot reload catalog service
      catalogService.loadAndValidateCatalog();

      res.json({
        success: true,
        message: `Game "${manifest.title || gameId}" v${version} deployed live to server and catalog!`,
        game: newGameEntry
      });
    } catch (err) {
      console.error('[Admin Upload Error]', err);
      res.status(500).json({ error: 'Failed to upload and deploy game', details: String(err) });
    }
  });

  // 4. Reports endpoint
  router.get('/reports', (_req: Request, res: Response) => {
    res.json({
      success: true,
      reports: []
    });
  });

  // 5. Update Game Touch Zones (Dynamic Swipe Lock)
  router.put('/games/:id/touch-zones', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { touchZones } = req.body;
      
      let catalogData: any = { schemaVersion: '1.0.0', games: [] };
      if (fs.existsSync(catalogPath)) {
        catalogData = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
      }

      const game = catalogData.games.find((g: any) => g.id === id);
      if (!game) {
        res.status(404).json({ error: 'Game not found in catalog' });
        return;
      }

      game.touchZones = Array.isArray(touchZones) ? touchZones : [];
      fs.writeFileSync(catalogPath, JSON.stringify(catalogData, null, 2), 'utf8');

      // Sync to frontend assets catalog if present
      const frontendCatalogPath = path.resolve(__dirname, '../../../frontend/assets/catalog/games.json');
      if (fs.existsSync(path.dirname(frontendCatalogPath))) {
        fs.writeFileSync(frontendCatalogPath, JSON.stringify(catalogData, null, 2), 'utf8');
      }

      // Hot reload catalog in memory
      catalogService.loadAndValidateCatalog();

      res.json({
        success: true,
        message: `Updated touch zones for game "${game.title}"`,
        touchZones: game.touchZones
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update touch zones', details: String(err) });
    }
  });

  return router;
}
