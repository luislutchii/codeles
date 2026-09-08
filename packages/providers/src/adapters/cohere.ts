/**
 * CodeLES Cohere Provider Adapter - Simplified for current SDK
 */

import { CohereClient } from 'cohere-ai';
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

export class CohereAdapter extends BaseProviderAdapter {
  name = 'cohere';
  type = 'cohere' as const;

  private client: CohereClient | null = null;

  async initialize(config: ProviderConfig): Promise<void> {
    this.config = config;
    
    const validation = this.validateApiKey(config.apiKey);
    if (!validation.valid) {
      throw new Error(`Cohere validation failed: ${validation.errors.join(', ')}`);
    }

    this.client = new CohereClient({
      token: config.apiKey!,
      baseUrl: config.baseUrl || 'https://api.cohere.com'
    });
  }

  async chat(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.client) throw new Error('Cohere client not initialized');

    const startTime = Date.now();
    
    const { system, messages } = this.separateSystemPrompt(request.messages);

    const response = await this.client.chat({
      model: request.model,
      message: messages[messages.length - 1]?.content || '',
      chatHistory: messages.slice(0, -1).map(m => ({
        role: m.role === 'assistant' ? 'CHATBOT' : 'USER',
        message: m.content
      })),
      preamble: system,
      temperature: request.temperature,
      p: request.topP,
      maxTokens: request.maxTokens
    });

    const latencyMs = Date.now() - startTime;
    const usage = this.calculateUsage(
      response.meta?.tokens?.inputTokens || 0,
      response.meta?.tokens?.outputTokens || 0
    );

    let messageContent = response.text || '';

    const message: ChatMessage = {
      id: `cohere-${Date.now()}`,
      role: 'assistant',
      content: messageContent,
      timestamp: Date.now()
    };

    return this.createResponse(
      `cohere-${Date.now()}`,
      [{ index: 0, message, finishReason: 'COMPLETE' }],
      usage,
      request.model,
      latencyMs
    );
  }

  async *streamChat(request: ProviderRequest): AsyncIterable<StreamChunk> {
    if (!this.client) throw new Error('Cohere client not initialized');

    const { system, messages } = this.separateSystemPrompt(request.messages);

    const stream = await this.client.chatStream({
      model: request.model,
      message: messages[messages.length - 1]?.content || '',
      chatHistory: messages.slice(0, -1).map(m => ({
        role: m.role === 'assistant' ? 'CHATBOT' : 'USER',
        message: m.content
      })),
      preamble: system,
      temperature: request.temperature,
      p: request.topP,
      maxTokens: request.maxTokens
    });

    let accumulatedContent = '';
    let finishReason: string | null = null;
    const chunkId = `cohere-${Date.now()}`;

    for await (const chunk of stream) {
      if (chunk.eventType === 'text-generation') {
        accumulatedContent += chunk.text;
        yield this.createStreamChunk(chunkId, [{
          index: 0,
          delta: { content: chunk.text, role: 'assistant' },
          finishReason: null
        }], request.model);
      } else if (chunk.eventType === 'stream-end') {
        finishReason = chunk.finishReason || 'COMPLETE';
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
      { id: 'command-r-plus', name: 'Command R+', contextWindow: 128000, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: true, supportsVision: false, supportsJsonMode: true, capabilities: ['chat', 'tools', 'json_mode', 'streaming'] },
      { id: 'command-r', name: 'Command R', contextWindow: 128000, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: true, supportsVision: false, supportsJsonMode: true, capabilities: ['chat', 'tools', 'json_mode', 'streaming'] },
      { id: 'command', name: 'Command', contextWindow: 4096, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: false, supportsVision: false, supportsJsonMode: false, capabilities: ['chat', 'streaming'] }
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
      await this.client.chat({
        model: 'command-r',
        message: 'Hi',
        maxTokens: 1
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