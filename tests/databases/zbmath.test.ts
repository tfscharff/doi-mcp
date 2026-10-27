import { describe, it, expect, vi, beforeEach } from 'vitest';
import { search, normalize, config } from '../../src/databases/zbmath.js';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('zbmath adapter', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('config', () => {
    it('has correct metadata', () => {
      expect(config.name).toBe('zbmath');
      expect(config.displayName).toBe('zbMATH');
      expect(config.baseUrl).toBe('https://api.zbmath.org');
    });
  });

  describe('search', () => {
    it('fetches from zbMATH API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ result: [{ title: 'Paper' }] }),
      });

      const results = await search('riemann hypothesis', { limit: 2 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('api.zbmath.org/document/_structured_search?query=riemann%20hypothesis&results_per_page=2'),
        expect.any(Object)
      );
      expect(results).toHaveLength(1);
    });

    it('includes year filter when provided', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ result: [] }) });

      await search('test', { year: 1859 });

      expect(mockFetch.mock.calls[0][0]).toContain('&year=1859');
    });

    it('returns empty array when response has no result', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

      expect(await search('test')).toEqual([]);
    });

    it('throws API_ERROR on HTTP failure', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' });

      await expect(search('test')).rejects.toMatchObject({ code: 'API_ERROR', database: 'zbMATH' });
    });

    it('throws ABORTED when the request is aborted', async () => {
      mockFetch.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));

      await expect(search('test')).rejects.toMatchObject({ code: 'ABORTED' });
    });
  });

  describe('normalize', () => {
    it('normalizes zbMATH result with mixed author formats', () => {
      const normalized = normalize({
        title: 'On the number of primes',
        authors: [{ name: 'Riemann, B.' }, 'Euler, L.', {}],
        year: 1859,
        doi: '10.1234/zb',
        source: 'Monatsber. Berlin',
      });

      expect(normalized).toEqual({
        source: 'zbMATH',
        title: 'On the number of primes',
        authors: ['Riemann, B.', 'Euler, L.'],
        year: 1859,
        doi: '10.1234/zb',
        journal: 'Monatsber. Berlin',
      });
    });

    it('falls back to publication_year and journal', () => {
      const normalized = normalize({ publication_year: 2001, journal: 'Ann. Math.' });

      expect(normalized.year).toBe(2001);
      expect(normalized.journal).toBe('Ann. Math.');
    });

    it('handles missing fields gracefully', () => {
      const normalized = normalize({});

      expect(normalized.source).toBe('zbMATH');
      expect(normalized.authors).toBeUndefined();
      expect(normalized.year).toBeUndefined();
    });
  });
});
