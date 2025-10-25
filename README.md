# DOI Citation Verifier MCP Server

[![smithery badge](https://smithery.ai/badge/@tfscharff/doi-mcp)](https://smithery.ai/server/@tfscharff/doi-mcp)

A Model Context Protocol (MCP) server that **prevents citation hallucination** by forcing verification of academic citations before they're mentioned. This server makes Claude verify every citation against real publications in the CrossRef database.

## The Problem This Solves

Large language models like Claude often "hallucinate" academic citations - citing papers that don't exist, misattributing real titles to wrong authors, or mixing up publication details. This MCP server eliminates that problem by:

1. **Mandatory verification**: Tools that check citations exist before allowing them to be cited
2. **Real-time validation**: Searches CrossRef's database of 150+ million publications
3. **Confidence scoring**: Only returns citations that confidently match the claimed details
4. **DOI-backed citations**: Every verified citation includes a valid, clickable DOI

## Features

- **Verify Citations**: Check if a paper with specific details actually exists before citing it
- **Find Verified Papers**: Search for real papers on a topic and get only verified citations
- **Confidence Scoring**: Fuzzy matching to handle minor variations while catching major errors
- **Citation Formatting**: Returns properly formatted citations with DOIs

## How It Works

When you ask Claude about research or for citations:

1. **Without this MCP**: Claude might say "According to Smith et al. (2023) in Nature..." citing a paper that doesn't exist
2. **With this MCP**: Claude MUST use `verifyCitation` first, which searches CrossRef and returns:
   - `verified: true` with full DOI → Claude can cite it
   - `verified: false` → Claude cannot cite it and must search for real papers instead

## Tools

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
- If verified=true: DOI, title, authors, year, journal, URL
- If verified=false: Warning message and possible alternative matches
- `confidence`: "high" or "medium" for verified citations

**Example successful verification:**
```json
{
  "verified": true,
  "confidence": "high",
  "doi": "10.1038/s41586-023-06004-9",
  "title": "Accurate structure prediction of biomolecular interactions...",
  "authors": ["John Jumper", "Richard Evans", "..."],
  "year": 2023,
  "journal": "Nature",
  "url": "https://doi.org/10.1038/s41586-023-06004-9",
  "message": "✓ Citation verified with high confidence"
}
```

### findVerifiedPapers
Search for real papers on a topic and return only verified citations with DOIs.

**Input:**
- `query` (string): Search query (topic, keywords, author names)
- `limit` (number, optional): Number of results (1-20, default: 5)
- `yearFrom` (number, optional): Minimum publication year
- `yearTo` (number, optional): Maximum publication year

**Returns:** Array of verified papers with complete citation information

## Prompts

### citation-verification-rules
Instructs Claude on mandatory citation verification protocol. The MCP automatically provides this context to prevent hallucination.

## Configuration

Optional configuration:
- `doiApiKey` (string): DOI.org API key for enhanced rate limits

## Installation

### Installing via Smithery

To install DOI Citation Verifier automatically via [Smithery](https://smithery.ai/server/@tfscharff/doi-mcp):

```bash
npx -y @smithery/cli install @tfscharff/doi-mcp
```

### Manual Installation

1. Clone the repository
2. Install dependencies: `npm install`
3. Build the project: `npm run build`
4. Add to your MCP client configuration

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Development with watch mode
npm run dev

# Test with Smithery CLI
npx @smithery/cli dev
```

## Example Usage

**Before this MCP (citation hallucination):**
```
User: "Tell me about recent AlphaFold research"
Claude: "According to Johnson et al. (2024) in Science, AlphaFold3 achieved..."
          ❌ This paper doesn't exist
```

**After this MCP (verified citations only):**
```
User: "Tell me about recent AlphaFold research"
Claude: [Uses findVerifiedPapers tool]
        "According to Jumper et al. (2023) in Nature (DOI: 10.1038/s41586-023-06004-9), 
         AlphaFold3 achieved..."
          ✓ Real paper with valid DOI
```

**Verification catches fake citations:**
```
User: "Can you verify this citation: Smith et al. (2024), 'Quantum AI', Nature"
Claude: [Uses verifyCitation tool]
        "⚠ I cannot verify this citation - no matching publication found in the CrossRef 
         database. This citation may be incorrect."
```

## API Sources

- **DOI Resolution**: https://doi.org API
- **DOI Search**: CrossRef API (https://api.crossref.org)

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## Related

- [CrossRef API Documentation](https://www.crossref.org/documentation/retrieve-metadata/rest-api/)
- [DOI Handbook](https://www.doi.org/the-identifier/resources/handbook)
- [Model Context Protocol](https://modelcontextprotocol.io)
