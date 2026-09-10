import { API_PATHS, NETWORK } from '../config/env';
import type { AnalyticsEventName } from '../types/game';
import { requestJsonWithFallback } from './http';

export interface AnalyticsPayload {
  clientId: string;
  eventName: AnalyticsEventName;
  gameId: string;
  gameTitle: string;
  durationSeconds?: number;
  score?: number;
  level?: number;
  exitReason?: string;
  extra?: Record<string, string | number | boolean>;
  timestampMs: number;
}

/**
 * Builds the exact dual camelCase / snake_case body the native
 * GameAnalyticsManager sends, so the backend ingest schema and the GA4
 * forwarding keep producing identical parameters for both clients.
 */
export function buildAnalyticsBody(event: AnalyticsPayload): Record<string, unknown> {
  const isAbandoned = event.eventName === 'game_exit' && (event.durationSeconds ?? 0) < 10;
  const params: Record<string, unknown> = {
    game_id: event.gameId,
    gameId: event.gameId,
    game_title: event.gameTitle,
    gameTitle: event.gameTitle,
    is_abandoned: isAbandoned,
    isAbandoned,
    ...(event.extra ?? {}),
  };
  if (event.durationSeconds !== undefined) {
    params.duration_seconds = event.durationSeconds;
    params.durationSeconds = event.durationSeconds;
  }
  if (event.score !== undefined) params.score = event.score;
  if (event.level !== undefined) params.level = event.level;
  if (event.exitReason !== undefined) {
    params.exit_reason = event.exitReason;
    params.exitReason = event.exitReason;
  }

  const body: Record<string, unknown> = {
    clientId: event.clientId,
    client_id: event.clientId,
    eventName: event.eventName,
    event_name: event.eventName,
    gameId: event.gameId,
    game_id: event.gameId,
    gameTitle: event.gameTitle,
    game_title: event.gameTitle,
    isAbandoned,
    is_abandoned: isAbandoned,
    params,
    timestampMs: event.timestampMs,
  };
  if (event.durationSeconds !== undefined) {
    body.durationSeconds = event.durationSeconds;
    body.duration_seconds = event.durationSeconds;
  }
  if (event.score !== undefined) body.score = event.score;
  if (event.level !== undefined) body.level = event.level;
  if (event.exitReason !== undefined) {
    body.exitReason = event.exitReason;
    body.exit_reason = event.exitReason;
  }
  return body;
}

/** POST /api/analytics/event. Resolves on 2xx, rejects otherwise. */
export async function postAnalyticsEvent(event: AnalyticsPayload): Promise<void> {
  await requestJsonWithFallback<{ success: boolean }>(API_PATHS.analyticsEvent, {
    method: 'POST',
    body: buildAnalyticsBody(event),
    timeoutMs: NETWORK.analyticsTimeoutMs,
  });
}
