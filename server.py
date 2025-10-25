#!/usr/bin/env python3
"""
DOI Resolver MCP Server
Queries the DOI REST API to retrieve and verify article metadata.
"""

import asyncio
import json
import logging
import sys
from typing import Any

import httpx
from mcp.server import Server
from mcp.types import Tool, TextContent, ToolResult

# Initialize logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stderr
)
logger = logging.getLogger(__name__)

# Initialize MCP server
server = Server("doi-mcp")

# DOI API endpoints
DOI_API_BASE = "https://api.crossref.org/v1"
DOI_CONTENT_NEGOTIATION = "https://doi.org"

# HTTP client with timeout and headers
HEADERS = {
    "User-Agent": "DOI-MCP/1.0 (mailto:thomas.f.scharff@gmail.com)",
    "Accept": "application/json"
}

async def resolve_doi(doi: str) -> dict[str, Any]:
    """
    Resolve a DOI to its metadata using the DOI REST API.
    """
    if not doi.startswith("http"):
        doi_url = f"{DOI_CONTENT_NEGOTIATION}/{doi}"
    else:
        doi_url = doi
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                doi_url,
                headers={"Accept": "application/vnd.citationstyles.csl+json", **HEADERS}
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as e:
        raise ValueError(f"Failed to resolve DOI: {str(e)}")

async def search_articles(query: str, limit: int = 10) -> dict[str, Any]:
    """
    Search for articles using Crossref API.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{DOI_API_BASE}/works",
                params={
                    "query": query,
                    "rows": min(limit, 100),
                    "sort": "relevance"
                },
                headers=HEADERS
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPError as e:
        raise ValueError(f"Failed to search articles: {str(e)}")

async def get_article_metadata(doi: str) -> dict[str, Any]:
    """
    Get detailed article metadata including title, authors, publication date, etc.
    """
    try:
        data = await resolve_doi(doi)
        
        # Extract key metadata
        metadata = {
            "doi": data.get("DOI", doi),
            "title": data.get("title", "Unknown"),
            "authors": [
                f"{author.get('given', '')} {author.get('family', '')}".strip()
                for author in data.get("author", [])
            ],
            "publication_date": data.get("published-print", {}).get("date-parts", [[None]])[0],
            "journal": data.get("container-title", ["Unknown"])[0] if data.get("container-title") else "Unknown",
            "volume": data.get("volume"),
            "issue": data.get("issue"),
            "pages": data.get("page"),
            "type": data.get("type", "unknown"),
            "url": data.get("URL"),
            "abstract": data.get("abstract"),
        }
        
        return metadata
    except Exception as e:
        raise ValueError(f"Error fetching metadata: {str(e)}")

@server.list_tools()
async def list_tools() -> list[Tool]:
    """List available tools."""
    return [
        Tool(
            name="resolve_doi",
            description="Resolve a DOI to get article metadata including title, authors, publication date, and URL",
            inputSchema={
                "type": "object",
                "properties": {
                    "doi": {
                        "type": "string",
                        "description": "The DOI (e.g., '10.1038/nature12373' or 'https://doi.org/10.1038/nature12373')"
                    }
                },
                "required": ["doi"]
            }
        ),
        Tool(
            name="search_articles",
            description="Search for articles by title, author, keyword, or other metadata",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query (e.g., 'machine learning', 'author:Smith', 'title:quantum')"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of results to return (1-100, default: 10)",
                        "default": 10
                    }
                },
                "required": ["query"]
            }
        ),
        Tool(
            name="get_metadata",
            description="Get detailed metadata for an article including authors, journal, publication date, abstract, etc.",
            inputSchema={
                "type": "object",
                "properties": {
                    "doi": {
                        "type": "string",
                        "description": "The DOI of the article"
                    }
                },
                "required": ["doi"]
            }
        )
    ]

@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[ToolResult]:
    """Handle tool calls."""
    try:
        if name == "resolve_doi":
            result = await resolve_doi(arguments["doi"])
            return [ToolResult(
                content=[TextContent(type="text", text=json.dumps(result, indent=2))],
                isError=False
            )]
        
        elif name == "search_articles":
            result = await search_articles(
                arguments["query"],
                arguments.get("limit", 10)
            )
            # Format search results
            items = result.get("message", {}).get("items", [])
            formatted = {
                "total_results": result.get("message", {}).get("total-results", 0),
                "results": [
                    {
                        "doi": item.get("DOI"),
                        "title": item.get("title"),
                        "authors": [
                            f"{a.get('given', '')} {a.get('family', '')}".strip()
                            for a in item.get("author", [])
                        ],
                        "published": item.get("published-print", {}).get("date-parts", [[None]])[0],
                        "journal": item.get("container-title", ["Unknown"])[0] if item.get("container-title") else "Unknown",
                    }
                    for item in items
                ]
            }
            return [ToolResult(
                content=[TextContent(type="text", text=json.dumps(formatted, indent=2))],
                isError=False
            )]
        
        elif name == "get_metadata":
            result = await get_article_metadata(arguments["doi"])
            return [ToolResult(
                content=[TextContent(type="text", text=json.dumps(result, indent=2))],
                isError=False
            )]
        
        else:
            return [ToolResult(
                content=[TextContent(type="text", text=f"Unknown tool: {name}")],
                isError=True
            )]
    
    except Exception as e:
        logger.error(f"Error calling tool {name}: {str(e)}", exc_info=True)
        return [ToolResult(
            content=[TextContent(type="text", text=f"Error: {str(e)}")],
            isError=True
        )]

async def main():
    """Run the MCP server."""
    logger.info("Starting DOI Resolver MCP server")
    try:
        async with server:
            logger.info("DOI Resolver MCP server initialized and ready")
            await server.wait_for_shutdown()
    except asyncio.CancelledError:
        logger.info("Server cancelled")
    except Exception as e:
        logger.error(f"Server error: {e}", exc_info=True)
        raise

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Server shut down by user")
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        sys.exit(1)