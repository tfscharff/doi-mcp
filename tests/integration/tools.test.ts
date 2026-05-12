import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyCitation } from '../../src/tools/verifyCitation.js';
import { findVerifiedPapers } from '../../src/tools/findVerifiedPapers.js';
import * as cache from '../../src/cache.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

// Helper to create mock API responses
function mockCrossRefResponse(papers: any[]) {
  return {
    ok: true,
    json: () => Promise.resolve({ message: { items: papers } }),
  };
}

function mockOpenAlexResponse(papers: any[]) {
  return {
    ok: true,
    json: () => Promise.resolve({ results: papers }),
  };
}

function mockEmptyResponses() {
  mockFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ message: { items: [] }, results: [], data: [] }),
    text: () => Promise.resolve(''),
  });
}

describe('verifyCitation tool', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    cache.clear();
  });

  it('verifies citation via DOI when provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        title: 'Test Paper',
        author: [{ given: 'John', family: 'Smith' }],
        published: { 'date-parts': [[2023]] },
        DOI: '10.1234/test',
        'container-title': 'Nature',
      }),
    });

    const result = await verifyCitation({ doi: '10.1234/test' });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.verified).toBe(true);
    expect(parsed.source).toBe('DOI.org');
    expect(parsed.doi).toBe('10.1234/test');
  });

  it('returns not verified when no matches found', async () => {
    mockEmptyResponses();

    const result = await verifyCitation({
      title: 'Nonexistent Paper That Does Not Exist',
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.verified).toBe(false);
    expect(parsed.message).toContain('No matching publications');
  });

  it('returns insufficient info when no search criteria provided', async () => {
    const result = await verifyCitation({});
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.verified).toBe(false);
    expect(parsed.message).toContain('Insufficient information');
  });

  it('caches successful verification results', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        title: 'Cached Paper',
        DOI: '10.1234/cached',
      }),
    });

    // First call
    await verifyCitation({ doi: '10.1234/cached' });
    const fetchCount1 = mockFetch.mock.calls.length;

    // Second call - should use cache
    await verifyCitation({ doi: '10.1234/cached' });
    const fetchCount2 = mockFetch.mock.calls.length;

    expect(fetchCount2).toBe(fetchCount1); // No additional fetch calls
  });
});

describe('findVerifiedPapers tool', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    cache.clear();
  });

  it('returns papers from multiple sources', async () => {
    // Mock responses for different databases
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('crossref')) {
        return mockCrossRefResponse([
          { title: ['CrossRef Paper'], DOI: '10.1234/cr' },
        ]);
      }
      if (url.includes('openalex')) {
        return mockOpenAlexResponse([
          { title: 'OpenAlex Paper', doi: 'https://doi.org/10.1234/oa' },
        ]);
      }
      // Default empty response for other APIs
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ results: [], data: [], message: { items: [] } }),
        text: () => Promise.resolve(''),
      });
    });

    const result = await findVerifiedPapers({ query: 'machine learning' });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.count).toBeGreaterThan(0);
    expect(parsed.papers).toBeDefined();
  });

  it('deduplicates papers by DOI', async () => {
    // Same DOI from two sources
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('crossref')) {
        return mockCrossRefResponse([
          { title: ['Same Paper'], DOI: '10.1234/same' },
        ]);
      }
      if (url.includes('openalex')) {
        return mockOpenAlexResponse([
          { title: 'Same Paper', doi: 'https://doi.org/10.1234/same' },
        ]);
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ results: [], data: [] }),
        text: () => Promise.resolve(''),
      });
    });

    const result = await findVerifiedPapers({ query: 'test' });
    const parsed = JSON.parse(result.content[0].text);

    // Should only have one paper despite being in two sources
    const doiCount = parsed.papers.filter((p: any) => p.doi === '10.1234/same').length;
    expect(doiCount).toBe(1);
  });

  it('returns message when no papers found', async () => {
    mockEmptyResponses();

    const result = await findVerifiedPapers({ query: 'xyznonexistent123' });

    expect(result.content[0].text).toContain('No verified papers found');
  });
});
