// DBLP database adapter (computer science bibliography)

import type { NormalizedPaper, DatabaseConfig, DatabaseError } from '../types.js';
import { fetchJson } from '../http.js';

export const config: DatabaseConfig = {
  name: 'dblp',
  displayName: 'DBLP',
  baseUrl: 'https://dblp.org',
  coverage: 'Comprehensive computer science bibliography',
};

interface DBLPHit {
  info?: {
    title?: string;
    authors?: { author?: string | string[] | Array<{ text?: string }> };
    year?: string;
    doi?: string;
    venue?: string;
  };
}

interface DBLPResponse {
  result?: { hits?: { hit?: DBLPHit[] } };
}

export async function search(
  query: string,
  options: { yearFrom?: number; yearTo?: number; limit?: number; signal?: AbortSignal } = {}
): Promise<DBLPHit[]> {
  const { yearFrom, yearTo, limit = 3, signal } = options;

  const url = `${config.baseUrl}/search/publ/api?q=${encodeURIComponent(query)}&format=json&h=${limit}`;

  try {
    const data = await fetchJson<DBLPResponse>(url, { signal });
    let hits = data.result?.hits?.hit || [];

    // Filter by year client-side (DBLP doesn't support year filtering in API)
    if (yearFrom || yearTo) {
      hits = hits.filter(hit => {
        const year = hit.info?.year ? parseInt(hit.info.year) : null;
        if (!year) return true;
        if (yearFrom && year < yearFrom) return false;
        if (yearTo && year > yearTo) return false;
        return true;
      });
    }

    return hits;
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw { code: 'ABORTED', message: 'Request cancelled' } as DatabaseError;
    }
    throw { code: 'API_ERROR', database: config.displayName, message: (err as Error).message } as DatabaseError;
  }
}

export function normalize(result: DBLPHit): NormalizedPaper {
  const info = result.info;
  let authors: string[] = [];

  if (info?.authors?.author) {
    const authorData = info.authors.author;
    if (Array.isArray(authorData)) {
      authors = authorData.map(a => (typeof a === 'string' ? a : a.text || '')).filter(Boolean);
    } else if (typeof authorData === 'string') {
      authors = [authorData];
    }
  }

  return {
    source: config.displayName,
    title: info?.title,
    authors,
    year: info?.year ? parseInt(info.year) : undefined,
    doi: info?.doi,
    journal: info?.venue,
  };
}
