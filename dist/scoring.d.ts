import type { NormalizedPaper, CitationInput } from './types.js';
export declare function calculateMatchScore(result: NormalizedPaper, filters: CitationInput): number;
export declare function findBestMatch(papers: NormalizedPaper[], filters: CitationInput): {
    match: NormalizedPaper | null;
    score: number;
};
