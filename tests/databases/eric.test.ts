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

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain(`api.ies.ed.gov/eric/?search=${encodeURIComponent('(reading fluency) AND url:*doi.org*')}&rows=4&format=json`);
      // ERIC has no DOI field; it only returns `url` (where DOIs live) when asked
      expect(url).toMatch(/&fields=[^&]*url/);
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
        publicationdateyear: 2019,
        url: 'http://dx.doi.org/10.1234/eric.5(2)',
        source: 'Journal of Education',
      });

      expect(normalized).toEqual({
        source: 'ERIC',
        title: 'Reading Fluency in Grade 3',
        authors: ['Smith, Jane', 'Doe, John'],
        year: 2019,
        doi: '10.1234/eric.5(2)',
        journal: 'Journal of Education',
      });
    });

    it('reads the DOI from https://doi.org links and accepts a string year', () => {
      const normalized = normalize({ url: 'https://doi.org/10.5860/crl-236', publicationdateyear: '2001' });

      expect(normalized.doi).toBe('10.5860/crl-236');
      expect(normalized.year).toBe(2001);
    });

    it('has no DOI when the url is not a doi.org link', () => {
      expect(normalize({ url: 'https://files.eric.ed.gov/fulltext/ED1.pdf' }).doi).toBeUndefined();
    });

    it('falls back to the first publicationtype for journal', () => {
      expect(normalize({ publicationtype: ['Reports - Research', 'Journal Articles'] }).journal).toBe('Reports - Research');
      expect(normalize({ publicationtype: 'Books' }).journal).toBe('Books');
    });

    it('handles missing fields gracefully', () => {
      const normalized = normalize({});

      expect(normalized.source).toBe('ERIC');
      expect(normalized.authors).toBeUndefined();
      expect(normalized.year).toBeUndefined();
    });
  });
});
