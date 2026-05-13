import type { NormalizedPaper, DatabaseConfig } from '../types.js';
export declare const config: DatabaseConfig;
interface InspireHit {
    metadata?: {
        titles?: Array<{
            title?: string;
        }>;
        authors?: Array<{
            full_name?: string;
        }>;
        publication_info?: Array<{
            year?: string;
            journal_title?: string;
            conference_record?: {
                titles?: Array<{
                    title?: string;
                }>;
            };
        }>;
        preprint_date?: string;
        dois?: Array<{
            value?: string;
        }>;
        abstracts?: Array<{
            value?: string;
        }>;
    };
}
export declare function search(query: string, options?: {
    year?: number;
    yearFrom?: number;
    yearTo?: number;
    limit?: number;
    signal?: AbortSignal;
}): Promise<InspireHit[]>;
export declare function normalize(result: InspireHit): NormalizedPaper;
export {};
