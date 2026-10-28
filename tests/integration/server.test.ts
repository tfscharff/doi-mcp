import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../../src/server.js';
import * as cache from '../../src/cache.js';
import pkg from '../../package.json' with { type: 'json' };

const mockFetch = vi.fn();
global.fetch = mockFetch;

const ok = (body: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

// Exercise the server end to end through a real MCP client over an in-memory transport
let client: Client;

beforeAll(async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([createServer().connect(serverTransport), client.connect(clientTransport)]);
});

afterAll(async () => {
  await client.close();
});

beforeEach(() => {
  vi.resetAllMocks();
  cache.clear();
});

const textOf = (result: any) => result.content[0].text as string;

describe('server metadata', () => {
  it('reports the package.json version', () => {
    expect(client.getServerVersion()).toEqual({ name: 'Multi-Source Citation Verifier', version: pkg.version });
  });
});

describe('tools', () => {
  it('registers the three tools with read-only annotations', async () => {
    const { tools } = await client.listTools();

    expect(tools.map(t => t.name).sort()).toEqual(['batchVerifyCitations', 'findVerifiedPapers', 'verifyCitation']);
    for (const tool of tools) {
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true });
    }
  });

  it('routes verifyCitation calls', async () => {
    mockFetch.mockImplementation(() => ok({ title: 'Via Server', DOI: '10.1/srv' }));

    const result = await client.callTool({ name: 'verifyCitation', arguments: { doi: '10.1/srv' } });

    expect(JSON.parse(textOf(result))).toMatchObject({ verified: true, title: 'Via Server' });
  });

  it('routes batchVerifyCitations calls', async () => {
    const result = await client.callTool({ name: 'batchVerifyCitations', arguments: { citations: [{ id: 'a' }] } });

    expect(JSON.parse(textOf(result)).summary).toEqual({ total: 1, verified: 0, failed: 1 });
  });

  it('routes findVerifiedPapers calls and applies schema defaults', async () => {
    mockFetch.mockImplementation(() => ok({}));

    const result = await client.callTool({ name: 'findVerifiedPapers', arguments: { query: 'nothing' } });

    expect(textOf(result)).toContain('No papers with a DOI found for this query in any database.');
    // source defaults to 'all', so every database is queried
    expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(9);
    // limit defaults to 5, over-fetched 3x from each source (CrossRef's rows=)
    expect(mockFetch.mock.calls.some(([url]) => url.includes('rows=15'))).toBe(true);
  });

  it('rejects arguments that fail schema validation', async () => {
    const result = await client.callTool({ name: 'findVerifiedPapers', arguments: { query: 'x', limit: 99 } });

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects an unknown source', async () => {
    const result = await client.callTool({ name: 'findVerifiedPapers', arguments: { query: 'x', source: 'google' } });

    expect(result.isError).toBe(true);
  });
});

describe('resources', () => {
  it('lists both resources', async () => {
    const { resources } = await client.listResources();

    expect(resources.map(r => r.uri).sort()).toEqual(['citation://databases', 'citation://guidelines']);
  });

  it('serves the database list as JSON', async () => {
    const { contents } = await client.readResource({ uri: 'citation://databases' });
    const data = JSON.parse(contents[0].text as string);

    expect(contents[0].mimeType).toBe('application/json');
    expect(data.databases).toHaveLength(9);
    expect(data.databases[0]).toEqual(expect.objectContaining({ name: 'CrossRef', url: 'https://api.crossref.org' }));
  });

  it('serves the guidelines as markdown', async () => {
    const { contents } = await client.readResource({ uri: 'citation://guidelines' });

    expect(contents[0].mimeType).toBe('text/markdown');
    expect(contents[0].text).toContain('# Citation Verification Guidelines');
  });
});

describe('prompts', () => {
  it('serves the citation-verification-rules prompt', async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map(p => p.name)).toEqual(['citation-verification-rules']);

    const { messages } = await client.getPrompt({ name: 'citation-verification-rules' });

    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect((messages[0].content as { text: string }).text).toContain('NEVER cite academic papers from memory');
  });
});
