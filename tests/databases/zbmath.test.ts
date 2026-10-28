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
    it('fetches from the zbMATH Open v1 search API', async () => {
      // Regression: the old /document/_structured_search?query= endpoint answers HTTP 400
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ result: [{ title: { title: 'Paper' } }] }),
      });

      const results = await search('riemann hypothesis', { limit: 2 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('api.zbmath.org/v1/document/_search?search_string=riemann%20hypothesis&page=0&results_per_page=2'),
        expect.any(Object)
      );
      expect(results).toHaveLength(1);
    });

    it('filters by year with the py: query syntax', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ result: [] }) });

      await search('test', { year: 1859 });

      expect(mockFetch.mock.calls[0][0]).toContain(`search_string=${encodeURIComponent('test py:1859')}`);
    });

    it('returns empty array when result is missing or null', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ result: null }) });

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
    it('normalizes a zbMATH Open document', () => {
      const normalized = normalize({
        title: { title: 'On the number of primes', subtitle: null },
        contributors: { authors: [{ name: 'Riemann, B.' }, {}] },
        year: '1859',
        links: [
          { type: 'arxiv', identifier: '0710.2066' },
          { type: 'doi', identifier: '10.1234/zb' },
        ],
        source: { series: [{ title: 'Monatsberichte' }], source: 'Monatsber. Berlin 1859' },
      });

      expect(normalized).toEqual({
        source: 'zbMATH',
        title: 'On the number of primes',
        authors: ['Riemann, B.'],
        year: 1859,
        doi: '10.1234/zb',
        journal: 'Monatsberichte',
      });
    });

    it('falls back to the source string for journal when there is no series', () => {
      expect(normalize({ source: { series: [], source: 'London: Chapman & Hall (1996)' } }).journal)
        .toBe('London: Chapman & Hall (1996)');
    });

    it('handles missing fields gracefully', () => {
      const normalized = normalize({ title: { title: null } });

      expect(normalized.source).toBe('zbMATH');
      expect(normalized.title).toBeUndefined();
      expect(normalized.authors).toBeUndefined();
      expect(normalized.year).toBeUndefined();
      expect(normalized.doi).toBeUndefined();
    });
  });
});
