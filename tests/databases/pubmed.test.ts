import { describe, it, expect, vi, beforeEach } from 'vitest';
import { search, normalize, getDOIsFromPubMed, config } from '../../src/databases/pubmed.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('pubmed adapter', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('config', () => {
    it('has correct metadata', () => {
      expect(config.name).toBe('pubmed');
      expect(config.displayName).toBe('PubMed');
    });
  });

  describe('search', () => {
    it('performs two-step search (esearch then esummary)', async () => {
      // First call: esearch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          esearchresult: { idlist: ['12345', '67890'] },
        }),
      });

      // Second call: esummary
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          result: {
            '12345': { uid: '12345', title: 'Paper 1' },
            '67890': { uid: '67890', title: 'Paper 2' },
          },
        }),
      });

      const results = await search('cancer research');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(results).toHaveLength(2);
      expect(results[0].title).toBe('Paper 1');
    });

    it('returns empty array when no PMIDs found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          esearchresult: { idlist: [] },
        }),
      });

      const results = await search('nonexistent query xyz');
      expect(results).toHaveLength(0);
    });
  });

  describe('getDOIsFromPubMed', () => {
    it('extracts DOIs from XML response', async () => {
      const xmlResponse = `
        <PubmedArticleSet>
          <PubmedArticle>
            <MedlineCitation>
              <PMID Version="1">12345</PMID>
            </MedlineCitation>
            <PubmedData>
              <ArticleIdList>
                <ArticleId IdType="doi">10.1234/test.123</ArticleId>
              </ArticleIdList>
            </PubmedData>
          </PubmedArticle>
        </PubmedArticleSet>
      `;

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(xmlResponse),
      });

      const doiMap = await getDOIsFromPubMed(['12345']);

      expect(doiMap.get('12345')).toBe('10.1234/test.123');
    });

    it('returns empty map for empty input', async () => {
      const doiMap = await getDOIsFromPubMed([]);
      expect(doiMap.size).toBe(0);
    });

    it('handles articles without DOIs', async () => {
      const xmlResponse = `
        <PubmedArticleSet>
          <PubmedArticle>
            <MedlineCitation>
              <PMID Version="1">12345</PMID>
            </MedlineCitation>
            <PubmedData>
              <ArticleIdList>
                <ArticleId IdType="pubmed">12345</ArticleId>
              </ArticleIdList>
            </PubmedData>
          </PubmedArticle>
        </PubmedArticleSet>
      `;

      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(xmlResponse),
      });

      const doiMap = await getDOIsFromPubMed(['12345']);
      expect(doiMap.has('12345')).toBe(false);
    });
  });

  describe('normalize', () => {
    it('normalizes PubMed summary format', () => {
      const raw = {
        uid: '12345',
        title: 'Cancer Treatment Advances',
        authors: [{ name: 'Smith J' }, { name: 'Doe J' }],
        pubdate: '2023 Mar',
        source: 'Nature Medicine',
      };

      const doiMap = new Map([['12345', '10.1038/test']]);
      const normalized = normalize(raw, doiMap);

      expect(normalized.source).toBe('PubMed');
      expect(normalized.title).toBe('Cancer Treatment Advances');
      expect(normalized.authors).toEqual(['Smith J', 'Doe J']);
      expect(normalized.year).toBe(2023);
      expect(normalized.doi).toBe('10.1038/test');
      expect(normalized.journal).toBe('Nature Medicine');
    });

    it('handles missing DOI in map', () => {
      const raw = { uid: '99999', title: 'Test' };
      const normalized = normalize(raw, new Map());
      expect(normalized.doi).toBeUndefined();
    });
  });
});
