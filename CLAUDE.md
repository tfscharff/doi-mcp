# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Model Context Protocol (MCP) server that prevents citation hallucination by verifying academic citations against multiple authoritative databases (CrossRef, OpenAlex, and PubMed). It's built using the `@modelcontextprotocol/sdk`.

## Key Architecture

### Single File Design
The entire MCP server is implemented in `src/index.ts` (~640 lines). This single-file architecture is intentional for simplicity and maintainability of an MCP server.

### Core Components

1. **Multi-Source Search** (`searchMultipleSources` function)
   - Queries three databases in parallel: CrossRef, OpenAlex, and PubMed
   - Returns aggregated results with error handling per source
   - Each API has different request formats and response structures

2. **Result Normalization** (`normalizeResult` function)
   - Converts heterogeneous API responses into a unified `NormalizedPaper` interface
   - Handles PubMed's two-step process (search for PMIDs, then fetch metadata)
   - Extracts DOIs from PubMed XML responses via `getDOIFromPubMed`

3. **Match Scoring** (`calculateMatchScore` function)
   - Scores potential matches based on title, year, authors, and journal
   - Score threshold (3+) determines if a citation can be verified
   - Higher scores (5+) indicate "high confidence" matches

4. **Two Primary Tools**
   - `verifyCitation`: Verifies if a specific citation exists (anti-hallucination tool)
   - `findVerifiedPapers`: Searches for real papers on a topic across databases

5. **MCP Resources & Prompts**
   - `citation://databases`: JSON resource listing database coverage
   - `citation://guidelines`: Markdown resource with usage best practices
   - `citation-verification-rules`: Prompt template enforcing verification-first workflow

### Tool Annotations
Both tools include MCP annotations:
- `readOnlyHint: true` - Tools don't modify data
- `destructiveHint: false` - Safe to call repeatedly
- `idempotentHint: true` - Same inputs produce same outputs

## Development Commands

```bash
# Install dependencies
npm install

# Build TypeScript to dist/
npm run build

# Watch mode for development
npm run dev
```

## API Integration Details

### CrossRef API
- Base: `https://api.crossref.org/works`
- No authentication required
- Supports query filters for publication date ranges
- Response: `message.items[]` array of works

### OpenAlex API
- Base: `https://api.openalex.org/works`
- Requires User-Agent header (polite pool access)
- Year filters use different syntax: `publication_year:YYYY` or ranges
- Response: `results[]` array of works

### PubMed API (NCBI E-utilities)
- Two-step process:
  1. `esearch.fcgi` - Search for PMIDs matching query
  2. `esummary.fcgi` - Fetch metadata for PMIDs
- DOIs require additional XML fetch via `efetch.fcgi` with XML parsing
- Date ranges specified as `YYYY:YYYY[dp]` in query string

## Key Implementation Patterns

### Error Handling
- External API failures are caught and added to `results.errors[]`
- The system continues querying other sources if one fails
- Partial results are still returned and normalized

### DOI Resolution Priority
If a DOI is provided to `verifyCitation`, it's checked first via DOI.org API before falling back to text-based search. This provides the most reliable verification path.

### Deduplication
`findVerifiedPapers` deduplicates results across sources using DOI or lowercase title as a unique key to avoid duplicate citations from multiple databases.

## TypeScript Configuration

- Target: ES2022 with Node16 module resolution
- Output: `dist/` directory (gitignored)
- Declarations: Generated (.d.ts files)
- Entry point: `dist/index.js` (specified in package.json)

## Export Pattern

The default export is a factory function:
```typescript
export default function createServer()
```

This allows the MCP runtime to instantiate the server and returns the initialized `server.server` instance. The server requires no configuration to function.
