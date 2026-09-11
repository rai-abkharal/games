import { GamePrefetcher, prefetchKey, type PrefetchFetcher, type PrefetchResponse } from '../src/services/gamePrefetcher';
import type { GameItem } from '../src/types/game';

function game(id: string, sizeBytes = 1000): GameItem {
  return {
    id,
    title: id,
    version: '1.0.0',
    entryUrl: `http://host/games/${id}/1.0.0/index.html`,
    thumbnailUrl: '',
    sizeBytes,
    orientation: 'portrait',
    engine: 'canvas',
    manifestUrl: '',
    feedOrder: 0,
    category: 'Arcade',
    description: '',
    updatedAt: '2026-09-01T00:00:00Z',
  };
}

const flush = () => new Promise<void>(resolve => setTimeout(() => resolve(), 0));

interface Pending {
  url: string;
  resolve: (response: PrefetchResponse) => void;
  reject: (error: Error) => void;
}

function makeFetcher() {
  const calls: Pending[] = [];
  const fetcher: PrefetchFetcher = url =>
    new Promise<PrefetchResponse>((resolve, reject) => {
      calls.push({ url, resolve, reject });
    });
  const respond = (index: number, html: string, extra: Partial<PrefetchResponse> = {}) =>
    calls[index].resolve({ ok: true, status: 200, contentLength: null, text: async () => html, ...extra });
  return { calls, fetcher, respond };
}

describe('GamePrefetcher', () => {
  test('fetches the wish-list in priority order, one at a time, and serves documents from memory', async () => {
    const { calls, fetcher, respond } = makeFetcher();
    const prefetcher = new GamePrefetcher(fetcher, { maxBytes: 10_000, budgetBytes: 100_000 });
    const [a, b] = [game('a'), game('b')];
    prefetcher.request([a, b]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/games/a/1.0.0/index.html?v=1.0.0&t=');
    respond(0, '<html>a</html>');
    await flush();
    expect(calls).toHaveLength(2);
    respond(1, '<html>b</html>');
    await flush();
    expect(prefetcher.get(a)).toMatchObject({ html: '<html>a</html>', baseUrl: calls[0].url });
    expect(prefetcher.has(b)).toBe(true);
    expect(prefetcher.stats()).toMatchObject({ entries: 2, inflight: false, queued: 0 });
  });

  test('skips games over the size cap and oversized responses', async () => {
    const { calls, fetcher, respond } = makeFetcher();
    const prefetcher = new GamePrefetcher(fetcher, { maxBytes: 100 });
    const big = game('big', 5_000_000);
    const lying = game('lying', 50);
    prefetcher.request([big, lying]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/lying/');
    respond(0, 'x'.repeat(500));
    await flush();
    expect(prefetcher.has(lying)).toBe(false);
    expect(prefetcher.has(big)).toBe(false);
  });

  test('a failed download backs off instead of retrying immediately', async () => {
    let now = 1_000_000;
    const { calls, fetcher } = makeFetcher();
    const prefetcher = new GamePrefetcher(fetcher, { failureBackoffMs: 20_000 }, () => now);
    const a = game('a');
    prefetcher.request([a]);
    calls[0].reject(new Error('offline'));
    await flush();
    prefetcher.request([a]);
    expect(calls).toHaveLength(1);
    now += 21_000;
    prefetcher.request([a]);
    expect(calls).toHaveLength(2);
  });

  test('a download that is no longer wanted is discarded', async () => {
    const { calls, fetcher, respond } = makeFetcher();
    const prefetcher = new GamePrefetcher(fetcher);
    const [a, b, c] = [game('a'), game('b'), game('c')];
    prefetcher.request([a, b]);
    prefetcher.request([c]); // a is in flight but no longer wanted
    respond(0, 'a');
    await flush();
    expect(prefetcher.has(a)).toBe(false);
    expect(calls[1].url).toContain('/c/');
    respond(1, 'c');
    await flush();
    expect(prefetcher.has(c)).toBe(true);
  });

  test('retain() protects the live window; other documents stay until the budget needs the room', async () => {
    let now = 0;
    const { fetcher, respond } = makeFetcher();
    const prefetcher = new GamePrefetcher(fetcher, { maxBytes: 1000, budgetBytes: 250 }, () => now++);
    const [a, b, c] = [game('a'), game('b'), game('c')];
    prefetcher.request([a, b, c]);
    respond(0, 'a'.repeat(100));
    await flush();
    respond(1, 'b'.repeat(100));
    await flush();
    prefetcher.retain([a]); // a is the oldest entry, but it is in the window
    expect(prefetcher.has(b)).toBe(true); // within budget: nothing is dropped
    respond(2, 'c'.repeat(100));
    await flush();
    expect(prefetcher.has(a)).toBe(true);
    expect(prefetcher.has(b)).toBe(false);
    expect(prefetcher.has(c)).toBe(true);
  });

  test('stays within the byte budget by evicting the least recently used entry', async () => {
    let now = 0;
    const { fetcher, respond } = makeFetcher();
    const prefetcher = new GamePrefetcher(fetcher, { maxBytes: 1000, budgetBytes: 250 }, () => now++);
    const [a, b, c] = [game('a'), game('b'), game('c')];
    prefetcher.request([a, b, c]);
    respond(0, 'a'.repeat(100));
    await flush();
    respond(1, 'b'.repeat(100));
    await flush();
    prefetcher.get(a); // touch a so b is the oldest
    respond(2, 'c'.repeat(100));
    await flush();
    expect(prefetcher.has(a)).toBe(true);
    expect(prefetcher.has(b)).toBe(false);
    expect(prefetcher.has(c)).toBe(true);
    expect(prefetcher.stats().bytes).toBe(200);
  });

  test('does nothing while offline and resumes when back online', () => {
    const { calls, fetcher } = makeFetcher();
    const prefetcher = new GamePrefetcher(fetcher);
    prefetcher.setOnline(false);
    prefetcher.request([game('a')]);
    expect(calls).toHaveLength(0);
    prefetcher.setOnline(true);
    expect(calls).toHaveLength(1);
  });

  test('a re-upload (new updatedAt) is a different document', () => {
    const before = game('a');
    const after = { ...game('a'), updatedAt: '2026-09-02T00:00:00Z' };
    expect(prefetchKey(before)).not.toBe(prefetchKey(after));
  });
});
