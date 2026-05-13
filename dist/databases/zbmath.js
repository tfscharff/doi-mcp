// zbMATH database adapter (mathematics)
import { fetchJson } from '../http.js';
export const config = {
    name: 'zbmath',
    displayName: 'zbMATH',
    baseUrl: 'https://api.zbmath.org',
    coverage: '4+ million mathematics publications',
};
export async function search(query, options = {}) {
    const { year, limit = 3, signal } = options;
    let url = `${config.baseUrl}/document/_structured_search?query=${encodeURIComponent(query)}&results_per_page=${limit}`;
    if (year) {
        url += `&year=${year}`;
    }
    try {
        const data = await fetchJson(url, { signal });
        return data.result || [];
    }
    catch (err) {
        if (err.name === 'AbortError') {
            throw { code: 'ABORTED', message: 'Request cancelled' };
        }
        throw { code: 'API_ERROR', database: config.displayName, message: err.message };
    }
}
export function normalize(result) {
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
