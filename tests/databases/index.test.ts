import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchMultipleSources, deduplicatePapers, allDatabases, OVERFETCH_FACTOR } from '../../src/databases/index.js';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

const ok = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
const okText = (text: string) => Promise.resolve({ ok: true, text: () => Promise.resolve(text) });
const empty = () => ok({});

describe('allDatabases', () => {
  it('lists all 8 databases with metadata', () => {
    expect(allDatabases).toHaveLength(8);
    expect(allDatabases.map(d => d.name)).toEqual([
      'crossref', 'openalex', 'pubmed', 'semanticscholar', 'zbmath', 'eric', 'hal', 'inspirehep',
    ]);
    for (const db of allDatabases) {
      expect(db.displayName).toBeTruthy();
      expect(db.coverage).toBeTruthy();
      expect(db.baseUrl).toMatch(/^https:\/\//);
    }
  });
});

describe('searchMultipleSources', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('queries every database in parallel by default', async () => {
    mockFetch.mockImplementation(empty);

    const { results, errors, sources } = await searchMultipleSources('test');

    expect(results).toEqual([]);
    expect(errors).toEqual([]);
    expect(sources).toEqual(allDatabases.map(d => d.displayName));
  });

  it('restricts queries to the requested sources', async () => {
    mockFetch.mockImplementation(() => ok({ message: { items: [{ title: ['Only CrossRef'], DOI: '10.1/only' }] } }));

    const { results, sources } = await searchMultipleSources('test', { sources: ['crossref'] });

    expect(sources).toEqual(['CrossRef']);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(results).toEqual([expect.objectContaining({ source: 'CrossRef', title: 'Only CrossRef' })]);
  });

  it('passes year and an over-fetched limit through to adapters', async () => {
    mockFetch.mockImplementation(empty);

    await searchMultipleSources('test', { year: 2020, limit: 7, sources: ['crossref'] });

    const url = mockFetch.mock.calls[0][0];
    expect(url).toContain(`rows=${7 * OVERFETCH_FACTOR}`);
    expect(url).toContain('from-pub-date:2020');
  });

  it('over-fetches so DOI-less top hits do not empty a source, then trims each source to limit', async () => {
    // Top two hits lack DOIs; a plain limit of 2 would have returned nothing
    const items = [
      { title: ['No DOI 1'] },
      { title: ['No DOI 2'] },
      { title: ['A'], DOI: '10.1/a' },
      { title: ['B'], DOI: '10.1/b' },
      { title: ['C'], DOI: '10.1/c' },
    ];
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('crossref')) return ok({ message: { items } });
      return ok({ results: [{ title: 'OA', doi: 'https://doi.org/10.2/oa' }] });
    });

    const { results } = await searchMultipleSources('test', { limit: 2, sources: ['crossref', 'openalex'] });

    expect(results.map(r => r.title)).toEqual(['A', 'B', 'OA']);
  });

  it('collects per-database errors without failing the whole search', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('crossref')) return ok({ message: { items: [{ title: ['Good'], DOI: '10.1/good' }] } });
      if (url.includes('openalex')) return Promise.resolve({ ok: false, status: 500, statusText: 'Server Error' });
      return empty();
    });

    const { results, errors } = await searchMultipleSources('test', { sources: ['crossref', 'openalex'] });

    expect(results).toHaveLength(1);
    expect(errors).toEqual([
      { database: 'OpenAlex', code: 'API_ERROR', message: 'HTTP 500: Server Error' },
    ]);
  });

  it('defaults error code and message when an adapter throws a bare object', async () => {
    mockFetch.mockImplementation(() => Promise.resolve({ ok: true, json: () => Promise.reject({}) }));

    const { errors } = await searchMultipleSources('test', { sources: ['crossref'] });

    expect(errors).toEqual([{ database: 'CrossRef', code: 'API_ERROR', message: 'Unknown error' }]);
  });

  it('fetches DOIs for PubMed results via efetch', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('esearch')) return ok({ esearchresult: { idlist: ['111'] } });
      if (url.includes('esummary')) return ok({ result: { '111': { uid: '111', title: 'PubMed Paper' } } });
      if (url.includes('efetch')) {
        return okText('<PubmedArticle><PMID>111</PMID><ArticleId IdType="doi">10.1/pm</ArticleId></PubmedArticle>');
      }
      return empty();
    });

    const { results } = await searchMultipleSources('test', { sources: ['pubmed'] });

    expect(results).toEqual([
      expect.objectContaining({ source: 'PubMed', title: 'PubMed Paper', doi: '10.1/pm' }),
    ]);
    expect(mockFetch.mock.calls.some(([url]) => url.includes('efetch'))).toBe(true);
  });
});

describe('deduplicatePapers', () => {
  it('removes duplicates by DOI, keeping the first occurrence', () => {
    const papers = [
      { source: 'A', doi: '10.1/x', title: 'One' },
      { source: 'B', doi: '10.1/x', title: 'One (dup)' },
    ];

    expect(deduplicatePapers(papers)).toEqual([papers[0]]);
  });

  it('falls back to case-insensitive title when there is no DOI', () => {
    const papers = [
      { source: 'A', title: 'Same Title' },
      { source: 'B', title: 'same title' },
      { source: 'C', title: 'Different' },
    ];

    expect(deduplicatePapers(papers).map(p => p.source)).toEqual(['A', 'C']);
  });

  it('drops papers with neither DOI nor title', () => {
    expect(deduplicatePapers([{ source: 'A' }])).toEqual([]);
  });
});

describe('searchMultipleSources (DOI-only scope)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('drops results that have no DOI', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('crossref')) return ok({ message: { items: [{ title: ['Has DOI'], DOI: '10.1/yes' }, { title: ['No DOI'] }] } });
      if (url.includes('openalex')) return ok({ results: [{ title: 'OpenAlex no DOI' }] });
      return empty();
    });

    const { results } = await searchMultipleSources('test', { sources: ['crossref', 'openalex'] });

    expect(results.map(r => r.title)).toEqual(['Has DOI']);
  });
});
