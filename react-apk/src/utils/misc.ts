export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function toInt(raw: unknown, fallback = 0): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.trunc(raw) : fallback;
  if (typeof raw === 'string') {
    const parsed = parseInt(raw.trim(), 10);
    if (Number.isFinite(parsed)) return parsed;
    const asFloat = parseFloat(raw.trim());
    return Number.isFinite(asFloat) ? Math.trunc(asFloat) : fallback;
  }
  return fallback;
}

/** RFC4122-ish v4 id without pulling in a crypto dependency. */
export function uuid(): string {
  let out = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += '-';
    else if (i === 14) out += '4';
    else {
      const r = (Math.random() * 16) | 0;
      out += (i === 19 ? (r & 0x3) | 0x8 : r).toString(16);
    }
  }
  return out;
}

/** "ARCADE" / "arcade" / "Arcade" all display as "Arcade". */
export function displayCategory(raw: string | undefined): string {
  const value = (raw || 'Arcade').trim();
  if (!value) return 'Arcade';
  return value
    .split(/[\s-]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(value.includes('-') ? '-' : ' ');
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function safeJsonParse<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
