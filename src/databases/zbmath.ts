// zbMATH database adapter (mathematics)

import type { NormalizedPaper, DatabaseConfig, DatabaseError } from '../types.js';
import { fetchJson } from '../http.js';

export const config: DatabaseConfig = {
  name: 'zbmath',
  displayName: 'zbMATH',
  baseUrl: 'https://api.zbmath.org',
  coverage: '4+ million mathematics publications',
};

interface ZbMathResult {
  title?: string;
  authors?: Array<{ name?: string } | string>;
  year?: number;
  publication_year?: number;
  doi?: string;
  source?: string;
  journal?: string;
}

interface ZbMathResponse {
  result?: ZbMathResult[];
}

export async function search(
  query: string,
  options: { year?: number; limit?: number; signal?: AbortSignal } = {}
): Promise<ZbMathResult[]> {
  const { year, limit = 3, signal } = options;

  let url = `${config.baseUrl}/document/_structured_search?query=${encodeURIComponent(query)}&results_per_page=${limit}`;
  if (year) {
    url += `&year=${year}`;
  }

  try {
    const data = await fetchJson<ZbMathResponse>(url, { signal });
    return data.result || [];
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw { code: 'ABORTED', message: 'Request cancelled' } as DatabaseError;
    }
    throw { code: 'API_ERROR', database: config.displayName, message: (err as Error).message } as DatabaseError;
  }
}

export function normalize(result: ZbMathResult): NormalizedPaper {
  const authors = result.authors?.map(a => (typeof a === 'string' ? a : a.name || '')).filter(Boolean);

  return {
    source: config.displayName,
    title: result.title,
    authors,
    year: result.year || result.publication_year,
    doi: result.doi,
    journal: result.source || result.journal,
  };
}
