export function createTtlCache({ ttlMs = 10 * 60 * 1000, maxEntries = 100 } = {}) {
  const entries = new Map();

  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) {
        return null;
      }

      if (entry.expiresAt < Date.now()) {
        entries.delete(key);
        return null;
      }

      entries.delete(key);
      entries.set(key, entry);
      return entry.value;
    },

    set(key, value) {
      entries.set(key, {
        value,
        expiresAt: Date.now() + ttlMs
      });

      while (entries.size > maxEntries) {
        const oldest = entries.keys().next().value;
        entries.delete(oldest);
      }
    }
  };
}
