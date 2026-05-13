import type { SearchInput } from '../types.js';
export declare function findVerifiedPapers(input: SearchInput): Promise<{
    content: Array<{
        type: 'text';
        text: string;
    }>;
    isError?: boolean;
}>;
