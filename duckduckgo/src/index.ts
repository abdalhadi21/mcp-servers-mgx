#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as DDG from "duck-duck-scrape";
import http, { IncomingMessage, ServerResponse } from 'http';

interface DuckDuckGoSearchArgs {
  query: string;
  count?: number;
  safeSearch?: "strict" | "moderate" | "off";
}

interface SearchResult {
  title: string;
  description: string;
  url: string;
}

interface RateLimit {
  perSecond: number;
  perMonth: number;
}

interface RequestCount {
  second: number;
  month: number;
  lastReset: number;
}

const CONFIG = {
  server: {
    name: "zhsama/duckduckgo-mcp-server",
    version: "0.1.2",
  },
  rateLimit: {
    perSecond: 1,
    perMonth: 15000,
  } as RateLimit,
  search: {
    maxQueryLength: 400,
    maxResults: 20,
    defaultResults: 10,
    defaultSafeSearch: "moderate" as const,
  },
} as const;

const WEB_SEARCH_TOOL = {
  name: "duckduckgo_web_search",
  description:
    "Performs a web search using the DuckDuckGo, ideal for general queries, news, articles, and online content. " +
    "Use this for broad information gathering, recent events, or when you need diverse web sources. " +
    "Supports content filtering and region-specific searches. " +
    `Maximum ${CONFIG.search.maxResults} results per request.`,
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: `Search query (max ${CONFIG.search.maxQueryLength} chars)`,
        maxLength: CONFIG.search.maxQueryLength,
      },
      count: {
        type: "number",
        description: `Number of results (1-${CONFIG.search.maxResults}, default ${CONFIG.search.defaultResults})`,
        minimum: 1,
        maximum: CONFIG.search.maxResults,
        default: CONFIG.search.defaultResults,
      },
      safeSearch: {
        type: "string",
        description: "SafeSearch level (strict, moderate, off)",
        enum: ["strict", "moderate", "off"],
        default: CONFIG.search.defaultSafeSearch,
      },
    },
    required: ["query"],
  },
};

const server = new Server(
  {
    name: CONFIG.server.name,
    version: CONFIG.server.version,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// 速率限制状态
let requestCount: RequestCount = {
  second: 0,
  month: 0,
  lastReset: Date.now(),
};

/**
 * 检查并更新速率限制
 * @throws {Error} 当超过速率限制时抛出错误
 */
function checkRateLimit(): void {
  const now = Date.now();
  console.error(`[DEBUG] Rate limit check - Current counts:`, requestCount);

  // 重置每秒计数器
  if (now - requestCount.lastReset > 1000) {
    requestCount.second = 0;
    requestCount.lastReset = now;
  }

  // 检查限制
  if (
    requestCount.second >= CONFIG.rateLimit.perSecond ||
    requestCount.month >= CONFIG.rateLimit.perMonth
  ) {
    const error = new Error("Rate limit exceeded");
    console.error("[ERROR] Rate limit exceeded:", requestCount);
    throw error;
  }

  // 更新计数器
  requestCount.second++;
  requestCount.month++;
}

/**
 * 类型守卫：检查参数是否符合 DuckDuckGoSearchArgs 接口
 */
function isDuckDuckGoWebSearchArgs(
  args: unknown
): args is DuckDuckGoSearchArgs {
  if (typeof args !== "object" || args === null) {
    return false;
  }

  const { query } = args as Partial<DuckDuckGoSearchArgs>;

  if (typeof query !== "string") {
    return false;
  }

  if (query.length > CONFIG.search.maxQueryLength) {
    return false;
  }

  return true;
}

/**
 * 执行网络搜索
 * @param query 搜索查询
 * @param count 结果数量
 * @param safeSearch 安全搜索级别
 * @returns 格式化的搜索结果
 */
async function performWebSearch(
  query: string,
  count: number = CONFIG.search.defaultResults,
  safeSearch: "strict" | "moderate" | "off" = CONFIG.search.defaultSafeSearch
): Promise<string> {
  console.error(
    `[DEBUG] Performing search - Query: "${query}", Count: ${count}, SafeSearch: ${safeSearch}`
  );

  try {
    checkRateLimit();

    const safeSearchMap = {
      strict: DDG.SafeSearchType.STRICT,
      moderate: DDG.SafeSearchType.MODERATE,
      off: DDG.SafeSearchType.OFF,
    };

    const searchResults = await DDG.search(query, {
      safeSearch: safeSearchMap[safeSearch],
    });

    if (searchResults.noResults) {
      console.error(`[INFO] No results found for query: "${query}"`);
      return `# DuckDuckGo 搜索结果\n没有找到与 "${query}" 相关的结果。`;
    }

    const results: SearchResult[] = searchResults.results
      .slice(0, count)
      .map((result: DDG.SearchResult) => ({
        title: result.title,
        description: result.description || result.title,
        url: result.url,
      }));

    console.error(
      `[INFO] Found ${results.length} results for query: "${query}"`
    );

    // 格式化结果
    return formatSearchResults(query, results);
  } catch (error) {
    console.error(`[ERROR] Search failed - Query: "${query}"`, error);
    throw error;
  }
}

/**
 * 格式化搜索结果为 Markdown
 */
function formatSearchResults(query: string, results: SearchResult[]): string {
  const formattedResults = results
    .map((r: SearchResult) => {
      return `### ${r.title}
${r.description}

🔗 [阅读更多](${r.url})
`;
    })
    .join("\n\n");

  return `# DuckDuckGo 搜索结果
${query} 的搜索结果（${results.length}件）

---

${formattedResults}
`;
}

// 工具处理器
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [WEB_SEARCH_TOOL],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    console.error(
      `[DEBUG] Received tool call request:`,
      JSON.stringify(request.params, null, 2)
    );

    const { name, arguments: args } = request.params;

    if (!args) {
      throw new Error("No arguments provided");
    }

    switch (name) {
      case "duckduckgo_web_search": {
        if (!isDuckDuckGoWebSearchArgs(args)) {
          throw new Error("Invalid arguments for duckduckgo_web_search");
        }

        const {
          query,
          count = CONFIG.search.defaultResults,
          safeSearch = CONFIG.search.defaultSafeSearch,
        } = args;
        const results = await performWebSearch(query, count, safeSearch);

        return {
          content: [{ type: "text", text: results }],
          isError: false,
        };
      }
      default: {
        console.error(`[ERROR] Unknown tool requested: ${name}`);
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
      }
    }
  } catch (error) {
    console.error("[ERROR] Request handler error:", error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
      isError: true,
    };
  }
});

/**
 * 启动服务器
 */
async function runServer() {
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
        res.end('DuckDuckGo Search MCP Server\nSSE endpoint: /sse\nMessages endpoint: /messages');
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });
    
    httpServer.listen(port, () => {
      console.error(`DuckDuckGo Search MCP Server running on SSE at port ${port}`);
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("DuckDuckGo Search MCP Server running on stdio");
  }
}

// 启动服务器并处理未捕获的错误
process.on("uncaughtException", (error) => {
  console.error("[FATAL] Uncaught exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Unhandled rejection:", reason);
  process.exit(1);
});

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
