# duckduckgo-search MCP Server

[English](README.md) | 中文

一个基于 Model Context Protocol 的 DuckDuckGo 搜索服务器

这是一个基于 TypeScript 的 MCP 服务器，提供 DuckDuckGo 搜索功能。它通过以下方式展示了核心 MCP 概念：

- 实现了 DuckDuckGo 搜索 API 的集成
- 提供了易用的搜索工具接口
- 支持速率限制和错误处理

## 功能特性

### 搜索工具

- `duckduckgo_search` - 使用 DuckDuckGo API 执行网络搜索
  - 必需参数：`query`（搜索查询，最大 400 字符）
  - 可选参数：`count`（结果数量，1-20，默认 10）
  - 可选参数：`safeSearch`（安全搜索级别：strict/moderate/off，默认 moderate）
  - 返回格式化的 Markdown 搜索结果

### 速率限制

- 每秒最多 1 个请求
- 每月最多 15000 个请求

## 开发

### 前置要求

- Node.js >= 18
- pnpm >= 8.0.0

### 安装依赖

```bash
# 安装 pnpm（如果尚未安装）
npm install -g pnpm

# 安装项目依赖
pnpm install
```

### 构建和运行

构建服务器：

```bash
pnpm run build
```

开发模式（自动重新构建）：

```bash
pnpm run watch
```

## 安装

要在 Claude Desktop 中使用，请添加服务器配置：

MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
Windows: `%APPDATA%/Claude/claude_desktop_config.json`

```json
# online
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

# local
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

### 调试

由于 MCP 服务器通过 stdio 通信，调试可能具有挑战性。我们推荐使用 [MCP Inspector](https://github.com/modelcontextprotocol/inspector)，可通过以下命令启动：

```bash
pnpm run inspector
```

Inspector 将提供一个 URL，用于在浏览器中访问调试工具。
