/**
 * CodeLES Anthropic Provider Adapter - Simplified for current SDK
 */

import Anthropic from '@anthropic-ai/sdk';
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

export class AnthropicAdapter extends BaseProviderAdapter {
  name = 'anthropic';
  type = 'anthropic' as const;

  private client: Anthropic | null = null;

  async initialize(config: ProviderConfig): Promise<void> {
    this.config = config;
    
    const validation = this.validateApiKey(config.apiKey);
    if (!validation.valid) {
      throw new Error(`Anthropic validation failed: ${validation.errors.join(', ')}`);
    }

    this.client = new Anthropic({
      apiKey: config.apiKey!,
      baseURL: config.baseUrl || 'https://api.anthropic.com',
      defaultHeaders: config.headers
    });
  }

  async chat(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.client) throw new Error('Anthropic client not initialized');

    const startTime = Date.now();
    
    const { system, messages } = this.separateSystemPrompt(request.messages);

    const completion = await this.client.messages.create({
      model: request.model,
      system,
      messages: messages as any,
      temperature: request.temperature,
      top_p: request.topP,
      max_tokens: request.maxTokens || 4096,
      stream: false
    });

    const latencyMs = Date.now() - startTime;
    const usage = this.calculateUsage(
      completion.usage?.input_tokens || 0,
      completion.usage?.output_tokens || 0
    );

    const content = completion.content[0];
    let messageContent = '';
    
    if (content.type === 'text') {
      messageContent = content.text;
    }

    const message: ChatMessage = {
      id: completion.id,
      role: 'assistant',
      content: messageContent,
      timestamp: Date.now()
    };

    return this.createResponse(
      completion.id,
      [{ index: 0, message, finishReason: completion.stop_reason || 'end_turn' }],
      usage,
      completion.model,
      latencyMs
    );
  }

  async *streamChat(request: ProviderRequest): AsyncIterable<StreamChunk> {
    if (!this.client) throw new Error('Anthropic client not initialized');

    const { system, messages } = this.separateSystemPrompt(request.messages);

    const stream = await this.client.messages.create({
      model: request.model,
      system,
      messages: messages as any,
      temperature: request.temperature,
      top_p: request.topP,
      max_tokens: request.maxTokens || 4096,
      stream: true
    });

    let accumulatedContent = '';
    let finishReason: string | null = null;
    const chunkId = `anthropic-${Date.now()}`;

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        accumulatedContent += chunk.delta.text;
        yield this.createStreamChunk(chunkId, [{
          index: 0,
          delta: { content: chunk.delta.text, role: 'assistant' },
          finishReason: null
        }], request.model);
      } else if (chunk.type === 'message_delta') {
        finishReason = chunk.delta.stop_reason;
      }
    }

    yield this.createStreamChunk(chunkId, [{
      index: 0,
      delta: { role: 'assistant' },
      finishReason
    }], request.model);
  }

  private separateSystemPrompt(messages: ChatMessage[]): { system: string; messages: ChatMessage[] } {
    const systemMessages = messages.filter(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');
    const system = systemMessages.map(m => m.content).join('\n\n');
    return { system, messages: otherMessages };
  }

  async listModels(): Promise<ModelConfig[]> {
    return [
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', contextWindow: 200000, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, capabilities: ['chat', 'tools', 'vision', 'json_mode', 'streaming'] },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', contextWindow: 200000, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, capabilities: ['chat', 'tools', 'vision', 'json_mode', 'streaming'] },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', contextWindow: 200000, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, capabilities: ['chat', 'tools', 'vision', 'json_mode', 'streaming'] },
      { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', contextWindow: 200000, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, capabilities: ['chat', 'tools', 'vision', 'json_mode', 'streaming'] },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', contextWindow: 200000, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, capabilities: ['chat', 'tools', 'vision', 'json_mode', 'streaming'] }
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
      await this.client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'Hi' }]
      });
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