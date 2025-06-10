#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
  Tool,
  CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import http, { IncomingMessage, ServerResponse } from 'http';
// @ts-ignore
import { getSubtitles } from 'youtube-captions-scraper';

// Define tool configurations
const TOOLS: Tool[] = [
  {
    name: "get_transcript",
    description: "Extract transcript from a YouTube video URL or ID",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "YouTube video URL or ID"
        },
        lang: {
          type: "string",
          description: "Language code for transcript (e.g., 'ko', 'en')",
          default: "en"
        }
      },
      required: ["url", "lang"]
    }
  }
];

interface TranscriptLine {
  text: string;
  start: number;
  dur: number;
}

class YouTubeTranscriptExtractor {
  /**
   * Extracts YouTube video ID from various URL formats or direct ID input
   */
  extractYoutubeId(input: string): string {
    if (!input) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'YouTube URL or ID is required'
      );
    }

    // Handle URL formats
    try {
      const url = new URL(input);
      if (url.hostname === 'youtu.be') {
        return url.pathname.slice(1);
      } else if (url.hostname.includes('youtube.com')) {
        const videoId = url.searchParams.get('v');
        if (!videoId) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid YouTube URL: ${input}`
          );
        }
        return videoId;
      }
    } catch (error) {
      // Not a URL, check if it's a direct video ID
      if (!/^[a-zA-Z0-9_-]{11}$/.test(input)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid YouTube video ID: ${input}`
        );
      }
      return input;
    }

    throw new McpError(
      ErrorCode.InvalidParams,
      `Could not extract video ID from: ${input}`
    );
  }

  /**
   * Retrieves transcript for a given video ID and language
   */
  async getTranscript(videoId: string, lang: string): Promise<string> {
    const languagesToTry = [lang, 'en', 'auto'];
    
    for (const langCode of languagesToTry) {
      try {
        console.error(`Trying language: ${langCode}`);
        const transcript = await getSubtitles({
          videoID: videoId,
          lang: langCode,
        });

        if (transcript && transcript.length > 0) {
          return this.formatTranscript(transcript);
        }
      } catch (error) {
        console.error(`Failed to fetch transcript for ${langCode}:`, error);
        // Continue to next language
      }
    }
    
    throw new McpError(
      ErrorCode.InternalError,
      `Could not find captions for video: ${videoId}. Tried languages: ${languagesToTry.join(', ')}`
    );
  }

  /**
   * Formats transcript lines into readable text
   */
  private formatTranscript(transcript: TranscriptLine[]): string {
    return transcript
      .map(line => line.text.trim())
      .filter(text => text.length > 0)
      .join(' ');
  }
}

class TranscriptServer {
  private extractor: YouTubeTranscriptExtractor;
  private server: Server;

  constructor() {
    this.extractor = new YouTubeTranscriptExtractor();
    this.server = new Server(
      {
        name: "mcp-servers-youtube-transcript",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error: Error) => {
      console.error("[MCP Error]", error);
    };

    process.on('SIGINT', async () => {
      await this.stop();
      process.exit(0);
    });
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: TOOLS
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request: any) => 
      this.handleToolCall(request.params.name, request.params.arguments ?? {})
    );
  }

  /**
   * Handles tool call requests
   */
  private async handleToolCall(name: string, args: any): Promise<{ toolResult: CallToolResult }> {
    switch (name) {
      case "get_transcript": {
        const { url: input, lang = "en" } = args;
        
        if (!input || typeof input !== 'string') {
          throw new McpError(
            ErrorCode.InvalidParams,
            'URL parameter is required and must be a string'
          );
        }

        if (lang && typeof lang !== 'string') {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Language code must be a string'
          );
        }
        
        try {
          const videoId = this.extractor.extractYoutubeId(input);
          console.error(`Processing transcript for video: ${videoId}`);
          
          const transcript = await this.extractor.getTranscript(videoId, lang);
          console.error(`Successfully extracted transcript (${transcript.length} chars)`);
          
          return {
            toolResult: {
              content: [{
                type: "text",
                text: transcript,
                metadata: {
                  videoId,
                  language: lang,
                  timestamp: new Date().toISOString(),
                  charCount: transcript.length
                }
              }],
              isError: false
            }
          };
        } catch (error) {
          console.error('Transcript extraction failed:', error);
          
          if (error instanceof McpError) {
            throw error;
          }
          
          throw new McpError(
            ErrorCode.InternalError,
            `Failed to process transcript: ${(error as Error).message}`
          );
        }
      }

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${name}`
        );
    }
  }

  /**
   * Starts the server
   */
  async start(): Promise<void> {
    if (process.env.MCP_TRANSPORT === 'sse') {
      const port = parseInt(process.env.PORT || '3000');
      
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
            // Create SSE transport for legacy clients
            const transport = new SSEServerTransport('/messages', res);
            transports[transport.sessionId] = transport;
            
            res.on("close", () => {
              delete transports[transport.sessionId];
            });
            
            await this.server.connect(transport);
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
          res.end('YouTube Transcript MCP Server\nSSE endpoint: /sse\nMessages endpoint: /messages');
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        }
      });
      
      httpServer.listen(port, () => {
        console.error(`YouTube Transcript MCP Server running on SSE at port ${port}`);
      });
    } else {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error("YouTube Transcript MCP Server running on stdio");
    }
  }

  /**
   * Stops the server
   */
  async stop(): Promise<void> {
    try {
      await this.server.close();
    } catch (error) {
      console.error('Error while stopping server:', error);
    }
  }
}

// Main execution
async function main() {
  const server = new TranscriptServer();
  
  try {
    await server.start();
  } catch (error) {
    console.error("Server failed to start:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal server error:", error);
  process.exit(1);
});