#!/usr/bin/env node
/**
 * DOI MCP Server
 * Queries the DOI REST API to retrieve and verify article metadata.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fetch from "node-fetch";

const DOI_API_BASE = "https://api.crossref.org/v1";
const DOI_CONTENT_NEGOTIATION = "https://doi.org";

const HEADERS = {
  "User-Agent": "DOI-MCP/1.0 (mailto:user@example.com)",
  "Accept": "application/json",
};

// Initialize MCP server
const server = new Server({
  name: "doi-mcp",
  version: "1.0.0",
});

async function resolveDoi(doi) {
  let doiUrl = doi;
  if (!doi.startsWith("http")) {
    doiUrl = `${DOI_CONTENT_NEGOTIATION}/${doi}`;
  }

  try {
    const response = await fetch(doiUrl, {
      headers: {
        Accept: "application/vnd.citationstyles.csl+json",
        ...HEADERS,
      },
      timeout: 10000,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`Failed to resolve DOI: ${error.message}`);
  }
}

async function searchArticles(query, limit = 10) {
  try {
    const params = new URLSearchParams({
      query,
      rows: Math.min(limit, 100),
      sort: "relevance",
    });

    const response = await fetch(`${DOI_API_BASE}/works?${params}`, {
      headers: HEADERS,
      timeout: 10000,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    throw new Error(`Failed to search articles: ${error.message}`);
  }
}

async function getArticleMetadata(doi) {
  try {
    const data = await resolveDoi(doi);

    const metadata = {
      doi: data.DOI || doi,
      title: data.title || "Unknown",
      authors: (data.author || []).map(
        (author) =>
          `${author.given || ""} ${author.family || ""}`.trim()
      ),
      publication_date: data["published-print"]?.["date-parts"]?.[0] || null,
      journal:
        data["container-title"]?.[0] || "Unknown",
      volume: data.volume || null,
      issue: data.issue || null,
      pages: data.page || null,
      type: data.type || "unknown",
      url: data.URL || null,
      abstract: data.abstract || null,
    };

    return metadata;
  } catch (error) {
    throw new Error(`Error fetching metadata: ${error.message}`);
  }
}

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "resolve_doi",
        description: "Resolve a DOI to get article metadata",
        inputSchema: {
          type: "object",
          properties: {
            doi: {
              type: "string",
              description: "The DOI (e.g., '10.1038/nature12373')",
            },
          },
          required: ["doi"],
        },
      },
      {
        name: "search_articles",
        description: "Search for articles by query",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query",
            },
            limit: {
              type: "integer",
              description: "Max results (1-100)",
              default: 10,
            },
          },
          required: ["query"],
        },
      },
      {
        name: "get_metadata",
        description: "Get detailed article metadata",
        inputSchema: {
          type: "object",
          properties: {
            doi: {
              type: "string",
              description: "The DOI",
            },
          },
          required: ["doi"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request;

  try {
    let result;

    if (name === "resolve_doi") {
      result = await resolveDoi(args.doi);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } else if (name === "search_articles") {
      result = await searchArticles(args.query, args.limit || 10);
      const items = result.message?.items || [];
      const formatted = {
        total_results: result.message?.["total-results"] || 0,
        results: items.map((item) => ({
          doi: item.DOI,
          title: item.title,
          authors: (item.author || []).map(
            (a) => `${a.given || ""} ${a.family || ""}`.trim()
          ),
          published: item["published-print"]?.["date-parts"]?.[0] || null,
          journal: item["container-title"]?.[0] || "Unknown",
        })),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }],
      };
    } else if (name === "get_metadata") {
      result = await getArticleMetadata(args.doi);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } else {
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }
  } catch (error) {
    console.error(`Error calling tool ${name}:`, error);
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

async function main() {
  console.error("Starting DOI MCP server");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("DOI MCP server is running");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});