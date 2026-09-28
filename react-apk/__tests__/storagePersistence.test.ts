import AsyncStorage from '@react-native-async-storage/async-storage';
import { readJson, writeJson, writeJsonNow } from '../src/services/storage';

test('a visible catalogue is durable before an older delayed write can replace it', async () => {
  jest.useFakeTimers();
  try {
    await AsyncStorage.clear();
    writeJson('catalog-test', { version: 1 }, 1000);
    expect(await writeJsonNow('catalog-test', { version: 2 })).toBe(true);
    jest.advanceTimersByTime(1100);
    expect(await readJson<{ version: number }>('catalog-test')).toEqual({ version: 2 });
  } finally {
    jest.useRealTimers();
  }
});
