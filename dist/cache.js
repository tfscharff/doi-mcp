// LRU cache for query results
const TTL = 5 * 60 * 1000; // 5 minutes
const MAX_SIZE = 100;
const cache = new Map();
export function get(key) {
    const entry = cache.get(key);
    if (!entry)
        return null;
    if (Date.now() > entry.expires) {
        cache.delete(key);
        return null;
    }
    return entry.data;
}
export function set(key, data) {
    // Evict oldest if at capacity (Map maintains insertion order)
    if (cache.size >= MAX_SIZE) {
        const oldest = cache.keys().next().value;
        if (oldest)
            cache.delete(oldest);
    }
    cache.set(key, {
        data,
        expires: Date.now() + TTL,
    });
}
export function createKey(tool, params) {
    return `${tool}:${JSON.stringify(params)}`;
}
export function clear() {
    cache.clear();
}
export function size() {
    return cache.size;
}
