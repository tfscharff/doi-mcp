import type { NormalizedPaper, DatabaseConfig } from '../types.js';
export declare const config: DatabaseConfig;
interface ZbMathResult {
    title?: string;
    authors?: Array<{
        name?: string;
    } | string>;
    year?: number;
    publication_year?: number;
    doi?: string;
    source?: string;
    journal?: string;
}
export declare function search(query: string, options?: {
    year?: number;
    limit?: number;
    signal?: AbortSignal;
}): Promise<ZbMathResult[]>;
export declare function normalize(result: ZbMathResult): NormalizedPaper;
export {};
