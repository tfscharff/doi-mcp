// zbMATH Open database adapter (mathematics)

import type { NormalizedPaper, DatabaseConfig, DatabaseError } from '../types.js';
import { fetchJson } from '../http.js';

export const config: DatabaseConfig = {
  name: 'zbmath',
  displayName: 'zbMATH',
  baseUrl: 'https://api.zbmath.org',
  coverage: '4+ million mathematics publications',
};

interface ZbMathResult {
  title?: { title?: string | null; subtitle?: string | null };
  contributors?: { authors?: Array<{ name?: string }> };
  year?: string;
  links?: Array<{ type?: string; identifier?: string }>;
  source?: { series?: Array<{ title?: string }>; source?: string };
}

interface ZbMathResponse {
  result?: ZbMathResult[] | null;
}

export async function search(
  query: string,
  options: { year?: number; limit?: number; signal?: AbortSignal } = {}
): Promise<ZbMathResult[]> {
  const { year, limit = 3, signal } = options;

  // zbMATH query language: `py:` filters by publication year
  const searchString = year ? `${query} py:${year}` : query;
  const url = `${config.baseUrl}/v1/document/_search?search_string=${encodeURIComponent(searchString)}&page=0&results_per_page=${limit}`;

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
  return {
    source: config.displayName,
    title: result.title?.title || undefined,
    authors: result.contributors?.authors?.map(a => a.name).filter((n): n is string => !!n),
    year: result.year ? parseInt(result.year) : undefined,
    doi: result.links?.find(l => l.type === 'doi')?.identifier,
    journal: result.source?.series?.[0]?.title || result.source?.source,
  };
}
