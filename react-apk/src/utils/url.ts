import { PLACEHOLDER_HOSTS } from '../config/env';
import type { GameItem } from '../types/game';

const ABSOLUTE_URL = /^https?:\/\//i;

/** Minimal URL parser (Hermes has no global `URL` with full parsing support). */
export function splitUrl(url: string): {
  origin: string;
  host: string;
  pathAndQuery: string;
} | null {
  const match = /^(https?:\/\/([^/?#]+))([^#]*)/i.exec(url);
  if (!match) return null;
  const hostWithPort = match[2];
  const host = hostWithPort.split(':')[0].toLowerCase();
  return { origin: match[1], host, pathAndQuery: match[3] || '/' };
}

/** Strip a trailing slash so base + path concatenation is predictable. */
export function trimBase(base: string): string {
  return base.replace(/\/+$/, '');
}

/**
 * Rewrites placeholder hosts (localhost, 10.0.2.2, games.example.com…) and
 * relative paths onto the base URL that actually answered — the same
 * normalisation GameRepository.normalizeGameUrls performs.
 */
export function normalizeAssetUrl(url: string, activeBase: string): string {
  if (!url) return url;
  const base = trimBase(activeBase);
  if (url.startsWith('/')) return `${base}${url}`;
  if (!ABSOLUTE_URL.test(url)) return url;
  const parts = splitUrl(url);
  if (parts && PLACEHOLDER_HOSTS.has(parts.host)) {
    return `${base}${parts.pathAndQuery}`;
  }
  return url;
}

export function normalizeGameUrls(game: GameItem, activeBase: string): GameItem {
  return {
    ...game,
    entryUrl: normalizeAssetUrl(game.entryUrl, activeBase),
    thumbnailUrl: normalizeAssetUrl(game.thumbnailUrl, activeBase),
    manifestUrl: normalizeAssetUrl(game.manifestUrl, activeBase),
  };
}

/**
 * Cache-busting entry URL identical to GameFeedAdapter: the version plus a
 * token derived from updatedAt/sha256 so an Admin Panel re-upload is picked up
 * while an unchanged game keeps hitting the WebView HTTP cache.
 */
export function buildGameEntryUrl(game: GameItem): string {
  const token = game.updatedAt
    ? hashCode(game.updatedAt)
    : game.sha256
      ? game.sha256.slice(0, 8)
      : String(hashCode(`${game.id}:${game.version}`));
  const sep = game.entryUrl.includes('?') ? '&' : '?';
  return `${game.entryUrl}${sep}v=${encodeURIComponent(game.version)}&t=${token}`;
}

/** Java-compatible String.hashCode, kept so cache keys match the native app. */
export function hashCode(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0;
  }
  return hash;
}
