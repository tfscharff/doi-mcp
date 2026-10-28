import { describe, it, expect, vi, beforeEach } from 'vitest';
import { search, normalize, config } from '../../src/databases/inspirehep.js';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockHits(hits: any[]) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ hits: { hits } }),
  });
}

describe('inspirehep adapter', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('config', () => {
    it('has correct metadata', () => {
      expect(config.name).toBe('inspirehep');
      expect(config.displayName).toBe('INSPIRE-HEP');
      expect(config.baseUrl).toBe('https://inspirehep.net/api/literature');
    });
  });

  describe('search', () => {
    it('fetches from INSPIRE-HEP API', async () => {
      mockHits([{ metadata: {} }]);

      const results = await search('higgs boson', { limit: 5 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('inspirehep.net/api/literature?q=higgs%20boson&size=5'),
        expect.any(Object)
      );
      // Relevance order: `sort=mostrecent` surfaced new preprints that have no DOI yet
      expect(mockFetch.mock.calls[0][0]).not.toContain('sort=');
      expect(results).toHaveLength(1);
    });

    it.each([
      [{ year: 2012 }, 'q=x and date 2012'],
      [{ yearFrom: 2010, yearTo: 2012 }, 'q=x and date 2010--2012'],
      [{ yearFrom: 2010 }, 'q=x and date 2010--'],
      [{ yearTo: 2012 }, 'q=x and date --2012'],
    ])('applies date filter %o', async (options, expected) => {
      mockHits([]);

      await search('x', options);

      expect(decodeURIComponent(mockFetch.mock.calls[0][0])).toContain(expected);
    });

    it('returns empty array when response has no hits', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

      expect(await search('test')).toEqual([]);
    });

    it('throws API_ERROR on HTTP failure', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' });

      await expect(search('test')).rejects.toMatchObject({ code: 'API_ERROR', database: 'INSPIRE-HEP' });
    });

    it('throws ABORTED when the request is aborted', async () => {
      mockFetch.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));

      await expect(search('test')).rejects.toMatchObject({ code: 'ABORTED' });
    });
  });

  describe('normalize', () => {
    it('normalizes INSPIRE-HEP hit format', () => {
      const normalized = normalize({
        metadata: {
          titles: [{ title: 'Observation of a new boson' }],
          authors: [{ full_name: 'Aad, G.' }, {}],
          publication_info: [{ year: '2012', journal_title: 'Phys.Lett.B' }],
          dois: [{ value: '10.1016/j.physletb.2012.08.020' }],
          abstracts: [{ value: 'Abstract text' }],
        },
      });

      expect(normalized).toEqual({
        source: 'INSPIRE-HEP',
        title: 'Observation of a new boson',
        authors: ['Aad, G.'],
        year: 2012,
        doi: '10.1016/j.physletb.2012.08.020',
        journal: 'Phys.Lett.B',
        abstract: 'Abstract text',
      });
    });

    it('falls back to preprint date and conference title', () => {
      const normalized = normalize({
        metadata: {
          preprint_date: '2019-06-15',
          publication_info: [{ conference_record: { titles: [{ title: 'ICHEP 2019' }] } }],
        },
      });

      expect(normalized.year).toBe(2019);
      expect(normalized.journal).toBe('ICHEP 2019');
    });

    it('handles missing metadata gracefully', () => {
      const normalized = normalize({});

      expect(normalized.source).toBe('INSPIRE-HEP');
      expect(normalized.title).toBeUndefined();
      expect(normalized.year).toBeUndefined();
      expect(normalized.authors).toBeUndefined();
    });
  });
});
