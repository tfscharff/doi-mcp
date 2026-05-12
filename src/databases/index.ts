// Database orchestrator - parallel query execution across all sources

import type { NormalizedPaper, DatabaseError, SearchResults } from '../types.js';
import * as crossref from './crossref.js';
import * as openalex from './openalex.js';
import * as pubmed from './pubmed.js';
import * as semanticscholar from './semanticscholar.js';
import * as dblp from './dblp.js';
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
  dblp,
  zbmath,
  eric,
  hal,
  inspirehep,
} as const;

type AdapterName = keyof typeof adapters;

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

  const results: NormalizedPaper[] = [];
  const errors: DatabaseError[] = [];
  const sourcesQueried: string[] = [];

  // Execute all searches in parallel
  const searchPromises = activeAdapters.map(async ([name, adapter]) => {
    sourcesQueried.push(adapter.config.displayName);

    try {
      const searchOptions = { year, yearFrom, yearTo, limit };
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

  for (const papers of allResults) {
    results.push(...papers.filter((p): p is NormalizedPaper => p !== null));
  }

  return { results, errors, sources: sourcesQueried };
}

export function deduplicatePapers(papers: NormalizedPaper[]): NormalizedPaper[] {
  const seen = new Set<string>();
  const unique: NormalizedPaper[] = [];

  for (const paper of papers) {
    const key = paper.doi || paper.title?.toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      unique.push(paper);
    }
  }

  return unique;
}
