import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import path from 'path';

describe('Backend API Integration Tests', () => {
  let app: any;

  beforeAll(() => {
    const catalogPath = path.resolve(__dirname, '../catalog/games.json');
    app = createApp(catalogPath, 'http://localhost:8080');
  });

  it('GET /api/health returns ok status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('mini-games-backend');
    expect(res.body.uptime).toBeDefined();
  });

  it('GET /api/games returns validated catalog with 10 games', async () => {
    const res = await request(app).get('/api/games');
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(1);
    expect(Array.isArray(res.body.games)).toBe(true);
    expect(res.body.games.length).toBe(10);

    // Verify ordering by feedOrder
    const feedOrders = res.body.games.map((g: any) => g.feedOrder);
    const sorted = [...feedOrders].sort((a, b) => a - b);
    expect(feedOrders).toEqual(sorted);

    // Verify required fields on first game
    const firstGame = res.body.games[0];
    expect(firstGame.id).toBe('tap-cannon');
    expect(firstGame.entryUrl).toContain('/games/tap-cannon/');
    expect(firstGame.thumbnailUrl).toContain('/thumbnails/tap-cannon.webp');
    expect(firstGame.sizeBytes).toBeGreaterThan(0);
    expect(firstGame.orientation).toBe('portrait');
    expect(firstGame.features.sound).toBe(true);
  });

  it('GET /api/games/:id returns specific game', async () => {
    const res = await request(app).get('/api/games/tap-cannon');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('tap-cannon');
    expect(res.body.title).toBe('Tap Cannon');
  });

  it('GET /api/games/non-existent returns 404', async () => {
    const res = await request(app).get('/api/games/non-existent');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Game not found');
  });
});
