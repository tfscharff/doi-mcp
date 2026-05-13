// batchVerifyCitations tool - verify multiple citations in parallel
import { MATCH_THRESHOLD, HIGH_CONFIDENCE_THRESHOLD } from '../types.js';
import { searchMultipleSources } from '../databases/index.js';
import { findBestMatch } from '../scoring.js';
import { fetchWithRedirect } from '../http.js';
async function verifyByDoi(doi) {
    const cleanDoi = doi.replace(/^(https?:\/\/)?(dx\.)?doi\.org\//, '');
    try {
        const metadata = await fetchWithRedirect(`https://doi.org/${cleanDoi}`, { accept: 'application/vnd.citationstyles.csl+json' });
        return {
            source: 'DOI.org',
            title: Array.isArray(metadata.title) ? metadata.title[0] : metadata.title,
            authors: metadata.author?.map(a => `${a.given || ''} ${a.family || ''}`.trim()),
            year: metadata.published?.['date-parts']?.[0]?.[0] || metadata.issued?.['date-parts']?.[0]?.[0],
            doi: metadata.DOI,
            journal: Array.isArray(metadata['container-title']) ? metadata['container-title'][0] : metadata['container-title'],
            abstract: metadata.abstract?.replace(/<[^>]*>/g, ''),
        };
    }
    catch {
        return null;
    }
}
async function verifySingleCitation(citation) {
    const citationId = citation.id || 'unknown';
    // If DOI provided, try direct lookup first
    if (citation.doi) {
        const paper = await verifyByDoi(citation.doi);
        if (paper) {
            return {
                id: citationId,
                verified: true,
                confidence: 'high',
                source: 'DOI.org',
                paper,
            };
        }
    }
    // Build search query
    const queryParts = [];
    if (citation.title)
        queryParts.push(citation.title);
    if (citation.authors?.length)
        queryParts.push(citation.authors.join(' '));
    if (citation.journal)
        queryParts.push(citation.journal);
    if (queryParts.length === 0) {
        return {
            id: citationId,
            verified: false,
            message: 'Insufficient information to verify',
        };
    }
    const query = queryParts.join(' ');
    const searchResults = await searchMultipleSources(query, { year: citation.year });
    if (searchResults.results.length === 0) {
        return {
            id: citationId,
            verified: false,
            message: 'No matching publications found',
        };
    }
    const { match: bestMatch, score: bestScore } = findBestMatch(searchResults.results, citation);
    if (!bestMatch || bestScore < MATCH_THRESHOLD) {
        return {
            id: citationId,
            verified: false,
            message: 'Could not confidently verify',
            possibleMatches: searchResults.results.slice(0, 2).map(r => ({
                title: r.title,
                authors: r.authors,
                year: r.year,
            })),
        };
    }
    return {
        id: citationId,
        verified: true,
        confidence: bestScore >= HIGH_CONFIDENCE_THRESHOLD ? 'high' : 'medium',
        source: bestMatch.source,
        paper: {
            title: bestMatch.title,
            authors: bestMatch.authors,
            year: bestMatch.year,
            doi: bestMatch.doi,
            doiUrl: bestMatch.doi ? `https://doi.org/${bestMatch.doi}` : null,
            journal: bestMatch.journal,
            abstractFromArticle: bestMatch.abstract,
        },
    };
}
export async function batchVerifyCitations(input) {
    try {
        const results = await Promise.all(input.citations.map(verifySingleCitation));
        const verified = results.filter(r => r.verified).length;
        const failed = results.filter(r => !r.verified).length;
        return {
            content: [{
                    type: 'text',
                    text: JSON.stringify({
                        summary: { total: input.citations.length, verified, failed },
                        results,
                    }, null, 2),
                }],
        };
    }
    catch (error) {
        return {
            content: [{ type: 'text', text: JSON.stringify({ error: error.message }, null, 2) }],
            isError: true,
        };
    }
}
