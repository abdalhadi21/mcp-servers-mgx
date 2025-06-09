#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  CallToolRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { WebFetcher } from "./web-fetcher.js";
import http from "http";

const server = new Server(
  {
    name: "web-fetcher",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const webFetcher = new WebFetcher();

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "fetch",
        description: "Fetch a URL and extract its contents as markdown using browser automation",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "URL to fetch",
            },
            raw: {
              type: "boolean",
              description: "Get the actual HTML content if the requested page, without simplification",
              default: false,
            },
          },
          required: ["url"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
  const { name, arguments: args } = request.params;

  if (name === "fetch") {
    try {
      const { url, raw = false } = args as { url: string; raw?: boolean };
      
      if (!url || typeof url !== 'string') {
        throw new Error('URL is required and must be a string');
      }

      const result = await webFetcher.fetchContent(url, { raw });
      
      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching content: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = process.env.MCP_TRANSPORT || 'stdio';
  
  if (transport === 'sse') {
    const port = parseInt(process.env.PORT || '3000', 10);
    
    const httpServer = http.createServer();
    const sseTransport = new SSEServerTransport('/events', httpServer as any);
    
    await server.connect(sseTransport);
    
    httpServer.listen(port, () => {
      console.error(`Web Fetcher MCP server running on SSE transport at http://localhost:${port}/events`);
    });
  } else {
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport);
    console.error("Web Fetcher MCP server running on stdio");
  }
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});