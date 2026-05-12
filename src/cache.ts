// LRU cache for query results

const TTL = 5 * 60 * 1000; // 5 minutes
const MAX_SIZE = 100;

interface CacheEntry<T> {
  data: T;
  expires: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

export function get<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expires) {
    cache.delete(key);
    return null;
  }

  return entry.data as T;
}

export function set<T>(key: string, data: T): void {
  // Evict oldest if at capacity (Map maintains insertion order)
  if (cache.size >= MAX_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }

  cache.set(key, {
    data,
    expires: Date.now() + TTL,
  });
}

export function createKey(tool: string, params: Record<string, unknown>): string {
  return `${tool}:${JSON.stringify(params)}`;
}

export function clear(): void {
  cache.clear();
}

export function size(): number {
  return cache.size;
}
