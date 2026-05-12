// verifyCitation tool - verify a single academic citation

import type { NormalizedPaper, CitationInput } from '../types.js';
import { MATCH_THRESHOLD, HIGH_CONFIDENCE_THRESHOLD } from '../types.js';
import { searchMultipleSources } from '../databases/index.js';
import { findBestMatch } from '../scoring.js';
import { fetchWithRedirect } from '../http.js';
import * as cache from '../cache.js';

interface DoiMetadata {
  title?: string | string[];
  author?: Array<{ given?: string; family?: string }>;
  published?: { 'date-parts'?: number[][] };
  issued?: { 'date-parts'?: number[][] };
  DOI?: string;
  'container-title'?: string | string[];
  abstract?: string;
}

async function verifyByDoi(doi: string): Promise<NormalizedPaper | null> {
  const cleanDoi = doi.replace(/^(https?:\/\/)?(dx\.)?doi\.org\//, '');

  try {
    const metadata = await fetchWithRedirect<DoiMetadata>(
      `https://doi.org/${cleanDoi}`,
      { accept: 'application/vnd.citationstyles.csl+json' }
    );

    return {
      source: 'DOI.org',
      title: Array.isArray(metadata.title) ? metadata.title[0] : metadata.title,
      authors: metadata.author?.map(a => `${a.given || ''} ${a.family || ''}`.trim()),
      year: metadata.published?.['date-parts']?.[0]?.[0] || metadata.issued?.['date-parts']?.[0]?.[0],
      doi: metadata.DOI,
      journal: Array.isArray(metadata['container-title']) ? metadata['container-title'][0] : metadata['container-title'],
      abstract: metadata.abstract?.replace(/<[^>]*>/g, ''),
    };
  } catch {
    return null;
  }
}

export async function verifyCitation(input: CitationInput): Promise<{
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}> {
  const { title, authors, year, doi, journal } = input;

  try {
    // Check cache first
    const cacheKey = cache.createKey('verifyCitation', { title, authors, year, doi });
    const cached = cache.get<any>(cacheKey);
    if (cached) {
      return { content: [{ type: 'text', text: JSON.stringify(cached, null, 2) }] };
    }

    // If DOI provided, try direct lookup first
    if (doi) {
      const paper = await verifyByDoi(doi);
      if (paper) {
        const result = {
          verified: true,
          source: 'DOI.org',
          doi: paper.doi,
          doiUrl: `https://doi.org/${paper.doi}`,
          title: paper.title,
          authors: paper.authors,
          year: paper.year,
          journal: paper.journal,
          abstractFromArticle: paper.abstract,
          message: '✓ Citation verified via DOI',
        };
        cache.set(cacheKey, result);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
    }

    // Build search query
    const queryParts: string[] = [];
    if (title) queryParts.push(title);
    if (authors?.length) queryParts.push(authors.join(' '));
    if (journal) queryParts.push(journal);

    if (queryParts.length === 0) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            verified: false,
            message: 'Insufficient information to verify citation',
          }, null, 2),
        }],
      };
    }

    const query = queryParts.join(' ');
    const searchResults = await searchMultipleSources(query, { year });

    if (searchResults.results.length === 0) {
      const result = {
        verified: false,
        message: '⚠ No matching publications found in any database - this citation may be incorrect',
        searchedSources: searchResults.sources,
        searchedFor: { title, authors, year, journal },
        errors: searchResults.errors.length > 0 ? searchResults.errors : undefined,
      };
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    const { match: bestMatch, score: bestScore } = findBestMatch(searchResults.results, { title, authors, year, journal });

    if (!bestMatch || bestScore < MATCH_THRESHOLD) {
      const result = {
        verified: false,
        message: '⚠ Could not confidently verify citation - may be incorrect',
        possibleMatches: searchResults.results.slice(0, 3).map(r => ({
          source: r.source,
          title: r.title,
          authors: r.authors,
          year: r.year,
          doi: r.doi,
          doiUrl: r.doi ? `https://doi.org/${r.doi}` : null,
        })),
      };
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    const result = {
      verified: true,
      confidence: bestScore >= HIGH_CONFIDENCE_THRESHOLD ? 'high' : 'medium',
      source: bestMatch.source,
      doi: bestMatch.doi,
      doiUrl: bestMatch.doi ? `https://doi.org/${bestMatch.doi}` : null,
      title: bestMatch.title,
      authors: bestMatch.authors,
      year: bestMatch.year,
      journal: bestMatch.journal,
      abstractFromArticle: bestMatch.abstract,
      message: bestScore >= HIGH_CONFIDENCE_THRESHOLD
        ? '✓ Citation verified with high confidence'
        : '✓ Citation found (verify details match)',
    };

    cache.set(cacheKey, result);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };

  } catch (error: any) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ verified: false, error: error.message }, null, 2),
      }],
      isError: true,
    };
  }
}
