// CrossRef database adapter

import type { NormalizedPaper, DatabaseConfig, DatabaseError } from '../types.js';
import { fetchJson } from '../http.js';

export const config: DatabaseConfig = {
  name: 'crossref',
  displayName: 'CrossRef',
  baseUrl: 'https://api.crossref.org',
  coverage: '150+ million scholarly publications',
};

interface CrossRefWork {
  title?: string[];
  author?: Array<{ given?: string; family?: string }>;
  published?: { 'date-parts'?: number[][] };
  DOI?: string;
  'container-title'?: string[];
  abstract?: string;
}

interface CrossRefResponse {
  message?: { items?: CrossRefWork[] };
}

export async function search(
  query: string,
  options: { year?: number; limit?: number; signal?: AbortSignal } = {}
): Promise<CrossRefWork[]> {
  const { year, limit = 3, signal } = options;

  let url = `${config.baseUrl}/works?query=${encodeURIComponent(query)}&rows=${limit}`;
  if (year) {
    url += `&filter=from-pub-date:${year},until-pub-date:${year}`;
  }

  try {
    const data = await fetchJson<CrossRefResponse>(url, { signal });
    return data.message?.items || [];
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw { code: 'ABORTED', message: 'Request cancelled' } as DatabaseError;
    }
    throw { code: 'API_ERROR', database: config.displayName, message: (err as Error).message } as DatabaseError;
  }
}

export function normalize(result: CrossRefWork): NormalizedPaper {
  return {
    source: config.displayName,
    title: result.title?.[0],
    authors: result.author?.map(a => `${a.given || ''} ${a.family || ''}`.trim()),
    year: result.published?.['date-parts']?.[0]?.[0],
    doi: result.DOI,
    journal: result['container-title']?.[0],
    abstract: result.abstract?.replace(/<[^>]*>/g, ''),
  };
}
