#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
  Tool,
  CallToolResult
} from "@modelcontextprotocol/sdk/types.js";
import { YouTubeTranscriptFetcher, YouTubeUtils, YouTubeTranscriptError, TranscriptOptions, Transcript } from './youtube.js';
import http, { IncomingMessage, ServerResponse } from 'http';

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
        },
        enableParagraphs: {
          type: "boolean",
          description: "Enable automatic paragraph breaks",
          default: false
        }
      },
      required: ["url"]
    }
  }
];

class YouTubeTranscriptExtractor {
  /**
   * Extracts YouTube video ID from various URL formats or direct ID input
   */
  extractYoutubeId(input: string): string {
    return YouTubeTranscriptFetcher.extractVideoId(input);
  }

  /**
   * Retrieves transcripts for a given video ID and language
   */
  async getTranscripts({ videoID, lang }: TranscriptOptions): Promise<{ transcripts: Transcript[], title: string }> {
    try {
      const result = await YouTubeTranscriptFetcher.fetchTranscripts(videoID, { lang });
      if (result.transcripts.length === 0) {
        throw new YouTubeTranscriptError('No transcripts found');
      }
      return result;
    } catch (error) {
      if (error instanceof YouTubeTranscriptError || error instanceof McpError) {
        throw error;
      }
      throw new YouTubeTranscriptError(`Failed to fetch transcripts: ${(error as Error).message}`);
    }
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
        const { url: input, lang = "en", enableParagraphs = false } = args;
        
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
          
          const { transcripts, title } = await this.extractor.getTranscripts({ 
            videoID: videoId, 
            lang: lang 
          });
          
          // Format text with optional paragraph breaks
          const formattedText = YouTubeUtils.formatTranscriptText(transcripts, {
            enableParagraphs: enableParagraphs
          });
          
          console.error(`Successfully extracted transcript (${formattedText.length} chars)`);
          
          return {
            toolResult: {
              content: [{
                type: "text",
                text: `# ${title}\n\n${formattedText}`,
                metadata: {
                  videoId,
                  title,
                  language: lang,
                  timestamp: new Date().toISOString(),
                  charCount: formattedText.length,
                  transcriptCount: transcripts.length,
                  totalDuration: YouTubeUtils.calculateTotalDuration(transcripts),
                  paragraphsEnabled: enableParagraphs
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