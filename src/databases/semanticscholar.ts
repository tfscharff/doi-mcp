// Semantic Scholar database adapter

import type { NormalizedPaper, DatabaseConfig, DatabaseError } from '../types.js';
import { fetchJson, HttpError } from '../http.js';

export const config: DatabaseConfig = {
  name: 'semanticscholar',
  displayName: 'Semantic Scholar',
  baseUrl: 'https://api.semanticscholar.org/graph/v1',
  coverage: '200+ million papers',
};

// Wait before the single retry of a keyless request that hit the shared 429 limit
export const RETRY_DELAY_MS = 1000;

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

  // Without a key, requests share one global anonymous quota that is often exhausted
  const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY;
  const headers: Record<string, string> = apiKey ? { 'x-api-key': apiKey } : {};

  const request = () => fetchJson<SemanticScholarResponse>(url, { signal, headers });

  try {
    let data: SemanticScholarResponse;
    try {
      data = await request();
    } catch (err) {
      // The anonymous pool is often only momentarily full, so wait once and retry
      if (apiKey || !(err instanceof HttpError && err.status === 429)) throw err;
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      data = await request();
    }
    return data.data || [];
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw { code: 'ABORTED', message: 'Request cancelled' } as DatabaseError;
    }
    if (err instanceof HttpError && err.status === 429) {
      const hint = apiKey ? 'the API key\'s quota is exhausted' : 'the shared anonymous quota is exhausted; set SEMANTIC_SCHOLAR_API_KEY for a dedicated quota';
      throw { code: 'RATE_LIMITED', database: config.displayName, message: `HTTP 429: rate limited (${hint})` } as DatabaseError;
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
