import type { NormalizedPaper, DatabaseConfig } from '../types.js';
export declare const config: DatabaseConfig;
interface PubMedSummary {
    uid?: string;
    title?: string;
    authors?: Array<{
        name?: string;
    }>;
    pubdate?: string;
    source?: string;
}
export declare function getDOIsFromPubMed(pmids: string[], signal?: AbortSignal): Promise<Map<string, string>>;
export declare function search(query: string, options?: {
    year?: number;
    yearFrom?: number;
    yearTo?: number;
    limit?: number;
    signal?: AbortSignal;
}): Promise<PubMedSummary[]>;
export declare function normalize(result: PubMedSummary, doiMap?: Map<string, string>): NormalizedPaper;
export {};
