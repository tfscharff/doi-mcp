import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findVerifiedPapers } from '../../src/tools/findVerifiedPapers.js';
import * as cache from '../../src/cache.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const ok = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

const parse = (result: { content: Array<{ text: string }> }) => JSON.parse(result.content[0].text);

describe('findVerifiedPapers tool (options and formatting)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    cache.clear();
  });

  it('queries only the selected source', async () => {
    mockFetch.mockImplementation(() => ok({ message: { items: [{ title: ['CR'], DOI: '10.1/cr' }] } }));

    const parsed = parse(await findVerifiedPapers({ query: 'q', source: 'crossref' }));

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toContain('api.crossref.org');
    expect(parsed.sources).toEqual(['CrossRef']);
  });

  it('passes limit and year range to the databases and caps output at limit', async () => {
    mockFetch.mockImplementation(() => ok({
      results: [
        { title: 'A', doi: 'https://doi.org/10.1/a' },
        { title: 'B', doi: 'https://doi.org/10.1/b' },
        { title: 'C', doi: 'https://doi.org/10.1/c' },
      ],
    }));

    const parsed = parse(await findVerifiedPapers({ query: 'q', source: 'openalex', limit: 2, yearFrom: 2010, yearTo: 2020 }));

    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain('per_page=2');
    expect(url).toContain('publication_year:2010-2020');
    expect(parsed.count).toBe(2);
    expect(parsed.papers.map((p: any) => p.index)).toEqual([1, 2]);
  });

  it('fills in placeholders for missing fields', async () => {
    mockFetch.mockImplementation(() => ok({ message: { items: [{ title: ['Bare'] }] } }));

    const parsed = parse(await findVerifiedPapers({ query: 'q', source: 'crossref' }));

    expect(parsed.papers[0]).toMatchObject({
      title: 'Bare',
      year: 'Unknown year',
      journal: 'Unknown journal',
      doiUrl: null,
    });
  });

  it('serves repeat queries from cache', async () => {
    mockFetch.mockImplementation(() => ok({ message: { items: [{ title: ['Cached'], DOI: '10.1/c' }] } }));

    const first = await findVerifiedPapers({ query: 'q', source: 'crossref' });
    const second = await findVerifiedPapers({ query: 'q', source: 'crossref' });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });
});
