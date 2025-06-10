# duckduckgo-search MCP Server

English | [中文](README_zh.md)

A Model Context Protocol server for DuckDuckGo Search

This is a TypeScript-based MCP server that provides DuckDuckGo search functionality. It demonstrates core MCP concepts through:

- Integration with DuckDuckGo Search
- Easy-to-use search tool interface
- Rate limiting and error handling support

<a href="https://glama.ai/mcp/servers/34fhy9xb9w">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/34fhy9xb9w/badge" alt="DuckDuckGo Server MCP server" />
</a>

## Features

### Search Tool

- `duckduckgo_search` - Perform web searches using DuckDuckGo API
  - Required parameter: `query` (search query, max 400 characters)
  - Optional parameter: `count` (number of results, 1-20, default 10)
  - Optional parameter: `safeSearch` (safety level: strict/moderate/off, default moderate)
  - Returns formatted Markdown search results

### Rate Limits

- Maximum 1 request per second
- Maximum 15000 requests per month

## Development

### Prerequisites

- Node.js >= 18
- pnpm >= 8.0.0

### Installation

```bash
# Install pnpm if not already installed
npm install -g pnpm

# Install project dependencies
pnpm install
```

### Build and Run

Build the server:

```bash
pnpm run build
```

For development with auto-rebuild:

```bash
pnpm run watch
```

## Installation & Usage

### Docker (Recommended)

```bash
# Build the Docker image
docker build -t duckduckgo-mcp-server .

# Run the server with SSE transport
docker run -p 3000:3000 duckduckgo-mcp-server
```

The server will be available at `http://localhost:3000`

### Local Development

```bash
# Install dependencies
pnpm install

# Build the project
pnpm run build

# Run with stdio transport (default)
node build/index.js

# Run with SSE transport
MCP_TRANSPORT=sse PORT=3000 node build/index.js
```

## Setup in Claude Desktop

To use with Claude Desktop, add the server config:

On MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

### Using Docker:
```json
{
  "mcpServers": {
    "duckduckgo-search": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "duckduckgo-mcp-server"
      ],
      "env": {
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

### Using NPX:
```json
{
  "mcpServers": {
    "duckduckgo-search": {
        "command": "npx",
        "args": [
          "-y",
          "duckduckgo-mcp-server"
        ]
    }
  }
}
```

### Using Local Build:
```json
{
  "mcpServers": {
    "duckduckgo-search": {
      "command": "node",
      "args": [
        "/path/to/duckduckgo-search/build/index.js"
      ]
    }
  }
}
```
![image](https://github.com/user-attachments/assets/6906e280-9dbb-4bb5-a537-d9e45e666084)
![image](https://github.com/user-attachments/assets/867a70ae-082f-45ab-a623-869bfd6c31eb)

### Debugging

Since MCP servers communicate over stdio, debugging can be challenging. We recommend using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector), which is available as a package script:

```bash
pnpm run inspector
```

The Inspector will provide a URL to access debugging tools in your browser.

## Environment Variables

- `MCP_TRANSPORT`: Transport type (`stdio` or `sse`, default: `stdio`)
- `PORT`: Port for SSE transport (default: `3000`)
- `NODE_ENV`: Node environment (`production` or `development`)