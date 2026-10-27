# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP server (stdio) that prevents citation hallucination by verifying academic citations against 9 databases: CrossRef, OpenAlex, PubMed, zbMATH, ERIC, HAL, INSPIRE-HEP, Semantic Scholar, DBLP. ESM TypeScript, Zod 4 for tool input schemas. Runtime supports Node >=18, but development needs Node >=22.12 (vitest 5).

## Commands

```bash
npm install
npm run build                          # tsc -> dist/
npm run dev                            # tsc --watch
npm test                               # vitest run (all tests)
npx vitest run tests/unit/scoring.test.ts   # single file
npx vitest run -t "crossref adapter"        # by test name
npm run test:coverage                  # v8 coverage -> coverage/ (gitignored)
```

No linter is configured.

## `dist/` is committed

`dist/` is checked in so `npx doi-mcp` works without a build step. After changing `src/`, run `npm run build` and commit the updated `dist/` too. `tsc` never deletes outputs, so when removing or renaming a source file, delete its `dist/` counterparts by hand.

The server version is read at runtime from `package.json` (`src/server.ts`, via `createRequire('../package.json')`), so bump only `package.json`.

## Architecture

Request flow: `index.ts` (stdio transport) → `server.ts` (`createServer()` registers 3 tools, 2 resources `citation://databases` / `citation://guidelines`, and a prompt; Zod schemas live here) → `tools/*.ts` → `databases/index.ts` → adapters.

- **`databases/index.ts`** — `searchMultipleSources()` runs every adapter (or a `sources` subset) in parallel via `Promise.all`; per-adapter failures are caught and returned in `errors` rather than failing the call. Also exports `allDatabases` metadata and `deduplicatePapers()` (keyed by DOI, else lowercased title).
- **PubMed is special-cased**: its search returns PMIDs/summaries, then the orchestrator calls `getDOIsFromPubMed()` and passes the DOI map as a second arg to `pubmed.normalize()`.
- **`tools/verifyCitation.ts`** — if a DOI is given, it first resolves it directly via doi.org content negotiation (CSL-JSON); only on failure does it fall back to the multi-database search + scoring.
- **`http.ts`** — `fetchJson` / `fetchText` / `fetchWithRedirect`, each with a 10s default timeout. A caller-provided `signal` replaces the timeout signal.
- **`cache.ts`** — module-global `Map`, 5-min TTL, 100 entries, evicts oldest *inserted* (FIFO, not true LRU). Only successful verifications are cached. Call `cache.clear()` between tests that hit the same keys.

### Adapter contract

Each `src/databases/<name>.ts` exports:
- `config: DatabaseConfig` — `{ name, displayName, baseUrl, coverage }`
- `search(query, options)` — raw results
- `normalize(raw)` — `NormalizedPaper` (the orchestrator filters out `null`s)

To add one: create the file, add it to the `adapters` object in `databases/index.ts`, update the hardcoded database lists in the `verifyCitation` and `findVerifiedPapers` descriptions in `server.ts` and the README, and add `tests/databases/<name>.test.ts`.

### Scoring (`scoring.ts`, thresholds in `types.ts`)

- Title: +3 if the result title contains the first 30 chars of the query title (case-insensitive substring)
- Year: +3 exact, +1 within ±1
- Authors: +2 per query author whose last whitespace-separated token appears in any result author
- `MATCH_THRESHOLD=3` (verified), `HIGH_CONFIDENCE_THRESHOLD=5`, `EARLY_EXIT_THRESHOLD=8`

The early exit only short-circuits `findBestMatch`'s loop over already-fetched results; all database queries still run to completion.

## Testing

Vitest with `globals: true`; tests in `tests/**/*.test.ts` (`unit/`, `databases/`, `integration/`). Tests mock `global.fetch` with `vi.fn()` — no live API calls. Coverage is 100% of lines; keep it there.

- `tests/integration/server.test.ts` drives `createServer()` through a real MCP `Client` over `InMemoryTransport`, so it exercises Zod validation, defaults, resources, and the prompt.
- `tests/integration/toolErrors.test.ts` uses `vi.mock` on `databases/index.js` to force the tools' outer catch blocks; `entry.test.ts` mocks the stdio transport to test `index.ts`.
- A `vi.fn()` that the code calls with `new` must use a `function`, not an arrow function (vitest 4+).
- Simulate an aborted request with `mockFetch.mockRejectedValue(Object.assign(new Error(), { name: 'AbortError' }))`.
