import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Script, runInNewContext } from 'node:vm';

const assets = resolve(__dirname, '../android/app/src/main/assets/tutorial-games');
const manifest = JSON.parse(readFileSync(resolve(assets, 'manifest.json'), 'utf8'));

test.each(manifest)('$gameId ships self-contained, valid HTML scripts with a matching content hash', item => {
  const html = readFileSync(resolve(assets, item.gameId + '.html'), 'utf8');
  expect(Buffer.byteLength(html)).toBe(item.bytes);
  expect(createHash('sha256').update(html).digest('hex').slice(0, 20)).toBe(item.buildId);
  expect(html).not.toMatch(/<(?:link|script|img)\b[^>]*(?:src|href)=["']https?:\/\//);
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  expect(scripts.length).toBeGreaterThan(0);
  for (const script of scripts) expect(() => new Script(script)).not.toThrow();
  const realStorage = { getItem: jest.fn(), setItem: jest.fn() };
  const window = { localStorage: realStorage };
  runInNewContext(scripts[0], { window });
  expect(window.localStorage.getItem('progress')).toBeNull();
  window.localStorage.setItem('progress', '2');
  expect(window.localStorage.getItem('progress')).toBe('2');
  expect(realStorage.getItem).not.toHaveBeenCalled();
  expect(realStorage.setItem).not.toHaveBeenCalled();
});

test('Knife retains its difficulty denominator and starts only stage one', () => {
  const html = readFileSync(resolve(assets, 'knife-hit.html'), 'utf8');
  expect(html).toContain('const jump = 1;');
  expect(html).toContain('const lv = 1;');
  expect(html).not.toContain('var TOTAL_LEVELS = 1;');
  expect(html).toContain('// Wait for the host tutorial swipe; do not auto-advance.');
});
