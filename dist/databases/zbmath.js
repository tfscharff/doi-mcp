// zbMATH Open database adapter (mathematics)
import { fetchJson } from '../http.js';
export const config = {
    name: 'zbmath',
    displayName: 'zbMATH',
    baseUrl: 'https://api.zbmath.org',
    coverage: '4+ million mathematics publications',
};
export async function search(query, options = {}) {
    const { year, limit = 3, signal } = options;
    // zbMATH query language: `py:` filters by publication year
    const searchString = year ? `${query} py:${year}` : query;
    const url = `${config.baseUrl}/v1/document/_search?search_string=${encodeURIComponent(searchString)}&page=0&results_per_page=${limit}`;
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
    return {
        source: config.displayName,
        title: result.title?.title || undefined,
        authors: result.contributors?.authors?.map(a => a.name).filter((n) => !!n),
        year: result.year ? parseInt(result.year) : undefined,
        doi: result.links?.find(l => l.type === 'doi')?.identifier,
        journal: result.source?.series?.[0]?.title || result.source?.source,
    };
}
