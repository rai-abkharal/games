import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeJsonParse } from '../utils/misc';

/**
 * Tiny persistence helper. Reads are async once at boot; afterwards every
 * store keeps its own in-memory copy, so hot paths never touch storage.
 * Writes are fire-and-forget and coalesced per key so rapid updates (coins
 * ticking up during a game) don't queue dozens of disk writes.
 */
const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();

export async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return safeJsonParse<T>(raw);
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown, delayMs = 150): void {
  const existing = pendingWrites.get(key);
  if (existing) clearTimeout(existing);
  pendingWrites.set(
    key,
    setTimeout(() => {
      pendingWrites.delete(key);
      AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {
        /* storage failures must never surface to the player */
      });
    }, delayMs),
  );
}

export async function readString(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeString(key: string, value: string): void {
  AsyncStorage.setItem(key, value).catch(() => {});
}

export async function removeKeys(keys: string[]): Promise<void> {
  try {
    await AsyncStorage.removeMany(keys);
  } catch {
    /* ignore */
  }
}
