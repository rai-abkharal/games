import AsyncStorage from '@react-native-async-storage/async-storage';

export interface LaunchDocument {
  key: string;
  html: string;
  baseUrl: string;
}
export interface LaunchCacheStorage {
  read: () => Promise<LaunchDocument | null>;
  write: (document: LaunchDocument) => Promise<void>;
}

// One small document, never an entire catalogue of engines or live DOM state.
export const LAUNCH_CACHE_BYTES = 512 * 1024;
const KEY = 'sp.launchDocument.v1';
export const launchCacheStorage: LaunchCacheStorage = {
  async read() {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (!raw || raw.length * 2 > LAUNCH_CACHE_BYTES * 2) return null;
      return JSON.parse(raw) as LaunchDocument;
    } catch { return null; }
  },
  async write(document) {
    // The prefetcher catches failures and leaves this eligible for a later retry.
    await AsyncStorage.setItem(KEY, JSON.stringify(document));
  },
};
