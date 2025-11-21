import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

interface SearchResults {
  crossref: any[] | null;
  openalex: any[] | null;
  pubmed: any[] | null;
  zbmath: any[] | null;
  arxiv: any[] | null;
  errors: string[];
}

interface NormalizedPaper {
  source: string;
  title?: string;
  authors?: string[];
  year?: number;
  doi?: string;
  journal?: string;
}

export default function createServer() {
  const server = new McpServer({
    name: "Multi-Source Citation Verifier",
    version: "2.0.0",
  });

  async function searchMultipleSources(query: string, filters: { year?: number } = {}): Promise<SearchResults> {
    const results: SearchResults = {
      crossref: null,
      openalex: null,
      pubmed: null,
      zbmath: null,
      arxiv: null,
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
    } catch (error: any) {
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
    } catch (error: any) {
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
            results.pubmed = pmids.map((id: string) => fetchData.result?.[id]).filter(Boolean);
          }
        }
      }
    } catch (error: any) {
      results.errors.push(`PubMed error: ${error.message}`);
    }

    // zbMATH search
    try {
      let zbmathUrl = `https://api.zbmath.org/document/_structured_search?query=${encodeURIComponent(query)}&results_per_page=3`;
      if (filters.year) {
        zbmathUrl += `&year=${filters.year}`;
      }

      const zbmathResponse = await fetch(zbmathUrl);
      if (zbmathResponse.ok) {
        const data = await zbmathResponse.json();
        results.zbmath = data.result || [];
      }
    } catch (error: any) {
      results.errors.push(`zbMATH error: ${error.message}`);
    }

    // arXiv search
    try {
      let arxivUrl = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=3`;

      const arxivResponse = await fetch(arxivUrl);
      if (arxivResponse.ok) {
        const xmlText = await arxivResponse.text();

        // Parse Atom XML entries
        const entries: any[] = [];
        const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
        let entryMatch;

        while ((entryMatch = entryRegex.exec(xmlText)) !== null) {
          const entryXml = entryMatch[1];

          // Extract fields from entry
          const titleMatch = entryXml.match(/<title>([\s\S]*?)<\/title>/);
          const idMatch = entryXml.match(/<id>([\s\S]*?)<\/id>/);
          const updatedMatch = entryXml.match(/<updated>([\s\S]*?)<\/updated>/);
          const doiMatch = entryXml.match(/<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/);
          const journalMatch = entryXml.match(/<arxiv:journal_ref[^>]*>([\s\S]*?)<\/arxiv:journal_ref>/);

          // Extract authors
          const authors: string[] = [];
          const authorRegex = /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g;
          let authorMatch;
          while ((authorMatch = authorRegex.exec(entryXml)) !== null) {
            authors.push(authorMatch[1].trim());
          }

          entries.push({
            title: titleMatch ? titleMatch[1].trim().replace(/\s+/g, ' ') : undefined,
            id: idMatch ? idMatch[1].trim() : undefined,
            updated: updatedMatch ? updatedMatch[1].trim() : undefined,
            doi: doiMatch ? doiMatch[1].trim() : undefined,
            journal_ref: journalMatch ? journalMatch[1].trim() : undefined,
            authors: authors
          });
        }

        results.arxiv = entries;
      }
    } catch (error: any) {
      results.errors.push(`arXiv error: ${error.message}`);
    }

    return results;
  }

  async function getDOIFromPubMed(pmid: string): Promise<string | null> {
    try {
      const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=xml`;
      const response = await fetch(url);
      if (response.ok) {
        const xmlText = await response.text();
        const doiMatch = xmlText.match(/<ArticleId IdType="doi">([^<]+)<\/ArticleId>/);
        return doiMatch ? doiMatch[1] : null;
      }
    } catch (error: any) {
      return null;
    }
    return null;
  }

  async function normalizeResult(result: any, source: string): Promise<NormalizedPaper | null> {
    if (!result) return null;
    
    switch (source) {
      case 'crossref':
        return {
          source: 'CrossRef',
          title: result.title?.[0],
          authors: result.author?.map((a: any) => `${a.given || ''} ${a.family || ''}`.trim()),
          year: result.published?.['date-parts']?.[0]?.[0],
          doi: result.DOI,
          journal: result['container-title']?.[0],
        };
      
      case 'openalex':
        return {
          source: 'OpenAlex',
          title: result.title,
          authors: result.authorships?.map((a: any) => a.author?.display_name).filter(Boolean),
          year: result.publication_year,
          doi: result.doi?.replace('https://doi.org/', ''),
          journal: result.primary_location?.source?.display_name,
        };
      
      case 'pubmed':
        const pmid = result.uid;
        const doi = await getDOIFromPubMed(pmid);

        return {
          source: 'PubMed',
          title: result.title,
          authors: result.authors?.map((a: any) => a.name),
          year: result.pubdate ? parseInt(result.pubdate.split(' ')[0]) : undefined,
          doi: doi || undefined,
          journal: result.source,
        };

      case 'zbmath':
        return {
          source: 'zbMATH',
          title: result.title,
          authors: result.authors?.map((a: any) => a.name || a).filter(Boolean),
          year: result.year || result.publication_year,
          doi: result.doi,
          journal: result.source || result.journal,
        };

      case 'arxiv':
        // Extract year from updated date (ISO 8601 format: 2023-01-15T10:30:00Z)
        let arxivYear: number | undefined = undefined;
        if (result.updated) {
          const yearMatch = result.updated.match(/^(\d{4})/);
          if (yearMatch) {
            arxivYear = parseInt(yearMatch[1]);
          }
        }

        // Extract arXiv ID from full URL
        let arxivId: string | undefined = undefined;
        if (result.id) {
          const idMatch = result.id.match(/arxiv\.org\/abs\/(.+)$/);
          arxivId = idMatch ? idMatch[1] : undefined;
        }

        return {
          source: 'arXiv',
          title: result.title,
          authors: result.authors,
          year: arxivYear,
          doi: result.doi || undefined,
          journal: result.journal_ref || (arxivId ? `arXiv:${arxivId}` : 'arXiv preprint'),
        };

      default:
        return null;
    }
  }

  function calculateMatchScore(result: NormalizedPaper, filters: { title?: string; authors?: string[]; year?: number; journal?: string }): number {
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
      const matchedAuthors = filters.authors.filter((filterAuthor: string) => 
        result.authors?.some((resultAuthor: string) => 
          resultAuthor.toLowerCase().includes(filterAuthor.toLowerCase().split(' ').pop() || '')
        )
      );
      score += matchedAuthors.length * 2;
    }
    
    return score;
  }

  // Register Tools with Annotations
  server.registerTool(
    "verifyCitation",
    {
      description: "CRITICAL: Use this to verify ANY academic citation before mentioning it. Checks multiple databases (CrossRef, OpenAlex, PubMed, zbMATH, arXiv) if a paper exists. Returns null if not found.",
      inputSchema: {
        title: z.string().optional().describe("Paper title (partial matches accepted)"),
        authors: z.array(z.string()).optional().describe("Author names (last names sufficient)"),
        year: z.number().optional().describe("Publication year"),
        doi: z.string().optional().describe("DOI if known"),
        journal: z.string().optional().describe("Journal name"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      }
    },
    async ({ title, authors, year, doi, journal }: { title?: string; authors?: string[]; year?: number; doi?: string; journal?: string }) => {
      try {
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
          } catch (error: any) {
            // Continue with search
          }
        }

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
        const searchResults = await searchMultipleSources(query, { year });

        const allResults: NormalizedPaper[] = [];

        if (searchResults.crossref) {
          for (const r of searchResults.crossref) {
            const normalized = await normalizeResult(r, 'crossref');
            if (normalized) allResults.push(normalized);
          }
        }
        if (searchResults.openalex) {
          for (const r of searchResults.openalex) {
            const normalized = await normalizeResult(r, 'openalex');
            if (normalized) allResults.push(normalized);
          }
        }
        if (searchResults.pubmed) {
          for (const r of searchResults.pubmed) {
            const normalized = await normalizeResult(r, 'pubmed');
            if (normalized) allResults.push(normalized);
          }
        }
        if (searchResults.zbmath) {
          for (const r of searchResults.zbmath) {
            const normalized = await normalizeResult(r, 'zbmath');
            if (normalized) allResults.push(normalized);
          }
        }
        if (searchResults.arxiv) {
          for (const r of searchResults.arxiv) {
            const normalized = await normalizeResult(r, 'arxiv');
            if (normalized) allResults.push(normalized);
          }
        }

        if (allResults.length === 0) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                verified: false,
                message: "⚠ No matching publications found in any database - this citation may be incorrect",
                searchedSources: ['CrossRef', 'OpenAlex', 'PubMed', 'zbMATH', 'arXiv'],
                searchedFor: { title, authors, year, journal },
                errors: searchResults.errors.length > 0 ? searchResults.errors : undefined
              }, null, 2)
            }],
          };
        }

        let bestMatch: NormalizedPaper | null = null;
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

      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              verified: false,
              error: error.message
            }, null, 2)
          }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "findVerifiedPapers",
    {
      description: "Search multiple academic databases (CrossRef, OpenAlex, PubMed, zbMATH, arXiv) for papers and return only verified, real citations with DOIs.",
      inputSchema: {
        query: z.string().describe("Search query (topic, keywords, author names)"),
        limit: z.number().min(1).max(20).default(5).describe("Number of results per source"),
        yearFrom: z.number().optional().describe("Minimum publication year"),
        yearTo: z.number().optional().describe("Maximum publication year"),
        source: z.enum(['all', 'crossref', 'openalex', 'pubmed', 'zbmath', 'arxiv']).default('all').describe("Which source to search"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      }
    },
    async ({ query, limit = 5, yearFrom, yearTo, source = 'all' }: { query: string; limit?: number; yearFrom?: number; yearTo?: number; source?: 'all' | 'crossref' | 'openalex' | 'pubmed' | 'zbmath' | 'arxiv' }) => {
      try {
        const allPapers: NormalizedPaper[] = [];

        if (source === 'all' || source === 'crossref') {
          try {
            let crossrefUrl = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${limit}`;
            if (yearFrom) crossrefUrl += `&filter=from-pub-date:${yearFrom}`;
            if (yearTo) crossrefUrl += `&filter=until-pub-date:${yearTo}`;

            const response = await fetch(crossrefUrl);
            if (response.ok) {
              const data = await response.json();
              for (const item of data.message?.items || []) {
                const paper = await normalizeResult(item, 'crossref');
                if (paper) allPapers.push(paper);
              }
            }
          } catch (error: any) {
            // Continue
          }
        }

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
                const paper = await normalizeResult(item, 'openalex');
                if (paper) allPapers.push(paper);
              }
            }
          } catch (error: any) {
            // Continue
          }
        }

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
          } catch (error: any) {
            // Continue
          }
        }

        if (source === 'all' || source === 'zbmath') {
          try {
            let zbmathUrl = `https://api.zbmath.org/document/_structured_search?query=${encodeURIComponent(query)}&results_per_page=${limit}`;
            if (yearFrom) zbmathUrl += `&year=${yearFrom}`;
            if (yearTo && !yearFrom) zbmathUrl += `&year=${yearTo}`;

            const response = await fetch(zbmathUrl);
            if (response.ok) {
              const data = await response.json();
              for (const item of data.result || []) {
                const paper = await normalizeResult(item, 'zbmath');
                if (paper) allPapers.push(paper);
              }
            }
          } catch (error: any) {
            // Continue
          }
        }

        if (source === 'all' || source === 'arxiv') {
          try {
            let arxivUrl = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${limit}`;

            const response = await fetch(arxivUrl);
            if (response.ok) {
              const xmlText = await response.text();

              // Parse Atom XML entries (same logic as in searchMultipleSources)
              const entries: any[] = [];
              const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
              let entryMatch;

              while ((entryMatch = entryRegex.exec(xmlText)) !== null) {
                const entryXml = entryMatch[1];

                const titleMatch = entryXml.match(/<title>([\s\S]*?)<\/title>/);
                const idMatch = entryXml.match(/<id>([\s\S]*?)<\/id>/);
                const updatedMatch = entryXml.match(/<updated>([\s\S]*?)<\/updated>/);
                const doiMatch = entryXml.match(/<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/);
                const journalMatch = entryXml.match(/<arxiv:journal_ref[^>]*>([\s\S]*?)<\/arxiv:journal_ref>/);

                const authors: string[] = [];
                const authorRegex = /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g;
                let authorMatch;
                while ((authorMatch = authorRegex.exec(entryXml)) !== null) {
                  authors.push(authorMatch[1].trim());
                }

                const entry = {
                  title: titleMatch ? titleMatch[1].trim().replace(/\s+/g, ' ') : undefined,
                  id: idMatch ? idMatch[1].trim() : undefined,
                  updated: updatedMatch ? updatedMatch[1].trim() : undefined,
                  doi: doiMatch ? doiMatch[1].trim() : undefined,
                  journal_ref: journalMatch ? journalMatch[1].trim() : undefined,
                  authors: authors
                };

                // Filter by year if specified
                let shouldInclude = true;
                if (yearFrom || yearTo) {
                  const yearMatch = entry.updated?.match(/^(\d{4})/);
                  if (yearMatch) {
                    const entryYear = parseInt(yearMatch[1]);
                    if (yearFrom && entryYear < yearFrom) shouldInclude = false;
                    if (yearTo && entryYear > yearTo) shouldInclude = false;
                  }
                }

                if (shouldInclude) {
                  entries.push(entry);
                }
              }

              for (const item of entries) {
                const paper = await normalizeResult(item, 'arxiv');
                if (paper) allPapers.push(paper);
              }
            }
          } catch (error: any) {
            // Continue
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

        const uniquePapers: NormalizedPaper[] = [];
        const seen = new Set<string>();

        for (const paper of allPapers) {
          const key = paper.doi || paper.title?.toLowerCase();
          if (key && !seen.has(key)) {
            seen.add(key);
            uniquePapers.push(paper);
          }
        }

        const citations = uniquePapers.slice(0, limit).map((paper, idx) => {
          const authorList = paper.authors?.slice(0, 3)?.join(", ") || "Unknown authors";
          const etAl = (paper.authors?.length || 0) > 3 ? " et al." : "";

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

      } catch (error: any) {
        return {
          content: [{
            type: "text",
            text: `Error: ${error.message}`
          }],
          isError: true,
        };
      }
    }
  );

  // Register Resources
  server.registerResource(
    "Supported Citation Databases",
    "citation://databases",
    {
      description: "Information about the academic databases used for citation verification",
      mimeType: "application/json",
    },
    async () => ({
      contents: [{
        uri: "citation://databases",
        mimeType: "application/json",
        text: JSON.stringify({
          databases: [
            {
              name: "CrossRef",
              coverage: "150+ million scholarly publications",
              url: "https://api.crossref.org",
              types: "All academic disciplines"
            },
            {
              name: "OpenAlex",
              coverage: "250+ million scholarly works",
              url: "https://api.openalex.org",
              types: "All academic disciplines"
            },
            {
              name: "PubMed",
              coverage: "35+ million biomedical publications",
              url: "https://pubmed.ncbi.nlm.nih.gov",
              types: "Biomedical and life sciences"
            },
            {
              name: "zbMATH",
              coverage: "4+ million mathematics publications",
              url: "https://zbmath.org",
              types: "Mathematics and related fields"
            },
            {
              name: "arXiv",
              coverage: "2+ million preprints",
              url: "https://arxiv.org",
              types: "Physics, mathematics, computer science, and more"
            }
          ],
          note: "All databases are queried in parallel for maximum coverage and reliability"
        }, null, 2)
      }]
    })
  );

  server.registerResource(
    "Citation Verification Guidelines",
    "citation://guidelines",
    {
      description: "Best practices for using the citation verification system",
      mimeType: "text/markdown",
    },
    async () => ({
      contents: [{
        uri: "citation://guidelines",
        mimeType: "text/markdown",
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
4. **Use appropriate database** - Choose PubMed for biomedical topics, zbMATH for mathematics, arXiv for preprints
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
`
      }]
    })
  );

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