// DBLP database adapter (computer science bibliography)
import { fetchJson } from '../http.js';
export const config = {
    name: 'dblp',
    displayName: 'DBLP',
    baseUrl: 'https://dblp.org',
    coverage: 'Comprehensive computer science bibliography',
};
export async function search(query, options = {}) {
    const { yearFrom, yearTo, limit = 3, signal } = options;
    const url = `${config.baseUrl}/search/publ/api?q=${encodeURIComponent(query)}&format=json&h=${limit}`;
    try {
        const data = await fetchJson(url, { signal });
        let hits = data.result?.hits?.hit || [];
        // Filter by year client-side (DBLP doesn't support year filtering in API)
        if (yearFrom || yearTo) {
            hits = hits.filter(hit => {
                const year = hit.info?.year ? parseInt(hit.info.year) : null;
                if (!year)
                    return true;
                if (yearFrom && year < yearFrom)
                    return false;
                if (yearTo && year > yearTo)
                    return false;
                return true;
            });
        }
        return hits;
    }
    catch (err) {
        if (err.name === 'AbortError') {
            throw { code: 'ABORTED', message: 'Request cancelled' };
        }
        throw { code: 'API_ERROR', database: config.displayName, message: err.message };
    }
}
export function normalize(result) {
    const info = result.info;
    let authors = [];
    if (info?.authors?.author) {
        const authorData = info.authors.author;
        if (Array.isArray(authorData)) {
            authors = authorData.map(a => (typeof a === 'string' ? a : a.text || '')).filter(Boolean);
        }
        else if (typeof authorData === 'string') {
            authors = [authorData];
        }
    }
    return {
        source: config.displayName,
        title: info?.title,
        authors,
        year: info?.year ? parseInt(info.year) : undefined,
        doi: info?.doi,
        journal: info?.venue,
    };
}
