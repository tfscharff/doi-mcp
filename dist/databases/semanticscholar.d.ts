import type { NormalizedPaper, DatabaseConfig } from '../types.js';
export declare const config: DatabaseConfig;
interface SemanticScholarPaper {
    paperId?: string;
    title?: string;
    authors?: Array<{
        name?: string;
    }>;
    year?: number;
    externalIds?: {
        DOI?: string;
    };
    venue?: string;
    abstract?: string;
}
export declare function search(query: string, options?: {
    year?: number;
    yearFrom?: number;
    yearTo?: number;
    limit?: number;
    signal?: AbortSignal;
}): Promise<SemanticScholarPaper[]>;
export declare function normalize(result: SemanticScholarPaper): NormalizedPaper;
export {};
