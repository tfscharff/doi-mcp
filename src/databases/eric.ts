// ERIC database adapter (education research)

import type { NormalizedPaper, DatabaseConfig, DatabaseError } from '../types.js';
import { fetchJson } from '../http.js';

export const config: DatabaseConfig = {
  name: 'eric',
  displayName: 'ERIC',
  baseUrl: 'https://api.ies.ed.gov/eric',
  coverage: '1.7+ million education publications',
};

interface ERICDoc {
  title?: string;
  author?: string[];
  publicationdateyear?: string;
  doi?: string;
  source?: string;
  publicationtype?: string;
}

interface ERICResponse {
  response?: { docs?: ERICDoc[] };
}

export async function search(
  query: string,
  options: { limit?: number; signal?: AbortSignal } = {}
): Promise<ERICDoc[]> {
  const { limit = 3, signal } = options;

  const url = `${config.baseUrl}/?search=${encodeURIComponent(query)}&rows=${limit}&format=json`;

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
  return {
    source: config.displayName,
    title: result.title,
    authors: result.author?.filter(Boolean),
    year: result.publicationdateyear ? parseInt(result.publicationdateyear) : undefined,
    doi: result.doi,
    journal: result.source || result.publicationtype,
  };
}
