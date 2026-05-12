import { describe, it, expect, vi, beforeEach } from 'vitest';
import { search, normalize, config } from '../../src/databases/crossref.js';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('crossref adapter', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('config', () => {
    it('has correct metadata', () => {
      expect(config.name).toBe('crossref');
      expect(config.displayName).toBe('CrossRef');
      expect(config.baseUrl).toBe('https://api.crossref.org');
    });
  });

  describe('search', () => {
    it('fetches from CrossRef API', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          message: {
            items: [
              {
                title: ['Test Paper'],
                DOI: '10.1234/test',
              },
            ],
          },
        }),
      });

      const results = await search('machine learning');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('api.crossref.org/works?query=machine%20learning'),
        expect.any(Object)
      );
      expect(results).toHaveLength(1);
      expect(results[0].DOI).toBe('10.1234/test');
    });

    it('includes year filter when provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ message: { items: [] } }),
      });

      await search('test', { year: 2023 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('filter=from-pub-date:2023,until-pub-date:2023'),
        expect.any(Object)
      );
    });

    it('returns empty array on API error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(search('test')).rejects.toMatchObject({
        code: 'API_ERROR',
      });
    });
  });

  describe('normalize', () => {
    it('normalizes CrossRef response format', () => {
      const raw = {
        title: ['Deep Learning for NLP'],
        author: [
          { given: 'John', family: 'Smith' },
          { given: 'Jane', family: 'Doe' },
        ],
        published: { 'date-parts': [[2023]] },
        DOI: '10.1234/test',
        'container-title': ['Nature'],
        abstract: '<p>This is the abstract.</p>',
      };

      const normalized = normalize(raw);

      expect(normalized.source).toBe('CrossRef');
      expect(normalized.title).toBe('Deep Learning for NLP');
      expect(normalized.authors).toEqual(['John Smith', 'Jane Doe']);
      expect(normalized.year).toBe(2023);
      expect(normalized.doi).toBe('10.1234/test');
      expect(normalized.journal).toBe('Nature');
      expect(normalized.abstract).toBe('This is the abstract.');
    });

    it('handles missing fields gracefully', () => {
      const raw = {};
      const normalized = normalize(raw);

      expect(normalized.source).toBe('CrossRef');
      expect(normalized.title).toBeUndefined();
      expect(normalized.authors).toBeUndefined();
    });
  });
});
