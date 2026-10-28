import type { NormalizedPaper, DatabaseConfig } from '../types.js';
export declare const config: DatabaseConfig;
interface ZbMathResult {
    title?: {
        title?: string | null;
        subtitle?: string | null;
    };
    contributors?: {
        authors?: Array<{
            name?: string;
        }>;
    };
    year?: string;
    links?: Array<{
        type?: string;
        identifier?: string;
    }>;
    source?: {
        series?: Array<{
            title?: string;
        }>;
        source?: string;
    };
}
export declare function search(query: string, options?: {
    year?: number;
    limit?: number;
    signal?: AbortSignal;
}): Promise<ZbMathResult[]>;
export declare function normalize(result: ZbMathResult): NormalizedPaper;
export {};
