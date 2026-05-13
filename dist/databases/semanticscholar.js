// Semantic Scholar database adapter
import { fetchJson } from '../http.js';
export const config = {
    name: 'semanticscholar',
    displayName: 'Semantic Scholar',
    baseUrl: 'https://api.semanticscholar.org/graph/v1',
    coverage: '200+ million papers',
};
export async function search(query, options = {}) {
    const { year, yearFrom, yearTo, limit = 3, signal } = options;
    let url = `${config.baseUrl}/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=paperId,title,authors,year,externalIds,venue,abstract`;
    if (year) {
        url += `&year=${year}`;
    }
    else if (yearFrom && yearTo) {
        url += `&year=${yearFrom}-${yearTo}`;
    }
    else if (yearFrom) {
        url += `&year=${yearFrom}-`;
    }
    else if (yearTo) {
        url += `&year=-${yearTo}`;
    }
    try {
        const data = await fetchJson(url, { signal });
        return data.data || [];
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
        title: result.title,
        authors: result.authors?.map(a => a.name).filter((n) => !!n),
        year: result.year,
        doi: result.externalIds?.DOI,
        journal: result.venue,
        abstract: result.abstract,
    };
}
