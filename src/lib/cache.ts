// Tiny TTL cache (in-memory + localStorage) used to limit external API calls.
// Searches and game-detail lookups are cached so repeated queries — and reloads
// — don't burn through the monthly RAWG quota.

interface Entry<T> {
  v: T;
  exp: number; // epoch ms when this entry expires
}

const PREFIX = "bb-cache:";
const mem = new Map<string, Entry<unknown>>();

export function cacheGet<T>(key: string): T | undefined {
  const hit = mem.get(key);
  if (hit) {
    if (Date.now() <= hit.exp) return hit.v as T;
    mem.delete(key);
  }
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return undefined;
    const entry = JSON.parse(raw) as Entry<T>;
    if (Date.now() > entry.exp) {
      localStorage.removeItem(PREFIX + key);
      return undefined;
    }
    mem.set(key, entry);
    return entry.v;
  } catch {
    return undefined;
  }
}

export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  const entry: Entry<T> = { v: value, exp: Date.now() + ttlMs };
  mem.set(key, entry);
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    /* storage full or unavailable — in-memory cache still applies */
  }
}
