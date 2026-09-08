/**
 * CodeLES Provider Registry
 * Registro centralizado de providers de IA
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
  ProviderType
} from '@codeles/core';
import { OpenAIAdapter } from '../adapters/openai.js';
import { AnthropicAdapter } from '../adapters/anthropic.js';
import { OpenRouterAdapter } from '../adapters/openrouter.js';
import { GoogleAdapter } from '../adapters/google.js';
import { CohereAdapter } from '../adapters/cohere.js';
import { MistralAdapter } from '../adapters/mistral.js';
import { GroqAdapter } from '../adapters/groq.js';
import { TogetherAdapter } from '../adapters/together.js';
import { CustomAdapter } from '../adapters/custom.js';
import { NVIDIAAdapter } from '../adapters/nvidia.js';

export class ProviderRegistry {
  private adapters: Map<string, ProviderAdapter> = new Map();
  private defaultModels: Map<ProviderType, ModelConfig[]> = new Map();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    // Register built-in adapters
    this.registerAdapter('openai', new OpenAIAdapter());
    this.registerAdapter('anthropic', new AnthropicAdapter());
    this.registerAdapter('openrouter', new OpenRouterAdapter());
    this.registerAdapter('google', new GoogleAdapter());
    this.registerAdapter('cohere', new CohereAdapter());
    this.registerAdapter('mistral', new MistralAdapter());
    this.registerAdapter('groq', new GroqAdapter());
    this.registerAdapter('together', new TogetherAdapter());
    this.registerAdapter('custom', new CustomAdapter());
    // NVIDIA Nemotron 3 Ultra - Default provider with 1M context
    this.registerAdapter('nvidia', new NVIDIAAdapter());

    // Default model configs for each provider type
    this.defaultModels.set('openai', [
      { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, capabilities: ['chat', 'tools', 'vision', 'json_mode', 'streaming'] },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000, maxOutputTokens: 16384, supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, capabilities: ['chat', 'tools', 'vision', 'json_mode', 'streaming'] },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', contextWindow: 128000, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, capabilities: ['chat', 'tools', 'vision', 'json_mode', 'streaming'] },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', contextWindow: 16385, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: true, supportsVision: false, supportsJsonMode: true, capabilities: ['chat', 'tools', 'json_mode', 'streaming'] }
    ]);

    this.defaultModels.set('anthropic', [
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', contextWindow: 200000, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, capabilities: ['chat', 'tools', 'vision', 'json_mode', 'streaming'] },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', contextWindow: 200000, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, capabilities: ['chat', 'tools', 'vision', 'json_mode', 'streaming'] },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', contextWindow: 200000, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, capabilities: ['chat', 'tools', 'vision', 'json_mode', 'streaming'] },
      { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', contextWindow: 200000, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, capabilities: ['chat', 'tools', 'vision', 'json_mode', 'streaming'] },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', contextWindow: 200000, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, capabilities: ['chat', 'tools', 'vision', 'json_mode', 'streaming'] }
    ]);

    this.defaultModels.set('openrouter', [
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet (OpenRouter)', contextWindow: 200000, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, capabilities: ['chat', 'tools', 'vision', 'json_mode', 'streaming'] },
      { id: 'anthropic/claude-3.5-haiku', name: 'Claude 3.5 Haiku (OpenRouter)', contextWindow: 200000, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, capabilities: ['chat', 'tools', 'vision', 'json_mode', 'streaming'] },
      { id: 'openai/gpt-4o', name: 'GPT-4o (OpenRouter)', contextWindow: 128000, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, capabilities: ['chat', 'tools', 'vision', 'json_mode', 'streaming'] },
      { id: 'google/gemini-pro-1.5', name: 'Gemini 1.5 Pro (OpenRouter)', contextWindow: 1000000, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, capabilities: ['chat', 'tools', 'vision', 'json_mode', 'streaming'] },
      { id: 'meta-llama/llama-3.1-405b', name: 'Llama 3.1 405B (OpenRouter)', contextWindow: 128000, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: true, supportsVision: false, supportsJsonMode: true, capabilities: ['chat', 'tools', 'json_mode', 'streaming'] }
    ]);

    this.defaultModels.set('google', [
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', contextWindow: 1000000, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, capabilities: ['chat', 'tools', 'vision', 'json_mode', 'streaming'] },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', contextWindow: 1000000, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsVision: true, supportsJsonMode: true, capabilities: ['chat', 'tools', 'vision', 'json_mode', 'streaming'] },
      { id: 'gemini-1.0-pro', name: 'Gemini 1.0 Pro', contextWindow: 32768, maxOutputTokens: 2048, supportsStreaming: true, supportsTools: true, supportsVision: false, supportsJsonMode: true, capabilities: ['chat', 'tools', 'json_mode', 'streaming'] }
    ]);

    this.defaultModels.set('cohere', [
      { id: 'command-r-plus', name: 'Command R+', contextWindow: 128000, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: true, supportsVision: false, supportsJsonMode: true, capabilities: ['chat', 'tools', 'json_mode', 'streaming'] },
      { id: 'command-r', name: 'Command R', contextWindow: 128000, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: true, supportsVision: false, supportsJsonMode: true, capabilities: ['chat', 'tools', 'json_mode', 'streaming'] }
    ]);

    this.defaultModels.set('mistral', [
      { id: 'mistral-large-latest', name: 'Mistral Large', contextWindow: 128000, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: true, supportsVision: false, supportsJsonMode: true, capabilities: ['chat', 'tools', 'json_mode', 'streaming'] },
      { id: 'mistral-medium-latest', name: 'Mistral Medium', contextWindow: 32768, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: true, supportsVision: false, supportsJsonMode: true, capabilities: ['chat', 'tools', 'json_mode', 'streaming'] }
    ]);

    this.defaultModels.set('groq', [
      { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B', contextWindow: 131072, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsVision: false, supportsJsonMode: true, capabilities: ['chat', 'tools', 'json_mode', 'streaming'] },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', contextWindow: 131072, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsVision: false, supportsJsonMode: true, capabilities: ['chat', 'tools', 'json_mode', 'streaming'] },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', contextWindow: 32768, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsVision: false, supportsJsonMode: true, capabilities: ['chat', 'tools', 'json_mode', 'streaming'] }
    ]);

    this.defaultModels.set('together', [
      { id: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo', name: 'Llama 3.1 405B', contextWindow: 128000, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: true, supportsVision: false, supportsJsonMode: true, capabilities: ['chat', 'tools', 'json_mode', 'streaming'] },
      { id: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', name: 'Llama 3.1 70B', contextWindow: 128000, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: true, supportsVision: false, supportsJsonMode: true, capabilities: ['chat', 'tools', 'json_mode', 'streaming'] }
    ]);

    // NVIDIA Nemotron 3 Ultra - 1M context default
    this.defaultModels.set('nvidia', [
      { id: 'nvidia/nemotron-3-ultra', name: 'Nemotron 3 Ultra (CodeLES Default)', contextWindow: 1000000, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsVision: false, supportsJsonMode: true, capabilities: ['chat', 'tools', 'json_mode', 'streaming'] },
      { id: 'nvidia/nemotron-3-ultra-1m', name: 'Nemotron 3 Ultra 1M Context', contextWindow: 1000000, maxOutputTokens: 8192, supportsStreaming: true, supportsTools: true, supportsVision: false, supportsJsonMode: true, capabilities: ['chat', 'tools', 'json_mode', 'streaming'] },
      { id: 'nvidia/llama-3.1-nemotron-70b-instruct', name: 'Llama 3.1 Nemotron 70B', contextWindow: 128000, maxOutputTokens: 4096, supportsStreaming: true, supportsTools: true, supportsVision: false, supportsJsonMode: true, capabilities: ['chat', 'tools', 'json_mode', 'streaming'] }
    ]);
  }

  registerAdapter(name: string, adapter: ProviderAdapter): void {
    this.adapters.set(name.toLowerCase(), adapter);
  }

  unregisterAdapter(name: string): void {
    this.adapters.delete(name.toLowerCase());
  }

  getAdapter(name: string): ProviderAdapter | undefined {
    return this.adapters.get(name.toLowerCase());
  }

  listAdapters(): string[] {
    return Array.from(this.adapters.keys());
  }

  async initializeAdapter(name: string, config: ProviderConfig): Promise<ProviderAdapter> {
    const adapter = this.getAdapter(name);
    if (!adapter) {
      throw new Error(`Provider adapter not found: ${name}`);
    }
    await adapter.initialize(config);
    return adapter;
  }

  getDefaultModels(providerType: ProviderType): ModelConfig[] {
    return this.defaultModels.get(providerType) || [];
  }

  setDefaultModels(providerType: ProviderType, models: ModelConfig[]): void {
    this.defaultModels.set(providerType, models);
  }

  async validateProviderConfig(config: ProviderConfig): Promise<ValidationResult> {
    const adapter = this.getAdapter(config.type);
    if (!adapter) {
      return {
        valid: false,
        errors: [`Unknown provider type: ${config.type}`],
        warnings: []
      };
    }
    return adapter.validateConfig(config);
  }

  async healthCheck(name: string): Promise<HealthCheckResult> {
    const adapter = this.getAdapter(name);
    if (!adapter) {
      return {
        healthy: false,
        error: `Provider adapter not found: ${name}`
      };
    }
    return adapter.healthCheck();
  }

  async listAllModels(): Promise<Map<string, ModelConfig[]>> {
    const result = new Map<string, ModelConfig[]>();
    
    for (const [name, adapter] of this.adapters) {
      try {
        const models = await adapter.listModels();
        result.set(name, models);
      } catch (error) {
        result.set(name, this.getDefaultModels(name as ProviderType));
      }
    }

    return result;
  }

  getAdapterNamesByType(type: ProviderType): string[] {
    const names: string[] = [];
    for (const [name, adapter] of this.adapters) {
      // We can't easily get the type without initializing, so we use the name
      if (name === type || (type === 'custom' && name === 'custom')) {
        names.push(name);
      }
    }
    return names;
  }
}

// Singleton instance
export const providerRegistry = new ProviderRegistry();