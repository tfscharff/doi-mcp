// Shared HTTP utilities with connection reuse
const DEFAULT_TIMEOUT = 10000;
// Non-OK responses throw this, so callers can react to the status (e.g. 429 rate limits)
export class HttpError extends Error {
    status;
    constructor(status, statusText) {
        super(statusText ? `HTTP ${status}: ${statusText}` : `HTTP ${status}`);
        this.status = status;
    }
}
export async function fetchJson(url, options = {}) {
    const { headers = {}, signal, timeout = DEFAULT_TIMEOUT } = options;
    // Create timeout signal if not provided
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
        const res = await fetch(url, {
            headers: {
                'Accept': 'application/json',
                ...headers,
            },
            signal: signal || controller.signal,
        });
        if (!res.ok) {
            throw new HttpError(res.status, res.statusText);
        }
        // Bot checks and error pages come back as HTML, sometimes with a 2xx status
        if (res.headers?.get('content-type')?.includes('text/html')) {
            throw new Error(`Expected JSON but got an HTML page (HTTP ${res.status}), likely a bot check or outage`);
        }
        return await res.json();
    }
    finally {
        clearTimeout(timeoutId);
    }
}
export async function fetchText(url, options = {}) {
    const { headers = {}, signal, timeout = DEFAULT_TIMEOUT } = options;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
        const res = await fetch(url, {
            headers,
            signal: signal || controller.signal,
        });
        if (!res.ok) {
            throw new HttpError(res.status, res.statusText);
        }
        return await res.text();
    }
    finally {
        clearTimeout(timeoutId);
    }
}
export async function fetchWithRedirect(url, options = {}) {
    const { headers = {}, signal, timeout = DEFAULT_TIMEOUT, accept } = options;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
        const res = await fetch(url, {
            headers: {
                ...(accept ? { 'Accept': accept } : {}),
                ...headers,
            },
            redirect: 'follow',
            signal: signal || controller.signal,
        });
        if (!res.ok) {
            throw new HttpError(res.status, res.statusText);
        }
        return await res.json();
    }
    finally {
        clearTimeout(timeoutId);
    }
}
