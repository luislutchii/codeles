/**
 * CodeLES Mistral Provider Adapter
 * Adapter para Mistral API
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

export class MistralAdapter extends BaseProviderAdapter {
  name = 'mistral';
  type = 'mistral' as const;

  private client: OpenAI | null = null;

  async initialize(config: ProviderConfig): Promise<void> {
    this.config = config;
    
    const validation = this.validateApiKey(config.apiKey);
    if (!validation.valid) {
      throw new Error(`Mistral validation failed: ${validation.errors.join(', ')}`);
    }

    this.client = new OpenAI({
      apiKey: config.apiKey!,
      baseURL: config.baseUrl || 'https://api.mistral.ai/v1',
      defaultHeaders: config.headers,
      
    });
  }

  async chat(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.client) throw new Error('Mistral client not initialized');

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
      frequency_penalty: request.frequencyPenalty
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
    if (!this.client) throw new Error('Mistral client not initialized');

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
      frequency_penalty: request.frequencyPenalty
    });

    let toolCalls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> = [];
    let finishReason: string | null = null;
    let chunkId = '';

    for await (const chunk of stream) {
      chunkId = chunk.id;
      const choice = chunk.choices[0];
      
      if (choice.delta.content) {
        yield this.createStreamChunk(chunkId, [{
          index: 0,
          delta: { content: choice.delta.content, role: choice.delta.role },
          finishReason: null
        }], request.model);
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
    }

    if (toolCalls.length > 0) {
      yield this.createStreamChunk(chunkId, [{
        index: 0,
        delta: { toolCalls, role: 'assistant' },
        finishReason
      }], request.model);
    } else {
      yield this.createStreamChunk(chunkId, [{
        index: 0,
        delta: { role: 'assistant' },
        finishReason
      }], request.model);
    }
  }

  async listModels(): Promise<ModelConfig[]> {
    return [
      { id: 'mistral-large-latest', name: 'Mistral Large', contextWindow: 128000, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: true, supportsVision: false, supportsJsonMode: true, capabilities: ['chat', 'tools', 'json_mode', 'streaming'] },
      { id: 'mistral-medium-latest', name: 'Mistral Medium', contextWindow: 32768, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: true, supportsVision: false, supportsJsonMode: true, capabilities: ['chat', 'tools', 'json_mode', 'streaming'] },
      { id: 'mistral-small-latest', name: 'Mistral Small', contextWindow: 32768, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: true, supportsVision: false, supportsJsonMode: true, capabilities: ['chat', 'tools', 'json_mode', 'streaming'] },
      { id: 'open-mistral-7b', name: 'Mistral 7B', contextWindow: 32768, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: false, supportsVision: false, supportsJsonMode: false, capabilities: ['chat', 'streaming'] }
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