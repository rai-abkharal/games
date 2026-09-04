import fs from 'fs';
import path from 'path';
import { Catalog, CatalogSchema, Game } from '../types/game';
import { normalizeGameFeatures } from '../utils/gameFeatures';

export class CatalogService {
  private catalogPath: string;
  private cachedCatalog: Catalog | null = null;
  private baseUrl: string;

  constructor(catalogPath?: string, baseUrl?: string) {
    const seedCandidates = [
      path.resolve(process.cwd(), 'catalog/games.json'),
      path.resolve(process.cwd(), 'backend/catalog/games.json'),
      path.resolve(__dirname, '../../../catalog/games.json'),
      path.resolve(__dirname, '../../catalog/games.json'),
      '/var/www/games-platform/backend/catalog/games.json',
    ];

    const configuredCatalogPath = catalogPath || process.env.CATALOG_PATH;
    if (configuredCatalogPath) {
      this.catalogPath = path.resolve(configuredCatalogPath);
    } else {
      const seedCatalogPath = seedCandidates.find(candidate => fs.existsSync(candidate))
        || path.resolve(__dirname, '../../catalog/games.json');
      const runtimeCatalogPath = process.env.RUNTIME_CATALOG_PATH
        ? path.resolve(process.env.RUNTIME_CATALOG_PATH)
        : path.join(path.dirname(seedCatalogPath), 'games.runtime.json');

      this.initializeRuntimeCatalog(seedCatalogPath, runtimeCatalogPath);
      this.catalogPath = runtimeCatalogPath;
    }

    this.baseUrl = (baseUrl || process.env.BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');
  }

  private initializeRuntimeCatalog(seedPath: string, runtimePath: string): void {
    fs.mkdirSync(path.dirname(runtimePath), { recursive: true });

    if (!fs.existsSync(runtimePath)) {
      fs.copyFileSync(seedPath, runtimePath);
      return;
    }

    // Runtime/admin data wins. Only append genuinely new games introduced by
    // the repository seed, while respecting admin deletion tombstones.
    try {
      const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
      const runtime = JSON.parse(fs.readFileSync(runtimePath, 'utf8'));
      const tombstonePath = path.join(path.dirname(runtimePath), 'deleted_games.json');
      const deletedIds = fs.existsSync(tombstonePath)
        ? new Set<string>(JSON.parse(fs.readFileSync(tombstonePath, 'utf8')))
        : new Set<string>();
      const runtimeIds = new Set<string>((runtime.games || []).map((game: any) => game.id));
      const additions = (seed.games || []).filter((game: any) =>
        game?.id && !runtimeIds.has(game.id) && !deletedIds.has(game.id)
      );

      if (additions.length === 0) return;

      const maxOrder = (runtime.games || []).reduce(
        (max: number, game: any) => Math.max(max, Number(game.feedOrder) || 0),
        0,
      );
      additions.forEach((game: any, index: number) => {
        runtime.games.push({ ...game, feedOrder: maxOrder + index + 1 });
      });
      runtime.version = Math.max(Number(runtime.version) || 1, Number(seed.version) || 1);
      runtime.updatedAt = new Date().toISOString();

      const temporaryPath = `${runtimePath}.tmp-${process.pid}`;
      fs.writeFileSync(temporaryPath, `${JSON.stringify(runtime, null, 2)}\n`, 'utf8');
      fs.renameSync(temporaryPath, runtimePath);
    } catch (error) {
      console.error('[Catalog] Runtime catalogue reconciliation failed; keeping existing runtime data.', error);
    }
  }

  public getCatalogPath(): string {
    return this.catalogPath;
  }

  public setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/+$/, '');
    this.cachedCatalog = null;
  }

  public loadAndValidateCatalog(): Catalog {
    if (!fs.existsSync(this.catalogPath)) {
      throw new Error(`Catalog file not found at: ${this.catalogPath}`);
    }

    const rawData = fs.readFileSync(this.catalogPath, 'utf-8');
    let parsedJson: unknown;

    try {
      parsedJson = JSON.parse(rawData);
    } catch (err) {
      throw new Error(`Invalid JSON in catalog file: ${(err as Error).message}`);
    }

    if (parsedJson && typeof parsedJson === 'object' && Array.isArray((parsedJson as any).games)) {
      (parsedJson as any).games = (parsedJson as any).games.map((g: any) => {
        if (g && typeof g === 'object') {
          const rawOrient = String(g.orientation || '').toLowerCase();
          g.orientation = rawOrient === 'landscape' ? 'landscape' : 'portrait';
          g.features = normalizeGameFeatures(g.features);
        }
        return g;
      });
    }

    // Parse and validate with Zod
    const validationResult = CatalogSchema.safeParse(parsedJson);
    if (!validationResult.success) {
      const errorDetails = validationResult.error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join('; ');
      console.warn(`[Catalog Warning] Validation auto-healed: ${errorDetails}`);
    }

    const catalog: Catalog = validationResult.success
      ? validationResult.data
      : (parsedJson as any);

    // Deduplicate game IDs
    const seenIds = new Set<string>();
    catalog.games = (catalog.games || []).filter((game) => {
      if (!game || !game.id) return false;
      if (seenIds.has(game.id)) {
        console.warn(`[Catalog Warning] Filtering out duplicate game ID: ${game.id}`);
        return false;
      }
      seenIds.add(game.id);
      return true;
    });

    // Sort by feedOrder ascending
    catalog.games.sort((a, b) => a.feedOrder - b.feedOrder);

    // Normalize URLs to use current baseUrl if needed
    catalog.games = catalog.games.map((g) => this.normalizeGameUrls(g));

    this.cachedCatalog = catalog;
    return catalog;
  }

  private lastMtime: number = 0;

  public getCatalog(publishedOnly = false): Catalog {
    try {
      if (fs.existsSync(this.catalogPath)) {
        const stats = fs.statSync(this.catalogPath);
        if (stats.mtimeMs > this.lastMtime) {
          this.cachedCatalog = null;
          this.lastMtime = stats.mtimeMs;
        }
      }
    } catch (_) {}

    const catalog = this.cachedCatalog || this.loadAndValidateCatalog();
    if (publishedOnly) {
      return {
        ...catalog,
        games: catalog.games.filter(g => (g as any).status !== 'archived' && (g as any).status !== 'deactivated' && (g as any).status !== 'draft')
      };
    }
    return catalog;
  }

  public getGameById(id: string): Game | undefined {
    const catalog = this.getCatalog();
    return catalog.games.find((g) => g.id === id);
  }

  private normalizeGameUrls(game: Game): Game {
    const replaceHost = (url: string) => {
      if (!url) return '';
      if (url.startsWith('/')) {
        return `${this.baseUrl}${url}`;
      }
      if (url.startsWith('http://') || url.startsWith('https://')) {
        // If placeholder host like games.example.com or local host, adjust according to base URL if set
        try {
          const parsed = new URL(url);
          if (parsed.hostname === 'games.example.com' || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '10.0.2.2') {
            return `${this.baseUrl}${parsed.pathname}`;
          }
        } catch {
          // Keep original
        }
      }
      return url;
    };

    return {
      ...game,
      entryUrl: replaceHost(game.entryUrl),
      thumbnailUrl: replaceHost(game.thumbnailUrl),
      manifestUrl: replaceHost(game.manifestUrl),
    };
  }
}
