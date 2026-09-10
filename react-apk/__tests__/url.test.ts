import { buildGameEntryUrl, hashCode, normalizeAssetUrl, normalizeGameUrls } from '../src/utils/url';
import type { GameItem } from '../src/types/game';

const base = 'http://162.243.197.241:3000';

describe('URL normalisation (parity with GameRepository.normalizeGameUrls)', () => {
  test('placeholder hosts are rewritten onto the active base', () => {
    expect(normalizeAssetUrl('http://localhost:8080/games/a/1.0.0/index.html', base)).toBe(
      `${base}/games/a/1.0.0/index.html`,
    );
    expect(normalizeAssetUrl('http://10.0.2.2:3000/thumbnails/a.webp', base)).toBe(`${base}/thumbnails/a.webp`);
    expect(normalizeAssetUrl('https://games.example.com/x?y=1', base)).toBe(`${base}/x?y=1`);
  });

  test('relative paths and real hosts', () => {
    expect(normalizeAssetUrl('/games/a/index.html', base)).toBe(`${base}/games/a/index.html`);
    expect(normalizeAssetUrl('https://cdn.example.net/a.png', base)).toBe('https://cdn.example.net/a.png');
    expect(normalizeAssetUrl('', base)).toBe('');
  });

  test('normalizeGameUrls only touches the three URL fields', () => {
    const game = {
      id: 'x',
      title: 'X',
      version: '1.0.0',
      entryUrl: 'http://localhost:8080/games/x/1.0.0/index.html',
      thumbnailUrl: '/thumbnails/x.svg',
      manifestUrl: 'http://127.0.0.1/games/x/1.0.0/manifest.json',
      sizeBytes: 1,
      orientation: 'portrait',
      engine: 'phaser',
      feedOrder: 1,
      category: 'Arcade',
      description: '',
    } as GameItem;
    const out = normalizeGameUrls(game, base);
    expect(out.entryUrl).toBe(`${base}/games/x/1.0.0/index.html`);
    expect(out.thumbnailUrl).toBe(`${base}/thumbnails/x.svg`);
    expect(out.manifestUrl).toBe(`${base}/games/x/1.0.0/manifest.json`);
    expect(out.id).toBe('x');
  });
});

describe('cache-busting entry URL (parity with GameFeedAdapter)', () => {
  test('hashCode matches java.lang.String#hashCode', () => {
    expect(hashCode('')).toBe(0);
    expect(hashCode('abc')).toBe(96354);
    expect(hashCode('2026-09-09T11:37:00.398Z')).toBe(hashCode('2026-09-09T11:37:00.398Z'));
  });

  test('uses version plus updatedAt hash', () => {
    const url = buildGameEntryUrl({
      entryUrl: `${base}/games/x/1.2.0/index.html`,
      version: '1.2.0',
      updatedAt: '2026-09-09T11:37:00.398Z',
    } as GameItem);
    expect(url).toBe(`${base}/games/x/1.2.0/index.html?v=1.2.0&t=${hashCode('2026-09-09T11:37:00.398Z')}`);
  });

  test('falls back to sha256 prefix', () => {
    const url = buildGameEntryUrl({
      entryUrl: `${base}/games/x/1.0.0/index.html?debug=1`,
      version: '1.0.0',
      sha256: 'deadbeefcafe',
    } as GameItem);
    expect(url).toBe(`${base}/games/x/1.0.0/index.html?debug=1&v=1.0.0&t=deadbeef`);
  });
});
