import type { NormalizedPaper, DatabaseConfig } from '../types.js';
export declare const config: DatabaseConfig;
interface CrossRefWork {
    title?: string[];
    author?: Array<{
        given?: string;
        family?: string;
    }>;
    published?: {
        'date-parts'?: number[][];
    };
    DOI?: string;
    'container-title'?: string[];
    abstract?: string;
}
export declare function search(query: string, options?: {
    year?: number;
    limit?: number;
    signal?: AbortSignal;
}): Promise<CrossRefWork[]>;
export declare function normalize(result: CrossRefWork): NormalizedPaper;
export {};
