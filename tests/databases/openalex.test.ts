import { describe, it, expect, vi, beforeEach } from 'vitest';
import { search, normalize, config } from '../../src/databases/openalex.js';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockResults(results: any[]) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ results }),
  });
}

describe('openalex adapter', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('config', () => {
    it('has correct metadata', () => {
      expect(config.name).toBe('openalex');
      expect(config.displayName).toBe('OpenAlex');
      expect(config.baseUrl).toBe('https://api.openalex.org');
    });
  });

  describe('search', () => {
    it('fetches from OpenAlex API with a User-Agent header', async () => {
      mockResults([{ title: 'Paper' }]);

      const results = await search('graphene', { limit: 6 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('api.openalex.org/works?search=graphene&per_page=6'),
        expect.objectContaining({
          headers: expect.objectContaining({ 'User-Agent': expect.stringContaining('mailto:') }),
        })
      );
      expect(results).toHaveLength(1);
    });

    it.each([
      [{ year: 2020 }, 'filter=publication_year:2020'],
      [{ yearFrom: 2015, yearTo: 2020 }, 'filter=publication_year:2015-2020'],
      [{ yearFrom: 2015 }, 'filter=publication_year:>2014'],
      [{ yearTo: 2020 }, 'filter=publication_year:<2021'],
    ])('applies year filter %o', async (options, expected) => {
      mockResults([]);

      await search('test', options);

      expect(mockFetch.mock.calls[0][0]).toContain(expected);
    });

    it('returns empty array when response has no results', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

      expect(await search('test')).toEqual([]);
    });

    it('throws API_ERROR on HTTP failure', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 429, statusText: 'Too Many Requests' });

      await expect(search('test')).rejects.toMatchObject({ code: 'API_ERROR', database: 'OpenAlex' });
    });

    it('throws ABORTED when the request is aborted', async () => {
      mockFetch.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));

      await expect(search('test')).rejects.toMatchObject({ code: 'ABORTED' });
    });
  });

  describe('normalize', () => {
    it('normalizes OpenAlex work and reconstructs the abstract', () => {
      const normalized = normalize({
        title: 'Graphene Paper',
        authorships: [{ author: { display_name: 'Andre Geim' } }, { author: {} }],
        publication_year: 2004,
        doi: 'https://doi.org/10.1126/science.1102896',
        primary_location: { source: { display_name: 'Science' } },
        abstract_inverted_index: { world: [1], hello: [0], again: [2] },
      });

      expect(normalized).toEqual({
        source: 'OpenAlex',
        title: 'Graphene Paper',
        authors: ['Andre Geim'],
        year: 2004,
        doi: '10.1126/science.1102896',
        journal: 'Science',
        abstract: 'hello world again',
      });
    });

    it('places repeated words at every position in the abstract', () => {
      const normalized = normalize({ abstract_inverted_index: { the: [0, 2], cat: [1], hat: [3] } });

      expect(normalized.abstract).toBe('the cat the hat');
    });

    it('handles missing fields gracefully', () => {
      const normalized = normalize({});

      expect(normalized.source).toBe('OpenAlex');
      expect(normalized.doi).toBeUndefined();
      expect(normalized.abstract).toBeUndefined();
    });
  });
});
