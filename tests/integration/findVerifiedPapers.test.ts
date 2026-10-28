import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findVerifiedPapers } from '../../src/tools/findVerifiedPapers.js';
import * as cache from '../../src/cache.js';
import { OVERFETCH_FACTOR } from '../../src/databases/index.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const ok = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
const status = (code: number, statusText = '') => Promise.resolve({ ok: false, status: code, statusText });

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
    expect(url).toContain(`per_page=${2 * OVERFETCH_FACTOR}`);
    expect(url).toContain('publication_year:2010-2020');
    expect(parsed.count).toBe(2);
    expect(parsed.papers.map((p: any) => p.index)).toEqual([1, 2]);
  });

  it('fills in placeholders for missing fields', async () => {
    mockFetch.mockImplementation(() => ok({ message: { items: [{ title: ['Bare'], DOI: '10.1/bare' }] } }));

    const parsed = parse(await findVerifiedPapers({ query: 'q', source: 'crossref' }));

    expect(parsed.papers[0]).toMatchObject({
      title: 'Bare',
      year: 'Unknown year',
      journal: 'Unknown journal',
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

describe('findVerifiedPapers tool (database errors)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    cache.clear();
  });

  it('names the failed databases and why, as an error, when every database failed', async () => {
    // Regression: failures were swallowed into "No verified papers found for this query"
    mockFetch.mockImplementation(() => status(429));

    const result = await findVerifiedPapers({ query: 'q', source: 'semanticscholar' });
    const parsed = parse(result);

    expect(result.isError).toBe(true);
    expect(parsed.count).toBe(0);
    expect(parsed.message).toContain('Every database queried failed');
    expect(parsed.message).toContain('Semantic Scholar (HTTP 429: rate limited');
    expect(parsed.errors).toEqual([expect.objectContaining({ database: 'Semantic Scholar', code: 'RATE_LIMITED' })]);
  });

  it('separates failed databases from ones that answered with nothing', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('crossref')) return ok({ message: { items: [] } });
      return status(503, 'Service Unavailable');
    });

    const result = await findVerifiedPapers({ query: 'q', source: 'all' });
    const parsed = parse(result);

    expect(result.isError).toBeUndefined();
    expect(parsed.message).toMatch(/^No papers with a DOI found in the databases that responded\. These failed: /);
    expect(parsed.message).toContain('OpenAlex (HTTP 503: Service Unavailable)');
    expect(parsed.errors.map((e: any) => e.database)).not.toContain('CrossRef');
    expect(parsed.sourcesQueried).toHaveLength(8);
  });

  it('reports a plain no-results message without errors when every database answered', async () => {
    mockFetch.mockImplementation(() => ok({ message: { items: [] } }));

    const parsed = parse(await findVerifiedPapers({ query: 'q', source: 'crossref' }));

    expect(parsed.message).toBe('No papers with a DOI found for this query in any database.');
    expect(parsed.errors).toBeUndefined();
  });

  it('lists failures alongside partial results and does not cache them', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('crossref')) return ok({ message: { items: [{ title: ['Got'], DOI: '10.1/got' }] } });
      return status(500, 'Server Error');
    });

    const parsed = parse(await findVerifiedPapers({ query: 'q' }));
    await findVerifiedPapers({ query: 'q' });

    expect(parsed.papers.map((p: any) => p.title)).toEqual(['Got']);
    expect(parsed.errors).toContainEqual({ database: 'OpenAlex', code: 'API_ERROR', message: 'HTTP 500: Server Error' });
    // Second call went back to the databases instead of the cache
    expect(mockFetch.mock.calls.filter(([url]) => url.includes('crossref'))).toHaveLength(2);
  });
});

describe('findVerifiedPapers tool (DOI-only scope)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    cache.clear();
  });

  it('returns only papers that have a DOI, each with a doiUrl', async () => {
    mockFetch.mockImplementation(() => ok({ message: { items: [{ title: ['With'], DOI: '10.1/w' }, { title: ['Without'] }] } }));

    const parsed = parse(await findVerifiedPapers({ query: 'q', source: 'crossref' }));

    expect(parsed.papers.map((p: any) => p.title)).toEqual(['With']);
    expect(parsed.papers[0].doiUrl).toBe('https://doi.org/10.1/w');
  });
});
