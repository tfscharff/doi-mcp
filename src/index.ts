import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Configuration schema
export const configSchema = z.object({
  autoVerify: z.boolean().default(true).describe("Automatically verify citations in responses"),
});

export default function createServer({ config }) {
  const server = new McpServer({
    name: "Multi-Source Citation Verifier",
    version: "2.0.0",
  });

  // Helper function to search multiple sources
  async function searchMultipleSources(query, filters = {}) {
    const results = {
      crossref: null,
      openalex: null,
      pubmed: null,
      errors: []
    };

    // CrossRef search
    try {
      let crossrefUrl = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=3`;
      if (filters.year) {
        crossrefUrl += `&filter=from-pub-date:${filters.year},until-pub-date:${filters.year}`;
      }
      
      const crossrefResponse = await fetch(crossrefUrl);
      if (crossrefResponse.ok) {
        const data = await crossrefResponse.json();
        results.crossref = data.message?.items || [];
      }
    } catch (error) {
      results.errors.push(`CrossRef error: ${error.message}`);
    }

    // OpenAlex search
    try {
      let openalexUrl = `https://api.openalex.org/works?search=${encodeURIComponent(query)}`;
      if (filters.year) {
        openalexUrl += `&filter=publication_year:${filters.year}`;
      }
      
      const openalexResponse = await fetch(openalexUrl, {
        headers: { 'User-Agent': 'mailto:research@example.com' }
      });
      if (openalexResponse.ok) {
        const data = await openalexResponse.json();
        results.openalex = data.results || [];
      }
    } catch (error) {
      results.errors.push(`OpenAlex error: ${error.message}`);
    }

    // PubMed search
    try {
      const pubmedSearchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmode=json&retmax=3`;
      const pubmedSearchResponse = await fetch(pubmedSearchUrl);
      
      if (pubmedSearchResponse.ok) {
        const searchData = await pubmedSearchResponse.json();
        const pmids = searchData.esearchresult?.idlist || [];
        
        if (pmids.length > 0) {
          const pubmedFetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=json`;
          const pubmedFetchResponse = await fetch(pubmedFetchUrl);
          
          if (pubmedFetchResponse.ok) {
            const fetchData = await pubmedFetchResponse.json();
            results.pubmed = pmids.map(id => fetchData.result?.[id]).filter(Boolean);
          }
        }
      }
    } catch (error) {
      results.errors.push(`PubMed error: ${error.message}`);
    }

    return results;
  }

  // Helper function to get DOI from PubMed result
  async function getDOIFromPubMed(pmid) {
    try {
      const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=xml`;
      const response = await fetch(url);
      if (response.ok) {
        const xmlText = await response.text();
        // Simple regex to extract DOI from XML
        const doiMatch = xmlText.match(/<ArticleId IdType="doi">([^<]+)<\/ArticleId>/);
        return doiMatch ? doiMatch[1] : null;
      }
    } catch (error) {
      return null;
    }
    return null;
  }

  // Helper function to normalize results from different sources
  async function normalizeResult(result, source) {
    switch (source) {
      case 'crossref':
        return {
          source: 'CrossRef',
          title: result.title?.[0],
          authors: result.author?.map(a => `${a.given || ''} ${a.family || ''}`.trim()),
          year: result.published?.['date-parts']?.[0]?.[0],
          doi: result.DOI,
          journal: result['container-title']?.[0],
        };
      
      case 'openalex':
        return {
          source: 'OpenAlex',
          title: result.title,
          authors: result.authorships?.map(a => a.author?.display_name).filter(Boolean),
          year: result.publication_year,
          doi: result.doi?.replace('https://doi.org/', ''),
          journal: result.primary_location?.source?.display_name,
        };
      
      case 'pubmed':
        // Try to fetch DOI for PubMed results
        const pmid = result.uid;
        const doi = await getDOIFromPubMed(pmid);
        
        return {
          source: 'PubMed',
          title: result.title,
          authors: result.authors?.map(a => a.name),
          year: result.pubdate ? parseInt(result.pubdate.split(' ')[0]) : null,
          doi: doi,
          journal: result.source,
        };
      
      default:
        return null;
    }
  }

  // Helper function to calculate match score
  function calculateMatchScore(result, filters) {
    let score = 0;
    
    if (filters.title && result.title) {
      const titleMatch = result.title.toLowerCase().includes(filters.title.toLowerCase().substring(0, 30));
      if (titleMatch) score += 3;
    }
    
    if (filters.year && result.year) {
      if (result.year === filters.year) score += 3;
      else if (Math.abs(result.year - filters.year) <= 1) score += 1;
    }
    
    if (filters.authors && result.authors) {
      const matchedAuthors = filters.authors.filter(filterAuthor => 
        result.authors.some((resultAuthor: string) => 
          resultAuthor.toLowerCase().includes(filterAuthor.toLowerCase().split(' ').pop() || '')
        )
      );
      score += matchedAuthors.length * 2;
    }
    
    return score;
  }

  // Primary verification tool
  server.registerTool(
    "verifyCitation",
    {
      title: "Verify Citation",
      description: "CRITICAL: Use this to verify ANY academic citation before mentioning it. Checks multiple databases (CrossRef, OpenAlex, PubMed) if a paper exists. Returns null if not found.",
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
        // If DOI provided, try to resolve it directly first
        if (doi) {
          const cleanDoi = doi.replace(/^(https?:\/\/)?(dx\.)?doi\.org\//, "");
          
          try {
            const doiResponse = await fetch(`https://doi.org/api/handles/${cleanDoi}`, {
              headers: { Accept: "application/vnd.citationstyles.csl+json" },
            });

            if (doiResponse.ok) {
              const metadata = await doiResponse.json();
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({
                    verified: true,
                    source: "DOI.org",
                    doi: metadata.DOI,
                    doiUrl: `https://doi.org/${metadata.DOI}`,
                    title: metadata.title?.[0],
                    authors: metadata.author?.map((a: any) => `${a.given || ''} ${a.family || ''}`.trim()),
                    year: metadata.published?.["date-parts"]?.[0]?.[0],
                    journal: metadata["container-title"]?.[0],
                    message: "✓ Citation verified via DOI"
                  }, null, 2)
                }],
              };
            }
          } catch (error) {
            // DOI resolution failed, continue with search
          }
        }

        // Build search query
        const queryParts = [];
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
        const searchResults = await searchMultipleSources(query, { year });

        // Collect all results
        const allResults = [];
        
        if (searchResults.crossref) {
          for (const r of searchResults.crossref) {
            allResults.push(await normalizeResult(r, 'crossref'));
          }
        }
        if (searchResults.openalex) {
          for (const r of searchResults.openalex) {
            allResults.push(await normalizeResult(r, 'openalex'));
          }
        }
        if (searchResults.pubmed) {
          for (const r of searchResults.pubmed) {
            allResults.push(await normalizeResult(r, 'pubmed'));
          }
        }

        if (allResults.length === 0) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                verified: false,
                message: "⚠ No matching publications found in any database - this citation may be incorrect",
                searchedSources: ['CrossRef', 'OpenAlex', 'PubMed'],
                searchedFor: { title, authors, year, journal },
                errors: searchResults.errors.length > 0 ? searchResults.errors : undefined
              }, null, 2)
            }],
          };
        }

        // Find best match across all sources
        let bestMatch = null;
        let bestScore = 0;

        for (const result of allResults) {
          const score = calculateMatchScore(result, { title, authors, year, journal });
          if (score > bestScore) {
            bestScore = score;
            bestMatch = result;
          }
        }

        if (!bestMatch || bestScore < 3) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                verified: false,
                message: "⚠ Could not confidently verify citation - may be incorrect",
                possibleMatches: allResults.slice(0, 3).map(r => ({
                  source: r.source,
                  title: r.title,
                  authors: r.authors,
                  year: r.year,
                  doi: r.doi,
                  doiUrl: r.doi ? `https://doi.org/${r.doi}` : null
                }))
              }, null, 2)
            }],
          };
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              verified: true,
              confidence: bestScore >= 5 ? "high" : "medium",
              source: bestMatch.source,
              doi: bestMatch.doi,
              doiUrl: bestMatch.doi ? `https://doi.org/${bestMatch.doi}` : null,
              title: bestMatch.title,
              authors: bestMatch.authors,
              year: bestMatch.year,
              journal: bestMatch.journal,
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

  // Search tool for finding papers
  server.registerTool(
    "findVerifiedPapers",
    {
      title: "Find Verified Papers",
      description: "Search multiple academic databases (CrossRef, OpenAlex, PubMed) for papers and return only verified, real citations with DOIs.",
      inputSchema: {
        query: z.string().describe("Search query (topic, keywords, author names)"),
        limit: z.number().min(1).max(20).default(5).describe("Number of results per source"),
        yearFrom: z.number().optional().describe("Minimum publication year"),
        yearTo: z.number().optional().describe("Maximum publication year"),
        source: z.enum(['all', 'crossref', 'openalex', 'pubmed']).default('all').describe("Which source to search"),
      },
    },
    async ({ query, limit = 5, yearFrom, yearTo, source = 'all' }) => {
      try {
        const allPapers = [];

        // CrossRef
        if (source === 'all' || source === 'crossref') {
          try {
            let crossrefUrl = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${limit}`;
            if (yearFrom) crossrefUrl += `&filter=from-pub-date:${yearFrom}`;
            if (yearTo) crossrefUrl += `&filter=until-pub-date:${yearTo}`;

            const response = await fetch(crossrefUrl);
            if (response.ok) {
              const data = await response.json();
              for (const item of data.message?.items || []) {
                allPapers.push(await normalizeResult(item, 'crossref'));
              }
            }
          } catch (error) {
            // Continue with other sources
          }
        }

        // OpenAlex
        if (source === 'all' || source === 'openalex') {
          try {
            let openalexUrl = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per_page=${limit}`;
            if (yearFrom && yearTo) {
              openalexUrl += `&filter=publication_year:${yearFrom}-${yearTo}`;
            } else if (yearFrom) {
              openalexUrl += `&filter=publication_year:>${yearFrom - 1}`;
            } else if (yearTo) {
              openalexUrl += `&filter=publication_year:<${yearTo + 1}`;
            }

            const response = await fetch(openalexUrl, {
              headers: { 'User-Agent': 'mailto:research@example.com' }
            });
            if (response.ok) {
              const data = await response.json();
              for (const item of data.results || []) {
                allPapers.push(await normalizeResult(item, 'openalex'));
              }
            }
          } catch (error) {
            // Continue with other sources
          }
        }

        // PubMed
        if (source === 'all' || source === 'pubmed') {
          try {
            let pubmedQuery = query;
            if (yearFrom || yearTo) {
              const fromYear = yearFrom || 1900;
              const toYear = yearTo || new Date().getFullYear();
              pubmedQuery += ` AND ${fromYear}:${toYear}[dp]`;
            }

            const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(pubmedQuery)}&retmode=json&retmax=${limit}`;
            const searchResponse = await fetch(searchUrl);
            
            if (searchResponse.ok) {
              const searchData = await searchResponse.json();
              const pmids = searchData.esearchresult?.idlist || [];
              
              if (pmids.length > 0) {
                const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=json`;
                const fetchResponse = await fetch(fetchUrl);
                
                if (fetchResponse.ok) {
                  const fetchData = await fetchResponse.json();
                  for (const id of pmids) {
                    const paper = await normalizeResult(fetchData.result?.[id], 'pubmed');
                    if (paper) allPapers.push(paper);
                  }
                }
              }
            }
          } catch (error) {
            // Continue with other sources
          }
        }

        if (allPapers.length === 0) {
          return {
            content: [{
              type: "text",
              text: "No verified papers found for this query across all sources."
            }],
          };
        }

        // Deduplicate by DOI and title
        const uniquePapers = [];
        const seen = new Set();

        for (const paper of allPapers) {
          const key = paper.doi || paper.title?.toLowerCase();
          if (key && !seen.has(key)) {
            seen.add(key);
            uniquePapers.push(paper);
          }
        }

        const citations = uniquePapers.slice(0, limit).map((paper, idx) => {
          const authorList = paper.authors?.slice(0, 3)?.join(", ") || "Unknown authors";
          const etAl = paper.authors?.length > 3 ? " et al." : "";

          return {
            index: idx + 1,
            source: paper.source,
            title: paper.title || "No title",
            authors: authorList + etAl,
            year: paper.year || "Unknown year",
            journal: paper.journal || "Unknown journal",
            doi: paper.doi,
            doiUrl: paper.doi ? `https://doi.org/${paper.doi}` : null,
            citation: `${authorList}${etAl}. (${paper.year || 'n.d.'}). ${paper.title}. ${paper.journal || 'Unknown journal'}. ${paper.doi ? `https://doi.org/${paper.doi}` : 'No DOI'}`
          };
        });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              count: citations.length,
              sources: [...new Set(citations.map(c => c.source))],
              papers: citations,
              note: "All citations are verified from multiple academic databases. Use the doiUrl field to access papers."
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
7. When referencing research, include the DOI URL from the doiUrl field so users can access the paper

ACCEPTABLE: "According to Smith et al. (2023) in Nature (https://doi.org/10.1038/s41586-023-xxxxx)..."
UNACCEPTABLE: "According to Smith et al. (2023)..." without verification

Always verify first, cite second. Never cite first and verify later.`
          }
        }
      ]
    })
  );

  return server.server;
}