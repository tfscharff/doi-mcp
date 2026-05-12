// OpenAlex database adapter

import type { NormalizedPaper, DatabaseConfig, DatabaseError } from '../types.js';
import { fetchJson } from '../http.js';

export const config: DatabaseConfig = {
  name: 'openalex',
  displayName: 'OpenAlex',
  baseUrl: 'https://api.openalex.org',
  coverage: '250+ million scholarly works',
};

interface OpenAlexWork {
  title?: string;
  authorships?: Array<{ author?: { display_name?: string } }>;
  publication_year?: number;
  doi?: string;
  primary_location?: { source?: { display_name?: string } };
  abstract_inverted_index?: Record<string, number[]>;
}

interface OpenAlexResponse {
  results?: OpenAlexWork[];
}

function reconstructAbstract(invertedIndex: Record<string, number[]>): string {
  const words: [string, number][] = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      words.push([word, pos]);
    }
  }
  words.sort((a, b) => a[1] - b[1]);
  return words.map(w => w[0]).join(' ');
}

export async function search(
  query: string,
  options: { year?: number; yearFrom?: number; yearTo?: number; limit?: number; signal?: AbortSignal } = {}
): Promise<OpenAlexWork[]> {
  const { year, yearFrom, yearTo, limit = 3, signal } = options;

  let url = `${config.baseUrl}/works?search=${encodeURIComponent(query)}&per_page=${limit}`;

  if (year) {
    url += `&filter=publication_year:${year}`;
  } else if (yearFrom && yearTo) {
    url += `&filter=publication_year:${yearFrom}-${yearTo}`;
  } else if (yearFrom) {
    url += `&filter=publication_year:>${yearFrom - 1}`;
  } else if (yearTo) {
    url += `&filter=publication_year:<${yearTo + 1}`;
  }

  try {
    const data = await fetchJson<OpenAlexResponse>(url, {
      headers: { 'User-Agent': 'mailto:research@example.com' },
      signal,
    });
    return data.results || [];
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw { code: 'ABORTED', message: 'Request cancelled' } as DatabaseError;
    }
    throw { code: 'API_ERROR', database: config.displayName, message: (err as Error).message } as DatabaseError;
  }
}

export function normalize(result: OpenAlexWork): NormalizedPaper {
  return {
    source: config.displayName,
    title: result.title,
    authors: result.authorships?.map(a => a.author?.display_name).filter((n): n is string => !!n),
    year: result.publication_year,
    doi: result.doi?.replace('https://doi.org/', ''),
    journal: result.primary_location?.source?.display_name,
    abstract: result.abstract_inverted_index ? reconstructAbstract(result.abstract_inverted_index) : undefined,
  };
}
