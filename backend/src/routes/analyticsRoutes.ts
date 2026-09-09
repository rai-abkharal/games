import { Router, Request, Response } from "express";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { SecurityStore } from "../security/store";

export const IngestEventSchema = z.preprocess((raw: any) => {
  if (!raw || typeof raw !== "object") return raw;
  const p = (raw.params && typeof raw.params === "object") ? raw.params : {};
  const clientId = raw.clientId || raw.client_id || p.clientId || p.client_id;
  const eventName = raw.eventName || raw.event_name || p.eventName || p.event_name;
  const gameId = raw.gameId || raw.game_id || p.gameId || p.game_id;
  const gameTitle = raw.gameTitle || raw.game_title || p.gameTitle || p.game_title;
  const userId = raw.userId || raw.user_id || p.userId || p.user_id;
  const durationSeconds = raw.durationSeconds ?? raw.duration_seconds ?? p.durationSeconds ?? p.duration_seconds;
  const score = raw.score ?? p.score;
  const level = raw.level ?? p.level;
  const exitReason = raw.exitReason || raw.exit_reason || p.exitReason || p.exit_reason;
  const isAbandoned = raw.isAbandoned ?? raw.is_abandoned ?? p.isAbandoned ?? p.is_abandoned;
  const timestampMs = raw.timestampMs || raw.timestamp_ms || Date.now();

  return {
    ...raw,
    clientId,
    eventName,
    gameId,
    gameTitle,
    userId,
    durationSeconds: typeof durationSeconds === "number" ? Math.max(0, Math.round(durationSeconds)) : undefined,
    score: typeof score === "number" ? Math.round(score) : undefined,
    level: typeof level === "number" ? Math.round(level) : undefined,
    exitReason: typeof exitReason === "string" ? exitReason : undefined,
    isAbandoned: typeof isAbandoned === "boolean" ? isAbandoned : (
      eventName === "game_exit" && typeof durationSeconds === "number" && durationSeconds < 10
    ),
    params: p,
    timestampMs,
  };
}, z.object({
  clientId: z.string().min(1),
  userId: z.string().optional(),
  eventName: z.enum([
    "game_start",
    "game_exit",
    "game_session_duration",
    "game_over",
    "game_completed",
    "ad_impression",
  ]),
  gameId: z.string().min(1),
  gameTitle: z.string().optional(),
  durationSeconds: z.number().int().nonnegative().optional(),
  score: z.number().int().optional(),
  level: z.number().int().optional(),
  isAbandoned: z.boolean().optional(),
  exitReason: z.string().optional(),
  params: z.record(z.any()).optional(),
  timestampMs: z.number().optional(),
}));

export type IngestEvent = z.infer<typeof IngestEventSchema>;

export function createPublicAnalyticsRouter(store: SecurityStore, catalogPath: string): Router {
  const router = Router();

  function getGa4Credentials() {
    let measurementId = process.env.GA4_MEASUREMENT_ID || "G-SWIPEPLAY1";
    const apiSecret = process.env.GA4_API_SECRET || "";

    const adsConfigPath = path.join(path.dirname(catalogPath), "ads_config.json");
    if (fs.existsSync(adsConfigPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(adsConfigPath, "utf8"));
        if (config.gaMeasurementId && typeof config.gaMeasurementId === "string") {
          measurementId = config.gaMeasurementId;
        }
      } catch (_) {}
    }

    return { measurementId, apiSecret };
  }

  async function forwardToGa4(event: IngestEvent, debug = false): Promise<{ ok: boolean; status: number; body: any }> {
    const { measurementId, apiSecret } = getGa4Credentials();
    if (!apiSecret) {
      return { ok: false, status: 0, body: { error: "GA4_API_SECRET is not configured on the server." } };
    }

    const host = debug
      ? `https://www.google-analytics.com/debug/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`
      : `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;

    const ga4Payload = {
      client_id: event.clientId,
      user_id: event.userId || undefined,
      events: [
        {
          name: event.eventName,
          params: {
            game_id: event.gameId,
            game_title: event.gameTitle || event.gameId,
            duration_seconds: event.durationSeconds,
            score: event.score,
            level: event.level,
            is_abandoned: event.isAbandoned ? 1 : 0,
            exit_reason: event.exitReason,
            debug_mode: debug ? 1 : undefined,
            ...(event.params || {}),
          },
        },
      ],
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(host, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ga4Payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      let bodyText: any = null;
      try {
        bodyText = await res.json();
      } catch (_) {
        bodyText = null;
      }

      return { ok: res.ok, status: res.status, body: bodyText };
    } catch (err: any) {
      return { ok: false, status: 500, body: { error: String(err.message || err) } };
    }
  }

  // 1. Ingest event from mobile app
  router.post("/event", (req: Request, res: Response) => {
    try {
      const parsed = IngestEventSchema.parse(req.body);

      // Save to SQLite store
      store.recordAnalyticsEvent({
        clientId: parsed.clientId,
        userId: parsed.userId,
        gameId: parsed.gameId,
        eventName: parsed.eventName,
        durationSeconds: parsed.durationSeconds,
        score: parsed.score,
        level: parsed.level,
        isAbandoned: parsed.isAbandoned,
        exitReason: parsed.exitReason,
        payload: parsed.params,
        createdAt: parsed.timestampMs || Date.now(),
      });

      // Forward to GA4 asynchronously in background
      void forwardToGa4(parsed, false).catch((err) => {
        console.warn("[Analytics Warning] GA4 forwarding failed:", err);
      });

      console.log(
        `[Analytics] Ingested "${parsed.eventName}" for game "${parsed.gameId}" (client: ${parsed.clientId.slice(0, 8)}..., duration: ${parsed.durationSeconds ?? 0}s, exitReason: ${parsed.exitReason || "none"})`
      );

      res.status(200).json({ success: true });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid analytics event payload", details: err.errors });
        return;
      }
      res.status(500).json({ error: "Failed to record analytics event", details: String(err) });
    }
  });

  return router;
}

export function createAdminAnalyticsRouter(store: SecurityStore, catalogPath: string): Router {
  const router = Router();

  function getGa4Credentials() {
    let measurementId = process.env.GA4_MEASUREMENT_ID || "G-SWIPEPLAY1";
    const apiSecret = process.env.GA4_API_SECRET || "";

    const adsConfigPath = path.join(path.dirname(catalogPath), "ads_config.json");
    if (fs.existsSync(adsConfigPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(adsConfigPath, "utf8"));
        if (config.gaMeasurementId && typeof config.gaMeasurementId === "string") {
          measurementId = config.gaMeasurementId;
        }
      } catch (_) {}
    }

    return { measurementId, apiSecret };
  }

  async function forwardToGa4(event: IngestEvent, debug = false): Promise<{ ok: boolean; status: number; body: any }> {
    const { measurementId, apiSecret } = getGa4Credentials();
    if (!apiSecret) {
      return { ok: false, status: 0, body: { error: "GA4_API_SECRET is not configured on the server." } };
    }

    const host = debug
      ? `https://www.google-analytics.com/debug/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`
      : `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;

    const ga4Payload = {
      client_id: event.clientId,
      user_id: event.userId || undefined,
      events: [
        {
          name: event.eventName,
          params: {
            game_id: event.gameId,
            game_title: event.gameTitle || event.gameId,
            duration_seconds: event.durationSeconds,
            score: event.score,
            level: event.level,
            is_abandoned: event.isAbandoned ? 1 : 0,
            exit_reason: event.exitReason,
            debug_mode: debug ? 1 : undefined,
            ...(event.params || {}),
          },
        },
      ],
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(host, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ga4Payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      let bodyText: any = null;
      try {
        bodyText = await res.json();
      } catch (_) {
        bodyText = null;
      }

      return { ok: res.ok, status: res.status, body: bodyText };
    } catch (err: any) {
      return { ok: false, status: 500, body: { error: String(err.message || err) } };
    }
  }

  // 1. Admin analytics summary
  router.get("/summary", (req: Request, res: Response) => {
    try {
      const range = (req.query.range as "today" | "7d" | "30d" | "all") || "all";
      const validRanges = ["today", "7d", "30d", "all"];
      const selectedRange = validRanges.includes(range) ? range : "all";

      const summary = store.getAnalyticsSummary(selectedRange);
      const { measurementId, apiSecret } = getGa4Credentials();

      res.json({
        success: true,
        summary,
        ga4: {
          measurementId,
          configured: Boolean(apiSecret),
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to load analytics summary", details: String(err) });
    }
  });

  // 2. Admin test event / GA4 verification
  router.post("/test-event", async (req: Request, res: Response) => {
    try {
      const testGameId = (req.body?.gameId as string) || "crown-chase";
      const testEvent: IngestEvent = {
        clientId: `test-client-${Date.now()}`,
        userId: "Admin_Tester",
        eventName: "game_start",
        gameId: testGameId,
        gameTitle: "Crown Chase (Test Event)",
        params: {
          test_trigger: "admin_panel_diagnostic",
          timestamp: new Date().toISOString(),
        },
      };

      // Record in local SQLite
      store.recordAnalyticsEvent({
        clientId: testEvent.clientId,
        userId: testEvent.userId,
        gameId: testEvent.gameId,
        eventName: testEvent.eventName,
        payload: testEvent.params,
      });

      // Send to GA4 DebugView
      const ga4Result = await forwardToGa4(testEvent, true);
      const { measurementId, apiSecret } = getGa4Credentials();

      res.json({
        success: true,
        message: ga4Result.ok
          ? "✅ Event successfully recorded locally and forwarded to GA4 DebugView!"
          : apiSecret
          ? `⚠️ Event recorded locally, but GA4 responded with status ${ga4Result.status}`
          : "⚠️ Event recorded in local database. GA4_API_SECRET is not set in server .env.",
        ga4: {
          measurementId,
          configured: Boolean(apiSecret),
          result: ga4Result,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to run test event", details: String(err) });
    }
  });

  return router;
}
