// ERIC database adapter (education research)

import type { NormalizedPaper, DatabaseConfig, DatabaseError } from '../types.js';
import { fetchJson } from '../http.js';

export const config: DatabaseConfig = {
  name: 'eric',
  displayName: 'ERIC',
  baseUrl: 'https://api.ies.ed.gov/eric',
  coverage: '1.7+ million education publications',
};

// ERIC has no DOI field; a record's DOI only appears as a doi.org link in `url`
const FIELDS = 'id,title,author,publicationdateyear,source,publicationtype,url';

interface ERICDoc {
  title?: string;
  author?: string[];
  publicationdateyear?: number | string;
  source?: string;
  publicationtype?: string | string[];
  url?: string;
}

interface ERICResponse {
  response?: { docs?: ERICDoc[] };
}

export async function search(
  query: string,
  options: { limit?: number; signal?: AbortSignal } = {}
): Promise<ERICDoc[]> {
  const { limit = 3, signal } = options;

  const doiOnly = `(${query}) AND url:*doi.org*`;
  const url = `${config.baseUrl}/?search=${encodeURIComponent(doiOnly)}&rows=${limit}&format=json&fields=${FIELDS}`;

  try {
    const data = await fetchJson<ERICResponse>(url, { signal });
    return data.response?.docs || [];
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw { code: 'ABORTED', message: 'Request cancelled' } as DatabaseError;
    }
    throw { code: 'API_ERROR', database: config.displayName, message: (err as Error).message } as DatabaseError;
  }
}

export function normalize(result: ERICDoc): NormalizedPaper {
  const doi = result.url?.match(/doi\.org\/(10\..+)$/)?.[1];
  const type = Array.isArray(result.publicationtype) ? result.publicationtype[0] : result.publicationtype;

  return {
    source: config.displayName,
    title: result.title,
    authors: result.author?.filter(Boolean),
    year: result.publicationdateyear ? Number(result.publicationdateyear) : undefined,
    doi,
    journal: result.source || type,
  };
}
