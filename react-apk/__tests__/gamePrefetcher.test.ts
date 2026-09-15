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
  signal: AbortSignal;
  resolve: (response: PrefetchResponse) => void;
  reject: (error: Error) => void;
}

function makeFetcher() {
  const calls: Pending[] = [];
  const fetcher: PrefetchFetcher = (url, _timeoutMs, signal) =>
    new Promise<PrefetchResponse>((resolve, reject) => {
      calls.push({ url, signal, resolve, reject });
      signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
    });
  const respond = (index: number, html: string, extra: Partial<PrefetchResponse> = {}) =>
    calls[index].resolve({ ok: true, status: 200, contentLength: null, text: async () => html, ...extra });
  return { calls, fetcher, respond };
}

const instances: GamePrefetcher[] = [];
function makePrefetcher(...args: ConstructorParameters<typeof GamePrefetcher>): GamePrefetcher {
  const prefetcher = new GamePrefetcher(...args);
  instances.push(prefetcher);
  return prefetcher;
}
afterEach(() => {
  for (const prefetcher of instances) prefetcher.clear();
  instances.length = 0;
});

describe('GamePrefetcher', () => {
  test('restores the last game document across process launches without fetching or executing a neighbor', async () => {
    const { calls, fetcher, respond } = makeFetcher();
    let saved: any = null;
    const storage = {
      read: async () => saved,
      write: jest.fn(async document => { saved = document; }),
    };
    const first = makePrefetcher(fetcher, {}, Date.now, storage);
    first.setLaunchGame(game('a'));
    first.request([game('a')]);
    respond(0, '<html>original entry</html>');
    await flush();
    expect(storage.write).toHaveBeenCalledTimes(1);
    const second = makePrefetcher(fetcher, {}, Date.now, storage);
    await second.restoreLaunch();
    expect(second.get(game('a'))?.html).toBe('<html>original entry</html>');
    expect(calls).toHaveLength(1);
    expect(second.get({ ...game('a'), version: '2' })).toBeNull();
    expect(second.get({ ...game('a'), sha256: 'new-digest' })).toBeNull();
    expect(second.get({ ...game('a'), entryUrl: 'https://other.example/index.html' })).toBeNull();
  });

  test('never writes launch storage during play and rejects oversized/corrupt launch records', async () => {
    const { fetcher, respond } = makeFetcher();
    const write = jest.fn(async () => {});
    const prefetcher = makePrefetcher(fetcher, {}, Date.now, { read: async () => null, write });
    prefetcher.request([game('a')]);
    respond(0, 'entry');
    await flush();
    prefetcher.setPaused(true);
    prefetcher.setLaunchGame(game('a'));
    prefetcher.saveLaunch();
    expect(write).not.toHaveBeenCalled();
    prefetcher.setPaused(false);
    prefetcher.saveLaunch();
    expect(write).toHaveBeenCalledTimes(1);
    const oversized = makePrefetcher(fetcher, {}, Date.now, {
      read: async () => ({ key: prefetchKey(game('a')), html: 'x'.repeat(300_000), baseUrl: 'https://example.com' }), write,
    });
    await oversized.restoreLaunch();
    expect(oversized.get(game('a'))).toBeNull();
    const broken = makePrefetcher(fetcher, {}, Date.now, {
      read: async () => { throw new Error('storage unavailable'); }, write,
    });
    await expect(broken.restoreLaunch()).resolves.toBeUndefined();
  });

  test('cancels a body already being read and ignores its late completion without retry backoff', async () => {
    const { calls, fetcher, respond } = makeFetcher();
    const prefetcher = makePrefetcher(fetcher);
    let finishBody!: (html: string) => void;
    const body = new Promise<string>(resolve => { finishBody = resolve; });
    prefetcher.request([game('a')]);
    respond(0, '', { text: () => body });
    await flush();
    prefetcher.setPaused(true);
    expect(calls[0].signal.aborted).toBe(true);
    finishBody('late response');
    await flush();
    expect(prefetcher.stats()).toMatchObject({ entries: 0, queued: 1, inflight: false });
    prefetcher.setPaused(false);
    expect(calls).toHaveLength(2);
    respond(1, 'fresh response');
    await flush();
    expect(prefetcher.get(game('a'))?.html).toBe('fresh response');
  });

  test('offline and clear abort downloads instead of just preventing the next request', async () => {
    const { calls, fetcher } = makeFetcher();
    const prefetcher = makePrefetcher(fetcher);
    prefetcher.request([game('a')]);
    prefetcher.setOnline(false);
    expect(calls[0].signal.aborted).toBe(true);
    await flush();
    prefetcher.setOnline(true);
    expect(calls).toHaveLength(2);
    prefetcher.clear();
    expect(calls[1].signal.aborted).toBe(true);
    await flush();
    expect(prefetcher.stats()).toMatchObject({ entries: 0, queued: 0, inflight: false });
  });

  test('suspends the queue and defers response text until gameplay ends', async () => {
    const { calls, fetcher, respond } = makeFetcher();
    const prefetcher = makePrefetcher(fetcher);
    const text = jest.fn(async () => '<html>a</html>');
    prefetcher.setPaused(true);
    prefetcher.request([game('a'), game('b')]);
    expect(calls).toHaveLength(0);
    prefetcher.setPaused(false);
    expect(calls).toHaveLength(1);
    prefetcher.setPaused(true);
    expect(calls[0].signal.aborted).toBe(true);
    respond(0, '', { text });
    await flush();
    expect(text).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    prefetcher.setPaused(false);
    expect(calls).toHaveLength(2);
    respond(1, '<html>a</html>');
    await flush();
    expect(prefetcher.has(game('a'))).toBe(true);
    expect(calls).toHaveLength(3);
    respond(2, '<html>b</html>');
    await flush();
  });

  test('fetches the wish-list in priority order, one at a time, and serves documents from memory', async () => {
    const { calls, fetcher, respond } = makeFetcher();
    const prefetcher = makePrefetcher(fetcher, { maxBytes: 10_000, budgetBytes: 100_000 });
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
    const prefetcher = makePrefetcher(fetcher, { maxBytes: 100 });
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
    const prefetcher = makePrefetcher(fetcher, { failureBackoffMs: 20_000 }, () => now);
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
    const prefetcher = makePrefetcher(fetcher);
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
    const prefetcher = makePrefetcher(fetcher, { maxBytes: 1000, budgetBytes: 500 }, () => now++);
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
    const prefetcher = makePrefetcher(fetcher, { maxBytes: 1000, budgetBytes: 500 }, () => now++);
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
    expect(prefetcher.stats().bytes).toBe(400);
  });

  test('does nothing while offline and resumes when back online', () => {
    const { calls, fetcher } = makeFetcher();
    const prefetcher = makePrefetcher(fetcher);
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
