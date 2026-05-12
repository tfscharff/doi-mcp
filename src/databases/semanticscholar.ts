// Semantic Scholar database adapter

import type { NormalizedPaper, DatabaseConfig, DatabaseError } from '../types.js';
import { fetchJson } from '../http.js';

export const config: DatabaseConfig = {
  name: 'semanticscholar',
  displayName: 'Semantic Scholar',
  baseUrl: 'https://api.semanticscholar.org/graph/v1',
  coverage: '200+ million papers',
};

interface SemanticScholarPaper {
  paperId?: string;
  title?: string;
  authors?: Array<{ name?: string }>;
  year?: number;
  externalIds?: { DOI?: string };
  venue?: string;
  abstract?: string;
}

interface SemanticScholarResponse {
  data?: SemanticScholarPaper[];
}

export async function search(
  query: string,
  options: { year?: number; yearFrom?: number; yearTo?: number; limit?: number; signal?: AbortSignal } = {}
): Promise<SemanticScholarPaper[]> {
  const { year, yearFrom, yearTo, limit = 3, signal } = options;

  let url = `${config.baseUrl}/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=paperId,title,authors,year,externalIds,venue,abstract`;

  if (year) {
    url += `&year=${year}`;
  } else if (yearFrom && yearTo) {
    url += `&year=${yearFrom}-${yearTo}`;
  } else if (yearFrom) {
    url += `&year=${yearFrom}-`;
  } else if (yearTo) {
    url += `&year=-${yearTo}`;
  }

  try {
    const data = await fetchJson<SemanticScholarResponse>(url, { signal });
    return data.data || [];
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw { code: 'ABORTED', message: 'Request cancelled' } as DatabaseError;
    }
    throw { code: 'API_ERROR', database: config.displayName, message: (err as Error).message } as DatabaseError;
  }
}

export function normalize(result: SemanticScholarPaper): NormalizedPaper {
  return {
    source: config.displayName,
    title: result.title,
    authors: result.authors?.map(a => a.name).filter((n): n is string => !!n),
    year: result.year,
    doi: result.externalIds?.DOI,
    journal: result.venue,
    abstract: result.abstract,
  };
}
