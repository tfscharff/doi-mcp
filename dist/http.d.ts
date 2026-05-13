interface FetchOptions {
    headers?: Record<string, string>;
    signal?: AbortSignal;
    timeout?: number;
}
export declare function fetchJson<T>(url: string, options?: FetchOptions): Promise<T>;
export declare function fetchText(url: string, options?: FetchOptions): Promise<string>;
export declare function fetchWithRedirect<T>(url: string, options?: FetchOptions & {
    accept?: string;
}): Promise<T>;
export {};
