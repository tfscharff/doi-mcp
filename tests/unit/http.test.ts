import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchJson, fetchText, fetchWithRedirect } from '../../src/http.js';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// A fetch that never resolves until its signal aborts
function hangUntilAborted(_url: string, init: { signal: AbortSignal }) {
  return new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => {
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    });
  });
}

describe('http', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('fetchJson', () => {
    it('sends Accept: application/json merged with custom headers', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ a: 1 }) });

      const data = await fetchJson('https://example.org', { headers: { 'X-Test': 'yes' } });

      expect(data).toEqual({ a: 1 });
      expect(mockFetch.mock.calls[0][1].headers).toEqual({ Accept: 'application/json', 'X-Test': 'yes' });
    });

    it('throws on non-OK responses', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });

      await expect(fetchJson('https://example.org')).rejects.toThrow('HTTP 404: Not Found');
    });

    it('aborts after the timeout', async () => {
      vi.useFakeTimers();
      mockFetch.mockImplementation(hangUntilAborted);

      const promise = fetchJson('https://example.org', { timeout: 50 });
      const assertion = expect(promise).rejects.toMatchObject({ name: 'AbortError' });
      await vi.advanceTimersByTimeAsync(50);

      await assertion;
    });

    it('uses a caller-provided signal instead of the timeout signal', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
      const controller = new AbortController();

      await fetchJson('https://example.org', { signal: controller.signal });

      expect(mockFetch.mock.calls[0][1].signal).toBe(controller.signal);
    });
  });

  describe('fetchText', () => {
    it('returns the response text', async () => {
      mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('<xml/>') });

      expect(await fetchText('https://example.org')).toBe('<xml/>');
    });

    it('throws on non-OK responses', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' });

      await expect(fetchText('https://example.org')).rejects.toThrow('HTTP 500: Server Error');
    });
  });

  describe('fetchWithRedirect', () => {
    it('follows redirects and sends the requested Accept header', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ DOI: '10.1/x' }) });

      const data = await fetchWithRedirect('https://doi.org/10.1/x', { accept: 'application/vnd.citationstyles.csl+json' });

      expect(data).toEqual({ DOI: '10.1/x' });
      const init = mockFetch.mock.calls[0][1];
      expect(init.redirect).toBe('follow');
      expect(init.headers).toEqual({ Accept: 'application/vnd.citationstyles.csl+json' });
    });

    it('omits Accept when not requested', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

      await fetchWithRedirect('https://doi.org/10.1/x');

      expect(mockFetch.mock.calls[0][1].headers).toEqual({});
    });

    it('throws on non-OK responses', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });

      await expect(fetchWithRedirect('https://doi.org/bad')).rejects.toThrow('HTTP 404: Not Found');
    });
  });
});
