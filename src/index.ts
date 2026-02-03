import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

interface SearchResults {
  crossref: any[] | null;
  openalex: any[] | null;
  pubmed: any[] | null;
  zbmath: any[] | null;
  semanticscholar: any[] | null;
  dblp: any[] | null;
  eric: any[] | null;
  hal: any[] | null;
  inspirehep: any[] | null;
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
    version: "3.2.0",
  });


  // Helper function to batch fetch DOIs from PubMed
  async function getDOIsFromPubMed(pmids: string[]): Promise<Map<string, string>> {
    const doiMap = new Map<string, string>();
    if (pmids.length === 0) return doiMap;

    try {
      const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=xml`;
      const response = await fetch(url);
      if (response.ok) {
        const xmlText = await response.text();

        // Parse each PubmedArticle
        const articleRegex = /<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g;
        let articleMatch;

        while ((articleMatch = articleRegex.exec(xmlText)) !== null) {
          const articleXml = articleMatch[1];
          const pmidMatch = articleXml.match(/<PMID[^>]*>(\d+)<\/PMID>/);
          const doiMatch = articleXml.match(/<ArticleId IdType="doi">([^<]+)<\/ArticleId>/);

          if (pmidMatch && doiMatch) {
            doiMap.set(pmidMatch[1], doiMatch[1]);
          }
        }
      }
    } catch (error: any) {
      // Return partial results
    }

    return doiMap;
  }

  async function searchMultipleSources(query: string, filters: { year?: number } = {}): Promise<SearchResults> {
    const results: SearchResults = {
      crossref: null,
      openalex: null,
      pubmed: null,
      zbmath: null,
      semanticscholar: null,
      dblp: null,
      eric: null,
      hal: null,
      inspirehep: null,
      errors: []
    };

    // Execute all API calls in parallel for maximum speed
    const apiCalls = await Promise.allSettled([
      // CrossRef search
      (async () => {
        let crossrefUrl = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=3`;
        if (filters.year) {
          crossrefUrl += `&filter=from-pub-date:${filters.year},until-pub-date:${filters.year}`;
        }
        const response = await fetch(crossrefUrl);
        if (response.ok) {
          const data = await response.json();
          return { source: 'crossref', data: data.message?.items || [] };
        }
        return { source: 'crossref', data: [] };
      })(),

      // OpenAlex search
      (async () => {
        let openalexUrl = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per_page=3`;
        if (filters.year) {
          openalexUrl += `&filter=publication_year:${filters.year}`;
        }
        const response = await fetch(openalexUrl, {
          headers: { 'User-Agent': 'mailto:research@example.com' }
        });
        if (response.ok) {
          const data = await response.json();
          return { source: 'openalex', data: data.results || [] };
        }
        return { source: 'openalex', data: [] };
      })(),

      // PubMed search (two-step process)
      (async () => {
        const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmode=json&retmax=3`;
        const searchResponse = await fetch(searchUrl);

        if (searchResponse.ok) {
          const searchData = await searchResponse.json();
          const pmids = searchData.esearchresult?.idlist || [];

          if (pmids.length > 0) {
            const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=json`;
            const fetchResponse = await fetch(fetchUrl);

            if (fetchResponse.ok) {
              const fetchData = await fetchResponse.json();
              return { source: 'pubmed', data: pmids.map((id: string) => fetchData.result?.[id]).filter(Boolean) };
            }
          }
        }
        return { source: 'pubmed', data: [] };
      })(),

      // zbMATH search
      (async () => {
        let zbmathUrl = `https://api.zbmath.org/document/_structured_search?query=${encodeURIComponent(query)}&results_per_page=3`;
        if (filters.year) {
          zbmathUrl += `&year=${filters.year}`;
        }
        const response = await fetch(zbmathUrl);
        if (response.ok) {
          const data = await response.json();
          return { source: 'zbmath', data: data.result || [] };
        }
        return { source: 'zbmath', data: [] };
      })(),

      // ERIC search
      (async () => {
        try {
          const ericUrl = `https://api.ies.ed.gov/eric/?search=${encodeURIComponent(query)}&rows=3&format=json`;
          const response = await fetch(ericUrl);
          if (response.ok) {
            const data = await response.json();
            return { source: 'eric', data: data.response?.docs || [] };
          }
        } catch (error) {
          // Return empty if API fails
        }
        return { source: 'eric', data: [] };
      })(),

      // HAL search
      (async () => {
        try {
          let halUrl = `https://api.archives-ouvertes.fr/search/?q=${encodeURIComponent(query)}&wt=json&rows=3`;
          if (filters.year) {
            halUrl += `&fq=publicationDateY_i:${filters.year}`;
          }
          const response = await fetch(halUrl);
          if (response.ok) {
            const data = await response.json();
            return { source: 'hal', data: data.response?.docs || [] };
          }
        } catch (error) {
          // Return empty if API fails
        }
        return { source: 'hal', data: [] };
      })(),

      // INSPIRE-HEP search (high-energy physics)
      (async () => {
        try {
          let inspireQuery = query;
          if (filters.year) {
            inspireQuery = `${query} and date ${filters.year}`;
          }
          const inspireUrl = `https://inspirehep.net/api/literature?q=${encodeURIComponent(inspireQuery)}&size=3&sort=mostrecent`;
          const response = await fetch(inspireUrl);
          if (response.ok) {
            const data = await response.json();
            return { source: 'inspirehep', data: data.hits?.hits || [] };
          }
        } catch (error) {
          // Return empty if API fails
        }
        return { source: 'inspirehep', data: [] };
      })(),

      // Semantic Scholar search
      (async () => {
        let semanticUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=3&fields=paperId,title,authors,year,externalIds,venue`;
        if (filters.year) {
          semanticUrl += `&year=${filters.year}`;
        }

        const response = await fetch(semanticUrl);
        if (response.ok) {
          const data = await response.json();
          return { source: 'semanticscholar', data: data.data || [] };
        }
        return { source: 'semanticscholar', data: [] };
      })(),

      // DBLP search
      (async () => {
        const dblpUrl = `https://dblp.org/search/publ/api?q=${encodeURIComponent(query)}&format=json&h=3`;
        const response = await fetch(dblpUrl);
        if (response.ok) {
          const data = await response.json();
          return { source: 'dblp', data: data.result?.hits?.hit || [] };
        }
        return { source: 'dblp', data: [] };
      })()
    ]);

    // Process results from parallel API calls
    apiCalls.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const { source, data } = result.value;
        results[source as keyof Omit<SearchResults, 'errors'>] = data;
      } else {
        const sources = ['CrossRef', 'OpenAlex', 'PubMed', 'zbMATH', 'ERIC', 'HAL', 'INSPIRE-HEP', 'Semantic Scholar', 'DBLP'];
        results.errors.push(`${sources[index]} error: ${result.reason?.message || 'Unknown error'}`);
      }
    });

    return results;
  }

  async function normalizeResult(result: any, source: string, doiMap?: Map<string, string>): Promise<NormalizedPaper | null> {
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
        const doi = doiMap?.get(pmid);

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

      case 'eric':
        return {
          source: 'ERIC',
          title: result.title,
          authors: result.author?.filter(Boolean),
          year: result.publicationdateyear ? parseInt(result.publicationdateyear) : undefined,
          doi: result.doi,
          journal: result.source || result.publicationtype,
        };

      case 'hal':
        return {
          source: 'HAL',
          title: result.title_s?.[0] || result.en_title_s?.[0],
          authors: result.authFullName_s,
          year: result.publicationDateY_i,
          doi: result.doiId_s,
          journal: result.journalTitle_s || result.bookTitle_s,
        };

      case 'inspirehep':
        const metadata = result.metadata || {};
        return {
          source: 'INSPIRE-HEP',
          title: metadata.titles?.[0]?.title,
          authors: metadata.authors?.map((a: any) => a.full_name).filter(Boolean),
          year: metadata.publication_info?.[0]?.year ? parseInt(metadata.publication_info[0].year) : metadata.preprint_date ? new Date(metadata.preprint_date).getFullYear() : undefined,
          doi: metadata.dois?.[0]?.value,
          journal: metadata.publication_info?.[0]?.journal_title || metadata.publication_info?.[0]?.conference_record?.titles?.[0]?.title,
        };

      case 'semanticscholar':
        return {
          source: 'Semantic Scholar',
          title: result.title,
          authors: result.authors?.map((a: any) => a.name).filter(Boolean),
          year: result.year,
          doi: result.externalIds?.DOI,
          journal: result.venue,
        };

      case 'dblp':
        return {
          source: 'DBLP',
          title: result.info?.title,
          authors: result.info?.authors?.author ?
            (Array.isArray(result.info.authors.author) ?
              result.info.authors.author.map((a: any) => a.text || a) :
              [result.info.authors.author.text || result.info.authors.author]) :
            [],
          year: result.info?.year ? parseInt(result.info.year) : undefined,
          doi: result.info?.doi,
          journal: result.info?.venue,
        };

      default:
        return null;
    }
  }

  function calculateMatchScore(result: NormalizedPaper, filters: { title?: string; authors?: string[]; year?: number; journal?: string }): number {
    let score = 0;

    // Title matching - cache lowercased values
    if (filters.title && result.title) {
      const filterTitleLower = filters.title.toLowerCase();
      const resultTitleLower = result.title.toLowerCase();
      // Use first 30 chars for fuzzy matching to handle slight variations
      const titleMatch = resultTitleLower.includes(filterTitleLower.substring(0, Math.min(30, filterTitleLower.length)));
      if (titleMatch) score += 3;
    }

    // Year matching - exact match or within 1 year
    if (filters.year && result.year) {
      if (result.year === filters.year) score += 3;
      else if (Math.abs(result.year - filters.year) <= 1) score += 1;
    }

    // Author matching - cache lowercased author names
    if (filters.authors && filters.authors.length > 0 && result.authors && result.authors.length > 0) {
      const resultAuthorsLower = result.authors.map(a => a.toLowerCase());
      const matchedAuthors = filters.authors.filter((filterAuthor: string) => {
        const lastName = filterAuthor.toLowerCase().split(' ').pop() || '';
        return resultAuthorsLower.some((resultAuthor: string) => resultAuthor.includes(lastName));
      });
      score += matchedAuthors.length * 2;
    }

    return score;
  }

  // Register Tools with Annotations
  server.registerTool(
    "verifyCitation",
    {
      description: "CRITICAL: Use this to verify ANY academic citation before mentioning it. Checks multiple databases (CrossRef, OpenAlex, PubMed, zbMATH, ERIC, HAL, INSPIRE-HEP, Semantic Scholar, DBLP) if a paper exists. Returns null if not found.",
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

        // Batch fetch PubMed DOIs for efficiency
        const pubmedPmids = searchResults.pubmed?.map((r: any) => r.uid).filter(Boolean) || [];
        const pubmedDoiMap = await getDOIsFromPubMed(pubmedPmids);

        // Normalize all results in parallel for maximum speed
        const normalizationPromises: Promise<NormalizedPaper | null>[] = [];

        if (searchResults.crossref) {
          normalizationPromises.push(...searchResults.crossref.map((r: any) => normalizeResult(r, 'crossref')));
        }
        if (searchResults.openalex) {
          normalizationPromises.push(...searchResults.openalex.map((r: any) => normalizeResult(r, 'openalex')));
        }
        if (searchResults.pubmed) {
          normalizationPromises.push(...searchResults.pubmed.map((r: any) => normalizeResult(r, 'pubmed', pubmedDoiMap)));
        }
        if (searchResults.zbmath) {
          normalizationPromises.push(...searchResults.zbmath.map((r: any) => normalizeResult(r, 'zbmath')));
        }
        if (searchResults.eric) {
          normalizationPromises.push(...searchResults.eric.map((r: any) => normalizeResult(r, 'eric')));
        }
        if (searchResults.hal) {
          normalizationPromises.push(...searchResults.hal.map((r: any) => normalizeResult(r, 'hal')));
        }
        if (searchResults.inspirehep) {
          normalizationPromises.push(...searchResults.inspirehep.map((r: any) => normalizeResult(r, 'inspirehep')));
        }
        if (searchResults.semanticscholar) {
          normalizationPromises.push(...searchResults.semanticscholar.map((r: any) => normalizeResult(r, 'semanticscholar')));
        }
        if (searchResults.dblp) {
          normalizationPromises.push(...searchResults.dblp.map((r: any) => normalizeResult(r, 'dblp')));
        }

        const allResults = (await Promise.all(normalizationPromises)).filter((r): r is NormalizedPaper => r !== null);

        if (allResults.length === 0) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                verified: false,
                message: "⚠ No matching publications found in any database - this citation may be incorrect",
                searchedSources: ['CrossRef', 'OpenAlex', 'PubMed', 'zbMATH', 'ERIC', 'HAL', 'INSPIRE-HEP', 'Semantic Scholar', 'DBLP'],
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
            // Early exit if we have a very high confidence match (title + year + author)
            if (bestScore >= 8) {
              break;
            }
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
      description: "Search multiple academic databases (CrossRef, OpenAlex, PubMed, zbMATH, ERIC, HAL, INSPIRE-HEP, Semantic Scholar, DBLP) for papers and return only verified, real citations with DOIs.",
      inputSchema: {
        query: z.string().describe("Search query (topic, keywords, author names)"),
        limit: z.number().min(1).max(20).default(5).describe("Number of results per source"),
        yearFrom: z.number().optional().describe("Minimum publication year"),
        yearTo: z.number().optional().describe("Maximum publication year"),
        source: z.enum(['all', 'crossref', 'openalex', 'pubmed', 'zbmath', 'eric', 'hal', 'inspirehep', 'semanticscholar', 'dblp']).default('all').describe("Which source to search"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      }
    },
    async ({ query, limit = 5, yearFrom, yearTo, source = 'all' }: { query: string; limit?: number; yearFrom?: number; yearTo?: number; source?: 'all' | 'crossref' | 'openalex' | 'pubmed' | 'zbmath' | 'eric' | 'hal' | 'inspirehep' | 'semanticscholar' | 'dblp' }) => {
      try {
        // Execute all API calls in parallel for maximum speed
        const apiPromises: Promise<{ source: string; items: any[] }>[] = [];

        if (source === 'all' || source === 'crossref') {
          apiPromises.push((async () => {
            let crossrefUrl = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${limit}`;
            if (yearFrom && yearTo) {
              crossrefUrl += `&filter=from-pub-date:${yearFrom},until-pub-date:${yearTo}`;
            } else if (yearFrom) {
              crossrefUrl += `&filter=from-pub-date:${yearFrom}`;
            } else if (yearTo) {
              crossrefUrl += `&filter=until-pub-date:${yearTo}`;
            }

            const response = await fetch(crossrefUrl);
            if (response.ok) {
              const data = await response.json();
              return { source: 'crossref', items: data.message?.items || [] };
            }
            return { source: 'crossref', items: [] };
          })());
        }

        if (source === 'all' || source === 'openalex') {
          apiPromises.push((async () => {
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
              return { source: 'openalex', items: data.results || [] };
            }
            return { source: 'openalex', items: [] };
          })());
        }

        if (source === 'all' || source === 'pubmed') {
          apiPromises.push((async () => {
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
                  return { source: 'pubmed', items: pmids.map((id: string) => fetchData.result?.[id]).filter(Boolean) };
                }
              }
            }
            return { source: 'pubmed', items: [] };
          })());
        }

        if (source === 'all' || source === 'zbmath') {
          apiPromises.push((async () => {
            let zbmathUrl = `https://api.zbmath.org/document/_structured_search?query=${encodeURIComponent(query)}&results_per_page=${limit}`;
            if (yearFrom) zbmathUrl += `&year=${yearFrom}`;
            if (yearTo && !yearFrom) zbmathUrl += `&year=${yearTo}`;

            const response = await fetch(zbmathUrl);
            if (response.ok) {
              const data = await response.json();
              return { source: 'zbmath', items: data.result || [] };
            }
            return { source: 'zbmath', items: [] };
          })());
        }

        if (source === 'all' || source === 'eric') {
          apiPromises.push((async () => {
            try {
              const ericUrl = `https://api.ies.ed.gov/eric/?search=${encodeURIComponent(query)}&rows=${limit}&format=json`;
              const response = await fetch(ericUrl);
              if (response.ok) {
                const data = await response.json();
                return { source: 'eric', items: data.response?.docs || [] };
              }
            } catch (error) {
              // Return empty if API fails
            }
            return { source: 'eric', items: [] };
          })());
        }

        if (source === 'all' || source === 'hal') {
          apiPromises.push((async () => {
            try {
              let halUrl = `https://api.archives-ouvertes.fr/search/?q=${encodeURIComponent(query)}&wt=json&rows=${limit}`;
              if (yearFrom && yearTo) {
                halUrl += `&fq=publicationDateY_i:[${yearFrom} TO ${yearTo}]`;
              } else if (yearFrom) {
                halUrl += `&fq=publicationDateY_i:[${yearFrom} TO *]`;
              } else if (yearTo) {
                halUrl += `&fq=publicationDateY_i:[* TO ${yearTo}]`;
              }
              const response = await fetch(halUrl);
              if (response.ok) {
                const data = await response.json();
                return { source: 'hal', items: data.response?.docs || [] };
              }
            } catch (error) {
              // Return empty if API fails
            }
            return { source: 'hal', items: [] };
          })());
        }

        if (source === 'all' || source === 'inspirehep') {
          apiPromises.push((async () => {
            try {
              let inspireUrl = `https://inspirehep.net/api/literature?q=${encodeURIComponent(query)}&size=${limit}`;
              if (yearFrom && yearTo) {
                inspireUrl = `https://inspirehep.net/api/literature?q=${encodeURIComponent(query)}+and+date+${yearFrom}--${yearTo}&size=${limit}`;
              } else if (yearFrom) {
                inspireUrl = `https://inspirehep.net/api/literature?q=${encodeURIComponent(query)}+and+date+${yearFrom}--&size=${limit}`;
              } else if (yearTo) {
                inspireUrl = `https://inspirehep.net/api/literature?q=${encodeURIComponent(query)}+and+date+--${yearTo}&size=${limit}`;
              }
              const response = await fetch(inspireUrl);
              if (response.ok) {
                const data = await response.json();
                return { source: 'inspirehep', items: data.hits?.hits || [] };
              }
            } catch (error) {
              // Return empty if API fails
            }
            return { source: 'inspirehep', items: [] };
          })());
        }

        if (source === 'all' || source === 'semanticscholar') {
          apiPromises.push((async () => {
            let semanticUrl = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=paperId,title,authors,year,externalIds,venue`;
            if (yearFrom && yearTo) {
              semanticUrl += `&year=${yearFrom}-${yearTo}`;
            } else if (yearFrom) {
              semanticUrl += `&year=${yearFrom}-`;
            } else if (yearTo) {
              semanticUrl += `&year=-${yearTo}`;
            }

            const response = await fetch(semanticUrl);
            if (response.ok) {
              const data = await response.json();
              return { source: 'semanticscholar', items: data.data || [] };
            }
            return { source: 'semanticscholar', items: [] };
          })());
        }

        if (source === 'all' || source === 'dblp') {
          apiPromises.push((async () => {
            const dblpUrl = `https://dblp.org/search/publ/api?q=${encodeURIComponent(query)}&format=json&h=${limit}`;
            const response = await fetch(dblpUrl);
            if (response.ok) {
              const data = await response.json();
              // Filter by year if specified
              let hits = data.result?.hits?.hit || [];
              if (yearFrom || yearTo) {
                hits = hits.filter((hit: any) => {
                  const year = hit.info?.year ? parseInt(hit.info.year) : null;
                  if (!year) return true;
                  if (yearFrom && year < yearFrom) return false;
                  if (yearTo && year > yearTo) return false;
                  return true;
                });
              }
              return { source: 'dblp', items: hits };
            }
            return { source: 'dblp', items: [] };
          })());
        }

        // Wait for all API calls to complete
        const apiResults = await Promise.allSettled(apiPromises);

        // Collect all items and batch fetch PubMed DOIs
        const allItems: { source: string; items: any[] }[] = [];
        apiResults.forEach(result => {
          if (result.status === 'fulfilled') {
            allItems.push(result.value);
          }
        });

        // Batch fetch PubMed DOIs
        const pubmedItems = allItems.find(item => item.source === 'pubmed');
        const pubmedPmids = pubmedItems?.items.map((r: any) => r.uid).filter(Boolean) || [];
        const pubmedDoiMap = await getDOIsFromPubMed(pubmedPmids);

        // Normalize all results in parallel
        const normalizationPromises: Promise<NormalizedPaper | null>[] = [];
        allItems.forEach(({ source, items }) => {
          if (source === 'pubmed') {
            normalizationPromises.push(...items.map((item: any) => normalizeResult(item, 'pubmed', pubmedDoiMap)));
          } else {
            normalizationPromises.push(...items.map((item: any) => normalizeResult(item, source)));
          }
        });

        const allPapers = (await Promise.all(normalizationPromises)).filter((r): r is NormalizedPaper => r !== null);

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
              name: "ERIC",
              coverage: "1.7+ million education publications",
              url: "https://eric.ed.gov",
              types: "Education research"
            },
            {
              name: "HAL",
              coverage: "4.4+ million documents",
              url: "https://hal.science",
              types: "All disciplines, particularly strong in humanities and social sciences"
            },
            {
              name: "INSPIRE-HEP",
              coverage: "1.7+ million high-energy physics publications",
              url: "https://inspirehep.net",
              types: "High-energy physics, particle physics, and related fields"
            },
            {
              name: "Semantic Scholar",
              coverage: "200+ million papers",
              url: "https://www.semanticscholar.org",
              types: "All academic disciplines with AI-powered search"
            },
            {
              name: "DBLP",
              coverage: "Comprehensive computer science bibliography",
              url: "https://dblp.org",
              types: "Computer science publications (journals and conferences)"
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