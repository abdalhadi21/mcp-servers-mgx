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
import http, { IncomingMessage, ServerResponse } from "http";

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
    
    // Store transports by session ID
    const transports: Record<string, SSEServerTransport> = {};
    
    const httpServer = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
      // Add CORS headers for all requests
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.url === '/sse' && req.method === 'GET') {
        try {
          // Create SSE transport
          const transport = new SSEServerTransport('/messages', res);
          transports[transport.sessionId] = transport;
          
          res.on("close", () => {
            delete transports[transport.sessionId];
          });
          
          await server.connect(transport);
        } catch (error) {
          console.error('SSE connection error:', error);
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
        }
      } else if (req.url?.startsWith('/messages') && req.method === 'POST') {
        try {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const sessionId = url.searchParams.get('sessionId');
          const transport = transports[sessionId || ''];
          
          if (transport) {
            await transport.handlePostMessage(req, res);
          } else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              error: {
                code: -32000,
                message: 'No transport found for sessionId'
              },
              id: null
            }));
          }
        } catch (error) {
          console.error('Message handling error:', error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            error: {
              code: -32603,
              message: 'Internal server error'
            },
            id: null
          }));
        }
      } else if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Web Fetcher MCP Server\nSSE endpoint: /sse\nMessages endpoint: /messages');
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });
    
    httpServer.listen(port, () => {
      console.error(`Web Fetcher MCP server running on SSE at port ${port}`);
      console.error(`SSE endpoint: http://localhost:${port}/sse`);
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