# Local Installation Guide

## Quick Install

### Option 1: Install from GitHub (Recommended)

Add this to your Claude Desktop config file:

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "doi-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "github:tfscharff/doi-mcp"
      ]
    }
  }
}
```

Restart Claude Desktop and the server will be available!

### Option 2: Install Globally

```bash
npm install -g github:tfscharff/doi-mcp
```

Then add to Claude Desktop config:

```json
{
  "mcpServers": {
    "doi-mcp": {
      "command": "doi-mcp"
    }
  }
}
```

### Option 3: Clone and Install Locally

```bash
# Clone the repository
git clone https://github.com/tfscharff/doi-mcp.git
cd doi-mcp

# Install dependencies and build
npm install
npm run build
```

Add to Claude Desktop config:

```json
{
  "mcpServers": {
    "doi-mcp": {
      "command": "node",
      "args": [
        "/absolute/path/to/doi-mcp/dist/index.js"
      ]
    }
  }
}
```

## Verify Installation

After restarting Claude Desktop, you should see these tools available:
- `verifyCitation` - Verify if a specific citation exists
- `findVerifiedPapers` - Search for real papers on a topic

## Troubleshooting

### Server not connecting
1. Check that Node.js is installed: `node --version` (requires v18+)
2. Look at Claude Desktop logs:
   - **Windows**: `%APPDATA%\Claude\logs\`
   - **macOS**: `~/Library/Logs/Claude/`
   - **Linux**: `~/.config/Claude/logs/`

### npx command fails
Try clearing npm cache:
```bash
npm cache clean --force
```

### Build errors
Make sure you have TypeScript dependencies:
```bash
cd doi-mcp
npm install
npm run build
```

## Development

To run in development mode:
```bash
npm run dev  # Watch mode for TypeScript compilation
```

## Testing Locally

You can test the server with the MCP inspector:
```bash
npx @modelcontextprotocol/inspector node dist/index.js
```
