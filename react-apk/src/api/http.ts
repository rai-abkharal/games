import { API_PATHS, CANDIDATE_BASE_URLS, DEFAULT_BASE_URL, STORAGE_KEYS } from '../config/env';
import { readString, writeString } from '../services/storage';
import { trimBase } from '../utils/url';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
  ) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpError';
  }
}

export class TimeoutError extends Error {
  constructor(url: string) {
    super(`Timed out loading ${url}`);
    this.name = 'TimeoutError';
  }
}

function abortError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/**
 * fetch() with a hard timeout and optional external cancellation. Both the
 * caller's signal and the timeout abort the same controller so a cancelled
 * request never keeps a socket busy.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs: number; signal?: AbortSignal | null },
): Promise<Response> {
  const { timeoutMs, signal, ...rest } = init;
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onExternalAbort);
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } catch (error) {
    if (isAbortError(error) && !(signal && signal.aborted)) {
      throw new TimeoutError(url);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onExternalAbort);
  }
}

/* ------------------------------------------------------------------------ */
/* Active base URL — remembered across launches like the native client.      */
/* ------------------------------------------------------------------------ */

let activeBaseUrl = DEFAULT_BASE_URL;
let hydrated = false;

export async function hydrateBaseUrl(): Promise<string> {
  if (!hydrated) {
    hydrated = true;
    const saved = await readString(STORAGE_KEYS.activeBaseUrl);
    if (saved && CANDIDATE_BASE_URLS.includes(saved)) activeBaseUrl = saved;
  }
  return activeBaseUrl;
}

export function getActiveBaseUrl(): string {
  return activeBaseUrl;
}

export function setActiveBaseUrl(base: string): void {
  const next = trimBase(base);
  if (next === activeBaseUrl) return;
  activeBaseUrl = next;
  writeString(STORAGE_KEYS.activeBaseUrl, next);
}

/** Candidates ordered so the last base that answered is tried first. */
export function orderedBaseUrls(): string[] {
  const rest = CANDIDATE_BASE_URLS.filter(base => base !== activeBaseUrl);
  return [activeBaseUrl, ...rest];
}

export interface RequestOptions {
  timeoutMs: number;
  signal?: AbortSignal | null;
  method?: 'GET' | 'POST';
  body?: unknown;
  /** Append a cache-buster so intermediaries never serve a stale catalogue. */
  bustCache?: boolean;
}

/**
 * Performs the request against each candidate base URL in turn and returns the
 * first successful JSON body. The winning base becomes the active one so game
 * asset URLs are normalised onto a host we know is reachable.
 */
export async function requestJsonWithFallback<T>(
  path: (typeof API_PATHS)[keyof typeof API_PATHS],
  options: RequestOptions,
): Promise<{ data: T; baseUrl: string }> {
  let lastError: unknown = null;
  for (const base of orderedBaseUrls()) {
    if (options.signal?.aborted) throw abortError();
    const url = `${base}${path}${options.bustCache ? `?_t=${Date.now()}` : ''}`;
    try {
      const response = await fetchWithTimeout(url, {
        method: options.method ?? 'GET',
        timeoutMs: options.timeoutMs,
        signal: options.signal ?? undefined,
        headers: {
          Accept: 'application/json',
          ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(options.bustCache ? { 'Cache-Control': 'no-cache' } : {}),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });
      if (!response.ok) {
        lastError = new HttpError(response.status, url);
        continue;
      }
      const data = (await response.json()) as T;
      setActiveBaseUrl(base);
      return { data, baseUrl: base };
    } catch (error) {
      if (isAbortError(error) && options.signal?.aborted) throw error;
      lastError = error;
    }
  }
  throw lastError ?? new Error('No backend reachable');
}
