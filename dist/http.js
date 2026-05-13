// Shared HTTP utilities with connection reuse
const DEFAULT_TIMEOUT = 10000;
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
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
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
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
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
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        return await res.json();
    }
    finally {
        clearTimeout(timeoutId);
    }
}
