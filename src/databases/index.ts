// Database orchestrator - parallel query execution across all sources

import type { NormalizedPaper, DoiPaper, DatabaseError, SearchResults } from '../types.js';
import * as crossref from './crossref.js';
import * as openalex from './openalex.js';
import * as pubmed from './pubmed.js';
import * as semanticscholar from './semanticscholar.js';
import * as zbmath from './zbmath.js';
import * as eric from './eric.js';
import * as hal from './hal.js';
import * as inspirehep from './inspirehep.js';

export { getDOIsFromPubMed } from './pubmed.js';

interface SearchOptions {
  year?: number;
  yearFrom?: number;
  yearTo?: number;
  limit?: number;
  sources?: string[];
}

const adapters = {
  crossref,
  openalex,
  pubmed,
  semanticscholar,
  zbmath,
  eric,
  hal,
  inspirehep,
} as const;

type AdapterName = keyof typeof adapters;

// Each source is asked for this many times `limit`, since many top hits have no DOI
export const OVERFETCH_FACTOR = 3;

export const allDatabases = Object.values(adapters).map(a => ({
  name: a.config.name,
  displayName: a.config.displayName,
  coverage: a.config.coverage,
  baseUrl: a.config.baseUrl,
}));

export async function searchMultipleSources(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResults> {
  const { year, yearFrom, yearTo, limit = 3, sources } = options;

  const activeAdapters = sources
    ? (Object.entries(adapters).filter(([name]) => sources.includes(name)) as [AdapterName, typeof adapters[AdapterName]][])
    : (Object.entries(adapters) as [AdapterName, typeof adapters[AdapterName]][]);

  const results: DoiPaper[] = [];
  const errors: DatabaseError[] = [];
  const sourcesQueried: string[] = [];

  // Execute all searches in parallel
  const searchPromises = activeAdapters.map(async ([name, adapter]) => {
    sourcesQueried.push(adapter.config.displayName);

    try {
      // Over-fetch so DOI-less top hits don't empty a source; trimmed back to `limit` below
      const searchOptions = { year, yearFrom, yearTo, limit: limit * OVERFETCH_FACTOR };
      const rawResults = await adapter.search(query, searchOptions);

      // Special handling for PubMed DOI fetching
      if (name === 'pubmed' && rawResults.length > 0) {
        const pmids = rawResults.map((r: any) => r.uid).filter(Boolean);
        const doiMap = await pubmed.getDOIsFromPubMed(pmids);
        return rawResults.map((r: any) => pubmed.normalize(r, doiMap));
      }

      return rawResults.map((r: any) => adapter.normalize(r));
    } catch (err) {
      const dbError = err as DatabaseError;
      errors.push({
        database: adapter.config.displayName,
        code: dbError.code || 'API_ERROR',
        message: dbError.message || 'Unknown error',
      });
      return [];
    }
  });

  const allResults = await Promise.all(searchPromises);

  // Drop anything without a DOI: this server only returns DOI-backed citations
  for (const papers of allResults) {
    results.push(...papers.filter((p): p is DoiPaper => !!p?.doi).slice(0, limit));
  }

  return { results, errors, sources: sourcesQueried };
}

export function deduplicatePapers<T extends NormalizedPaper>(papers: T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];

  for (const paper of papers) {
    const key = paper.doi || paper.title?.toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      unique.push(paper);
    }
  }

  return unique;
}
