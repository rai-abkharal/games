import { CANDIDATE_BASE_URLS } from '../src/config/env';

test('concurrent startup requests wait for the same remembered endpoint read', async () => {
  let finishRead!: (base: string) => void;
  const saved = new Promise<string>(resolve => { finishRead = resolve; });
  const read = jest.fn(() => saved);
  jest.resetModules();
  jest.doMock('../src/services/storage', () => ({ readString: read, writeString: jest.fn() }));
  const http: typeof import('../src/api/http') = require('../src/api/http');
  const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true, json: async () => ({ games: [] }),
  } as Response);
  try {
    const a = http.hydrateBaseUrl();
    const b = http.hydrateBaseUrl();
    const request = http.requestJsonWithFallback('/api/games', { timeoutMs: 8000 });
    expect(read).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    finishRead(CANDIDATE_BASE_URLS[1]);
    await Promise.all([a, b, request]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe(`${CANDIDATE_BASE_URLS[1]}/api/games`);
  } finally {
    fetchSpy.mockRestore();
    jest.dontMock('../src/services/storage');
  }
});
