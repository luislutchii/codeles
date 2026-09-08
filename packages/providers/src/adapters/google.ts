/**
 * CodeLES Google (Gemini) Provider Adapter - Simplified for current SDK
 */

import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
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

export class GoogleAdapter extends BaseProviderAdapter {
  name = 'google';
  type = 'google' as const;

  private client: GoogleGenerativeAI | null = null;

  async initialize(config: ProviderConfig): Promise<void> {
    this.config = config;
    
    const validation = this.validateApiKey(config.apiKey);
    if (!validation.valid) {
      throw new Error(`Google validation failed: ${validation.errors.join(', ')}`);
    }

    this.client = new GoogleGenerativeAI(config.apiKey!);
  }

  async chat(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.client) throw new Error('Google client not initialized');

    const startTime = Date.now();
    
    const model = this.client.getGenerativeModel({ 
      model: request.model,
      generationConfig: {
        temperature: request.temperature,
        topP: request.topP,
        maxOutputTokens: request.maxTokens,
        stopSequences: request.stop,
        responseMimeType: request.responseFormat?.type === 'json_object' ? 'application/json' : 'text/plain'
      }
    });

    const { system, messages } = this.separateSystemPrompt(request.messages);
    const chat = model.startChat({
      history: messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      })),
      systemInstruction: system || undefined
    });

    const result = await chat.sendMessage(request.messages[request.messages.length - 1]?.content || '');
    const response = result.response;
    
    const latencyMs = Date.now() - startTime;
    const usage = this.calculateUsage(
      response.usageMetadata?.promptTokenCount || 0,
      response.usageMetadata?.candidatesTokenCount || 0
    );

    const content = response.text();
    const message: ChatMessage = {
      id: `google-${Date.now()}`,
      role: 'assistant',
      content,
      timestamp: Date.now()
    };

    return this.createResponse(
      `google-${Date.now()}`,
      [{ index: 0, message, finishReason: response.candidates?.[0]?.finishReason || 'STOP' }],
      usage,
      request.model,
      latencyMs
    );
  }

  async *streamChat(request: ProviderRequest): AsyncIterable<StreamChunk> {
    if (!this.client) throw new Error('Google client not initialized');

    const model = this.client.getGenerativeModel({ 
      model: request.model,
      generationConfig: {
        temperature: request.temperature,
        topP: request.topP,
        maxOutputTokens: request.maxTokens,
        stopSequences: request.stop
      }
    });

    const { system, messages } = this.separateSystemPrompt(request.messages);
    const chat = model.startChat({
      history: messages.slice(0, -1).map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      })),
      systemInstruction: system || undefined
    });

    const lastMessage = messages[messages.length - 1]?.content || '';
    const stream = await chat.sendMessageStream(lastMessage);

    let accumulatedContent = '';
    let finishReason: string | null = null;
    const chunkId = `google-${Date.now()}`;

    for await (const chunk of stream.stream) {
      const text = chunk.text();
      if (text) {
        accumulatedContent += text;
      }

      if (chunk.candidates?.[0]?.finishReason) {
        finishReason = chunk.candidates[0].finishReason;
      }

      yield this.createStreamChunk(chunkId, [{
        index: 0,
        delta: { content: text, role: 'assistant' },
        finishReason
      }], request.model);
    }
  }

  private separateSystemPrompt(messages: ChatMessage[]): { system: string; messages: ChatMessage[] } {
    const systemMessages = messages.filter(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');
    const system = systemMessages.map(m => m.content).join('\n\n');
    return { system, messages: otherMessages };
  }

  async listModels(): Promise<ModelConfig[]> {
    return [
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', contextWindow: 1000000, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, capabilities: ['chat', 'tools', 'vision', 'json_mode', 'streaming'] },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', contextWindow: 1000000, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, capabilities: ['chat', 'tools', 'vision', 'json_mode', 'streaming'] },
      { id: 'gemini-1.0-pro', name: 'Gemini 1.0 Pro', contextWindow: 32768, maxOutputTokens: 2048, supportsStreaming: true, supportsTools: true, supportsVision: false, supportsJsonMode: true, capabilities: ['chat', 'tools', 'json_mode', 'streaming'] }
    ];
  }

  async validateConfig(config: ProviderConfig): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    const apiKeyValidation = this.validateApiKey(config.apiKey);
    if (!apiKeyValidation.valid) errors.push(...apiKeyValidation.errors);

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
      const model = this.client.getGenerativeModel({ model: 'gemini-1.0-pro' });
      await model.generateContent('Hi');
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