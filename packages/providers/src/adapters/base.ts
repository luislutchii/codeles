/**
 * CodeLES Base Provider Adapter
 * Classe base para todos os adapters de providers
 */

import {
  ProviderAdapter,
  ProviderConfig,
  ProviderRequest,
  ProviderResponse,
  StreamChunk,
  ModelConfig,
  ValidationResult,
  HealthCheckResult,
  ChatMessage,
  ToolDefinition,
  TokenUsage,
  ProviderType
} from '@codeles/core';

export abstract class BaseProviderAdapter implements ProviderAdapter {
  abstract name: string;
  abstract type: ProviderType;

  protected config: ProviderConfig | null = null;

  abstract initialize(config: ProviderConfig): Promise<void>;
  abstract chat(request: ProviderRequest): Promise<ProviderResponse>;
  abstract streamChat(request: ProviderRequest): AsyncIterable<StreamChunk>;
  abstract listModels(): Promise<ModelConfig[]>;
  abstract validateConfig(config: ProviderConfig): Promise<ValidationResult>;
  abstract healthCheck(): Promise<HealthCheckResult>;
  abstract shutdown(): Promise<void>;

  protected buildMessages(messages: ChatMessage[]): Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }> {
    return messages.map(msg => {
      if (msg.role === 'tool') {
        return {
          role: 'tool',
          content: msg.content,
          tool_call_id: msg.toolCallId
        };
      }
      
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        return {
          role: 'assistant',
          content: msg.content || '',
          tool_calls: msg.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments
            }
          }))
        };
      }

      return {
        role: msg.role,
        content: msg.content
      };
    });
  }

  protected buildTools(tools?: ToolDefinition[]): ToolDefinition[] | undefined {
    if (!tools || tools.length === 0) return undefined;
    return tools;
  }

  protected calculateUsage(promptTokens: number, completionTokens: number): TokenUsage {
    return {
      prompt: promptTokens,
      completion: completionTokens,
      total: promptTokens + completionTokens
    };
  }

  protected createResponse(
    id: string,
    choices: Array<{ index: number; message: ChatMessage; finishReason: string }>,
    usage: TokenUsage,
    model: string,
    latencyMs: number
  ): ProviderResponse {
    return {
      id,
      choices: choices.map(c => ({
        index: c.index,
        message: c.message,
        finishReason: c.finishReason
      })),
      usage,
      model,
      provider: this.name,
      latencyMs
    };
  }

  protected createStreamChunk(
    id: string,
    choices: Array<{ index: number; delta: { role?: string; content?: string; toolCalls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> }; finishReason: string | null }>,
    model: string
  ): StreamChunk {
    return {
      id,
      choices: choices.map(c => ({
        index: c.index,
        delta: {
          role: c.delta.role as any,
          content: c.delta.content,
          toolCalls: c.delta.toolCalls
        },
        finishReason: c.finishReason
      })),
      model,
      provider: this.name
    };
  }

  protected validateApiKey(apiKey?: string): ValidationResult {
    if (!apiKey || apiKey.trim() === '') {
      return {
        valid: false,
        errors: ['API key is required'],
        warnings: []
      };
    }
    return { valid: true, errors: [], warnings: [] };
  }

  protected validateBaseUrl(baseUrl?: string): ValidationResult {
    if (baseUrl) {
      try {
        new URL(baseUrl);
        return { valid: true, errors: [], warnings: [] };
      } catch {
        return {
          valid: false,
          errors: ['Invalid base URL'],
          warnings: []
        };
      }
    }
    return { valid: true, errors: [], warnings: [] };
  }

  protected async makeRequest<T>(
    url: string,
    options: RequestInit,
    retryConfig?: { maxAttempts: number; baseDelayMs: number; maxDelayMs: number; exponentialBase: number; retryableStatusCodes: number[] }
  ): Promise<T> {
    const config = retryConfig || {
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      exponentialBase: 2,
      retryableStatusCodes: [408, 429, 500, 502, 503, 504]
    };

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        const response = await fetch(url, options);
        
        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          const error = new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
          
          if (config.retryableStatusCodes.includes(response.status) && attempt < config.maxAttempts) {
            lastError = error;
            const delay = Math.min(
              config.baseDelayMs * Math.pow(config.exponentialBase, attempt - 1),
              config.maxDelayMs
            );
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          
          throw error;
        }

        return await response.json() as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < config.maxAttempts) {
          const delay = Math.min(
            config.baseDelayMs * Math.pow(config.exponentialBase, attempt - 1),
            config.maxDelayMs
          );
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  protected async makeStreamRequest(
    url: string,
    options: RequestInit,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') return;
          onChunk(data);
        }
      }
    }
  }
}