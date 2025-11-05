# DOI Citation Verifier MCP Server

[![smithery badge](https://smithery.ai/badge/@tfscharff/doi-mcp)](https://smithery.ai/server/@tfscharff/doi-mcp)

A Model Context Protocol (MCP) server that **prevents citation hallucination** by verifying academic citations against multiple authoritative databases. This server enables AI assistants to verify every citation against real publications in CrossRef, OpenAlex, and PubMed before citing them.

## The Problem This Solves

Large language models often "hallucinate" academic citations - citing papers that don't exist, misattributing real titles to wrong authors, or mixing up publication details. This MCP server eliminates that problem by:

1. **Multi-source verification**: Checks citations across CrossRef (150+ million publications), OpenAlex (250+ million works), and PubMed (35+ million biomedical papers)
2. **Real-time validation**: Searches multiple authoritative databases to confirm publications exist
3. **Comprehensive coverage**: Combines general academic literature (CrossRef, OpenAlex) with specialized biomedical sources (PubMed)
4. **DOI-backed citations**: Every verified citation includes a valid, clickable DOI

## Features

- **Verify Citations**: Check if a paper with specific details actually exists across multiple databases
- **Find Verified Papers**: Search for real papers on a topic and get only verified citations from CrossRef, OpenAlex, and PubMed
- **Multi-Database Coverage**: Cross-references results across academic databases for maximum reliability
- **Source Selection**: Search all databases or target specific sources (CrossRef, OpenAlex, PubMed)
- **Citation Formatting**: Returns properly formatted citations with DOIs

## How It Works

When an AI assistant is asked about research or for citations:

1. **Without this MCP**: The assistant might cite "According to Smith et al. (2023) in Nature..." referencing a paper that doesn't exist
2. **With this MCP**: The assistant uses `verifyCitation` first, which searches across databases and returns:
   - Verified match with full DOI → Can be cited
   - No match found → Cannot cite; must search for real papers instead

## Tools

### verifyCitation
**Primary anti-hallucination tool** - Verifies a citation exists across multiple databases before it can be mentioned.

**Input:**
- `title` (string, optional): Paper title (partial matches accepted)
- `authors` (array, optional): Author names (last names sufficient)
- `year` (number, optional): Publication year
- `doi` (string, optional): DOI if known
- `journal` (string, optional): Journal name

**Returns JSON with:**
- `verified`: true/false
- If verified=true: DOI, title, authors, year, journal, URL, source database
- If verified=false: Warning message that no matching publication was found
- Match quality indicators for transparency

**Example successful verification:**
```json
{
  "verified": true,
  "doi": "10.1038/s41586-023-06004-9",
  "title": "Accurate structure prediction of biomolecular interactions...",
  "authors": ["John Jumper", "Richard Evans", "..."],
  "year": 2023,
  "journal": "Nature",
  "url": "https://doi.org/10.1038/s41586-023-06004-9",
  "source": "crossref",
  "message": "✓ Citation verified"
}
```

### findVerifiedPapers
Search for real papers on a topic and return only verified citations with DOIs from multiple databases.

**Input:**
- `query` (string): Search query (topic, keywords, author names)
- `source` (string, optional): Which database to search - "all" (default), "crossref", "openalex", or "pubmed"
- `limit` (number, optional): Number of results per source (1-20, default: 5)
- `yearFrom` (number, optional): Minimum publication year
- `yearTo` (number, optional): Maximum publication year

**Returns:** Array of verified papers from the specified database(s) with complete citation information including source

**Example:**
```javascript
// Search all databases
findVerifiedPapers({ query: "CRISPR gene editing", limit: 5 })

// Search only PubMed for biomedical papers
findVerifiedPapers({ query: "cancer immunotherapy", source: "pubmed", limit: 10 })

// Search with year filter
findVerifiedPapers({ query: "machine learning", yearFrom: 2020, yearTo: 2024 })
```

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
Assistant: "According to Johnson et al. (2024) in Science, AlphaFold3 achieved..."
           ❌ This paper doesn't exist
```

**After this MCP (verified citations only):**
```
User: "Tell me about recent AlphaFold research"
Assistant: [Uses findVerifiedPapers tool]
           "According to Jumper et al. (2023) in Nature (DOI: 10.1038/s41586-023-06004-9), 
            AlphaFold3 achieved..."
           ✓ Real paper with valid DOI verified across databases
```

**Verification catches fake citations:**
```
User: "Can you verify this citation: Smith et al. (2024), 'Quantum AI', Nature"
Assistant: [Uses verifyCitation tool]
           "⚠ I cannot verify this citation - no matching publication found in 
            CrossRef, OpenAlex, or PubMed databases. This citation may be incorrect."
```

## API Sources

- **CrossRef API**: 150+ million scholarly publications (https://api.crossref.org)
- **OpenAlex API**: 250+ million scholarly works (https://api.openalex.org)
- **PubMed API**: 35+ million biomedical and life sciences publications (https://api.ncbi.nlm.nih.gov/lit/ctxp)
- **DOI Resolution**: DOI.org API (https://doi.org)

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## Related

- [CrossRef API Documentation](https://www.crossref.org/documentation/retrieve-metadata/rest-api/)
- [OpenAlex API Documentation](https://docs.openalex.org/)
- [PubMed API Documentation](https://www.ncbi.nlm.nih.gov/home/develop/api/)
- [DOI Handbook](https://www.doi.org/the-identifier/resources/handbook)
- [Model Context Protocol](https://modelcontextprotocol.io)