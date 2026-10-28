import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { search, normalize, config, RETRY_DELAY_MS } from '../../src/databases/semanticscholar.js';

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
      mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' });

      await expect(search('test')).rejects.toMatchObject({ code: 'API_ERROR', database: 'Semantic Scholar' });
    });

    describe('rate limits and API key', () => {
      const rateLimited = { ok: false, status: 429, statusText: '' };

      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
        delete process.env.SEMANTIC_SCHOLAR_API_KEY;
      });

      it('retries a keyless 429 once after a delay and returns the retry\'s results', async () => {
        mockFetch
          .mockResolvedValueOnce(rateLimited)
          .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ data: [{ title: 'Second try' }] }) });

        const pending = search('test');
        await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS - 1);
        expect(mockFetch).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);

        expect(await pending).toEqual([{ title: 'Second try' }]);
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });

      it('throws RATE_LIMITED with a hint to set an API key when the retry is also limited', async () => {
        mockFetch.mockResolvedValue(rateLimited);

        const pending = expect(search('test')).rejects.toMatchObject({
          code: 'RATE_LIMITED',
          database: 'Semantic Scholar',
          message: expect.stringContaining('set SEMANTIC_SCHOLAR_API_KEY'),
        });
        await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS);
        await pending;

        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(mockFetch.mock.calls[0][1].headers).not.toHaveProperty('x-api-key');
      });

      it('does not retry errors other than 429', async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 503, statusText: 'Service Unavailable' });

        await expect(search('test')).rejects.toMatchObject({ code: 'API_ERROR' });
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      it('sends SEMANTIC_SCHOLAR_API_KEY as x-api-key and does not retry a keyed 429', async () => {
        process.env.SEMANTIC_SCHOLAR_API_KEY = 'k123';
        mockFetch.mockResolvedValue(rateLimited);

        await expect(search('test')).rejects.toMatchObject({
          code: 'RATE_LIMITED',
          message: expect.stringContaining("the API key's quota is exhausted"),
        });
        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch.mock.calls[0][1].headers['x-api-key']).toBe('k123');
      });
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
