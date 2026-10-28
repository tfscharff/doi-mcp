// findVerifiedPapers tool - search for papers across databases
import { searchMultipleSources, deduplicatePapers } from '../databases/index.js';
import * as cache from '../cache.js';
export async function findVerifiedPapers(input) {
    const { query, limit = 5, yearFrom, yearTo, source = 'all' } = input;
    try {
        // Check cache
        const cacheKey = cache.createKey('findVerifiedPapers', { query, limit, yearFrom, yearTo, source });
        const cached = cache.get(cacheKey);
        if (cached) {
            return { content: [{ type: 'text', text: JSON.stringify(cached, null, 2) }] };
        }
        const sources = source === 'all' ? undefined : [source];
        const searchResults = await searchMultipleSources(query, {
            yearFrom,
            yearTo,
            limit,
            sources,
        });
        const { errors } = searchResults;
        const failed = errors.map(e => `${e.database} (${e.message})`).join(', ');
        if (searchResults.results.length === 0) {
            // A failed database proves nothing about whether papers exist, so say which ones failed
            const allFailed = errors.length > 0 && errors.length === searchResults.sources.length;
            const message = allFailed
                ? `Every database queried failed, so no papers could be checked: ${failed}.`
                : errors.length > 0
                    ? `No papers with a DOI found in the databases that responded. These failed: ${failed}.`
                    : 'No papers with a DOI found for this query in any database.';
            const result = {
                count: 0,
                message,
                sourcesQueried: searchResults.sources,
                errors: errors.length > 0 ? errors : undefined,
            };
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
                ...(allFailed ? { isError: true } : {}),
            };
        }
        const uniquePapers = deduplicatePapers(searchResults.results);
        const citations = uniquePapers.slice(0, limit).map((paper, idx) => ({
            index: idx + 1,
            source: paper.source,
            title: paper.title || 'No title',
            authors: paper.authors,
            year: paper.year || 'Unknown year',
            journal: paper.journal || 'Unknown journal',
            doi: paper.doi,
            doiUrl: `https://doi.org/${paper.doi}`,
            abstractFromArticle: paper.abstract,
        }));
        const result = {
            count: citations.length,
            sources: [...new Set(citations.map(c => c.source))],
            papers: citations,
            note: 'All citations are verified from multiple academic databases. Use the doiUrl field to access papers.',
            errors: errors.length > 0 ? errors : undefined,
        };
        // Don't cache partial results: a failed database may be back on the next call
        if (errors.length === 0)
            cache.set(cacheKey, result);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
    catch (error) {
        return {
            content: [{ type: 'text', text: `Error: ${error.message}` }],
            isError: true,
        };
    }
}
