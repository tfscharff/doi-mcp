// CrossRef database adapter
import { fetchJson } from '../http.js';
export const config = {
    name: 'crossref',
    displayName: 'CrossRef',
    baseUrl: 'https://api.crossref.org',
    coverage: '150+ million scholarly publications',
};
export async function search(query, options = {}) {
    const { year, limit = 3, signal } = options;
    let url = `${config.baseUrl}/works?query=${encodeURIComponent(query)}&rows=${limit}`;
    if (year) {
        url += `&filter=from-pub-date:${year},until-pub-date:${year}`;
    }
    try {
        const data = await fetchJson(url, { signal });
        return data.message?.items || [];
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
        title: result.title?.[0],
        authors: result.author?.map(a => `${a.given || ''} ${a.family || ''}`.trim()),
        year: result.published?.['date-parts']?.[0]?.[0],
        doi: result.DOI,
        journal: result['container-title']?.[0],
        abstract: result.abstract?.replace(/<[^>]*>/g, ''),
    };
}
