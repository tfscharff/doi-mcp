import type { BatchCitationInput } from '../types.js';
export declare function batchVerifyCitations(input: {
    citations: BatchCitationInput[];
}): Promise<{
    content: Array<{
        type: 'text';
        text: string;
    }>;
    isError?: boolean;
}>;
