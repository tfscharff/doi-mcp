// Input validation (replaces Zod dependency)
export function validateCitationInput(input) {
    if (typeof input !== 'object' || input === null) {
        throw new Error('Input must be an object');
    }
    const obj = input;
    const title = typeof obj.title === 'string' ? obj.title : undefined;
    const doi = typeof obj.doi === 'string' ? obj.doi : undefined;
    const journal = typeof obj.journal === 'string' ? obj.journal : undefined;
    const year = typeof obj.year === 'number' ? obj.year : undefined;
    const authors = Array.isArray(obj.authors)
        ? obj.authors.filter((a) => typeof a === 'string')
        : undefined;
    return { title, doi, journal, year, authors };
}
export function validateBatchInput(input) {
    if (typeof input !== 'object' || input === null) {
        throw new Error('Input must be an object');
    }
    const obj = input;
    if (!Array.isArray(obj.citations)) {
        throw new Error('citations must be an array');
    }
    const citations = obj.citations.map((c, i) => {
        const citation = validateCitationInput(c);
        const id = typeof c?.id === 'string' ? c.id : `citation_${i + 1}`;
        return { ...citation, id };
    });
    return { citations };
}
export function validateSearchInput(input) {
    if (typeof input !== 'object' || input === null) {
        throw new Error('Input must be an object');
    }
    const obj = input;
    if (typeof obj.query !== 'string' || !obj.query.trim()) {
        throw new Error('query is required and must be a non-empty string');
    }
    const validSources = ['all', 'crossref', 'openalex', 'pubmed', 'zbmath', 'eric', 'hal', 'inspirehep', 'semanticscholar', 'dblp'];
    let source = 'all';
    if (typeof obj.source === 'string' && validSources.includes(obj.source)) {
        source = obj.source;
    }
    let limit = 5;
    if (typeof obj.limit === 'number' && obj.limit >= 1 && obj.limit <= 20) {
        limit = Math.floor(obj.limit);
    }
    return {
        query: obj.query.trim(),
        limit,
        yearFrom: typeof obj.yearFrom === 'number' ? obj.yearFrom : undefined,
        yearTo: typeof obj.yearTo === 'number' ? obj.yearTo : undefined,
        source,
    };
}
