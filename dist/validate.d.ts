import type { CitationInput, BatchCitationInput, SearchInput } from './types.js';
export declare function validateCitationInput(input: unknown): CitationInput;
export declare function validateBatchInput(input: unknown): {
    citations: BatchCitationInput[];
};
export declare function validateSearchInput(input: unknown): SearchInput;
