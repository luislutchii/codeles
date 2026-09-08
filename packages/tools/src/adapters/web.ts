/**
 * CodeLES Web Tool
 * Busca na web, fetch de páginas, extração de conteúdo
 */

import { BaseToolAdapter } from './base.js';
import { ToolDefinition, ToolResult, ToolContext, ToolArtifact, ValidationResult } from '@codeles/core';

export class WebTool extends BaseToolAdapter {
  name = 'web';
  description = 'Web search, fetch pages, extract content. Supports search engines, direct URL fetching, and content extraction.';
  version = '1.0.0';

  definition: ToolDefinition = {
    type: 'function',
    function: {
      name: 'web',
      description: 'Web operations: search, fetch, extract content from URLs.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['search', 'fetch', 'extract', 'summarize'],
            description: 'Operation to perform'
          },
          query: {
            type: 'string',
            description: 'Search query for search action'
          },
          url: {
            type: 'string',
            description: 'URL for fetch/extract/summarize actions'
          },
          engine: {
            type: 'string',
            enum: ['duckduckgo', 'google', 'bing', 'brave'],
            description: 'Search engine to use (default: duckduckgo)',
            default: 'duckduckgo'
          },
          maxResults: {
            type: 'number',
            description: 'Maximum results for search (default: 10)',
            default: 10
          },
          timeout: {
            type: 'number',
            description: 'Request timeout in ms (default: 30000)',
            default: 30000
          },
          headers: {
            type: 'object',
            description: 'Custom headers for fetch requests'
          }
        },
        required: ['action']
      }
    }
  };

  permissions = [
    { action: 'search', allowed: true },
    { action: 'fetch', allowed: true },
    { action: 'extract', allowed: true }
  ];

  private userAgent = 'CodeLES/1.0 (+https://codeles.lutchi.vercel.app)';

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const { action, query, url, engine = 'duckduckgo', maxResults = 10, timeout = 30000, headers = {} } = args as {
      action: string;
      query?: string;
      url?: string;
      engine?: string;
      maxResults?: number;
      timeout?: number;
      headers?: Record<string, string>;
    };

    try {
      switch (action) {
        case 'search':
          if (!query) return this.createErrorResult('query is required for search');
          return await this.searchWeb(query, engine, maxResults, timeout);
        case 'fetch':
          if (!url) return this.createErrorResult('url is required for fetch');
          return await this.fetchUrl(url, headers, timeout);
        case 'extract':
          if (!url) return this.createErrorResult('url is required for extract');
          return await this.extractContent(url, headers, timeout);
        case 'summarize':
          if (!url) return this.createErrorResult('url is required for summarize');
          return await this.summarizeUrl(url, headers, timeout);
        default:
          return this.createErrorResult(`Unknown action: ${action}`);
      }
    } catch (error) {
      return this.createErrorResult(`Web error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async searchWeb(query: string, engine: string, maxResults: number, timeout: number): Promise<ToolResult> {
    let searchUrl: string;
    let results: Array<{ title: string; url: string; snippet: string; source: string }> = [];

    switch (engine) {
      case 'duckduckgo':
        searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        results = await this.parseDuckDuckGo(searchUrl, timeout);
        break;
      case 'google':
        searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${maxResults}`;
        results = await this.parseGoogle(searchUrl, timeout);
        break;
      case 'bing':
        searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${maxResults}`;
        results = await this.parseBing(searchUrl, timeout);
        break;
      case 'brave':
        searchUrl = `https://search.brave.com/search?q=${encodeURIComponent(query)}&count=${maxResults}`;
        results = await this.parseBrave(searchUrl, timeout);
        break;
      default:
        return this.createErrorResult(`Unknown search engine: ${engine}`);
    }

    return this.createSuccessResult({
      query,
      engine,
      results: results.slice(0, maxResults),
      total: results.length
    });
  }

  private async parseDuckDuckGo(url: string, timeout: number): Promise<Array<{ title: string; url: string; snippet: string; source: string }>> {
    const response = await this.fetchWithTimeout(url, timeout);
    const html = await response.text();
    
    // Simple regex parsing for DuckDuckGo
    const results: Array<{ title: string; url: string; snippet: string; source: string }> = [];
    const linkRegex = /class="result__snippet">([^<]*)<\/a>.*?class="result__url">([^<]*)<\/a>.*?class="result__snippet">([^<]*)/gs;
    let match;
    
    while ((match = linkRegex.exec(html)) !== null && results.length < 20) {
      results.push({
        title: match[1].trim(),
        url: match[2].trim(),
        snippet: match[3].trim(),
        source: 'duckduckgo'
      });
    }

    // Fallback simpler parsing
    if (results.length === 0) {
      const simpleRegex = /<a class="result__snippet" href="([^"]*)">([^<]*)<\/a>/g;
      while ((match = simpleRegex.exec(html)) !== null && results.length < 20) {
        results.push({
          title: match[2].trim(),
          url: match[1].trim(),
          snippet: '',
          source: 'duckduckgo'
        });
      }
    }

    return results;
  }

  private async parseGoogle(url: string, timeout: number): Promise<Array<{ title: string; url: string; snippet: string; source: string }>> {
    const response = await this.fetchWithTimeout(url, timeout);
    const html = await response.text();
    
    const results: Array<{ title: string; url: string; snippet: string; source: string }> = [];
    // Google parsing is complex and changes frequently
    // This is a simplified version
    const linkRegex = /<h3 class="[^"]*">([^<]*)<\/h3>.*?<a href="\/url\?q=([^&"]*)/gs;
    let match;
    
    while ((match = linkRegex.exec(html)) !== null && results.length < 20) {
      results.push({
        title: match[1].trim(),
        url: decodeURIComponent(match[2]),
        snippet: '',
        source: 'google'
      });
    }

    return results;
  }

  private async parseBing(url: string, timeout: number): Promise<Array<{ title: string; url: string; snippet: string; source: string }>> {
    const response = await this.fetchWithTimeout(url, timeout);
    const html = await response.text();
    
    const results: Array<{ title: string; url: string; snippet: string; source: string }> = [];
    const linkRegex = /<h2><a href="([^"]*)"[^>]*>([^<]*)<\/a><\/h2>.*?<p class="b_caption">([^<]*)/gs;
    let match;
    
    while ((match = linkRegex.exec(html)) !== null && results.length < 20) {
      results.push({
        title: match[2].trim(),
        url: match[1].trim(),
        snippet: match[3].trim(),
        source: 'bing'
      });
    }

    return results;
  }

  private async parseBrave(url: string, timeout: number): Promise<Array<{ title: string; url: string; snippet: string; source: string }>> {
    const response = await this.fetchWithTimeout(url, timeout);
    const html = await response.text();
    
    const results: Array<{ title: string; url: string; snippet: string; source: string }> = [];
    const linkRegex = /<a class="snippet" href="([^"]*)"[^>]*><span[^>]*>([^<]*)<\/span>.*?<span[^>]*>([^<]*)<\/span>/gs;
    let match;
    
    while ((match = linkRegex.exec(html)) !== null && results.length < 20) {
      results.push({
        title: match[2].trim(),
        url: match[1].trim(),
        snippet: match[3].trim(),
        source: 'brave'
      });
    }

    return results;
  }

  private async fetchUrl(url: string, headers: Record<string, string>, timeout: number): Promise<ToolResult> {
    const response = await this.fetchWithTimeout(url, timeout, headers);
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    
    return this.createSuccessResult({
      url,
      status: response.status,
      statusText: response.statusText,
      contentType,
      contentLength: text.length,
      content: text.slice(0, 50000) // Limit to 50KB
    }, [{
      type: 'file',
      path: url.replace(/[^a-zA-Z0-9]/g, '_'),
      content: text,
      mimeType: contentType,
      size: text.length
    }]);
  }

  private async extractContent(url: string, headers: Record<string, string>, timeout: number): Promise<ToolResult> {
    const response = await this.fetchWithTimeout(url, timeout, headers);
    const contentType = response.headers.get('content-type') || '';
    const html = await response.text();
    
    // Extract main content using simple heuristics
    const extracted = this.extractMainContent(html);
    
    return this.createSuccessResult({
      url,
      title: this.extractTitle(html),
      content: extracted.text,
      links: extracted.links,
      images: extracted.images,
      wordCount: extracted.text.split(/\s+/).length
    });
  }

  private async summarizeUrl(url: string, headers: Record<string, string>, timeout: number): Promise<ToolResult> {
    const fetchResult = await this.extractContent(url, headers, timeout);
    if (!fetchResult.success) return fetchResult;
    
    const content = (fetchResult.output as any)?.content || '';
    const summary = this.generateSummary(content);
    
    return this.createSuccessResult({
      url,
      title: (fetchResult.output as any)?.title,
      summary,
      originalLength: content.length,
      summaryLength: summary.length
    });
  }

  private extractTitle(html: string): string {
    const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    return match ? match[1].trim() : '';
  }

  private extractMainContent(html: string): { text: string; links: string[]; images: string[] } {
    // Remove scripts, styles, and other non-content elements
    let cleanHtml = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');

    // Extract links
    const links: string[] = [];
    const linkRegex = /<a\s+[^>]*href=["']([^"']*)["'][^>]*>([^<]*)<\/a>/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null && links.length < 50) {
      links.push(`${match[2].trim()}: ${match[1]}`);
    }

    // Extract images
    const images: string[] = [];
    const imgRegex = /<img\s+[^>]*src=["']([^"']*)["'][^>]*>/gi;
    while ((match = imgRegex.exec(html)) !== null && images.length < 20) {
      images.push(match[1]);
    }

    // Get text content
    const text = cleanHtml
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return { text, links, images };
  }

  private generateSummary(text: string): string {
    // Simple extractive summary - first few sentences
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
    return sentences.slice(0, 3).join('. ').trim() + '.';
  }

  private async fetchWithTimeout(url: string, timeout: number, headers: Record<string, string> = {}): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          ...headers
        },
        signal: controller.signal,
        redirect: 'follow'
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  validateArgs(args: Record<string, unknown>): ValidationResult {
    if (!args.action || typeof args.action !== 'string') {
      return { valid: false, errors: ['action is required'], warnings: [] };
    }
    if (args.action === 'search' && (!args.query || typeof args.query !== 'string')) {
      return { valid: false, errors: ['query is required for search'], warnings: [] };
    }
    if (['fetch', 'extract', 'summarize'].includes(args.action as string) && (!args.url || typeof args.url !== 'string')) {
      return { valid: false, errors: ['url is required for fetch/extract/summarize'], warnings: [] };
    }
    return { valid: true, errors: [], warnings: [] };
  }
}