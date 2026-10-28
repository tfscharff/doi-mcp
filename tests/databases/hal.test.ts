import { describe, it, expect, vi, beforeEach } from 'vitest';
import { search, normalize, config } from '../../src/databases/hal.js';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockDocs(docs: any[]) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ response: { docs } }),
  });
}

describe('hal adapter', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('config', () => {
    it('has correct metadata', () => {
      expect(config.name).toBe('hal');
      expect(config.displayName).toBe('HAL');
      expect(config.baseUrl).toBe('https://api.archives-ouvertes.fr/search');
    });
  });

  describe('search', () => {
    it('fetches from HAL API', async () => {
      mockDocs([{ title_s: ['Paper'] }]);

      const results = await search('philosophie', { limit: 2 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('api.archives-ouvertes.fr/search/?q=philosophie&wt=json&rows=2'),
        expect.any(Object)
      );
      expect(results).toHaveLength(1);
    });

    it('asks only for records with a DOI and names the fields to return', async () => {
      // Regression: without `fl`, HAL returned only docid/label_s, so no result ever had a DOI
      mockDocs([]);

      await search('test');

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('&fq=doiId_s:*');
      expect(url).toMatch(/&fl=[^&]*doiId_s/);
      expect(url).toMatch(/&fl=[^&]*title_s/);
    });

    it.each([
      [{ year: 2020 }, 'fq=publicationDateY_i:2020'],
      [{ yearFrom: 2015, yearTo: 2020 }, 'fq=publicationDateY_i:[2015 TO 2020]'],
      [{ yearFrom: 2015 }, 'fq=publicationDateY_i:[2015 TO *]'],
      [{ yearTo: 2020 }, 'fq=publicationDateY_i:[* TO 2020]'],
    ])('applies year filter %o', async (options, expected) => {
      mockDocs([]);

      await search('test', options);

      expect(mockFetch.mock.calls[0][0]).toContain(expected);
    });

    it('returns empty array when response has no docs', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

      expect(await search('test')).toEqual([]);
    });

    it('throws API_ERROR on HTTP failure', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' });

      await expect(search('test')).rejects.toMatchObject({ code: 'API_ERROR', database: 'HAL' });
    });

    it('throws ABORTED when the request is aborted', async () => {
      mockFetch.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));

      await expect(search('test')).rejects.toMatchObject({ code: 'ABORTED' });
    });
  });

  describe('normalize', () => {
    it('normalizes HAL doc format', () => {
      const normalized = normalize({
        title_s: ['Titre français'],
        en_title_s: ['English title'],
        authFullName_s: ['Marie Curie'],
        publicationDateY_i: 1903,
        doiId_s: '10.1234/hal',
        journalTitle_s: 'Comptes Rendus',
        abstract_s: ['Résumé'],
      });

      expect(normalized).toEqual({
        source: 'HAL',
        title: 'Titre français',
        authors: ['Marie Curie'],
        year: 1903,
        doi: '10.1234/hal',
        journal: 'Comptes Rendus',
        abstract: 'Résumé',
      });
    });

    it('falls back to English title/abstract and book title', () => {
      const normalized = normalize({
        en_title_s: ['English title'],
        en_abstract_s: ['English abstract'],
        bookTitle_s: 'Proceedings',
      });

      expect(normalized.title).toBe('English title');
      expect(normalized.abstract).toBe('English abstract');
      expect(normalized.journal).toBe('Proceedings');
    });

    it('handles missing fields gracefully', () => {
      const normalized = normalize({});

      expect(normalized.source).toBe('HAL');
      expect(normalized.title).toBeUndefined();
      expect(normalized.abstract).toBeUndefined();
    });
  });
});
