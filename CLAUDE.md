# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

MCP server that prevents citation hallucination by verifying academic citations against 9 authoritative databases (CrossRef, OpenAlex, PubMed, zbMATH, ERIC, HAL, INSPIRE-HEP, Semantic Scholar, DBLP).

## Architecture

### Modular Structure

```
src/
├── index.ts              # Entry point (~10 lines)
├── server.ts             # MCP setup, tool registration (~200 lines)
├── types.ts              # Interfaces and constants
├── scoring.ts            # Match scoring algorithm
├── validate.ts           # Input validation
├── cache.ts              # LRU cache (5-min TTL)
├── http.ts               # Shared fetch utilities
├── tools/
│   ├── verifyCitation.ts
│   ├── batchVerifyCitations.ts
│   └── findVerifiedPapers.ts
└── databases/
    ├── index.ts          # Parallel query orchestrator
    ├── crossref.ts
    ├── openalex.ts
    ├── pubmed.ts
    ├── semanticscholar.ts
    ├── dblp.ts
    ├── zbmath.ts
    ├── eric.ts
    ├── hal.ts
    └── inspirehep.ts
```

Each file is <200 lines for maintainability.

### Database Adapter Pattern

Each adapter exports:
- `config`: DatabaseConfig with name, baseUrl, coverage
- `search(query, options)`: Returns raw results
- `normalize(result)`: Converts to NormalizedPaper

### Speed Optimizations

1. **LRU Cache** (`cache.ts`): 5-minute TTL, 100 entries max
2. **Parallel Queries**: All 9 databases queried simultaneously
3. **Early Exit**: Stops at score ≥8 for high-confidence matches
4. **Timeout Handling**: 10-second default per request

### Scoring Algorithm (`scoring.ts`)

- Title match: +3 points (first 30 chars, case-insensitive)
- Year exact: +3 points (±1 year: +1 point)
- Author match: +2 points per matched last name
- Thresholds: MATCH=3, HIGH_CONFIDENCE=5, EARLY_EXIT=8

## Development Commands

```bash
npm install       # Install dependencies
npm run build     # Compile TypeScript
npm run dev       # Watch mode
npm test          # Run tests
npm run test:coverage  # Coverage report
```

## Adding a New Database

1. Create `src/databases/newdb.ts`:
   ```typescript
   export const config: DatabaseConfig = { name, displayName, baseUrl, coverage };
   export async function search(query, options): Promise<RawResult[]>;
   export function normalize(result): NormalizedPaper;
   ```
2. Import and add to `src/databases/index.ts` adapters object
3. Add tests in `tests/databases/newdb.test.ts`

## Key Types

```typescript
interface NormalizedPaper {
  source: string;
  title?: string;
  authors?: string[];
  year?: number;
  doi?: string;
  journal?: string;
  abstract?: string;
}

interface SearchResults {
  results: NormalizedPaper[];
  errors: DatabaseError[];
  sources: string[];
}
```

## Tool Annotations

All tools use MCP annotations:
- `readOnlyHint: true` - Read-only operations
- `destructiveHint: false` - Safe to repeat
- `idempotentHint: true` - Deterministic results

## Testing

Tests use Vitest with mocked fetch responses. No live API calls in CI.

```
tests/
├── unit/           # scoring, cache, validate
├── databases/      # adapter tests with mocks
└── integration/    # end-to-end tool tests
```
