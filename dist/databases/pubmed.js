// PubMed database adapter (NCBI E-utilities)
import { fetchJson, fetchText } from '../http.js';
export const config = {
    name: 'pubmed',
    displayName: 'PubMed',
    baseUrl: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils',
    coverage: '35+ million biomedical publications',
};
// Batch fetch DOIs from PubMed XML
export async function getDOIsFromPubMed(pmids, signal) {
    const doiMap = new Map();
    if (pmids.length === 0)
        return doiMap;
    try {
        const url = `${config.baseUrl}/efetch.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=xml`;
        const xmlText = await fetchText(url, { signal });
        // Parse each PubmedArticle - state machine approach
        let pos = 0;
        while (pos < xmlText.length) {
            const articleStart = xmlText.indexOf('<PubmedArticle>', pos);
            if (articleStart === -1)
                break;
            const articleEnd = xmlText.indexOf('</PubmedArticle>', articleStart);
            if (articleEnd === -1)
                break;
            const articleXml = xmlText.slice(articleStart, articleEnd);
            // Extract PMID
            const pmidStart = articleXml.indexOf('<PMID');
            if (pmidStart !== -1) {
                const pmidValueStart = articleXml.indexOf('>', pmidStart) + 1;
                const pmidValueEnd = articleXml.indexOf('</PMID>', pmidValueStart);
                const pmid = articleXml.slice(pmidValueStart, pmidValueEnd).trim();
                // Extract DOI
                const doiMarker = '<ArticleId IdType="doi">';
                const doiStart = articleXml.indexOf(doiMarker);
                if (doiStart !== -1) {
                    const doiValueStart = doiStart + doiMarker.length;
                    const doiValueEnd = articleXml.indexOf('</ArticleId>', doiValueStart);
                    const doi = articleXml.slice(doiValueStart, doiValueEnd).trim();
                    if (pmid && doi) {
                        doiMap.set(pmid, doi);
                    }
                }
            }
            pos = articleEnd + 1;
        }
    }
    catch {
        // Return partial results on error
    }
    return doiMap;
}
export async function search(query, options = {}) {
    const { year, yearFrom, yearTo, limit = 3, signal } = options;
    let searchQuery = query;
    if (year) {
        searchQuery += ` AND ${year}:${year}[dp]`;
    }
    else if (yearFrom || yearTo) {
        const from = yearFrom || 1900;
        const to = yearTo || new Date().getFullYear();
        searchQuery += ` AND ${from}:${to}[dp]`;
    }
    try {
        // Step 1: Search for PMIDs
        const searchUrl = `${config.baseUrl}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(searchQuery)}&retmode=json&retmax=${limit}`;
        const searchData = await fetchJson(searchUrl, { signal });
        const pmids = searchData.esearchresult?.idlist || [];
        if (pmids.length === 0)
            return [];
        // Step 2: Fetch summaries
        const fetchUrl = `${config.baseUrl}/esummary.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=json`;
        const fetchData = await fetchJson(fetchUrl, { signal });
        return pmids.map(id => fetchData.result?.[id]).filter((r) => !!r);
    }
    catch (err) {
        if (err.name === 'AbortError') {
            throw { code: 'ABORTED', message: 'Request cancelled' };
        }
        throw { code: 'API_ERROR', database: config.displayName, message: err.message };
    }
}
export function normalize(result, doiMap) {
    const pmid = result.uid;
    const doi = pmid ? doiMap?.get(pmid) : undefined;
    return {
        source: config.displayName,
        title: result.title,
        authors: result.authors?.map(a => a.name).filter((n) => !!n),
        year: result.pubdate ? parseInt(result.pubdate.split(' ')[0]) : undefined,
        doi,
        journal: result.source,
    };
}
