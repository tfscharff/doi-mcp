<p align="center">
  <img src="icon.png" alt="doi-mcp logo" width="128" height="128">
</p>

<h1 align="center">DOI Citation Verifier MCP Server</h1>

<p align="center">
  A Model Context Protocol (MCP) server that <strong>prevents citation hallucination</strong> by verifying academic citations against <strong>9 authoritative databases</strong>. Only papers with a DOI are ever verified or returned, so every citation it gives an AI assistant comes with a working <code>https://doi.org/</code> link.
</p>

## 🚀 Quick Install

```bash
npx -y github:tfscharff/doi-mcp
```

Or add to your Claude Desktop config:
```json
{
  "mcpServers": {
    "doi-mcp": {
      "command": "npx",
      "args": ["-y", "github:tfscharff/doi-mcp"]
    }
  }
}
```

To pin a release, append its tag: `github:tfscharff/doi-mcp#v5.0.0`. See [Releases](#releases).

## The Problem This Solves

Large language models sometimes "hallucinate" academic citations - citing papers that don't exist, misattributing real titles to wrong authors, or mixing up publication details. This MCP server eliminates that problem by:

1. **9-database verification**: Checks citations across CrossRef, OpenAlex, PubMed, zbMATH, ERIC, HAL, INSPIRE-HEP, Semantic Scholar, and DBLP
2. **Parallel search**: Queries all databases simultaneously
3. **Comprehensive coverage**: 600+ million publications across all disciplines including STEM, humanities, social sciences, and education
4. **DOI-only results**: A paper counts only if a database returns a DOI for it. Every verified citation, possible match, and search result includes a DOI.

## Features

- **9 Database Search**: CrossRef, OpenAlex, PubMed, zbMATH, ERIC, HAL, INSPIRE-HEP, Semantic Scholar, DBLP
- **Verify Citations**: Check if a paper with specific details actually exists, one at a time or in batches
- **Find Verified Papers**: Search for real papers on a topic and get only DOI-backed results
- **Strict matching**: A candidate must match the citation's title or an author; a matching year alone never verifies anything
- **Parallel Processing**: All database queries run simultaneously
- **Caching**: Repeated successful queries return instantly (5-minute TTL, 100 entries)
- **Source Selection**: Search all databases or target specific sources
- **Zero Configuration**: All databases work out-of-the-box with no API keys required
- **Fully Tested**: 100% line coverage across scoring, caching, HTTP, all 9 database adapters, the tools, and the MCP server itself

## How It Works

When an AI assistant is asked about research or for citations:

1. **Without this MCP**: The assistant might cite "According to Smith et al. (2023) in Nature..." referencing a paper that doesn't exist
2. **With this MCP**: The assistant uses `verifyCitation` first, which searches across 9 databases in parallel and returns:
   - Verified match with a DOI → Can be cited
   - No DOI-backed match found → Cannot cite; must search for real papers instead

If a DOI is supplied, it is resolved directly at doi.org first; the database search is the fallback.

### Scoring

Each candidate returned by the databases is scored against the citation:

| Match | Points |
|---|---|
| Title contains the first 30 characters of the cited title (case-insensitive) | +3 |
| Exact year | +3 (±1 year: +1) |
| Each cited author whose last name appears in the candidate's authors | +2 |

A candidate is only considered if it has a DOI **and** matches on title or at least one author. A score of 3+ verifies the citation; 5+ is reported as high confidence.

### Limitations

- **Papers without a DOI can't be verified.** Some real papers, such as conference proceedings that never received a DOI, will come back `verified: false`. This is deliberate: the server only vouches for citations it can link to.
- **Speed depends on the slowest database.** Most lookups take one to a few seconds; title/author searches wait for all 9 databases.
- **Semantic Scholar rate-limits** requests without an API key. When it does, its error is reported in the response and the other 8 databases are still used.

## Tools

All tools are read-only (`readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`).

### verifyCitation
**Primary anti-hallucination tool** - Verifies a citation exists before it can be mentioned.

**Input:**
- `title` (string, optional): Paper title (partial matches accepted)
- `authors` (array, optional): Author names (last names sufficient)
- `year` (number, optional): Publication year
- `doi` (string, optional): DOI if known
- `journal` (string, optional): Journal name

**Returns JSON with:**
- `verified`: true/false
- If verified: `confidence` (`high`/`medium`), `source`, `doi`, `doiUrl`, `title`, `authors`, `year`, `journal`, `abstractFromArticle`, `message`
- If not verified: a warning `message`, plus `possibleMatches` (each with a DOI) when there were near misses

**Example successful verification:**
```json
{
  "verified": true,
  "confidence": "high",
  "source": "CrossRef",
  "doi": "10.1038/nature14539",
  "doiUrl": "https://doi.org/10.1038/nature14539",
  "title": "Deep learning",
  "authors": ["Yann LeCun", "Yoshua Bengio", "Geoffrey Hinton"],
  "year": 2015,
  "journal": "Nature",
  "message": "✓ Citation verified with high confidence"
}
```

### batchVerifyCitations
Verify several citations in one call. Each citation takes the same fields as `verifyCitation`, plus an optional `id` to match results back to inputs.

**Input:**
- `citations` (array): `{ id?, title?, authors?, year?, doi?, journal? }` objects

**Returns:** `summary` (`total`, `verified`, `failed`) and a `results` array, one entry per citation, each with `id`, `verified`, and either `paper` (including `doiUrl`) or a `message`.

### findVerifiedPapers
Search for real papers on a topic and return only papers with DOIs.

**Input:**
- `query` (string): Search query (topic, keywords, author names)
- `source` (string, optional): Which database to search - "all" (default), "crossref", "openalex", "pubmed", "zbmath", "eric", "hal", "inspirehep", "semanticscholar", or "dblp"
- `limit` (number, optional): Number of results per source (1-20, default: 5)
- `yearFrom` (number, optional): Minimum publication year
- `yearTo` (number, optional): Maximum publication year

**Returns:** Up to `limit` papers, deduplicated by DOI, each with `source`, `title`, `authors`, `year`, `journal`, `doi`, and `doiUrl`

**Example:**
```javascript
// Search all 9 databases
findVerifiedPapers({ query: "CRISPR gene editing", limit: 5 })

// Search only PubMed for biomedical papers
findVerifiedPapers({ query: "cancer immunotherapy", source: "pubmed", limit: 10 })

// Search zbMATH for mathematics papers
findVerifiedPapers({ query: "algebraic topology", source: "zbmath" })

// Search DBLP for computer science papers
findVerifiedPapers({ query: "neural networks", source: "dblp", yearFrom: 2020 })

// Search ERIC for education research
findVerifiedPapers({ query: "active learning pedagogy", source: "eric" })

// Search HAL for French/European humanities research
findVerifiedPapers({ query: "phenomenology Husserl", source: "hal" })

// Search INSPIRE-HEP for high-energy physics papers
findVerifiedPapers({ query: "Higgs boson", source: "inspirehep" })
```

### Resources and prompt

- `citation://databases` (JSON): the 9 databases with coverage and API URLs
- `citation://guidelines` (Markdown): when and how to use each tool
- `citation-verification-rules` (prompt): rules that tell the assistant to verify before citing and to cite only with a DOI

## Installation

Add to your Claude Desktop config file:

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "doi-mcp": {
      "command": "npx",
      "args": ["-y", "github:tfscharff/doi-mcp"]
    }
  }
}
```

Restart Claude Desktop and the server will be available.

### Alternative: Global Install

```bash
npm install -g github:tfscharff/doi-mcp
```

Then use this config:
```json
{
  "mcpServers": {
    "doi-mcp": {
      "command": "doi-mcp"
    }
  }
}
```

### Alternative: Clone Locally

```bash
git clone https://github.com/tfscharff/doi-mcp.git
cd doi-mcp
npm install
npm run build
```

Config for local install:
```json
{
  "mcpServers": {
    "doi-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/doi-mcp/dist/index.js"]
    }
  }
}
```

## Troubleshooting

### Server not connecting
1. Check Node.js is installed: `node --version` (requires v18+)
2. Check Claude Desktop logs:
   - **Windows**: `%APPDATA%\Claude\logs\`
   - **macOS**: `~/Library/Logs/Claude/`
   - **Linux**: `~/.config/Claude/logs/`

### npx command fails
```bash
npm cache clean --force
```

### Testing locally
```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## Releases

Every change is published as a [GitHub release](https://github.com/tfscharff/doi-mcp/releases) following [Semantic Versioning](https://semver.org/):

- **Major** (5.0.0 → 6.0.0): a change in what gets verified or returned, or in the tools' inputs and outputs
- **Minor** (5.0.0 → 5.1.0): new features, such as a new database or tool
- **Patch** (5.0.0 → 5.0.1): fixes, docs, and maintenance

See [CHANGELOG.md](CHANGELOG.md) for what changed in each version.

## Development

Development requires Node.js 22.12+ (for Vitest 5). The server itself runs on Node 18+.

```bash
npm install            # Install dependencies
npm run build          # Compile TypeScript to dist/
npm run dev            # Watch mode
npm test               # Run tests
npm run test:watch     # Tests in watch mode
npm run test:coverage  # Tests with coverage report
```

Tests mock all network calls; nothing hits the live APIs.

### Releasing

`dist/` is committed so `npx` can run the server straight from GitHub. Don't commit or tag releases by hand; use:

```bash
npm run ship -- "fix(pubmed): handle missing PMIDs" --body "Optional details for the release notes."
```

`scripts/ship.mjs` checks the header is a [Conventional Commit](https://www.conventionalcommits.org/), runs the tests, rebuilds `dist/`, bumps the version (`feat` → minor; `fix`, `docs`, `chore`, etc. → patch; `!` or `BREAKING CHANGE:` → major), adds a `CHANGELOG.md` entry, then commits, tags `vX.Y.Z`, pushes, and creates the GitHub release. Use `--dry-run` to preview, or `--as X.Y.Z` to force a version. It only runs on `main` with uncommitted changes.

### Architecture

```
src/
├── index.ts              # Entry point (stdio transport)
├── server.ts             # MCP server setup, Zod input schemas
├── types.ts              # Shared interfaces
├── scoring.ts            # Match scoring algorithm
├── cache.ts              # Result cache (5-min TTL)
├── http.ts               # Fetch utilities with timeouts
├── tools/                # Tool handlers
│   ├── verifyCitation.ts
│   ├── batchVerifyCitations.ts
│   └── findVerifiedPapers.ts
└── databases/            # Database adapters
    ├── index.ts          # Parallel query orchestrator; drops results without a DOI
    ├── crossref.ts
    ├── openalex.ts
    ├── pubmed.ts
    └── ... (9 adapters total)
```

**Adding a new database:**
1. Create `src/databases/newdb.ts` with `config`, `search()`, and `normalize()`
2. Import and add to `src/databases/index.ts`
3. Add it to the database lists in the tool descriptions in `src/server.ts`
4. Add tests in `tests/databases/newdb.test.ts`

## Example Usage

**Before this MCP (citation hallucination):**
```
User: "Tell me about recent AlphaFold research"
Assistant: "According to Johnson et al. (2024) in Science, AlphaFold3 achieved..."
           ❌ This paper doesn't exist
```

**After this MCP (verified citations only):**
```
User: "Tell me about recent AlphaFold research"
Assistant: [Uses findVerifiedPapers tool]
           "According to Abramson et al. (2024) in Nature (https://doi.org/10.1038/s41586-024-07487-w),
            AlphaFold 3 predicts..."
           ✓ Real paper with a DOI
```

**Verification catches fake citations:**
```
User: "Can you verify this citation: Smith et al. (2024), 'Quantum AI', Nature"
Assistant: [Uses verifyCitation tool - searches all 9 databases in parallel]
           "⚠ I cannot verify this citation - no matching publication with a DOI
            was found in any of the 9 databases. This citation may be incorrect."
```

## Database Coverage

All databases are queried in parallel:

### General Databases
- **CrossRef**: 150+ million scholarly publications across all disciplines
- **OpenAlex**: 250+ million scholarly works across all disciplines
- **Semantic Scholar**: 200+ million papers with AI-powered search

### Specialized Databases
- **PubMed**: 35+ million biomedical and life sciences publications
- **zbMATH**: 4+ million mathematics publications
- **DBLP**: Comprehensive computer science bibliography (journals and conferences)
- **ERIC**: 1.7+ million education research publications
- **HAL**: 4.4+ million French/European scholarly documents (2.5M English)
- **INSPIRE-HEP**: 1.7+ million high-energy physics publications

### Total Coverage
**600+ million publications** across all academic disciplines with specialized depth in STEM, computer science, biomedical sciences, mathematics, and education research. Only records that carry a DOI are used.

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## Related

### API Documentation
- [CrossRef API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/)
- [OpenAlex API](https://docs.openalex.org/)
- [PubMed API](https://www.ncbi.nlm.nih.gov/home/develop/api/)
- [zbMATH API](https://zbmath.org/api/)
- [ERIC API](https://eric.ed.gov/?api=)
- [HAL API](https://api.archives-ouvertes.fr/docs/)
- [INSPIRE-HEP API](https://github.com/inspirehep/rest-api-doc)
- [Semantic Scholar API](https://www.semanticscholar.org/product/api)
- [DBLP API](https://dblp.org/faq/How+to+use+the+dblp+search+API.html)

### Resources
- [DOI Handbook](https://www.doi.org/the-identifier/resources/handbook)
- [Model Context Protocol](https://modelcontextprotocol.io)
