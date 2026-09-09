import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { SecurityStore } from "../src/security/store";
import { SecurityConfig } from "../src/security/config";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Analytics & Ads API Pipeline", () => {
  let tempDir: string;
  let catalogPath: string;
  let store: SecurityStore;
  let app: any;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "analytics-test-"));
    catalogPath = path.join(tempDir, "games.json");
    fs.writeFileSync(
      catalogPath,
      JSON.stringify({
        version: 1,
        games: [
          {
            id: "crown-chase",
            title: "Crown Chase",
            version: "1.0.0",
            entryUrl: "http://localhost:3000/games/crown-chase/index.html",
            thumbnailUrl: "http://localhost:3000/thumbnails/crown-chase.png",
            sizeBytes: 1024,
            orientation: "portrait",
            engine: "phaser",
            manifestUrl: "http://localhost:3000/games/crown-chase/manifest.json",
            feedOrder: 1,
            category: "Arcade",
            description: "Chase crowns",
            features: { sound: true, vibration: false, hint: true },
            ads: { enabled: true, useCustomInterval: false, intervalMinutes: 5 },
          },
        ],
      })
    );

    const dbPath = path.join(tempDir, "admin.sqlite");
    store = new SecurityStore(dbPath);

    const config: SecurityConfig = {
      origin: "https://admin.example.com",
      previewOrigin: "https://preview.example.net",
      database: dbPath,
      staging: path.join(tempDir, "uploads"),
      idleMs: 30 * 60_000,
      absoluteMs: 12 * 60 * 60_000,
      secure: false,
    };

    app = createApp(catalogPath, "http://localhost:3000", {
      store,
      config,
      publicDir: path.join(tempDir, "public"),
    });
  });

  it("records game_start and game_exit events and calculates analytics summary", async () => {
    // 1. Send game_start
    const startRes = await request(app)
      .post("/api/analytics/event")
      .send({
        clientId: "client-123",
        userId: "Guest_USER1",
        eventName: "game_start",
        gameId: "crown-chase",
        gameTitle: "Crown Chase",
      });

    expect(startRes.status).toBe(200);
    expect(startRes.body.success).toBe(true);

    // 2. Send game_exit with duration
    const exitRes = await request(app)
      .post("/api/analytics/event")
      .send({
        clientId: "client-123",
        userId: "Guest_USER1",
        eventName: "game_exit",
        gameId: "crown-chase",
        gameTitle: "Crown Chase",
        durationSeconds: 45,
        isAbandoned: false,
        exitReason: "swipe",
      });

    expect(exitRes.status).toBe(200);

    // 3. Send game_exit that is abandoned (<10s)
    const abandonRes = await request(app)
      .post("/api/analytics/event")
      .send({
        clientId: "client-456",
        userId: "Guest_USER2",
        eventName: "game_exit",
        gameId: "crown-chase",
        gameTitle: "Crown Chase",
        durationSeconds: 5,
        isAbandoned: true,
        exitReason: "swipe",
      });

    expect(abandonRes.status).toBe(200);

    // 4. Verify summary directly from store
    const summary = store.getAnalyticsSummary("all");
    expect(summary.totalPlays).toBe(1);
    expect(summary.totalPlayTimeSeconds).toBe(50); // 45 + 5
    expect(summary.abandonedSessions).toBe(1);
    expect(summary.gameStats.length).toBe(1);
    expect(summary.gameStats[0].gameId).toBe("crown-chase");
    expect(summary.gameStats[0].plays).toBe(1);
    expect(summary.gameStats[0].totalPlayTimeSeconds).toBe(50);
  });

  it("rejects malformed analytics event payloads", async () => {
    const res = await request(app)
      .post("/api/analytics/event")
      .send({
        clientId: "", // Invalid: empty string
        eventName: "unknown_event", // Invalid enum
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid analytics event payload");
  });

  it("returns default ads config with defaultIntervalMinutes and gaMeasurementId", async () => {
    const res = await request(app).get("/api/ads/config");
    expect(res.status).toBe(200);
    expect(res.body.bannerEnabled).toBe(true);
    expect(res.body.defaultIntervalMinutes).toBe(5);
    expect(res.body.gaMeasurementId).toBeDefined();
  });
});
