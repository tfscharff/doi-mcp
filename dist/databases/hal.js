// HAL database adapter (French/European scholarship)
import { fetchJson } from '../http.js';
export const config = {
    name: 'hal',
    displayName: 'HAL',
    baseUrl: 'https://api.archives-ouvertes.fr/search',
    coverage: '4.4+ million documents',
};
export async function search(query, options = {}) {
    const { year, yearFrom, yearTo, limit = 3, signal } = options;
    let url = `${config.baseUrl}/?q=${encodeURIComponent(query)}&wt=json&rows=${limit}`;
    if (year) {
        url += `&fq=publicationDateY_i:${year}`;
    }
    else if (yearFrom && yearTo) {
        url += `&fq=publicationDateY_i:[${yearFrom} TO ${yearTo}]`;
    }
    else if (yearFrom) {
        url += `&fq=publicationDateY_i:[${yearFrom} TO *]`;
    }
    else if (yearTo) {
        url += `&fq=publicationDateY_i:[* TO ${yearTo}]`;
    }
    try {
        const data = await fetchJson(url, { signal });
        return data.response?.docs || [];
    }
    catch (err) {
        if (err.name === 'AbortError') {
            throw { code: 'ABORTED', message: 'Request cancelled' };
        }
        throw { code: 'API_ERROR', database: config.displayName, message: err.message };
    }
}
export function normalize(result) {
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
