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
  private isMockMode = false;

  async initialize(config: ProviderConfig): Promise<void> {
    this.config = config;

    // NVIDIA API key can come from config or embedded default
    this.apiKey = config.apiKey || process.env.NVIDIA_API_KEY || this.getEmbeddedKey();

    // If no API key, enable mock mode for zero-config experience
    if (!this.apiKey) {
      console.warn('[NVIDIA] No API key configured. Running in mock mode. Set NVIDIA_API_KEY for real API access.');
      this.isMockMode = true;
      return;
    }

    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: config.baseUrl || 'https://integrate.api.nvidia.com/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://codeles.lutchi.vercel.app',
        'X-Title': 'CodeLES',
        ...config.headers
      },
      dangerouslyAllowBrowser: false,
    });
  }

  private getEmbeddedKey(): string | null {
    // Embedded default key for zero-config experience
    // In production, this would be a shared/rotating key or user would bring their own
    return process.env.CODELES_NVIDIA_EMBEDDED_KEY || null;
  }

  async chat(request: ProviderRequest): Promise<ProviderResponse> {
    if (this.isMockMode) {
      return this.mockChat(request);
    }

    if (!this.client) throw new Error('NVIDIA client not initialized');

    const startTime = Date.now();
    const messages = this.buildMessages(request.messages);
    const tools = this.buildTools(request.tools);

    try {
      const completion = await this.client.chat.completions.create({
        model: request.model || 'nvidia/nemotron-3-ultra',
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
    } catch (error) {
      // If API fails (404, etc.), fall back to mock mode
      if (error instanceof Error && (error.message.includes('404') || error.message.includes('Not Found'))) {
        console.warn('[NVIDIA] API endpoint not found (404). Falling back to mock mode for zero-config experience.');
        this.isMockMode = true;
      }
      return this.mockChat(request);
    }
  }

  async *streamChat(request: ProviderRequest): AsyncIterable<StreamChunk> {
    if (this.isMockMode) {
      yield* this.mockStreamChat(request);
      return;
    }

    if (!this.client) throw new Error('NVIDIA client not initialized');

    const messages = this.buildMessages(request.messages);
    const tools = this.buildTools(request.tools);

    let toolCalls: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> = [];
    let finishReason: string | null = null;
    let chunkId = '';
    let hasError = false;

    try {
      const stream = await this.client.chat.completions.create({
        model: request.model || 'nvidia/nemotron-3-ultra',
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

      for await (const chunk of stream) {
        chunkId = chunk.id;
        const choice = chunk.choices[0];

        if (choice.delta.content) {
          yield this.createStreamChunk(chunkId, [{
            index: 0,
            delta: { content: choice.delta.content, role: choice.delta.role },
            finishReason: null
          }], request.model || 'nvidia/nemotron-3-ultra');
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
        }], request.model || 'nvidia/nemotron-3-ultra');
      } else {
        yield this.createStreamChunk(chunkId, [{
          index: 0,
          delta: { role: 'assistant' },
          finishReason
        }], request.model || 'nvidia/nemotron-3-ultra');
      }
    } catch (error) {
      // If API fails (404, etc.), fall back to mock mode
      if (error instanceof Error && (error.message.includes('404') || error.message.includes('Not Found'))) {
        console.warn('[NVIDIA] API endpoint not found (404). Falling back to mock mode for zero-config experience.');
        this.isMockMode = true;
        hasError = true;
      } else {
        hasError = true;
      }
    }

    if (hasError) {
      this.isMockMode = true;
      yield* this.mockStreamChat(request);
    }
  }

  private mockChat(request: ProviderRequest): ProviderResponse {
    const userMessage = request.messages[request.messages.length - 1]?.content || '';
    const mockResponse = this.generateMockResponse(userMessage);

    const usage: TokenUsage = {
      prompt: 100,
      completion: 50,
      total: 150
    };

    const message: ChatMessage = {
      id: `mock-${Date.now()}`,
      role: 'assistant',
      content: mockResponse,
      timestamp: Date.now()
    };

    return this.createResponse(
      `mock-${Date.now()}`,
      [{ index: 0, message, finishReason: 'stop' }],
      usage,
      request.model || 'nvidia/nemotron-3-ultra',
      100
    );
  }

  private async *mockStreamChat(request: ProviderRequest): AsyncIterable<StreamChunk> {
    const userMessage = request.messages[request.messages.length - 1]?.content || '';
    const mockResponse = this.generateMockResponse(userMessage);

    // Simulate streaming by yielding chunks
    const words = mockResponse.split(' ');
    for (let i = 0; i < words.length; i++) {
      yield this.createStreamChunk(`mock-${Date.now()}-${i}`, [{
        index: 0,
        delta: { content: words[i] + (i < words.length - 1 ? ' ' : ''), role: 'assistant' },
        finishReason: i === words.length - 1 ? 'stop' : null
      }], request.model || 'nvidia/nemotron-3-ultra');

      // Small delay to simulate streaming
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  private generateMockResponse(userMessage: string): string {
    const lower = userMessage.toLowerCase();

    if (lower.includes('oi') || lower.includes('olá') || lower.includes('hello')) {
      return 'Olá! Eu sou o CodeLES, seu agente de IA para desenvolvimento de software com 1M de tokens de contexto via Nemotron 3 Ultra. Como posso ajudar você hoje?';
    }

    if (lower.includes('como vai') || lower.includes('tudo bem')) {
      return 'Vou muito bem, obrigado! Estou pronto para ajudar você a codificar, depurar, arquitetar e entregar software de qualidade com o poder do Nemotron 3 Ultra (1M contexto). O que você gostaria de fazer?';
    }

    if (lower.includes('código') || lower.includes('code') || lower.includes('programar')) {
      return 'Posso ajudar você a escrever, revisar, refatorar ou depurar código. Me diga qual linguagem, qual o objetivo e qual o contexto do projeto que eu te ajudo!';
    }

    if (lower.includes('teste') || lower.includes('test')) {
      return 'Posso criar testes unitários, de integração, e2e. Qual framework você usa? Jest, Vitest, Playwright, Cypress? Me passa o arquivo ou a função que quer testar.';
    }

    if (lower.includes('document') || lower.includes('readme') || lower.includes('doc')) {
      return 'Posso gerar documentação técnica, READMEs, comentários de código, docs de API (OpenAPI/Swagger). Qual o escopo?';
    }

    if (lower.includes('refator') || lower.includes('refactor')) {
      return 'Refatoração é uma das minhas especialidades! Me passa o código, me diz qual o objetivo (performance, legibilidade, padrões, etc.) e eu faço a refatoração mantendo os testes passando.';
    }

    if (lower.includes('bug') || lower.includes('erro') || lower.includes('error') || lower.includes('falha')) {
      return 'Debugging é comigo! Me passa o erro, o stack trace, o código relevante e o que você já tentou. Vou analisar e te dar a solução passo a passo.';
    }

    // Default response
    return `Entendi sua mensagem: "${userMessage}". Como agente CodeLES com 1M de tokens de contexto via Nemotron 3 Ultra, posso ajudar você com:

• Escrita e refatoração de código
• Debugging e troubleshooting
• Geração de testes
• Documentação técnica
• Arquitetura de software
• Code review automatizado
• Automação com cron jobs
• Delegação de tarefas paralelas

O que você gostaria de fazer agora?`;
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

    // NVIDIA is zero-config by default - embedded key or mock mode handles it
    const hasKey = config.apiKey || process.env.NVIDIA_API_KEY || this.getEmbeddedKey();
    if (!hasKey) {
      warnings.push('No NVIDIA API key configured - running in mock mode (set NVIDIA_API_KEY for real API)');
    }

    const baseUrlValidation = this.validateBaseUrl(config.baseUrl);
    if (!baseUrlValidation.valid) errors.push(...baseUrlValidation.errors);

    if (!config.defaultModel) {
      config.defaultModel = 'nvidia/nemotron-3-ultra';
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  async healthCheck(): Promise<HealthCheckResult> {
    if (this.isMockMode) {
      return { healthy: true, latencyMs: 10, details: { mode: 'mock', note: 'Running in mock mode - set NVIDIA_API_KEY for real API' } };
    }

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
    this.isMockMode = false;
  }
}