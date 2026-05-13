// ERIC database adapter (education research)
import { fetchJson } from '../http.js';
export const config = {
    name: 'eric',
    displayName: 'ERIC',
    baseUrl: 'https://api.ies.ed.gov/eric',
    coverage: '1.7+ million education publications',
};
export async function search(query, options = {}) {
    const { limit = 3, signal } = options;
    const url = `${config.baseUrl}/?search=${encodeURIComponent(query)}&rows=${limit}&format=json`;
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
        title: result.title,
        authors: result.author?.filter(Boolean),
        year: result.publicationdateyear ? parseInt(result.publicationdateyear) : undefined,
        doi: result.doi,
        journal: result.source || result.publicationtype,
    };
}
