import type { NormalizedPaper, DatabaseConfig } from '../types.js';
export declare const config: DatabaseConfig;
interface OpenAlexWork {
    title?: string;
    authorships?: Array<{
        author?: {
            display_name?: string;
        };
    }>;
    publication_year?: number;
    doi?: string;
    primary_location?: {
        source?: {
            display_name?: string;
        };
    };
    abstract_inverted_index?: Record<string, number[]>;
}
export declare function search(query: string, options?: {
    year?: number;
    yearFrom?: number;
    yearTo?: number;
    limit?: number;
    signal?: AbortSignal;
}): Promise<OpenAlexWork[]>;
export declare function normalize(result: OpenAlexWork): NormalizedPaper;
export {};
