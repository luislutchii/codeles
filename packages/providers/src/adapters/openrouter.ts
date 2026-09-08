/**
 * CodeLES OpenRouter Provider Adapter
 * Adapter para OpenRouter API (acesso a múltiplos modelos)
 */

import OpenAI from 'openai';
import {
  ProviderConfig,
  ProviderRequest,
  ProviderResponse,
  StreamChunk,
  ModelConfig,
  ValidationResult,
  HealthCheckResult,
  ChatMessage,
  ToolDefinition,
  TokenUsage
} from '@codeles/core';
import { BaseProviderAdapter } from './base.js';

export class OpenRouterAdapter extends BaseProviderAdapter {
  name = 'openrouter';
  type = 'openrouter' as const;

  private client: OpenAI | null = null;

  async initialize(config: ProviderConfig): Promise<void> {
    this.config = config;
    
    const validation = this.validateApiKey(config.apiKey);
    if (!validation.valid) {
      throw new Error(`OpenRouter validation failed: ${validation.errors.join(', ')}`);
    }

    this.client = new OpenAI({
          apiKey: config.apiKey!,
          baseURL: config.baseUrl || 'https://openrouter.ai/api/v1',
          defaultHeaders: {
            'HTTP-Referer': 'https://codeles.lutchi.vercel.app',
            'X-Title': 'CodeLES',
            ...config.headers
          }
        });
  }

  async chat(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.client) throw new Error('OpenRouter client not initialized');

    const startTime = Date.now();
    
    const messages = this.buildMessages(request.messages);
    const tools = this.buildTools(request.tools);

    const completion = await this.client.chat.completions.create({
      model: request.model,
      messages: messages as any,
      temperature: request.temperature,
      top_p: request.topP,
      max_tokens: request.maxTokens,
      stream: false,
      tools: tools as any,
      tool_choice: request.toolChoice as any,
      response_format: request.responseFormat as any,
      stop: request.stop,
      presence_penalty: request.presencePenalty,
      frequency_penalty: request.frequencyPenalty,
      user: request.user
    });

    const latencyMs = Date.now() - startTime;
    const usage = this.calculateUsage(
      completion.usage?.prompt_tokens || 0,
      completion.usage?.completion_tokens || 0
    );

    const choice = completion.choices[0];
    const message: ChatMessage = {
      id: completion.id,
      role: choice.message.role,
      content: choice.message.content || '',
      toolCalls: choice.message.tool_calls?.map(tc => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments
        }
      })),
      timestamp: Date.now()
    };

    return this.createResponse(
      completion.id,
      [{ index: 0, message, finishReason: choice.finish_reason || 'stop' }],
      usage,
      completion.model,
      latencyMs
    );
  }

  async *streamChat(request: ProviderRequest): AsyncIterable<StreamChunk> {
    if (!this.client) throw new Error('OpenRouter client not initialized');

    const messages = this.buildMessages(request.messages);
    const tools = this.buildTools(request.tools);

    const stream = await this.client.chat.completions.create({
      model: request.model,
      messages: messages as any,
      temperature: request.temperature,
      top_p: request.topP,
      max_tokens: request.maxTokens,
      stream: true,
      tools: tools as any,
      tool_choice: request.toolChoice as any,
      response_format: request.responseFormat as any,
      stop: request.stop,
      presence_penalty: request.presencePenalty,
      frequency_penalty: request.frequencyPenalty,
      user: request.user
    });

    let accumulatedContent = '';
    let toolCalls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> = [];
    let finishReason: string | null = null;
    let chunkId = '';

    for await (const chunk of stream) {
      chunkId = chunk.id;
      const choice = chunk.choices[0];
      
      if (choice.delta.content) {
        accumulatedContent += choice.delta.content;
      }

      if (choice.delta.tool_calls) {
        for (const tc of choice.delta.tool_calls) {
          if (tc.index !== undefined && tc.index >= toolCalls.length) {
            toolCalls.push({ id: tc.id || '', type: 'function', function: { name: '', arguments: '' } });
          }
          if (tc.function?.name) {
            toolCalls[tc.index!].function.name = tc.function.name;
          }
          if (tc.function?.arguments) {
            toolCalls[tc.index!].function.arguments += tc.function.arguments;
          }
        }
      }

      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
      }

      const delta: StreamChunk['choices'][0]['delta'] = {};
      if (choice.delta.role) delta.role = choice.delta.role;
      if (choice.delta.content) delta.content = choice.delta.content;
      if (toolCalls.length > 0) delta.toolCalls = [...toolCalls];

      yield this.createStreamChunk(chunkId, [{
        index: 0,
        delta,
        finishReason
      }], request.model);
    }
  }

  async listModels(): Promise<ModelConfig[]> {
    if (!this.client) throw new Error('OpenRouter client not initialized');

    try {
      // OpenRouter has a models endpoint
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${this.config?.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) throw new Error('Failed to fetch models');
      
      const data = await response.json() as { data: Array<{ id: string; name: string; context_length: number; pricing: { prompt: number; completion: number } }> };
      
      return data.data.map(m => ({
        id: m.id,
        name: m.name,
        contextWindow: m.context_length || 128000,
        maxOutputTokens: 4096,
        supportsStreaming: true,
        supportsTools: true,
        supportsVision: m.id.includes('vision') || m.id.includes('gpt-4o') || m.id.includes('gemini') || m.id.includes('claude-3'),
        supportsJsonMode: true,
        pricing: m.pricing ? {
          inputPer1k: m.pricing.prompt * 1000,
          outputPer1k: m.pricing.completion * 1000,
          currency: 'USD'
        } : undefined,
        capabilities: ['chat', 'tools', 'json_mode', 'streaming', ...(m.id.includes('vision') || m.id.includes('gpt-4o') || m.id.includes('gemini') || m.id.includes('claude-3') ? ['vision'] : [])]
      }));
    } catch {
      return this.getDefaultModels();
    }
  }

  private getDefaultModels(): ModelConfig[] {
    return [
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet (OpenRouter)', contextWindow: 200000, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, capabilities: ['chat', 'tools', 'vision', 'json_mode', 'streaming'] },
      { id: 'anthropic/claude-3.5-haiku', name: 'Claude 3.5 Haiku (OpenRouter)', contextWindow: 200000, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, capabilities: ['chat', 'tools', 'vision', 'json_mode', 'streaming'] },
      { id: 'openai/gpt-4o', name: 'GPT-4o (OpenRouter)', contextWindow: 128000, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, capabilities: ['chat', 'tools', 'vision', 'json_mode', 'streaming'] },
      { id: 'google/gemini-pro-1.5', name: 'Gemini 1.5 Pro (OpenRouter)', contextWindow: 1000000, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, capabilities: ['chat', 'tools', 'vision', 'json_mode', 'streaming'] },
      { id: 'meta-llama/llama-3.1-405b', name: 'Llama 3.1 405B (OpenRouter)', contextWindow: 128000, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: true, supportsVision: false, supportsJsonMode: true, capabilities: ['chat', 'tools', 'json_mode', 'streaming'] }
    ];
  }

  async validateConfig(config: ProviderConfig): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    const apiKeyValidation = this.validateApiKey(config.apiKey);
    if (!apiKeyValidation.valid) errors.push(...apiKeyValidation.errors);

    const baseUrlValidation = this.validateBaseUrl(config.baseUrl);
    if (!baseUrlValidation.valid) errors.push(...baseUrlValidation.errors);

    if (!config.defaultModel) {
      warnings.push('No default model specified');
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  async healthCheck(): Promise<HealthCheckResult> {
    if (!this.client) {
      return { healthy: false, error: 'Client not initialized' };
    }

    try {
      const startTime = Date.now();
      await this.client.models.list();
      const latencyMs = Date.now() - startTime;
      return { healthy: true, latencyMs };
    } catch (error) {
      return { healthy: false, error: error instanceof Error ? error.message : 'Health check failed' };
    }
  }

  async shutdown(): Promise<void> {
    this.client = null;
    this.config = null;
  }
}