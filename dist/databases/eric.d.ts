import type { NormalizedPaper, DatabaseConfig } from '../types.js';
export declare const config: DatabaseConfig;
interface ERICDoc {
    title?: string;
    author?: string[];
    publicationdateyear?: string;
    doi?: string;
    source?: string;
    publicationtype?: string;
}
export declare function search(query: string, options?: {
    limit?: number;
    signal?: AbortSignal;
}): Promise<ERICDoc[]>;
export declare function normalize(result: ERICDoc): NormalizedPaper;
export {};
