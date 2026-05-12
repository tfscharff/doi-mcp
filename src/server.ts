// MCP server setup - tool, resource, and prompt registration

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { allDatabases } from './databases/index.js';
import { verifyCitation } from './tools/verifyCitation.js';
import { batchVerifyCitations } from './tools/batchVerifyCitations.js';
import { findVerifiedPapers } from './tools/findVerifiedPapers.js';

export function createServer() {
  const server = new McpServer({
    name: 'Multi-Source Citation Verifier',
    version: '4.0.0',
  });

  // Register Tools
  server.registerTool(
    'verifyCitation',
    {
      description: 'CRITICAL: Use this to verify ANY academic citation before mentioning it. Checks multiple databases (CrossRef, OpenAlex, PubMed, zbMATH, ERIC, HAL, INSPIRE-HEP, Semantic Scholar, DBLP) if a paper exists. Returns null if not found.',
      inputSchema: {
        title: z.string().optional().describe('Paper title (partial matches accepted)'),
        authors: z.array(z.string()).optional().describe('Author names (last names sufficient)'),
        year: z.number().optional().describe('Publication year'),
        doi: z.string().optional().describe('DOI if known'),
        journal: z.string().optional().describe('Journal name'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async (input: { title?: string; authors?: string[]; year?: number; doi?: string; journal?: string }) => {
      return verifyCitation(input);
    }
  );

  server.registerTool(
    'batchVerifyCitations',
    {
      description: 'Verify multiple citations in a single call. More efficient than calling verifyCitation multiple times. Returns verification status for each citation.',
      inputSchema: {
        citations: z.array(z.object({
          id: z.string().optional().describe('Optional identifier to track this citation in results'),
          title: z.string().optional().describe('Paper title'),
          authors: z.array(z.string()).optional().describe('Author names'),
          year: z.number().optional().describe('Publication year'),
          doi: z.string().optional().describe('DOI if known'),
          journal: z.string().optional().describe('Journal name'),
        })).describe('Array of citations to verify'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async (input: { citations: Array<{ id?: string; title?: string; authors?: string[]; year?: number; doi?: string; journal?: string }> }) => {
      return batchVerifyCitations(input);
    }
  );

  server.registerTool(
    'findVerifiedPapers',
    {
      description: 'Search multiple academic databases (CrossRef, OpenAlex, PubMed, zbMATH, ERIC, HAL, INSPIRE-HEP, Semantic Scholar, DBLP) for papers and return only verified, real citations with DOIs.',
      inputSchema: {
        query: z.string().describe('Search query (topic, keywords, author names)'),
        limit: z.number().min(1).max(20).default(5).describe('Number of results per source'),
        yearFrom: z.number().optional().describe('Minimum publication year'),
        yearTo: z.number().optional().describe('Maximum publication year'),
        source: z.enum(['all', 'crossref', 'openalex', 'pubmed', 'zbmath', 'eric', 'hal', 'inspirehep', 'semanticscholar', 'dblp']).default('all').describe('Which source to search'),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async (input: { query: string; limit?: number; yearFrom?: number; yearTo?: number; source?: string }) => {
      return findVerifiedPapers({
        query: input.query,
        limit: input.limit ?? 5,
        yearFrom: input.yearFrom,
        yearTo: input.yearTo,
        source: input.source ?? 'all',
      });
    }
  );

  // Register Resources
  server.registerResource(
    'Supported Citation Databases',
    'citation://databases',
    {
      description: 'Information about the academic databases used for citation verification',
      mimeType: 'application/json',
    },
    async () => ({
      contents: [{
        uri: 'citation://databases',
        mimeType: 'application/json',
        text: JSON.stringify({
          databases: allDatabases.map(db => ({
            name: db.displayName,
            coverage: db.coverage,
            url: db.baseUrl,
          })),
          note: 'All databases are queried in parallel for maximum coverage and reliability',
        }, null, 2),
      }],
    })
  );

  server.registerResource(
    'Citation Verification Guidelines',
    'citation://guidelines',
    {
      description: 'Best practices for using the citation verification system',
      mimeType: 'text/markdown',
    },
    async () => ({
      contents: [{
        uri: 'citation://guidelines',
        mimeType: 'text/markdown',
        text: `# Citation Verification Guidelines

## When to Use verifyCitation

**ALWAYS** verify before citing:
- Specific papers you remember from training data
- Papers mentioned by users that you want to reference
- Any citation with specific author names, titles, or years

## When to Use findVerifiedPapers

Use when:
- Asked about "recent research on X"
- Needing to cite sources for a general topic
- Building a bibliography or literature review
- User asks "what papers exist on X"

## Best Practices

1. **Never cite from memory** - Always verify first
2. **Include DOI URLs** - Use the \`doiUrl\` field in responses
3. **Check verification status** - Only cite if \`verified: true\`
4. **Use appropriate database** - Choose PubMed for biomedical, zbMATH for mathematics, ERIC for education, HAL for humanities, INSPIRE-HEP for physics
5. **Provide alternatives** - If verification fails, search for real papers instead

## Example Workflow

\`\`\`
User: "Tell me about CRISPR research"
→ Use findVerifiedPapers({query: "CRISPR gene editing", limit: 5})
→ Get verified papers with DOIs
→ Cite: "According to Doudna et al. (2012) (https://doi.org/10.1126/science.1225829)..."
\`\`\`

## Warning Signs

❌ Don't cite: "I believe Smith et al. published..."
❌ Don't cite: "There was a famous paper on X..."
✓ Do verify: Use tools to find real, verifiable citations
`,
      }],
    })
  );

  server.registerPrompt(
    'citation-verification-rules',
    {
      description: 'Rules for preventing citation hallucination',
    },
    async () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `CRITICAL CITATION VERIFICATION RULES:

1. NEVER cite academic papers from memory without verification
2. ALWAYS use verifyCitation tool before mentioning ANY specific paper
3. If verifyCitation returns verified:false, DO NOT cite that paper
4. When asked about research on a topic, use findVerifiedPapers to get real citations
5. If you cannot verify a citation, say "I cannot verify this citation" instead of citing it
6. Only cite papers with valid DOIs returned by the verification tools
7. When referencing research, include the DOI URL from the doiUrl field so users can access the paper

ACCEPTABLE: "According to Smith et al. (2023) in Nature (https://doi.org/10.1038/s41586-023-xxxxx)..."
UNACCEPTABLE: "According to Smith et al. (2023)..." without verification

Always verify first, cite second. Never cite first and verify later.`,
          },
        },
      ],
    })
  );

  return server.server;
}
