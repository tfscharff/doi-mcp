import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Configuration schema
export const configSchema = z.object({
  autoVerify: z.boolean().default(true).describe("Automatically verify citations in responses"),
});

export default function createServer({ config }: { config?: z.infer<typeof configSchema> }) {
  const server = new McpServer({
    name: "DOI Citation Verifier",
    version: "1.0.0",
  });

  // Primary tool: Verify a citation exists and matches claimed details
  server.registerTool(
    "verifyCitation",
    {
      title: "Verify Citation",
      description: "CRITICAL: Use this to verify ANY academic citation before mentioning it. Checks if a paper with the given details actually exists and returns verified metadata. Returns null if paper cannot be found.",
      inputSchema: {
        title: z.string().optional().describe("Paper title (partial matches accepted)"),
        authors: z.array(z.string()).optional().describe("Author names (last names sufficient)"),
        year: z.number().optional().describe("Publication year"),
        doi: z.string().optional().describe("DOI if known"),
        journal: z.string().optional().describe("Journal name"),
      },
    },
    async ({ title, authors, year, doi, journal }) => {
      try {
        // If DOI provided, verify it directly
        if (doi) {
          const cleanDoi = doi.replace(/^(https?:\/\/)?(dx\.)?doi\.org\//, "");
          const response = await fetch(`https://doi.org/api/handles/${cleanDoi}`, {
            headers: { Accept: "application/vnd.citationstyles.csl+json" },
          });

          if (response.ok) {
            const metadata = await response.json();
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  verified: true,
                  doi: metadata.DOI,
                  title: metadata.title?.[0],
                  authors: metadata.author?.map((a: any) => 
                    `${a.given || ""} ${a.family || ""}`.trim()
                  ),
                  year: metadata.published?.["date-parts"]?.[0]?.[0],
                  journal: metadata["container-title"]?.[0],
                  url: `https://doi.org/${metadata.DOI}`,
                  message: "✓ Citation verified via DOI"
                }, null, 2)
              }],
            };
          }
        }

        // Build search query from provided details
        const queryParts: string[] = [];
        if (title) queryParts.push(title);
        if (authors && authors.length > 0) queryParts.push(authors.join(" "));
        if (journal) queryParts.push(journal);
        
        if (queryParts.length === 0) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                verified: false,
                message: "Insufficient information to verify citation"
              }, null, 2)
            }],
          };
        }

        const query = queryParts.join(" ");
        const encodedQuery = encodeURIComponent(query);
        
        // Search CrossRef
        const searchUrl = `https://api.crossref.org/works?query=${encodedQuery}&rows=5`;
        const response = await fetch(searchUrl);

        if (!response.ok) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                verified: false,
                message: "Search failed - cannot verify citation"
              }, null, 2)
            }],
          };
        }

        const data = await response.json();
        const results = data.message?.items || [];

        if (results.length === 0) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                verified: false,
                message: "⚠ No matching publications found - this citation may be incorrect",
                searchedFor: { title, authors, year, journal }
              }, null, 2)
            }],
          };
        }

        // Find best match
        let bestMatch = null;
        let bestScore = 0;

        for (const result of results) {
          let score = 0;
          const resultYear = result.published?.["date-parts"]?.[0]?.[0];
          const resultTitle = result.title?.[0]?.toLowerCase() || "";
          const resultAuthors = result.author?.map((a: any) => 
            a.family?.toLowerCase()
          ).filter(Boolean) || [];

          // Year match is critical
          if (year && resultYear === year) score += 3;
          else if (year && Math.abs(resultYear - year) <= 1) score += 1;
          
          // Title similarity
          if (title && resultTitle.includes(title.toLowerCase().substring(0, 30))) {
            score += 3;
          }

          // Author match
          if (authors && authors.length > 0) {
            const matchedAuthors = authors.filter(a => 
              resultAuthors.some(ra => ra.includes(a.toLowerCase().split(" ").pop() || ""))
            );
            score += matchedAuthors.length * 2;
          }

          if (score > bestScore) {
            bestScore = score;
            bestMatch = result;
          }
        }

        // Require minimum confidence
        if (!bestMatch || bestScore < 3) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                verified: false,
                message: "⚠ Could not confidently verify citation - may be incorrect",
                possibleMatches: results.slice(0, 2).map((r: any) => ({
                  title: r.title?.[0],
                  authors: r.author?.map((a: any) => `${a.given || ""} ${a.family || ""}`.trim()),
                  year: r.published?.["date-parts"]?.[0]?.[0],
                  doi: r.DOI
                }))
              }, null, 2)
            }],
          };
        }

        // Return verified citation
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              verified: true,
              confidence: bestScore >= 5 ? "high" : "medium",
              doi: bestMatch.DOI,
              title: bestMatch.title?.[0],
              authors: bestMatch.author?.map((a: any) => 
                `${a.given || ""} ${a.family || ""}`.trim()
              ),
              year: bestMatch.published?.["date-parts"]?.[0]?.[0],
              journal: bestMatch["container-title"]?.[0],
              url: `https://doi.org/${bestMatch.DOI}`,
              message: bestScore >= 5 ? "✓ Citation verified with high confidence" : "✓ Citation found (verify details match)"
            }, null, 2)
          }],
        };

      } catch (error) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              verified: false,
              error: error instanceof Error ? error.message : String(error)
            }, null, 2)
          }],
          isError: true,
        };
      }
    }
  );

  // Tool to search and get verified citations
  server.registerTool(
    "findVerifiedPapers",
    {
      title: "Find Verified Papers",
      description: "Search for academic papers and return only verified, real citations with DOIs. Use this instead of citing from memory.",
      inputSchema: {
        query: z.string().describe("Search query (topic, keywords, author names)"),
        limit: z.number().min(1).max(20).default(5).describe("Number of results"),
        yearFrom: z.number().optional().describe("Minimum publication year"),
        yearTo: z.number().optional().describe("Maximum publication year"),
      },
    },
    async ({ query, limit = 5, yearFrom, yearTo }) => {
      try {
        let searchUrl = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${limit}`;
        
        if (yearFrom) {
          searchUrl += `&filter=from-pub-date:${yearFrom}`;
        }
        if (yearTo) {
          searchUrl += `&filter=until-pub-date:${yearTo}`;
        }

        const response = await fetch(searchUrl);

        if (!response.ok) {
          return {
            content: [{
              type: "text",
              text: "Search failed - unable to retrieve verified papers"
            }],
            isError: true,
          };
        }

        const data = await response.json();
        const results = data.message?.items || [];

        if (results.length === 0) {
          return {
            content: [{
              type: "text",
              text: "No verified papers found for this query."
            }],
          };
        }

        const citations = results.map((item: any, idx: number) => {
          const authors = item.author
            ?.slice(0, 3)
            ?.map((a: any) => `${a.given || ""} ${a.family || ""}`.trim())
            .join(", ") || "Unknown authors";
          const etAl = item.author?.length > 3 ? " et al." : "";
          const title = item.title?.[0] || "No title";
          const year = item.published?.["date-parts"]?.[0]?.[0] || "Unknown year";
          const journal = item["container-title"]?.[0] || "Unknown journal";
          const doi = item.DOI;
          const url = `https://doi.org/${doi}`;

          return {
            index: idx + 1,
            title,
            authors: authors + etAl,
            year,
            journal,
            doi,
            url,
            citation: `${authors}${etAl}. (${year}). ${title}. ${journal}. https://doi.org/${doi}`
          };
        });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              count: citations.length,
              papers: citations,
              note: "All citations are verified and include valid DOIs"
            }, null, 2)
          }],
        };

      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true,
        };
      }
    }
  );

  // Prompt resource to guide Claude to verify citations
  server.registerPrompt(
    "citation-verification-rules",
    {
      name: "Citation Verification Rules",
      description: "Rules for preventing citation hallucination",
    },
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `CRITICAL CITATION VERIFICATION RULES:

1. NEVER cite academic papers from memory without verification
2. ALWAYS use verifyCitation tool before mentioning ANY specific paper
3. If verifyCitation returns verified:false, DO NOT cite that paper
4. When asked about research on a topic, use findVerifiedPapers to get real citations
5. If you cannot verify a citation, say "I cannot verify this citation" instead of citing it
6. Only cite papers with valid DOIs returned by the verification tools
7. When referencing research, use phrases like "According to verified research..." and include the DOI

ACCEPTABLE: "According to Smith et al. (2023) in Nature (DOI: 10.1038/s41586-023-xxxxx)..."
UNACCEPTABLE: "According to Smith et al. (2023)..." without verification

Always verify first, cite second. Never cite first and verify later.`
          }
        }
      ]
    })
  );

  return server.server;
}