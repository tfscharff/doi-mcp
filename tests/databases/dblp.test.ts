import { describe, it, expect, vi, beforeEach } from 'vitest';
import { search, normalize, config } from '../../src/databases/dblp.js';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockHits(hits: any[]) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ result: { hits: { hit: hits } } }),
  });
}

describe('dblp adapter', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('config', () => {
    it('has correct metadata', () => {
      expect(config.name).toBe('dblp');
      expect(config.displayName).toBe('DBLP');
      expect(config.baseUrl).toBe('https://dblp.org');
    });
  });

  describe('search', () => {
    it('fetches from DBLP API with limit', async () => {
      mockHits([{ info: { title: 'Paper' } }]);

      const results = await search('neural nets', { limit: 7 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('dblp.org/search/publ/api?q=neural%20nets&format=json&h=7'),
        expect.any(Object)
      );
      expect(results).toHaveLength(1);
    });

    it('returns empty array when response has no hits', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

      expect(await search('test')).toEqual([]);
    });

    it('filters by year range client-side, keeping hits without a year', async () => {
      mockHits([
        { info: { title: 'Old', year: '2010' } },
        { info: { title: 'In range', year: '2020' } },
        { info: { title: 'New', year: '2025' } },
        { info: { title: 'No year' } },
      ]);

      const results = await search('test', { yearFrom: 2015, yearTo: 2022 });

      expect(results.map(r => r.info?.title)).toEqual(['In range', 'No year']);
    });

    it('applies an open-ended yearFrom or yearTo filter', async () => {
      const hits = [{ info: { year: '2010' } }, { info: { year: '2020' } }];

      mockHits(hits);
      expect((await search('test', { yearFrom: 2015 })).map(r => r.info?.year)).toEqual(['2020']);

      mockHits(hits);
      expect((await search('test', { yearTo: 2015 })).map(r => r.info?.year)).toEqual(['2010']);
    });

    it('throws API_ERROR on HTTP failure', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' });

      await expect(search('test')).rejects.toMatchObject({
        code: 'API_ERROR',
        database: 'DBLP',
        message: 'HTTP 500: Internal Server Error',
      });
    });

    it('throws ABORTED when the request is aborted', async () => {
      mockFetch.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));

      await expect(search('test')).rejects.toMatchObject({ code: 'ABORTED' });
    });
  });

  describe('normalize', () => {
    it('normalizes DBLP hit with object authors', () => {
      const normalized = normalize({
        info: {
          title: 'Attention Is All You Need',
          authors: { author: [{ text: 'Ashish Vaswani' }, { text: '' }, 'Noam Shazeer'] },
          year: '2017',
          doi: '10.5555/3295222',
          venue: 'NeurIPS',
        },
      });

      expect(normalized).toEqual({
        source: 'DBLP',
        title: 'Attention Is All You Need',
        authors: ['Ashish Vaswani', 'Noam Shazeer'],
        year: 2017,
        doi: '10.5555/3295222',
        journal: 'NeurIPS',
      });
    });

    it('handles a single string author', () => {
      expect(normalize({ info: { authors: { author: 'Solo Author' } } }).authors).toEqual(['Solo Author']);
    });

    it('handles missing fields gracefully', () => {
      const normalized = normalize({});

      expect(normalized.source).toBe('DBLP');
      expect(normalized.title).toBeUndefined();
      expect(normalized.authors).toEqual([]);
      expect(normalized.year).toBeUndefined();
    });
  });
});
