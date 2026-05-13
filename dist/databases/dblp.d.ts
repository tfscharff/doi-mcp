import type { NormalizedPaper, DatabaseConfig } from '../types.js';
export declare const config: DatabaseConfig;
interface DBLPHit {
    info?: {
        title?: string;
        authors?: {
            author?: string | string[] | Array<{
                text?: string;
            }>;
        };
        year?: string;
        doi?: string;
        venue?: string;
    };
}
export declare function search(query: string, options?: {
    yearFrom?: number;
    yearTo?: number;
    limit?: number;
    signal?: AbortSignal;
}): Promise<DBLPHit[]>;
export declare function normalize(result: DBLPHit): NormalizedPaper;
export {};
