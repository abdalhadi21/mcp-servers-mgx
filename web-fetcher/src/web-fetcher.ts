import { Builder, WebDriver, By, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import tesseract from 'node-tesseract-ocr';
import sharp from 'sharp';
import PDFParser from 'pdf2json';
import mammoth from 'mammoth';

export interface FetchOptions {
  raw?: boolean;
  timeout?: number;
  userAgent?: string;
}

export interface ExtractionResult {
  content: string;
  method: string;
  score: number;
  metadata?: Record<string, any>;
}

export class WebFetcher {
  private turndown: TurndownService;
  private driver: WebDriver | null = null;

  constructor() {
    this.turndown = new TurndownService({
      headingStyle: 'atx',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
    });
    
    this.turndown.addRule('removeScripts', {
      filter: ['script', 'style', 'noscript'],
      replacement: () => '',
    });
  }

  async fetchContent(url: string, options: FetchOptions = {}): Promise<string> {
    const { raw = false, timeout = 30000 } = options;
    
    console.error(`Fetching content from: ${url}`);
    
    // Check if it's a GitHub URL and convert to raw content URL
    const processedUrl = this.processGitHubUrl(url);
    
    // Try HTTP first as it's fastest
    try {
      const httpResult = await this.extractWithHttp(processedUrl);
      if (httpResult && httpResult.score > 50) {
        console.error(`Fast HTTP extraction successful (score: ${httpResult.score})`);
        return raw ? (httpResult.metadata?.rawHtml || httpResult.content) : httpResult.content;
      }
    } catch (error) {
      console.error('HTTP extraction failed:', error);
    }

    const results: ExtractionResult[] = [];
    
    // Run other methods in parallel with timeout
    const extractionPromises = [
      this.extractWithBrowser(processedUrl, Math.min(timeout, 15000)).catch(err => {
        console.error('Browser extraction failed:', err);
        return null;
      }),
      this.isDocumentUrl(processedUrl) ? 
        this.extractDocument(processedUrl).catch(err => {
          console.error('Document extraction failed:', err);
          return null;
        }) : null,
    ];

    // Only try OCR as last resort
    if (results.length === 0) {
      extractionPromises.push(
        this.extractWithOCR(processedUrl, Math.min(timeout, 10000)).catch(err => {
          console.error('OCR extraction failed:', err);
          return null;
        })
      );
    }

    const extractionResults = await Promise.race([
      Promise.all(extractionPromises),
      new Promise<(ExtractionResult | null)[]>((_, reject) => 
        setTimeout(() => reject(new Error('Extraction timeout')), timeout)
      )
    ]);

    extractionResults.forEach(result => {
      if (result) results.push(result);
    });

    if (results.length === 0) {
      throw new Error('All extraction methods failed');
    }

    const bestResult = this.selectBestResult(results);
    console.error(`Selected method: ${bestResult.method} (score: ${bestResult.score})`);
    
    if (raw) {
      return bestResult.metadata?.rawHtml || bestResult.content;
    }
    
    return bestResult.content;
  }

  private async extractWithBrowser(url: string, timeout: number): Promise<ExtractionResult | null> {
    let driver: WebDriver | null = null;
    
    try {
      const options = new chrome.Options();
      options.addArguments(
        '--headless',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-extensions',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      );

      driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .build();

      await driver.manage().setTimeouts({ pageLoad: timeout });
      await driver.get(url);
      
      await driver.wait(until.elementLocated(By.tagName('body')), timeout);
      await driver.sleep(2000);

      const html = await driver.getPageSource();
      const $ = cheerio.load(html);
      
      $('script, style, noscript, nav, header, footer, aside, .ad, .advertisement').remove();
      
      const cleanHtml = $.html();
      const markdown = this.turndown.turndown(cleanHtml);
      const score = this.calculateScore(markdown, 'browser');
      
      return {
        content: markdown,
        method: 'browser',
        score,
        metadata: { rawHtml: html }
      };
      
    } finally {
      if (driver) {
        await driver.quit();
      }
    }
  }

  private async extractWithHttp(url: string): Promise<ExtractionResult | null> {
    const headers: any = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate',
      'Connection': 'keep-alive',
    };

    // Add GitHub token if available for API requests
    if (url.includes('api.github.com') && process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const response = await axios.get(url, {
      headers,
      timeout: 10000,
      maxRedirects: 5,
    });

    // Handle GitHub API responses
    if (url.includes('api.github.com')) {
      if (Array.isArray(response.data)) {
        // Directory listing
        const items = response.data.map((item: any) => 
          `- [${item.name}](${item.html_url}) (${item.type})`
        ).join('\n');
        return {
          content: `# Directory Contents\n\n${items}`,
          method: 'http-api',
          score: 80,
          metadata: { rawHtml: JSON.stringify(response.data) }
        };
      } else if (response.data.content) {
        // File content
        const content = Buffer.from(response.data.content, 'base64').toString('utf8');
        return {
          content: content,
          method: 'http-api',
          score: 90,
          metadata: { rawHtml: content }
        };
      }
    }

    const $ = cheerio.load(response.data);
    
    $('script, style, noscript, nav, header, footer, aside, .ad, .advertisement').remove();
    
    const cleanHtml = $.html();
    const markdown = this.turndown.turndown(cleanHtml);
    const score = this.calculateScore(markdown, 'http');
    
    return {
      content: markdown,
      method: 'http',
      score,
      metadata: { rawHtml: response.data }
    };
  }

  private async extractWithOCR(url: string, timeout: number): Promise<ExtractionResult | null> {
    let driver: WebDriver | null = null;
    
    try {
      const options = new chrome.Options();
      options.addArguments(
        '--headless',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1920,1080'
      );

      driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .build();

      await driver.manage().setTimeouts({ pageLoad: timeout });
      await driver.get(url);
      
      await driver.wait(until.elementLocated(By.tagName('body')), timeout);
      await driver.sleep(3000);

      const screenshot = await driver.takeScreenshot();
      const imageBuffer = Buffer.from(screenshot, 'base64');
      
      const processedImage = await sharp(imageBuffer)
        .resize(1920, null, { withoutEnlargement: true })
        .greyscale()
        .normalize()
        .png()
        .toBuffer();

      const ocrText = await tesseract.recognize(processedImage, {
        lang: 'eng',
        oem: 1,
        psm: 3,
      });

      const score = this.calculateScore(ocrText, 'ocr');
      
      return {
        content: ocrText,
        method: 'ocr',
        score,
        metadata: { screenshot: screenshot }
      };
      
    } finally {
      if (driver) {
        await driver.quit();
      }
    }
  }

  private async extractDocument(url: string): Promise<ExtractionResult | null> {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
    });

    const buffer = Buffer.from(response.data);
    let content = '';
    
    if (url.toLowerCase().includes('.pdf')) {
      const pdfParser = new (PDFParser as any)(null, 1);
      content = await new Promise((resolve, reject) => {
        pdfParser.on('pdfParser_dataError', (errData: any) => reject(errData.parserError));
        pdfParser.on('pdfParser_dataReady', () => {
          const text = pdfParser.getRawTextContent();
          resolve(text);
        });
        pdfParser.parseBuffer(buffer);
      });
    } else if (url.toLowerCase().includes('.docx')) {
      const result = await mammoth.extractRawText({ buffer });
      content = result.value;
    } else if (url.toLowerCase().includes('.doc')) {
      content = buffer.toString('utf8');
    }

    const score = this.calculateScore(content, 'document');
    
    return {
      content,
      method: 'document',
      score,
      metadata: { fileSize: buffer.length }
    };
  }

  private calculateScore(content: string, method: string): number {
    let score = 0;
    
    const contentLength = content.length;
    if (contentLength < 100) {
      score -= 20;
    } else {
      score += Math.min(contentLength / 100, 50);
    }
    
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 50);
    score += Math.min(paragraphs.length * 2, 20);
    
    const errorPatterns = [
      /error/i,
      /not found/i,
      /access denied/i,
      /forbidden/i,
      /timeout/i,
      /captcha/i,
      /robot/i,
    ];
    
    const hasErrors = errorPatterns.some(pattern => pattern.test(content));
    if (hasErrors) {
      score -= 30;
    }
    
    if (method === 'browser') score += 5;
    if (method === 'http') score += 3;
    if (method === 'ocr') score -= 5;
    if (method === 'document') score += 10;
    
    const hasStructure = /#{1,6}\s/.test(content) || /<h[1-6]/.test(content);
    if (hasStructure) score += 10;
    
    const hasLinks = /\[.*\]\(.*\)/.test(content) || /<a\s+href/.test(content);
    if (hasLinks) score += 5;
    
    return Math.max(0, score);
  }

  private selectBestResult(results: ExtractionResult[]): ExtractionResult {
    results.sort((a, b) => b.score - a.score);
    
    console.error('Extraction results:');
    results.forEach(r => {
      console.error(`  ${r.method}: score ${r.score}, length ${r.content.length}`);
    });
    
    return results[0];
  }

  private isDocumentUrl(url: string): boolean {
    const documentExtensions = ['.pdf', '.doc', '.docx', '.pptx', '.ppt'];
    return documentExtensions.some(ext => url.toLowerCase().includes(ext));
  }

  private processGitHubUrl(url: string): string {
    // Convert GitHub blob URLs to raw content URLs
    const githubBlobPattern = /github\.com\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)\/(.*)/;
    const match = url.match(githubBlobPattern);
    
    if (match) {
      const [, owner, repo, branch, path] = match;
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
    }
    
    // Convert GitHub tree URLs to API URLs
    const githubTreePattern = /github\.com\/([^\/]+)\/([^\/]+)\/tree\/([^\/]+)\/(.*)/;
    const treeMatch = url.match(githubTreePattern);
    
    if (treeMatch) {
      const [, owner, repo, branch, path] = treeMatch;
      return `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
    }
    
    return url;
  }

  async cleanup(): Promise<void> {
    if (this.driver) {
      await this.driver.quit();
      this.driver = null;
    }
  }
}