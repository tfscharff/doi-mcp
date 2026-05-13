import type { CitationInput } from '../types.js';
export declare function verifyCitation(input: CitationInput): Promise<{
    content: Array<{
        type: 'text';
        text: string;
    }>;
    isError?: boolean;
}>;
