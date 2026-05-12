import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as cache from '../../src/cache.js';

describe('cache', () => {
  beforeEach(() => {
    cache.clear();
  });

  it('returns null for missing keys', () => {
    expect(cache.get('nonexistent')).toBeNull();
  });

  it('stores and retrieves values', () => {
    cache.set('key1', { data: 'test' });
    expect(cache.get('key1')).toEqual({ data: 'test' });
  });

  it('returns null for expired entries', () => {
    vi.useFakeTimers();

    cache.set('key1', 'value');
    expect(cache.get('key1')).toBe('value');

    // Advance time past TTL (5 minutes)
    vi.advanceTimersByTime(6 * 60 * 1000);

    expect(cache.get('key1')).toBeNull();

    vi.useRealTimers();
  });

  it('evicts oldest entry when at capacity', () => {
    // Fill cache to capacity (100 entries)
    for (let i = 0; i < 100; i++) {
      cache.set(`key${i}`, `value${i}`);
    }

    expect(cache.size()).toBe(100);
    expect(cache.get('key0')).toBe('value0');

    // Add one more entry
    cache.set('key100', 'value100');

    // Oldest entry should be evicted
    expect(cache.size()).toBe(100);
    expect(cache.get('key0')).toBeNull();
    expect(cache.get('key100')).toBe('value100');
  });

  it('createKey generates consistent keys', () => {
    const key1 = cache.createKey('tool', { a: 1, b: 2 });
    const key2 = cache.createKey('tool', { a: 1, b: 2 });
    expect(key1).toBe(key2);
  });

  it('createKey generates different keys for different params', () => {
    const key1 = cache.createKey('tool', { a: 1 });
    const key2 = cache.createKey('tool', { a: 2 });
    expect(key1).not.toBe(key2);
  });

  it('clear removes all entries', () => {
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    expect(cache.size()).toBe(2);

    cache.clear();
    expect(cache.size()).toBe(0);
  });
});
