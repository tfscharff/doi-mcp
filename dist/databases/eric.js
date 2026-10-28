// ERIC database adapter (education research)
import { fetchJson } from '../http.js';
export const config = {
    name: 'eric',
    displayName: 'ERIC',
    baseUrl: 'https://api.ies.ed.gov/eric',
    coverage: '1.7+ million education publications',
};
// ERIC has no DOI field; a record's DOI only appears as a doi.org link in `url`
const FIELDS = 'id,title,author,publicationdateyear,source,publicationtype,url';
export async function search(query, options = {}) {
    const { limit = 3, signal } = options;
    const doiOnly = `(${query}) AND url:*doi.org*`;
    const url = `${config.baseUrl}/?search=${encodeURIComponent(doiOnly)}&rows=${limit}&format=json&fields=${FIELDS}`;
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
    const doi = result.url?.match(/doi\.org\/(10\..+)$/)?.[1];
    const type = Array.isArray(result.publicationtype) ? result.publicationtype[0] : result.publicationtype;
    return {
        source: config.displayName,
        title: result.title,
        authors: result.author?.filter(Boolean),
        year: result.publicationdateyear ? Number(result.publicationdateyear) : undefined,
        doi,
        journal: result.source || type,
    };
}
