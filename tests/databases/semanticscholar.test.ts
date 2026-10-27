import { describe, it, expect, vi, beforeEach } from 'vitest';
import { search, normalize, config } from '../../src/databases/semanticscholar.js';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockData(data: any[]) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ data }),
  });
}

describe('semanticscholar adapter', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('config', () => {
    it('has correct metadata', () => {
      expect(config.name).toBe('semanticscholar');
      expect(config.displayName).toBe('Semantic Scholar');
      expect(config.baseUrl).toBe('https://api.semanticscholar.org/graph/v1');
    });
  });

  describe('search', () => {
    it('fetches from Semantic Scholar API with the needed fields', async () => {
      mockData([{ title: 'Paper' }]);

      const results = await search('transformers', { limit: 4 });

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('api.semanticscholar.org/graph/v1/paper/search?query=transformers&limit=4');
      expect(url).toContain('fields=paperId,title,authors,year,externalIds,venue,abstract');
      expect(results).toHaveLength(1);
    });

    it.each([
      [{ year: 2020 }, '&year=2020'],
      [{ yearFrom: 2015, yearTo: 2020 }, '&year=2015-2020'],
      [{ yearFrom: 2015 }, '&year=2015-'],
      [{ yearTo: 2020 }, '&year=-2020'],
    ])('applies year filter %o', async (options, expected) => {
      mockData([]);

      await search('test', options);

      expect(mockFetch.mock.calls[0][0]).toContain(expected);
    });

    it('returns empty array when response has no data', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

      expect(await search('test')).toEqual([]);
    });

    it('throws API_ERROR on HTTP failure', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 429, statusText: 'Too Many Requests' });

      await expect(search('test')).rejects.toMatchObject({ code: 'API_ERROR', database: 'Semantic Scholar' });
    });

    it('throws ABORTED when the request is aborted', async () => {
      mockFetch.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));

      await expect(search('test')).rejects.toMatchObject({ code: 'ABORTED' });
    });
  });

  describe('normalize', () => {
    it('normalizes Semantic Scholar paper format', () => {
      const normalized = normalize({
        paperId: 'abc123',
        title: 'Attention Is All You Need',
        authors: [{ name: 'Ashish Vaswani' }, {}],
        year: 2017,
        externalIds: { DOI: '10.5555/3295222' },
        venue: 'NeurIPS',
        abstract: 'The dominant sequence transduction models...',
      });

      expect(normalized).toEqual({
        source: 'Semantic Scholar',
        title: 'Attention Is All You Need',
        authors: ['Ashish Vaswani'],
        year: 2017,
        doi: '10.5555/3295222',
        journal: 'NeurIPS',
        abstract: 'The dominant sequence transduction models...',
      });
    });

    it('handles missing fields gracefully', () => {
      const normalized = normalize({});

      expect(normalized.source).toBe('Semantic Scholar');
      expect(normalized.authors).toBeUndefined();
      expect(normalized.doi).toBeUndefined();
    });
  });
});
