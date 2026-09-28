import type { GameItem } from '../types/game';
import { DEFAULT_BASE_URL } from '../config/env';

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
 * Treat catalogue hosts as untrusted metadata and route their paths through
 * the configured HTTPS origin.
 */
export function normalizeAssetUrl(url: string, activeBase: string): string {
  if (!url) return url;
  const base = trimBase(activeBase);
  if (url.startsWith('/')) return `${base}${url}`;
  if (!ABSOLUTE_URL.test(url)) {
    return /^[a-z][a-z0-9+.-]*:/i.test(url) ? '' : `${base}/${url.replace(/^\.?\//, '')}`;
  }
  const parts = splitUrl(url);
  return parts ? `${base}${parts.pathAndQuery}` : '';
}

export function normalizeGameUrls(game: GameItem, activeBase: string): GameItem {
  return {
    ...game,
    entryUrl: normalizeAssetUrl(game.entryUrl, activeBase),
    thumbnailUrl: normalizeAssetUrl(game.thumbnailUrl, activeBase),
    manifestUrl: normalizeAssetUrl(game.manifestUrl, activeBase),
    // The bundle manifest is fetched by the native downloader, which has no
    // notion of candidate hosts — it must arrive already pointed at the base
    // that actually answered.
    ...(game.bundleUrl ? { bundleUrl: normalizeAssetUrl(game.bundleUrl, activeBase) } : {}),
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

/**
 * Play an uncached server build from the canonical origin without using the
 * public /games redirect (which points at the separate Admin preview host).
 * The native downloader remains the only authority for offline readiness.
 */
export function buildRemotePlayUrl(game: GameItem): string | null {
  if (game.tutorial || !game.buildId || !game.bundleUrl ||
      !/^[a-z0-9-]+$/.test(game.id) || !/^\d+\.\d+\.\d+$/.test(game.version)) return null;
  const pathAndQuery = splitUrl(buildGameEntryUrl(game))?.pathAndQuery;
  const prefix = `/games/${game.id}/${game.version}/`;
  if (!pathAndQuery?.startsWith(prefix)) return null;
  const relative = pathAndQuery.slice(prefix.length).split('?')[0];
  if (!/\.html?$/i.test(relative) || relative.includes('\\') ||
      relative.split('/').some(part => !part || part === '.' || part === '..' || /%2f|%5c/i.test(part))) return null;
  const suffix = pathAndQuery.slice(prefix.length);
  return `${DEFAULT_BASE_URL}/api/play/${game.id}/${game.version}/${suffix}` +
    `${suffix.includes('?') ? '&' : '?'}b=${encodeURIComponent(game.buildId)}`;
}

/** Java-compatible String.hashCode, kept so cache keys match the native app. */
export function hashCode(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0;
  }
  return hash;
}
