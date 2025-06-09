# Web Fetcher MCP Server

A Model Context Protocol server that provides advanced web content fetching capabilities using browser automation, OCR, and multiple extraction methods. This server enables LLMs to retrieve and process content from web pages, even those that require JavaScript rendering or use anti-scraping techniques.

## Features

- **Multiple Extraction Methods**: Browser automation, HTTP requests, OCR, and document parsing
- **Intelligent Content Scoring**: Sophisticated scoring system to select the best extraction result
- **JavaScript Rendering**: Full browser automation with undetected Chrome driver
- **OCR Capabilities**: Extract text from images and complex layouts using Tesseract
- **Document Support**: Parse PDF, DOCX, and PPTX files
- **Anti-Detection**: Stealth browser configuration to bypass basic bot detection

## Available Tools

### `fetch`
Fetches a URL and extracts its contents as markdown using browser automation and multi-method extraction.

**Parameters:**
- `url` (string, required): URL to fetch
- `raw` (boolean, optional): Get the actual HTML content without simplification (default: false)

## Extraction Methods

The server uses multiple methods to extract content and selects the best result:

1. **Browser Automation**: Selenium WebDriver with undetected Chrome
2. **HTTP Extraction**: Direct HTTP requests with BeautifulSoup parsing
3. **OCR**: Screenshot-based text extraction using Tesseract
4. **Document Parsing**: Direct parsing of PDF, DOCX, PPTX files

## Scoring System

The server uses a sophisticated scoring system (0-100 points) to select the best result:

### Base Content Score (up to 50 points)
- 1 point per 100 characters of content (max 50)
- Penalty for extremely short content (<100 characters)

### Structure Bonus (up to 20 points)
- Points for well-structured content with paragraphs
- More paragraphs indicate better organization

### Quality Assessment
- **Error Detection**: Penalizes content with error messages
- **Structure Recognition**: Bonus for headers and links
- **Method Preference**: Browser > HTTP > Document > OCR

## Installation

```bash
npm install
npm run build
```

## Usage

### Development
```bash
npm run dev
```

### Production
```bash
# Stdio transport (default)
npm start

# SSE transport
MCP_TRANSPORT=sse PORT=3000 npm start
```

### Docker
```bash
docker build -t web-fetcher .

# Run with SSE transport (default in Docker)
docker run -p 3000:3000 web-fetcher

# Run with stdio transport
docker run -e MCP_TRANSPORT=stdio web-fetcher
```

## Transport Options

The server supports two transport modes:

1. **Stdio Transport** (default): For direct integration with MCP clients
2. **SSE Transport**: For HTTP-based deployment, accessible at `/sse` endpoint

Set transport mode using the `MCP_TRANSPORT` environment variable:
- `stdio` - Standard input/output communication
- `sse` - Server-Sent Events over HTTP (port configurable via `PORT` env var)

### SSE Endpoints
When running in SSE mode:
- GET `/sse` - SSE event stream endpoint
- POST `/messages?sessionId=...` - Message submission endpoint
- GET `/` - Server information

## System Requirements

- Node.js 18+
- Chrome/Chromium browser
- Tesseract OCR (for OCR functionality)

### Docker Dependencies
The Docker image includes:
- Chromium browser
- ChromeDriver
- Tesseract OCR with English language data
- Required fonts for proper rendering

## Example Usage

```javascript
// Fetch a regular webpage
{
  "tool": "fetch",
  "arguments": {
    "url": "https://example.com"
  }
}

// Get raw HTML content
{
  "tool": "fetch", 
  "arguments": {
    "url": "https://example.com",
    "raw": true
  }
}
```

## Error Handling

The server gracefully handles failures by:
- Trying multiple extraction methods
- Providing detailed error messages
- Falling back to alternative methods when primary methods fail
- Logging extraction attempts and scores for debugging

## Security Considerations

- Uses stealth browser configuration to avoid detection
- Respects robots.txt (optional implementation)
- Rate limiting recommended for production use
- No persistent storage of fetched content

## Performance Notes

- Browser automation has higher resource usage
- OCR processing can be CPU intensive
- Results are not cached (implement caching if needed)
- Parallel extraction attempts for best performance