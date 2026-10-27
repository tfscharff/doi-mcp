import { describe, it, expect, vi } from 'vitest';

const { connect, transport } = vi.hoisted(() => ({
  connect: vi.fn(() => Promise.resolve()),
  transport: { kind: 'stdio' },
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  // Called with `new`, so the mock must be a function, not an arrow
  StdioServerTransport: vi.fn(function () { return transport; }),
}));
vi.mock('../../src/server.js', () => ({
  createServer: vi.fn(() => ({ connect })),
}));

describe('entry point', () => {
  it('connects the server to a stdio transport', async () => {
    await import('../../src/index.js');

    expect(connect).toHaveBeenCalledWith(transport);
  });
});
