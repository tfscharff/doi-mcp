// INSPIRE-HEP database adapter (high-energy physics)

import type { NormalizedPaper, DatabaseConfig, DatabaseError } from '../types.js';
import { fetchJson } from '../http.js';

export const config: DatabaseConfig = {
  name: 'inspirehep',
  displayName: 'INSPIRE-HEP',
  baseUrl: 'https://inspirehep.net/api/literature',
  coverage: '1.7+ million high-energy physics publications',
};

interface InspireHit {
  metadata?: {
    titles?: Array<{ title?: string }>;
    authors?: Array<{ full_name?: string }>;
    publication_info?: Array<{
      year?: string;
      journal_title?: string;
      conference_record?: { titles?: Array<{ title?: string }> };
    }>;
    preprint_date?: string;
    dois?: Array<{ value?: string }>;
    abstracts?: Array<{ value?: string }>;
  };
}

interface InspireResponse {
  hits?: { hits?: InspireHit[] };
}

export async function search(
  query: string,
  options: { year?: number; yearFrom?: number; yearTo?: number; limit?: number; signal?: AbortSignal } = {}
): Promise<InspireHit[]> {
  const { year, yearFrom, yearTo, limit = 3, signal } = options;

  let searchQuery = query;
  if (year) {
    searchQuery = `${query} and date ${year}`;
  } else if (yearFrom && yearTo) {
    searchQuery = `${query} and date ${yearFrom}--${yearTo}`;
  } else if (yearFrom) {
    searchQuery = `${query} and date ${yearFrom}--`;
  } else if (yearTo) {
    searchQuery = `${query} and date --${yearTo}`;
  }

  const url = `${config.baseUrl}?q=${encodeURIComponent(searchQuery)}&size=${limit}&sort=mostrecent`;

  try {
    const data = await fetchJson<InspireResponse>(url, { signal });
    return data.hits?.hits || [];
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw { code: 'ABORTED', message: 'Request cancelled' } as DatabaseError;
    }
    throw { code: 'API_ERROR', database: config.displayName, message: (err as Error).message } as DatabaseError;
  }
}

export function normalize(result: InspireHit): NormalizedPaper {
  const metadata = result.metadata || {};
  const pubInfo = metadata.publication_info?.[0];

  let year: number | undefined;
  if (pubInfo?.year) {
    year = parseInt(pubInfo.year);
  } else if (metadata.preprint_date) {
    year = new Date(metadata.preprint_date).getFullYear();
  }

  return {
    source: config.displayName,
    title: metadata.titles?.[0]?.title,
    authors: metadata.authors?.map(a => a.full_name).filter((n): n is string => !!n),
    year,
    doi: metadata.dois?.[0]?.value,
    journal: pubInfo?.journal_title || pubInfo?.conference_record?.titles?.[0]?.title,
    abstract: metadata.abstracts?.[0]?.value,
  };
}
