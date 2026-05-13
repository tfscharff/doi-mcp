import type { NormalizedPaper, SearchResults } from '../types.js';
export { getDOIsFromPubMed } from './pubmed.js';
interface SearchOptions {
    year?: number;
    yearFrom?: number;
    yearTo?: number;
    limit?: number;
    sources?: string[];
}
export declare const allDatabases: {
    name: string;
    displayName: string;
    coverage: string;
    baseUrl: string;
}[];
export declare function searchMultipleSources(query: string, options?: SearchOptions): Promise<SearchResults>;
export declare function deduplicatePapers(papers: NormalizedPaper[]): NormalizedPaper[];
