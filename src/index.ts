#!/usr/bin/env node

// doi-mcp entry point

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

const transport = new StdioServerTransport();
const server = createServer();
await server.connect(transport);
