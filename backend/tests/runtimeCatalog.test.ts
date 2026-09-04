import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { CatalogService } from '../src/services/catalogService';

const temporaryDirectories: string[] = [];
const originalRuntimePath = process.env.RUNTIME_CATALOG_PATH;

afterEach(() => {
  if (originalRuntimePath === undefined) delete process.env.RUNTIME_CATALOG_PATH;
  else process.env.RUNTIME_CATALOG_PATH = originalRuntimePath;

  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('runtime catalogue persistence', () => {
  it('does not overwrite admin-added games when the service restarts', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'games-catalog-'));
    temporaryDirectories.push(directory);
    const runtimePath = path.join(directory, 'games.runtime.json');
    process.env.RUNTIME_CATALOG_PATH = runtimePath;

    new CatalogService();
    const runtime = JSON.parse(fs.readFileSync(runtimePath, 'utf8'));
    runtime.games.unshift({
      ...runtime.games[0],
      id: 'admin-upload-survives',
      title: 'Admin Upload Survives',
      feedOrder: 0,
    });
    fs.writeFileSync(runtimePath, `${JSON.stringify(runtime, null, 2)}\n`, 'utf8');

    new CatalogService();
    const afterRestart = JSON.parse(fs.readFileSync(runtimePath, 'utf8'));

    expect(afterRestart.games.some((game: any) => game.id === 'admin-upload-survives')).toBe(true);
  });
});
