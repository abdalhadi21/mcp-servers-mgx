#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import http, { IncomingMessage, ServerResponse } from 'http';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

interface SearXNGSearchArgs {
  query: string;
  count?: number;
  safeSearch?: "0" | "1" | "2";
  categories?: string;
  engines?: string;
  lang?: string;
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
  lastSecondReset: number;
  lastMonthReset: number;
}

const CONFIG = {
  server: {
    name: packageJson.name.replace('duckduckgo', 'searxng'),
    version: packageJson.version,
  },
  searxng: {
    baseUrl: process.env.SEARXNG_BASE_URL || 'https://VTM2KCSv7OThTLoGfy9H6jn0Z0FUGPl6.selfstack.space',
    timeout: parseInt(process.env.SEARXNG_TIMEOUT || '15000'),
  },
  rateLimit: {
    perSecond: parseInt(process.env.RATE_LIMIT_PER_SECOND || '5'),
    perMonth: parseInt(process.env.RATE_LIMIT_PER_MONTH || '200000'),
  } as RateLimit,
  search: {
    maxQueryLength: parseInt(process.env.MAX_QUERY_LENGTH || '400'),
    maxResults: parseInt(process.env.MAX_RESULTS || '20'),
    defaultResults: parseInt(process.env.DEFAULT_RESULTS || '10'),
    defaultSafeSearch: (process.env.DEFAULT_SAFE_SEARCH || '1') as '0' | '1' | '2',
    defaultCategories: process.env.DEFAULT_CATEGORIES || 'general',
  },
} as const;

const WEB_SEARCH_TOOL = {
  name: "searxng_web_search",
  description:
    "Performs a web search using SearXNG, ideal for general queries, news, articles, and online content. " +
    "Use this for broad information gathering, recent events, or when you need diverse web sources. " +
    "Supports content filtering, multiple search engines, and region-specific searches. " +
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
        description: "SafeSearch level (0=off, 1=moderate, 2=strict)",
        enum: ["0", "1", "2"],
        default: CONFIG.search.defaultSafeSearch,
      },
      categories: {
        type: "string",
        description: "Search categories (general, images, videos, news, music, files, etc.)",
        default: CONFIG.search.defaultCategories,
      },
      engines: {
        type: "string",
        description: "Comma-separated list of search engines to use",
      },
      lang: {
        type: "string",
        description: "Language code (e.g., en, fr, de)",
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
  lastSecondReset: Date.now(),
  lastMonthReset: Date.now(),
};

/**
 * 检查并更新速率限制
 * @throws {Error} 当超过速率限制时抛出错误
 */
function checkRateLimit(): void {
  const now = Date.now();
  console.error(`[DEBUG] Rate limit check - Current counts:`, requestCount);

  // 重置每秒计数器 (1秒 = 1000毫秒)
  if (now - requestCount.lastSecondReset > 1000) {
    requestCount.second = 0;
    requestCount.lastSecondReset = now;
  }

  // 重置每月计数器 (30天 = 30 * 24 * 60 * 60 * 1000毫秒)
  const monthInMs = 30 * 24 * 60 * 60 * 1000;
  if (now - requestCount.lastMonthReset > monthInMs) {
    requestCount.month = 0;
    requestCount.lastMonthReset = now;
  }

  // 检查限制
  if (requestCount.second >= CONFIG.rateLimit.perSecond) {
    throw new Error(`Rate limit exceeded: ${requestCount.second}/${CONFIG.rateLimit.perSecond} per second`);
  }
  if (requestCount.month >= CONFIG.rateLimit.perMonth) {
    throw new Error(`Rate limit exceeded: ${requestCount.month}/${CONFIG.rateLimit.perMonth} per month`);
  }

  // 更新计数器
  requestCount.second++;
  requestCount.month++;
}

/**
 * 验证和清理搜索参数
 */
function validateAndSanitizeArgs(args: unknown): SearXNGSearchArgs {
  if (typeof args !== "object" || args === null) {
    throw new Error("Invalid arguments: must be an object");
  }

  const { query, count, safeSearch, categories, engines, lang } = args as Partial<SearXNGSearchArgs>;

  // 验证 query
  if (typeof query !== "string") {
    throw new Error("Query must be a string");
  }
  if (query.trim().length === 0) {
    throw new Error("Query cannot be empty");
  }
  if (query.length > CONFIG.search.maxQueryLength) {
    throw new Error(`Query too long (max ${CONFIG.search.maxQueryLength} characters)`);
  }

  // 验证 count
  let validCount = CONFIG.search.defaultResults;
  if (count !== undefined) {
    if (typeof count !== "number" || !Number.isInteger(count)) {
      throw new Error("Count must be an integer");
    }
    if (count < 1 || count > CONFIG.search.maxResults) {
      throw new Error(`Count must be between 1 and ${CONFIG.search.maxResults}`);
    }
    validCount = count;
  }

  // 验证 safeSearch
  let validSafeSearch = CONFIG.search.defaultSafeSearch;
  if (safeSearch !== undefined) {
    if (!['0', '1', '2'].includes(safeSearch)) {
      throw new Error("SafeSearch must be '0' (off), '1' (moderate), or '2' (strict)");
    }
    validSafeSearch = safeSearch;
  }

  // 验证可选参数
  let validCategories = CONFIG.search.defaultCategories;
  if (categories !== undefined) {
    if (typeof categories !== "string") {
      throw new Error("Categories must be a string");
    }
    validCategories = categories.trim();
  }

  let validEngines: string | undefined;
  if (engines !== undefined) {
    if (typeof engines !== "string") {
      throw new Error("Engines must be a string");
    }
    validEngines = engines.trim();
  }

  let validLang: string | undefined;
  if (lang !== undefined) {
    if (typeof lang !== "string") {
      throw new Error("Language must be a string");
    }
    validLang = lang.trim();
  }

  return {
    query: query.trim(),
    count: validCount,
    safeSearch: validSafeSearch,
    categories: validCategories,
    engines: validEngines,
    lang: validLang,
  };
}


/**
 * 执行 SearXNG 网络搜索
 * @param searchArgs 搜索参数
 * @returns 格式化的搜索结果
 */
async function performWebSearch(searchArgs: SearXNGSearchArgs): Promise<string> {
  console.error(
    `[DEBUG] Performing SearXNG search - Query: "${searchArgs.query}", Count: ${searchArgs.count}`
  );

  try {
    checkRateLimit();

    // 构建 SearXNG API URL
    const searchUrl = new URL('/search', CONFIG.searxng.baseUrl);
    searchUrl.searchParams.set('q', searchArgs.query);
    searchUrl.searchParams.set('format', 'json');
    searchUrl.searchParams.set('safesearch', searchArgs.safeSearch || CONFIG.search.defaultSafeSearch);
    searchUrl.searchParams.set('categories', searchArgs.categories || CONFIG.search.defaultCategories);
    
    if (searchArgs.engines) {
      searchUrl.searchParams.set('engines', searchArgs.engines);
    }
    
    if (searchArgs.lang) {
      searchUrl.searchParams.set('lang', searchArgs.lang);
    }

    console.error(`[DEBUG] SearXNG URL: ${searchUrl.toString()}`);

    // 调用 SearXNG API
    const response = await fetch(searchUrl.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'SearXNG-MCP-Server/1.0',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(CONFIG.searxng.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`[ERROR] SearXNG API error: ${response.status} ${response.statusText}`, errorText);
      
      if (response.status === 429) {
        throw new Error('SearXNG instance rate limit exceeded. Please try again later.');
      } else if (response.status >= 500) {
        throw new Error('SearXNG service is temporarily unavailable.');
      } else if (response.status === 403) {
        throw new Error('SearXNG access denied. Please check instance configuration.');
      } else {
        throw new Error(`SearXNG API error: ${response.status}`);
      }
    }

    const data = await response.json();

    if (!data.results || !Array.isArray(data.results)) {
      console.error(`[INFO] No results found for query: "${searchArgs.query}"`);
      return `# SearXNG Search Results\nNo results found for "${searchArgs.query}".`;
    }

    // 限制结果数量
    const results: SearchResult[] = data.results
      .slice(0, searchArgs.count || CONFIG.search.defaultResults)
      .map((result: any) => ({
        title: result.title || 'No title',
        description: result.content || result.title || 'No description',
        url: result.url,
      }));

    console.error(
      `[INFO] Found ${results.length} results for query: "${searchArgs.query}"`
    );

    return formatSearchResults(searchArgs.query, results);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('Rate limit')) {
        throw new Error('Search rate limit exceeded. Please try again later.');
      }
      if (error.message.includes('timeout') || error.message.includes('fetch')) {
        throw new Error('SearXNG service temporarily unavailable. Please try again.');
      }
      if (error.message.includes('SearXNG API error')) {
        throw new Error('SearXNG service error. Please check the service configuration.');
      }
    }
    console.error(`[ERROR] SearXNG search failed - Query: "${searchArgs.query}"`, error);
    throw new Error('Search failed due to an internal error.');
  }
}

/**
 * 格式化搜索结果为 Markdown
 */
function formatSearchResults(query: string, results: SearchResult[]): string {
  const formattedResults = results
    .map((r: SearchResult) => {
      // 输出中防止 Markdown 注入
      const safeTitle = r.title.replace(/[\[\]]/g, '');
      const safeDescription = r.description.replace(/[\[\]]/g, '');
      const safeUrl = r.url;
      
      return `### ${safeTitle}
${safeDescription}

🔗 [Read more](${safeUrl})
`;
    })
    .join("\n\n");

  const safeQuery = query.replace(/[\[\]]/g, '');
  return `# SearXNG Search Results
Search results for "${safeQuery}" (${results.length} results)

---

${formattedResults}
`;
}

// 工具处理器
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [WEB_SEARCH_TOOL],
}));

server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  try {
    console.error(
      `[DEBUG] Received tool call request for tool: ${request.params?.name}`
    );

    const { name, arguments: args } = request.params;

    if (!name) {
      return {
        content: [{ type: "text", text: "Tool name is required" }],
        isError: true,
      };
    }

    if (!args) {
      return {
        content: [{ type: "text", text: "Tool arguments are required" }],
        isError: true,
      };
    }

    switch (name) {
      case "searxng_web_search": {
        try {
          const validatedArgs = validateAndSanitizeArgs(args);
          const results = await performWebSearch(validatedArgs);

          return {
            content: [{ type: "text", text: results }],
            isError: false,
          };
        } catch (validationError) {
          return {
            content: [{ 
              type: "text", 
              text: validationError instanceof Error ? validationError.message : "Invalid search parameters" 
            }],
            isError: true,
          };
        }
      }
      default: {
        return {
          content: [{ type: "text", text: `Tool '${name}' is not supported` }],
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
          text: "An internal error occurred while processing your request",
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
        res.end('SearXNG Search MCP Server\nSSE endpoint: /sse\nMessages endpoint: /messages');
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    });
    
    httpServer.listen(port, () => {
      console.error(`SearXNG Search MCP Server running on SSE at port ${port}`);
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("SearXNG Search MCP Server running on stdio");
  }
}

// 启动服务器并处理未捕获的错误
process.on("uncaughtException", (error: Error) => {
  console.error("[FATAL] Uncaught exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason: any) => {
  console.error("[FATAL] Unhandled rejection:", reason);
  process.exit(1);
});

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
