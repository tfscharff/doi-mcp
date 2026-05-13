// OpenAlex database adapter
import { fetchJson } from '../http.js';
export const config = {
    name: 'openalex',
    displayName: 'OpenAlex',
    baseUrl: 'https://api.openalex.org',
    coverage: '250+ million scholarly works',
};
function reconstructAbstract(invertedIndex) {
    const words = [];
    for (const [word, positions] of Object.entries(invertedIndex)) {
        for (const pos of positions) {
            words.push([word, pos]);
        }
    }
    words.sort((a, b) => a[1] - b[1]);
    return words.map(w => w[0]).join(' ');
}
export async function search(query, options = {}) {
    const { year, yearFrom, yearTo, limit = 3, signal } = options;
    let url = `${config.baseUrl}/works?search=${encodeURIComponent(query)}&per_page=${limit}`;
    if (year) {
        url += `&filter=publication_year:${year}`;
    }
    else if (yearFrom && yearTo) {
        url += `&filter=publication_year:${yearFrom}-${yearTo}`;
    }
    else if (yearFrom) {
        url += `&filter=publication_year:>${yearFrom - 1}`;
    }
    else if (yearTo) {
        url += `&filter=publication_year:<${yearTo + 1}`;
    }
    try {
        const data = await fetchJson(url, {
            headers: { 'User-Agent': 'mailto:research@example.com' },
            signal,
        });
        return data.results || [];
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
        authors: result.authorships?.map(a => a.author?.display_name).filter((n) => !!n),
        year: result.publication_year,
        doi: result.doi?.replace('https://doi.org/', ''),
        journal: result.primary_location?.source?.display_name,
        abstract: result.abstract_inverted_index ? reconstructAbstract(result.abstract_inverted_index) : undefined,
    };
}
