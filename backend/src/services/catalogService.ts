import fs from 'fs';
import path from 'path';
import { Catalog, CatalogSchema, Game } from '../types/game';

export class CatalogService {
  private catalogPath: string;
  private cachedCatalog: Catalog | null = null;
  private baseUrl: string;

  constructor(catalogPath?: string, baseUrl?: string) {
    const candidates = [
      catalogPath,
      path.resolve(process.cwd(), 'catalog/games.json'),
      path.resolve(process.cwd(), 'backend/catalog/games.json'),
      path.resolve(__dirname, '../../../catalog/games.json'),
      path.resolve(__dirname, '../../catalog/games.json'),
      '/var/www/games-platform/backend/catalog/games.json',
    ].filter(Boolean) as string[];

    this.catalogPath = candidates.find(p => fs.existsSync(p)) || path.resolve(__dirname, '../../catalog/games.json');
    this.baseUrl = (baseUrl || process.env.BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');
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

    // Parse and validate with Zod
    const validationResult = CatalogSchema.safeParse(parsedJson);
    if (!validationResult.success) {
      const errorDetails = validationResult.error.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join('; ');
      throw new Error(`Catalog validation failed: ${errorDetails}`);
    }

    const catalog = validationResult.data;

    // Check duplicate game IDs
    const idSet = new Set<string>();
    for (const game of catalog.games) {
      if (idSet.has(game.id)) {
        throw new Error(`Duplicate game ID found in catalog: ${game.id}`);
      }
      idSet.add(game.id);
    }

    // Sort by feedOrder ascending
    catalog.games.sort((a, b) => a.feedOrder - b.feedOrder);

    // Normalize URLs to use current baseUrl if needed
    catalog.games = catalog.games.map((g) => this.normalizeGameUrls(g));

    this.cachedCatalog = catalog;
    return catalog;
  }

  public getCatalog(publishedOnly = false): Catalog {
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
