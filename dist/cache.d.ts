export declare function get<T>(key: string): T | null;
export declare function set<T>(key: string, data: T): void;
export declare function createKey(tool: string, params: Record<string, unknown>): string;
export declare function clear(): void;
export declare function size(): number;
