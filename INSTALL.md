# Installation Instructions

## Setup

1. Build the MCP server:
```bash
npm install
npm run build
```

2. Add to your Claude Desktop configuration (`%APPDATA%\Claude\claude_desktop_config.json` on Windows or `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "doi-mcp": {
      "command": "node",
      "args": ["C:\\Users\\thoma\\Documents\\doi-mcp\\dist\\index.js"]
    }
  },
  "globalInstructions": "CITATION VERIFICATION PROTOCOL:\n\nWhen discussing academic research:\n1. ALWAYS use verifyCitation tool before citing specific papers\n2. Use findVerifiedPapers when asked about research topics\n3. NEVER cite papers from memory - verify first\n4. Include DOI URLs (https://doi.org/...) in all citations\n5. If verification fails (verified:false), do not cite the paper\n\nThis ensures all citations are real and prevents hallucination."
}
```

**Note:** Adjust the path in `args` to match your installation location.

## Automatic Citation Verification

With the `globalInstructions` configured above, Claude will automatically:
- Verify citations before mentioning them
- Search for real papers when asked about research
- Include DOI links in responses
- Never cite unverified papers

## Manual Usage

You can also explicitly invoke the prompt:
```
Use the citation-verification-rules prompt
```

Or call tools directly:
```
Verify this citation: Smith et al. (2023), "Machine Learning", Nature
```

## Databases Covered

- **CrossRef**: 150M+ publications (all disciplines)
- **OpenAlex**: 250M+ works (all disciplines)
- **PubMed**: 35M+ publications (biomedical)
- **zbMATH**: 4M+ publications (mathematics)
- **arXiv**: 2M+ preprints (physics, math, CS)

All databases queried in parallel for maximum speed and coverage.
