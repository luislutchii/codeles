/**
 * CodeLES NVIDIA Nemotron Provider Adapter
 * Provider padrão integrado com 1M de contexto (Nemotron 3 Ultra)
 * Baseado na API da NVIDIA - transparente para o usuário
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

export class NVIDIAAdapter extends BaseProviderAdapter {
  name = 'nvidia';
  type = 'nvidia' as const;

  private client: OpenAI | null = null;
  private apiKey: string | null = null;

  async initialize(config: ProviderConfig): Promise<void> {
    this.config = config;
    
    // NVIDIA API key can come from config or embedded default
    this.apiKey = config.apiKey || process.env.NVIDIA_API_KEY || this.getEmbeddedKey();
    
    if (!this.apiKey) {
      throw new Error('NVIDIA API key not configured');
    }

    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: config.baseUrl || 'https://integrate.api.nvidia.com/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://codeles.lutchi.vercel.app',
        'X-Title': 'CodeLES',
        ...config.headers
      },
      
    });
  }

  private getEmbeddedKey(): string | null {
    // Embedded default key for zero-config experience
    // In production, this would be a shared/rotating key or user would bring their own
    return process.env.CODELES_NVIDIA_EMBEDDED_KEY || null;
  }

  async chat(request: ProviderRequest): Promise<ProviderResponse> {
    if (!this.client) throw new Error('NVIDIA client not initialized');

    const startTime = Date.now();
    
    const messages = this.buildMessages(request.messages);
    const tools = this.buildTools(request.tools);

    const completion = await this.client.chat.completions.create({
      model: request.model,
      messages: messages as any,
      temperature: request.temperature ?? 0.7,
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
    if (!this.client) throw new Error('NVIDIA client not initialized');

    const messages = this.buildMessages(request.messages);
    const tools = this.buildTools(request.tools);

    const stream = await this.client.chat.completions.create({
      model: request.model,
      messages: messages as any,
      temperature: request.temperature ?? 0.7,
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
      { 
        id: 'nvidia/nemotron-3-ultra', 
        name: 'Nemotron 3 Ultra (CodeLES Default)', 
        contextWindow: 1000000, // 1M context!
        maxOutputTokens: 8192, 
        supportsStreaming: true, 
        supportsTools: true, 
        supportsVision: false, 
        supportsJsonMode: true, 
        capabilities: ['chat', 'tools', 'json_mode', 'streaming'] 
      },
      { 
        id: 'nvidia/nemotron-3-ultra-1m', 
        name: 'Nemotron 3 Ultra 1M Context', 
        contextWindow: 1000000, 
        maxOutputTokens: 8192, 
        supportsStreaming: true, 
        supportsTools: true, 
        supportsVision: false, 
        supportsJsonMode: true, 
        capabilities: ['chat', 'tools', 'json_mode', 'streaming'] 
      },
      { 
        id: 'nvidia/llama-3.1-nemotron-70b-instruct', 
        name: 'Llama 3.1 Nemotron 70B', 
        contextWindow: 128000, 
        maxOutputTokens: 4096, 
        supportsStreaming: true, 
        supportsTools: true, 
        supportsVision: false, 
        supportsJsonMode: true, 
        capabilities: ['chat', 'tools', 'json_mode', 'streaming'] 
      }
    ];
  }

  async validateConfig(config: ProviderConfig): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // NVIDIA is zero-config by default - embedded key handles it
    const hasKey = config.apiKey || process.env.NVIDIA_API_KEY || this.getEmbeddedKey();
    if (!hasKey) {
      warnings.push('No NVIDIA API key configured - using embedded default (rate limited)');
    }

    const baseUrlValidation = this.validateBaseUrl(config.baseUrl);
    if (!baseUrlValidation.valid) errors.push(...baseUrlValidation.errors);

    if (!config.defaultModel) {
      config.defaultModel = 'nvidia/nemotron-3-ultra';
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
      return { healthy: true, latencyMs, details: { contextWindow: '1M tokens' } };
    } catch (error) {
      return { healthy: false, error: error instanceof Error ? error.message : 'Health check failed' };
    }
  }

  async shutdown(): Promise<void> {
    this.client = null;
    this.config = null;
    this.apiKey = null;
  }
}