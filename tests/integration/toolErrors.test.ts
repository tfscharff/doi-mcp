import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as cache from '../../src/cache.js';

// Force the orchestrator to throw so the tools' outer catch blocks run
vi.mock('../../src/databases/index.js', () => ({
  searchMultipleSources: vi.fn(() => Promise.reject(new Error('orchestrator exploded'))),
  deduplicatePapers: vi.fn(),
}));

const { verifyCitation } = await import('../../src/tools/verifyCitation.js');
const { findVerifiedPapers } = await import('../../src/tools/findVerifiedPapers.js');
const { batchVerifyCitations } = await import('../../src/tools/batchVerifyCitations.js');

describe('tool error handling', () => {
  beforeEach(() => {
    cache.clear();
  });

  it('verifyCitation returns isError with the message', async () => {
    const result = await verifyCitation({ title: 'Anything' });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toEqual({ verified: false, error: 'orchestrator exploded' });
  });

  it('findVerifiedPapers returns isError with the message', async () => {
    const result = await findVerifiedPapers({ query: 'anything' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Error: orchestrator exploded');
  });

  it('batchVerifyCitations returns isError with the message', async () => {
    const result = await batchVerifyCitations({ citations: [{ title: 'Anything' }] });

    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toEqual({ error: 'orchestrator exploded' });
  });
});
