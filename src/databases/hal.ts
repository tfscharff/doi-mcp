// HAL database adapter (French/European scholarship)

import type { NormalizedPaper, DatabaseConfig, DatabaseError } from '../types.js';
import { fetchJson } from '../http.js';

export const config: DatabaseConfig = {
  name: 'hal',
  displayName: 'HAL',
  baseUrl: 'https://api.archives-ouvertes.fr/search',
  coverage: '4.4+ million documents',
};

interface HALDoc {
  title_s?: string[];
  en_title_s?: string[];
  authFullName_s?: string[];
  publicationDateY_i?: number;
  doiId_s?: string;
  journalTitle_s?: string;
  bookTitle_s?: string;
  abstract_s?: string[];
  en_abstract_s?: string[];
}

interface HALResponse {
  response?: { docs?: HALDoc[] };
}

export async function search(
  query: string,
  options: { year?: number; yearFrom?: number; yearTo?: number; limit?: number; signal?: AbortSignal } = {}
): Promise<HALDoc[]> {
  const { year, yearFrom, yearTo, limit = 3, signal } = options;

  let url = `${config.baseUrl}/?q=${encodeURIComponent(query)}&wt=json&rows=${limit}`;

  if (year) {
    url += `&fq=publicationDateY_i:${year}`;
  } else if (yearFrom && yearTo) {
    url += `&fq=publicationDateY_i:[${yearFrom} TO ${yearTo}]`;
  } else if (yearFrom) {
    url += `&fq=publicationDateY_i:[${yearFrom} TO *]`;
  } else if (yearTo) {
    url += `&fq=publicationDateY_i:[* TO ${yearTo}]`;
  }

  try {
    const data = await fetchJson<HALResponse>(url, { signal });
    return data.response?.docs || [];
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw { code: 'ABORTED', message: 'Request cancelled' } as DatabaseError;
    }
    throw { code: 'API_ERROR', database: config.displayName, message: (err as Error).message } as DatabaseError;
  }
}

export function normalize(result: HALDoc): NormalizedPaper {
  return {
    source: config.displayName,
    title: result.title_s?.[0] || result.en_title_s?.[0],
    authors: result.authFullName_s,
    year: result.publicationDateY_i,
    doi: result.doiId_s,
    journal: result.journalTitle_s || result.bookTitle_s,
    abstract: result.abstract_s?.[0] || result.en_abstract_s?.[0],
  };
}
