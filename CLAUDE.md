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

## Releasing (every change is a release)

Don't `git commit` / `git tag` by hand. Finish the change, then:

```bash
npm run ship -- "fix(scope): short imperative description" --body-file notes.md
npm run ship -- "feat: x" --dry-run   # preview the version bump and changelog entry
```

`scripts/ship.mjs` (ported from the zoteamo repo) checks the Conventional Commit header, runs `npm test`, rebuilds `dist/`, bumps `package.json` (`feat` → minor; `fix`/`docs`/`chore`/etc. → patch; `!` or `BREAKING CHANGE:` → major), prepends `CHANGELOG.md`, commits, tags `vX.Y.Z`, pushes, and runs `gh release create`. It refuses to run off `main` or with a clean tree; `--as X.Y.Z` forces a version. Pure helpers live in `scripts/lib/release.mjs` (tested in `tests/unit/release.test.ts`).

Treat any change to what gets verified or returned, or to tool inputs/outputs, as breaking (`!`).

## `dist/` is committed

`dist/` is checked in so `npx doi-mcp` works without a build step. After changing `src/`, run `npm run build` and commit the updated `dist/` too. `tsc` never deletes outputs, so when removing or renaming a source file, delete its `dist/` counterparts by hand.

The server version is read at runtime from `package.json` (`src/server.ts`, via `createRequire('../package.json')`), so bump only `package.json`.

## Architecture

Request flow: `index.ts` (stdio transport) → `server.ts` (`createServer()` registers 3 tools, 2 resources `citation://databases` / `citation://guidelines`, and a prompt; Zod schemas live here) → `tools/*.ts` → `databases/index.ts` → adapters.

- **`databases/index.ts`** — `searchMultipleSources()` runs every adapter (or a `sources` subset) in parallel via `Promise.all`; per-adapter failures are caught and returned in `errors` rather than failing the call. Also exports `allDatabases` metadata and `deduplicatePapers()` (keyed by DOI, else lowercased title).
- **DOI-only scope**: `searchMultipleSources` drops every result without a DOI, so all tools only ever match, suggest, or return DOI-backed papers (typed as `DoiPaper`). Don't add fallbacks that surface DOI-less records. It asks each adapter for `limit * OVERFETCH_FACTOR` (3) results, filters, then trims each source back to `limit`. Where an API can filter to DOI-bearing records server-side, the adapter does (HAL `fq=doiId_s:*`, ERIC `url:*doi.org*`).
- **Never swallow `errors`**: every tool response that isn't a verified match includes `errors` (a failed database may hold the match). `findVerifiedPapers` says which databases failed, sets `isError` when all of them did, and doesn't cache results that had errors.
- **PubMed is special-cased**: its search returns PMIDs/summaries, then the orchestrator calls `getDOIsFromPubMed()` and passes the DOI map as a second arg to `pubmed.normalize()`.
- **`tools/verifyCitation.ts`** — if a DOI is given, it first resolves it directly via doi.org content negotiation (CSL-JSON); only on failure does it fall back to the multi-database search + scoring.
- **`http.ts`** — `fetchJson` / `fetchText` / `fetchWithRedirect`, each with a 10s default timeout. A caller-provided `signal` replaces the timeout signal. Non-OK responses throw `HttpError` (has `.status`); `fetchJson` rejects `text/html` responses (bot checks).

### Live API quirks (verified 2026-10-27)

- **ERIC** has no DOI field; DOIs appear only as doi.org links in `url`, which must be requested via `fields=`.
- **HAL** returns only `docid`/`label_s` unless `fl=` names the fields.
- **zbMATH** uses `/v1/document/_search?search_string=` (the old `_structured_search?query=` returns 400); DOIs are in `links[]` with `type: 'doi'`; year filter is `py:YYYY` in the query.
- **INSPIRE-HEP**: don't sort by `mostrecent`; new preprints have no DOI yet.
- **Semantic Scholar** 429s on the shared anonymous quota; `SEMANTIC_SCHOLAR_API_KEY` is sent as `x-api-key`.
- **DBLP** serves an Anubis "not a bot" HTML page (HTTP 202) to all API clients. Don't try to solve or evade the challenge; it fails with an explanatory error.

To check adapters live, call the built `dist/databases/<name>.js` `search()`/`normalize()` directly (tests never hit the network).
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
- `findBestMatch` skips any candidate without a title or author match (`hasIdentityMatch`). Without this, a year match alone (+3) reached the threshold and fabricated citations verified against unrelated papers from the same year.

The early exit only short-circuits `findBestMatch`'s loop over already-fetched results; all database queries still run to completion.

## Testing

Vitest with `globals: true`; tests in `tests/**/*.test.ts` (`unit/`, `databases/`, `integration/`). Tests mock `global.fetch` with `vi.fn()` — no live API calls. Coverage is 100% of lines; keep it there.

- `tests/integration/server.test.ts` drives `createServer()` through a real MCP `Client` over `InMemoryTransport`, so it exercises Zod validation, defaults, resources, and the prompt.
- `tests/integration/toolErrors.test.ts` uses `vi.mock` on `databases/index.js` to force the tools' outer catch blocks; `entry.test.ts` mocks the stdio transport to test `index.ts`.
- A `vi.fn()` that the code calls with `new` must use a `function`, not an arrow function (vitest 4+).
- Simulate an aborted request with `mockFetch.mockRejectedValue(Object.assign(new Error(), { name: 'AbortError' }))`.
