import { describe, it, expect, vi, beforeEach } from 'vitest';
import { search, normalize, config } from '../../src/databases/eric.js';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('eric adapter', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('config', () => {
    it('has correct metadata', () => {
      expect(config.name).toBe('eric');
      expect(config.displayName).toBe('ERIC');
      expect(config.baseUrl).toBe('https://api.ies.ed.gov/eric');
    });
  });

  describe('search', () => {
    it('fetches from ERIC API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ response: { docs: [{ title: 'Reading Fluency' }] } }),
      });

      const results = await search('reading fluency', { limit: 4 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('api.ies.ed.gov/eric/?search=reading%20fluency&rows=4&format=json'),
        expect.any(Object)
      );
      expect(results).toEqual([{ title: 'Reading Fluency' }]);
    });

    it('returns empty array when response has no docs', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

      expect(await search('test')).toEqual([]);
    });

    it('throws API_ERROR on HTTP failure', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' });

      await expect(search('test')).rejects.toMatchObject({ code: 'API_ERROR', database: 'ERIC' });
    });

    it('throws ABORTED when the request is aborted', async () => {
      mockFetch.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));

      await expect(search('test')).rejects.toMatchObject({ code: 'ABORTED' });
    });
  });

  describe('normalize', () => {
    it('normalizes ERIC doc format', () => {
      const normalized = normalize({
        title: 'Reading Fluency in Grade 3',
        author: ['Smith, Jane', '', 'Doe, John'],
        publicationdateyear: '2019',
        doi: '10.1234/eric',
        source: 'Journal of Education',
      });

      expect(normalized).toEqual({
        source: 'ERIC',
        title: 'Reading Fluency in Grade 3',
        authors: ['Smith, Jane', 'Doe, John'],
        year: 2019,
        doi: '10.1234/eric',
        journal: 'Journal of Education',
      });
    });

    it('falls back to publicationtype for journal', () => {
      expect(normalize({ publicationtype: 'Reports - Research' }).journal).toBe('Reports - Research');
    });

    it('handles missing fields gracefully', () => {
      const normalized = normalize({});

      expect(normalized.source).toBe('ERIC');
      expect(normalized.authors).toBeUndefined();
      expect(normalized.year).toBeUndefined();
    });
  });
});
