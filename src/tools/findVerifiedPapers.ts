// findVerifiedPapers tool - search for papers across databases

import type { SearchInput } from '../types.js';
import { searchMultipleSources, deduplicatePapers } from '../databases/index.js';
import * as cache from '../cache.js';

export async function findVerifiedPapers(input: SearchInput): Promise<{
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}> {
  const { query, limit = 5, yearFrom, yearTo, source = 'all' } = input;

  try {
    // Check cache
    const cacheKey = cache.createKey('findVerifiedPapers', { query, limit, yearFrom, yearTo, source });
    const cached = cache.get<any>(cacheKey);
    if (cached) {
      return { content: [{ type: 'text', text: JSON.stringify(cached, null, 2) }] };
    }

    const sources = source === 'all' ? undefined : [source];
    const searchResults = await searchMultipleSources(query, {
      yearFrom,
      yearTo,
      limit,
      sources,
    });

    if (searchResults.results.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'No verified papers found for this query across all sources.',
        }],
      };
    }

    const uniquePapers = deduplicatePapers(searchResults.results);

    const citations = uniquePapers.slice(0, limit).map((paper, idx) => ({
      index: idx + 1,
      source: paper.source,
      title: paper.title || 'No title',
      authors: paper.authors,
      year: paper.year || 'Unknown year',
      journal: paper.journal || 'Unknown journal',
      doi: paper.doi,
      doiUrl: paper.doi ? `https://doi.org/${paper.doi}` : null,
      abstractFromArticle: paper.abstract,
    }));

    const result = {
      count: citations.length,
      sources: [...new Set(citations.map(c => c.source))],
      papers: citations,
      note: 'All citations are verified from multiple academic databases. Use the doiUrl field to access papers.',
    };

    cache.set(cacheKey, result);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };

  } catch (error: any) {
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true,
    };
  }
}
