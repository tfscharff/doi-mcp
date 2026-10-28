import { describe, it, expect, vi, beforeEach } from 'vitest';
import { batchVerifyCitations } from '../../src/tools/batchVerifyCitations.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const ok = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
const notFound = () => Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' });

const parse = (result: { content: Array<{ text: string }> }) => JSON.parse(result.content[0].text);

describe('batchVerifyCitations tool', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('reports failed databases on unverified citations', async () => {
    // Regression: batch results swallowed per-database failures entirely
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('crossref')) return ok({ message: { items: [{ title: ['Unrelated'], DOI: '10.1/u' }] } });
      if (url.includes('openalex')) return Promise.resolve({ ok: false, status: 503, statusText: 'Service Unavailable' });
      return ok({});
    });

    const parsed = parse(await batchVerifyCitations({ citations: [{ id: 'weak', title: 'Deep Learning', authors: ['Nobody'] }] }));

    expect(parsed.results[0]).toMatchObject({
      id: 'weak',
      verified: false,
      message: 'Could not confidently verify',
      errors: [{ database: 'OpenAlex', code: 'API_ERROR', message: 'HTTP 503: Service Unavailable' }],
    });
  });

  it('reports failed databases when nothing is found', async () => {
    mockFetch.mockImplementation(() => Promise.resolve({ ok: false, status: 500, statusText: 'Server Error' }));

    const parsed = parse(await batchVerifyCitations({ citations: [{ id: 'gone', title: 'Anything' }] }));

    expect(parsed.results[0].message).toBe('No matching publications with a DOI found');
    expect(parsed.results[0].errors).toHaveLength(8);
  });

  it('returns an empty summary for an empty batch', async () => {
    const parsed = parse(await batchVerifyCitations({ citations: [] }));

    expect(parsed).toEqual({ summary: { total: 0, verified: 0, failed: 0 }, results: [] });
  });

  it('verifies each citation and summarizes the outcome', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === 'https://doi.org/10.1/good') {
        return ok({
          title: 'DOI Paper',
          author: [{ given: 'Ada', family: 'Lovelace' }],
          published: { 'date-parts': [[1843]] },
          DOI: '10.1/good',
          'container-title': ['Notes'],
          abstract: '<p>Engine</p>',
        });
      }
      if (url.startsWith('https://doi.org/')) return notFound();
      if (url.includes('crossref')) {
        return ok({
          message: {
            items: [
              { title: ['Deep Learning'], published: { 'date-parts': [[2015]] }, DOI: '10.1/dl' },
              { title: ['Graph Theory Basics'], DOI: '10.1/gt' },
            ],
          },
        });
      }
      return ok({});
    });

    const parsed = parse(await batchVerifyCitations({
      citations: [
        { id: 'doi', doi: 'https://doi.org/10.1/good' },
        { id: 'high', title: 'Deep Learning', year: 2015 },
        { id: 'medium', title: 'Graph Theory Basics' },
        { id: 'weak', title: 'Quantum Basket Weaving' },
        { id: 'empty' },
        {},
      ],
    }));

    expect(parsed.summary).toEqual({ total: 6, verified: 3, failed: 3 });

    const byId = Object.fromEntries(parsed.results.map((r: any) => [r.id, r]));
    expect(byId.doi).toMatchObject({
      verified: true,
      confidence: 'high',
      source: 'DOI.org',
      paper: { title: 'DOI Paper', authors: ['Ada Lovelace'], year: 1843, journal: 'Notes', abstract: 'Engine' },
    });
    expect(byId.high).toMatchObject({
      verified: true,
      confidence: 'high',
      source: 'CrossRef',
      paper: { doi: '10.1/dl', doiUrl: 'https://doi.org/10.1/dl' },
    });
    expect(byId.medium).toMatchObject({ verified: true, confidence: 'medium', paper: { doiUrl: 'https://doi.org/10.1/gt' } });
    expect(byId.weak).toMatchObject({ verified: false, message: 'Could not confidently verify' });
    expect(byId.weak.possibleMatches).toHaveLength(2);
    expect(byId.empty).toMatchObject({ verified: false, message: 'Insufficient information to verify' });
    expect(byId.unknown).toMatchObject({ verified: false });
  });

  it('falls back to search when DOI lookup fails, and reports no matches', async () => {
    mockFetch.mockImplementation((url: string) => (url.startsWith('https://doi.org/') ? notFound() : ok({})));

    const parsed = parse(await batchVerifyCitations({
      citations: [{ id: 'x', doi: '10.1/missing', title: 'Ghost Paper', authors: ['Nobody'], journal: 'Nowhere' }],
    }));

    expect(parsed.results[0]).toEqual({ id: 'x', verified: false, message: 'No matching publications with a DOI found' });
    const crossrefUrl = mockFetch.mock.calls.map(c => c[0]).find((u: string) => u.includes('crossref'));
    expect(decodeURIComponent(crossrefUrl)).toContain('query=Ghost Paper Nobody Nowhere');
  });

  it('does not verify a citation whose only match is the year', async () => {
    mockFetch.mockImplementation((url: string) => (url.includes('crossref')
      ? ok({ message: { items: [{ title: ['Prayer Basket'], published: { 'date-parts': [[2019]] }, DOI: '10.1/pb' }] } })
      : ok({})));

    const parsed = parse(await batchVerifyCitations({
      citations: [{ id: 'fake', title: 'Neural Toaster Calibration', year: 2019 }],
    }));

    expect(parsed.results[0]).toMatchObject({ id: 'fake', verified: false, message: 'Could not confidently verify' });
  });

  it('returns isError when the input is malformed', async () => {
    const result = await batchVerifyCitations({ citations: null as any });

    expect(result.isError).toBe(true);
    expect(parse(result).error).toBeTruthy();
  });
});

describe('batchVerifyCitations tool (DOI-only scope)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('does not verify a strong match that has no DOI', async () => {
    mockFetch.mockImplementation((url: string) => (url.includes('crossref')
      ? ok({ message: { items: [{ title: ['Real Paper'], published: { 'date-parts': [[2020]] } }] } })
      : ok({})));

    const parsed = parse(await batchVerifyCitations({ citations: [{ id: 'r', title: 'Real Paper', year: 2020 }] }));

    expect(parsed.results[0]).toEqual({ id: 'r', verified: false, message: 'No matching publications with a DOI found' });
  });

  it('falls back to the requested DOI when DOI.org metadata omits it', async () => {
    mockFetch.mockImplementation(() => ok({ title: 'No DOI field' }));

    const parsed = parse(await batchVerifyCitations({ citations: [{ id: 'd', doi: '10.1/requested' }] }));

    expect(parsed.results[0].paper.doi).toBe('10.1/requested');
  });
});
