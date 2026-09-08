/**
 * CodeLES OpenAI Provider Adapter
 * Adapter para OpenAI API (GPT-4, GPT-3.5, etc.)
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

export class OpenAIAdapter extends BaseProviderAdapter {
  name = 'openai';
  type = 'openai' as const;

  private client: OpenAI | null = null;

  async initialize(config: ProviderConfig): Promise<void> {
    this.config = config;
    
    const validation = this.validateApiKey(config.apiKey);
    if (!validation.valid) {
      throw new Error(`OpenAI validation failed: ${validation.errors.join(', ')}`);
    }

    this.client = new OpenAI({
          apiKey: config.apiKey!,
          baseURL: config.baseUrl || 'https://api.openai.com/v1',
          organization: config.organization,
          defaultHeaders: config.headers
        });
  }

  async chat(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.client) throw new Error('OpenAI client not initialized');

    const startTime = Date.now();
    
    const messages = this.buildMessages(request.messages);
    const tools = this.buildTools(request.tools);

    const completion = await this.client.chat.completions.create({
      model: request.model,
      messages: messages as any,
      temperature: request.temperature ?? this.config?.retry?.baseDelayMs ? 0.7 : 0.7,
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
    if (!this.client) throw new Error('OpenAI client not initialized');

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
    if (!this.client) throw new Error('OpenAI client not initialized');

    try {
      const models = await this.client.models.list();
      return models.data
        .filter(m => m.id.startsWith('gpt-') || m.id.startsWith('o1'))
        .map(m => ({
          id: m.id,
          name: m.id,
          contextWindow: this.getContextWindow(m.id),
          maxOutputTokens: this.getMaxOutputTokens(m.id),
          supportsStreaming: true,
          supportsTools: this.supportsTools(m.id),
          supportsVision: this.supportsVision(m.id),
          supportsJsonMode: this.supportsJsonMode(m.id),
          capabilities: this.getCapabilities(m.id)
        }));
    } catch {
      // Return defaults on error
      return this.getDefaultModels();
    }
  }

  private getDefaultModels(): ModelConfig[] {
    return [
      { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, capabilities: ['chat', 'tools', 'vision', 'json_mode', 'streaming'] },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000, maxOutputTokens: 16384, supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, capabilities: ['chat', 'tools', 'vision', 'json_mode', 'streaming'] },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', contextWindow: 128000, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, capabilities: ['chat', 'tools', 'vision', 'json_mode', 'streaming'] },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', contextWindow: 16385, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: true, supportsVision: false, supportsJsonMode: true, capabilities: ['chat', 'tools', 'json_mode', 'streaming'] }
    ];
  }

  private getContextWindow(modelId: string): number {
    if (modelId.includes('gpt-4o') || modelId.includes('gpt-4-turbo') || modelId.includes('o1')) return 128000;
    if (modelId.includes('gpt-3.5')) return 16385;
    return 8192;
  }

  private getMaxOutputTokens(modelId: string): number {
    if (modelId.includes('gpt-4o-mini')) return 16384;
    if (modelId.includes('gpt-4o') || modelId.includes('gpt-4-turbo') || modelId.includes('o1')) return 4096;
    return 4096;
  }

  private supportsTools(modelId: string): boolean {
    return modelId.includes('gpt-4') || modelId.includes('gpt-3.5-turbo') || modelId.includes('o1');
  }

  private supportsVision(modelId: string): boolean {
    return modelId.includes('gpt-4o') || modelId.includes('gpt-4-turbo') || modelId.includes('gpt-4-vision');
  }

  private supportsJsonMode(modelId: string): boolean {
    return modelId.includes('gpt-4o') || modelId.includes('gpt-4-turbo') || modelId.includes('gpt-3.5-turbo-0125') || modelId.includes('o1');
  }

  private getCapabilities(modelId: string): ModelConfig['capabilities'] {
    const caps: ModelConfig['capabilities'] = ['chat', 'streaming'];
    if (this.supportsTools(modelId)) caps.push('tools');
    if (this.supportsVision(modelId)) caps.push('vision');
    if (this.supportsJsonMode(modelId)) caps.push('json_mode');
    return caps;
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

    if (config.models.length === 0) {
      warnings.push('No models configured, will use defaults');
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