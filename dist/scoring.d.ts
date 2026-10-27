import type { NormalizedPaper, CitationInput } from './types.js';
export declare function calculateMatchScore(result: NormalizedPaper, filters: CitationInput): number;
export declare function hasIdentityMatch(result: NormalizedPaper, filters: CitationInput): boolean;
export declare function findBestMatch<T extends NormalizedPaper>(papers: T[], filters: CitationInput): {
    match: T | null;
    score: number;
};
