import type { NormalizedPaper, DatabaseConfig } from '../types.js';
export declare const config: DatabaseConfig;
interface HALDoc {
    title_s?: string[];
    en_title_s?: string[];
    authFullName_s?: string[];
    publicationDateY_i?: number;
    doiId_s?: string;
    journalTitle_s?: string;
    bookTitle_s?: string;
    abstract_s?: string[];
    en_abstract_s?: string[];
}
export declare function search(query: string, options?: {
    year?: number;
    yearFrom?: number;
    yearTo?: number;
    limit?: number;
    signal?: AbortSignal;
}): Promise<HALDoc[]>;
export declare function normalize(result: HALDoc): NormalizedPaper;
export {};
