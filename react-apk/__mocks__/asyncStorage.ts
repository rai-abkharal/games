/** In-memory stand-in for AsyncStorage used by the unit tests. */
const store = new Map<string, string>();

const AsyncStorage = {
  getItem: async (key: string) => store.get(key) ?? null,
  setItem: async (key: string, value: string) => {
    store.set(key, value);
  },
  removeItem: async (key: string) => {
    store.delete(key);
  },
  removeMany: async (keys: string[]) => {
    keys.forEach(key => store.delete(key));
  },
  clear: async () => store.clear(),
};

export default AsyncStorage;
