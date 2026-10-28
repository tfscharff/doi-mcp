import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyCitation } from '../../src/tools/verifyCitation.js';
import * as cache from '../../src/cache.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const ok = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
const notFound = () => Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' });

// CrossRef returns the given items; doi.org 404s; every other database is empty
function mockCrossRefOnly(items: any[]) {
  mockFetch.mockImplementation((url: string) => {
    if (url.startsWith('https://doi.org/')) return notFound();
    if (url.includes('crossref')) return ok({ message: { items } });
    return ok({});
  });
}

const parse = (result: { content: Array<{ text: string }> }) => JSON.parse(result.content[0].text);

describe('verifyCitation tool (scoring paths)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    cache.clear();
  });

  it('normalizes DOI.org CSL-JSON metadata', async () => {
    mockFetch.mockImplementation(() => ok({
      title: ['Array Title'],
      author: [{ family: 'Solo' }],
      issued: { 'date-parts': [[2001]] },
      DOI: '10.1/x',
      'container-title': ['Journal A'],
      abstract: '<jats:p>Plain</jats:p>',
    }));

    const parsed = parse(await verifyCitation({ doi: 'https://dx.doi.org/10.1/x' }));

    expect(mockFetch.mock.calls[0][0]).toBe('https://doi.org/10.1/x');
    expect(parsed).toMatchObject({
      verified: true,
      title: 'Array Title',
      authors: ['Solo'],
      year: 2001,
      journal: 'Journal A',
      abstractFromArticle: 'Plain',
      doiUrl: 'https://doi.org/10.1/x',
    });
  });

  it('falls back to database search when DOI lookup fails', async () => {
    mockCrossRefOnly([{ title: ['Deep Learning'], published: { 'date-parts': [[2015]] }, DOI: '10.1/dl' }]);

    const parsed = parse(await verifyCitation({ doi: '10.1/bad', title: 'Deep Learning', year: 2015 }));

    expect(parsed.verified).toBe(true);
    expect(parsed.source).toBe('CrossRef');
    expect(parsed.doi).toBe('10.1/dl');
  });

  it('reports high confidence when score reaches the high-confidence threshold', async () => {
    mockCrossRefOnly([{ title: ['Deep Learning'], published: { 'date-parts': [[2015]] }, DOI: '10.1/dl' }]);

    const parsed = parse(await verifyCitation({ title: 'Deep Learning', year: 2015 }));

    expect(parsed.confidence).toBe('high');
    expect(parsed.message).toContain('high confidence');
    expect(parsed.doiUrl).toBe('https://doi.org/10.1/dl');
  });

  it('reports medium confidence for a title-only match', async () => {
    mockCrossRefOnly([{ title: ['Deep Learning'], DOI: '10.1/dl' }]);

    const parsed = parse(await verifyCitation({ title: 'Deep Learning' }));

    expect(parsed.verified).toBe(true);
    expect(parsed.confidence).toBe('medium');
    expect(parsed.doiUrl).toBe('https://doi.org/10.1/dl');
    expect(parsed.message).toContain('verify details match');
  });

  it('returns possible matches when the best score is below the match threshold', async () => {
    mockCrossRefOnly([{ title: ['Something Else Entirely'], DOI: '10.1/other' }]);

    const parsed = parse(await verifyCitation({ title: 'Deep Learning', authors: ['Nobody'] }));

    expect(parsed.verified).toBe(false);
    expect(parsed.message).toContain('Could not confidently verify');
    expect(parsed.possibleMatches).toEqual([
      expect.objectContaining({ title: 'Something Else Entirely', doiUrl: 'https://doi.org/10.1/other' }),
    ]);
    expect(parsed.errors).toBeUndefined();
  });

  it('reports failed databases when it cannot confidently verify, since one may hold the match', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.startsWith('https://doi.org/')) return notFound();
      if (url.includes('crossref')) return ok({ message: { items: [{ title: ['Something Else Entirely'], DOI: '10.1/other' }] } });
      if (url.includes('openalex')) return Promise.resolve({ ok: false, status: 503, statusText: 'Service Unavailable' });
      return ok({});
    });

    const parsed = parse(await verifyCitation({ title: 'Deep Learning', authors: ['Nobody'] }));

    expect(parsed.verified).toBe(false);
    expect(parsed.errors).toEqual([{ database: 'OpenAlex', code: 'API_ERROR', message: 'HTTP 503: Service Unavailable' }]);
  });

  it('does not verify a fabricated citation whose only match is the year', async () => {
    mockCrossRefOnly([{ title: ['Prayer Basket'], published: { 'date-parts': [[2019]] }, DOI: '10.1525/x' }]);

    const parsed = parse(await verifyCitation({
      title: 'Quantum Entanglement in Medieval Basket Weaving Guilds',
      authors: ['Zzyzx'],
      year: 2019,
    }));

    expect(parsed.verified).toBe(false);
    expect(parsed.message).toContain('Could not confidently verify');
  });

  it('builds the search query from title, authors and journal', async () => {
    mockCrossRefOnly([]);

    await verifyCitation({ title: 'T', authors: ['A One', 'B Two'], journal: 'J' });

    const crossrefUrl = mockFetch.mock.calls.map(c => c[0]).find((u: string) => u.includes('crossref'));
    expect(decodeURIComponent(crossrefUrl)).toContain('query=T A One B Two J');
  });

  it('includes database errors when nothing is found', async () => {
    mockFetch.mockImplementation(notFound);

    const parsed = parse(await verifyCitation({ title: 'Anything' }));

    expect(parsed.verified).toBe(false);
    expect(parsed.errors.length).toBeGreaterThan(0);
    expect(parsed.searchedSources).toHaveLength(8);
  });

  it('does not cache unverified results', async () => {
    mockCrossRefOnly([]);

    await verifyCitation({ title: 'Missing' });

    expect(cache.size()).toBe(0);
  });
});

describe('verifyCitation tool (DOI-only scope)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    cache.clear();
  });

  it('does not verify a strong match that has no DOI', async () => {
    mockCrossRefOnly([{ title: ['Attention Is All You Need'], published: { 'date-parts': [[2017]] } }]);

    const parsed = parse(await verifyCitation({ title: 'Attention Is All You Need', year: 2017 }));

    expect(parsed.verified).toBe(false);
    expect(parsed.message).toContain('No matching publications with a DOI');
  });

  it('picks the DOI-bearing record when a no-DOI record would score higher', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.startsWith('https://doi.org/')) return notFound();
      if (url.includes('crossref')) return ok({ message: { items: [{ title: ['Attention Is All You Need'], DOI: '10.48550/arxiv.1706.03762' }] } });
      if (url.includes('inspirehep')) {
        return ok({ hits: { hits: [{ metadata: {
          titles: [{ title: 'Attention Is All You Need' }],
          authors: [{ full_name: 'Vaswani, Ashish' }],
          publication_info: [{ year: '2017' }],
        } }] } });
      }
      return ok({});
    });

    const parsed = parse(await verifyCitation({ title: 'Attention Is All You Need', authors: ['Vaswani'], year: 2017 }));

    expect(parsed.verified).toBe(true);
    expect(parsed.source).toBe('CrossRef');
    expect(parsed.doiUrl).toBe('https://doi.org/10.48550/arxiv.1706.03762');
  });

  it('falls back to the requested DOI when DOI.org metadata omits it', async () => {
    mockFetch.mockImplementation(() => ok({ title: 'No DOI field' }));

    const parsed = parse(await verifyCitation({ doi: '10.1/requested' }));

    expect(parsed.doi).toBe('10.1/requested');
    expect(parsed.doiUrl).toBe('https://doi.org/10.1/requested');
  });
});
