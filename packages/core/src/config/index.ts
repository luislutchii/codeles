/**
 * CodeLES Configuration Manager
 * Gerencia configuração do agente (YAML + env + defaults)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { z } from 'zod';
import { config as dotenvConfig } from 'dotenv';
import {
  CodeLESConfig,
  DEFAULT_CONFIG,
  ProviderConfig,
  ToolConfig,
  SkillConfig,
  ValidationResult
} from '../types/index.js';

// Load .env file if exists
dotenvConfig({ path: path.resolve(process.cwd(), '.env') });
dotenvConfig({ path: path.resolve(os.homedir(), '.codeles', '.env') });

const ConfigSchema = z.object({
  version: z.string(),
  profile: z.string(),
  agent: z.object({
    name: z.string(),
    version: z.string(),
    identity: z.object({
      name: z.string(),
      role: z.string(),
      personality: z.array(z.string()),
      mission: z.string(),
      represents: z.string(),
      founder: z.string(),
      website: z.string().url()
    }),
    defaultProvider: z.string(),
    defaultModel: z.string(),
    systemPrompt: z.string(),
    maxTokens: z.number().positive(),
    temperature: z.number().min(0).max(2),
    topP: z.number().min(0).max(1),
    presencePenalty: z.number().min(-2).max(2),
    frequencyPenalty: z.number().min(-2).max(2)
  }),
  providers: z.record(z.object({
    name: z.string(),
    type: z.enum(['openai', 'anthropic', 'openrouter', 'google', 'cohere', 'mistral', 'groq', 'together', 'custom', 'nvidia']),
    enabled: z.boolean(),
    priority: z.number(),
    apiKey: z.string().optional(),
    baseUrl: z.string().url().optional(),
    organization: z.string().optional(),
    models: z.array(z.object({
      id: z.string(),
      name: z.string(),
      contextWindow: z.number().positive(),
      maxOutputTokens: z.number().positive(),
      supportsStreaming: z.boolean(),
      supportsTools: z.boolean(),
      supportsVision: z.boolean(),
      supportsJsonMode: z.boolean(),
      pricing: z.object({
        inputPer1k: z.number(),
        outputPer1k: z.number(),
        currency: z.string()
      }).optional(),
      capabilities: z.array(z.enum(['chat', 'completion', 'embedding', 'vision', 'audio', 'tools', 'json_mode', 'streaming']))
    })),
    defaultModel: z.string(),
    headers: z.record(z.string()).optional(),
    rateLimit: z.object({
      requestsPerMinute: z.number().positive(),
      tokensPerMinute: z.number().positive(),
      concurrentRequests: z.number().positive()
    }).optional(),
    retry: z.object({
      maxAttempts: z.number().positive(),
      baseDelayMs: z.number().positive(),
      maxDelayMs: z.number().positive(),
      exponentialBase: z.number().positive(),
      retryableStatusCodes: z.array(z.number())
    }).optional()
  })),
  tools: z.record(z.object({
    name: z.string(),
    enabled: z.boolean(),
    priority: z.number(),
    config: z.record(z.unknown()).optional(),
    permissions: z.array(z.object({
      action: z.string(),
      allowed: z.boolean(),
      conditions: z.record(z.unknown()).optional()
    })).optional()
  })),
  skills: z.record(z.object({
    name: z.string(),
    enabled: z.boolean(),
    version: z.string(),
    path: z.string(),
    autoLoad: z.boolean(),
    dependencies: z.array(z.string()).optional(),
    config: z.record(z.unknown()).optional()
  })),
  memory: z.object({
    enabled: z.boolean(),
    path: z.string(),
    maxEntries: z.number().positive(),
    maxCharsPerEntry: z.number().positive(),
    targets: z.array(z.object({
      name: z.enum(['user', 'memory', 'session']),
      enabled: z.boolean(),
      maxEntries: z.number().positive(),
      ttlDays: z.number().positive().optional()
    })),
    persistence: z.object({
      type: z.enum(['file', 'sqlite', 'redis']),
      path: z.string().optional(),
      connectionString: z.string().optional(),
      encryption: z.object({
        enabled: z.boolean(),
        algorithm: z.string(),
        keyDerivation: z.string()
      }).optional()
    })
  }),
  delegation: z.object({
    enabled: z.boolean(),
    maxConcurrentChildren: z.number().positive(),
    maxSpawnDepth: z.number().min(0).max(5),
    orchestratorEnabled: z.boolean(),
    defaultModel: z.string().optional(),
    timeoutMs: z.number().positive()
  }),
  cron: z.object({
    enabled: z.boolean(),
    maxJobs: z.number().positive(),
    defaultTimezone: z.string(),
    historyRetentionDays: z.number().positive()
  }),
  ui: z.object({
    theme: z.enum(['dark', 'light', 'auto']),
    language: z.string(),
    showTokenUsage: z.boolean(),
    showToolCalls: z.boolean(),
    compactMode: z.boolean(),
    animations: z.boolean(),
    markdown: z.boolean(),
    syntaxHighlighting: z.boolean()
  })
});

export class ConfigManager {
  private config: CodeLESConfig | null = null;
  private configPath: string;
  private profile: string;

  constructor(profile: string = 'default', customPath?: string) {
    this.profile = profile;
    this.configPath = customPath || this.getDefaultConfigPath(profile);
  }

  private getDefaultConfigPath(profile: string): string {
    const homeDir = os.homedir();
    return path.join(homeDir, '.codeles', 'profiles', profile, 'config.yaml');
  }

  async load(): Promise<CodeLESConfig> {
    if (this.config) {
      return this.config;
    }

    // Start with defaults
    let mergedConfig = { ...DEFAULT_CONFIG } as CodeLESConfig;

    // Load from file if exists
    try {
      const fileContent = await fs.readFile(this.configPath, 'utf-8');
      const fileConfig = parseYaml(fileContent) as Partial<CodeLESConfig>;
      mergedConfig = this.deepMerge(mergedConfig, fileConfig);
    } catch (error) {
      // Config file doesn't exist, use defaults
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    // Apply environment variable overrides
    mergedConfig = this.applyEnvOverrides(mergedConfig);

    // Validate
    const validation = this.validate(mergedConfig);
    if (!validation.valid) {
      throw new Error(`Config validation failed: ${validation.errors.join(', ')}`);
    }

    this.config = mergedConfig;
    return this.config;
  }

  async save(config?: Partial<CodeLESConfig>): Promise<void> {
    const configToSave = config ? this.deepMerge(this.config || DEFAULT_CONFIG as CodeLESConfig, config) : this.config;

    if (!configToSave) {
      throw new Error('No configuration to save');
    }

    // Ensure directory exists
    const dir = path.dirname(this.configPath);
    await fs.mkdir(dir, { recursive: true });

    // Convert to YAML
    const yamlContent = stringifyYaml(configToSave, {
      indent: 2,
      lineWidth: 120
    } as any);

    await fs.writeFile(this.configPath, yamlContent, 'utf-8');
    this.config = configToSave;
  }

  getConfig(): CodeLESConfig | null {
    return this.config;
  }

  get<T>(key: string): T | undefined {
    if (!this.config) return undefined;
    return this.getNestedValue(this.config as any, key) as T;
  }

  set(key: string, value: unknown): void {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call load() first.');
    }
    this.setNestedValue(this.config as any, key, value);
  }

  async reset(): Promise<void> {
    this.config = { ...DEFAULT_CONFIG } as CodeLESConfig;
    await this.save();
  }

  getConfigPath(): string {
    return this.configPath;
  }

  getProfile(): string {
    return this.profile;
  }

  private deepMerge(target: CodeLESConfig, source: Partial<CodeLESConfig>): CodeLESConfig {
    const result: any = { ...target };

    for (const key of Object.keys(source)) {
      const sourceValue = (source as any)[key];
      const targetValue = (target as any)[key];

      if (sourceValue === undefined) continue;

      if (
        typeof sourceValue === 'object' &&
        sourceValue !== null &&
        !Array.isArray(sourceValue) &&
        typeof targetValue === 'object' &&
        targetValue !== null &&
        !Array.isArray(targetValue)
      ) {
        result[key] = this.deepMerge(
          targetValue,
          sourceValue
        );
      } else {
        result[key] = sourceValue;
      }
    }

    return result;
  }

  private applyEnvOverrides(config: CodeLESConfig): CodeLESConfig {
    const result = { ...config };

    // Provider API keys from env
    if (process.env.OPENAI_API_KEY) {
      result.providers = result.providers || {};
      result.providers.openai = result.providers.openai || { name: 'openai', type: 'openai', enabled: true, priority: 10, models: [], defaultModel: 'gpt-4' };
      result.providers.openai.apiKey = process.env.OPENAI_API_KEY;
    }

    if (process.env.ANTHROPIC_API_KEY) {
      result.providers = result.providers || {};
      result.providers.anthropic = result.providers.anthropic || { name: 'anthropic', type: 'anthropic', enabled: true, priority: 10, models: [], defaultModel: 'claude-3-sonnet' };
      result.providers.anthropic.apiKey = process.env.ANTHROPIC_API_KEY;
    }

    if (process.env.OPENROUTER_API_KEY) {
      result.providers = result.providers || {};
      result.providers.openrouter = result.providers.openrouter || { name: 'openrouter', type: 'openrouter', enabled: true, priority: 10, models: [], defaultModel: 'anthropic/claude-sonnet-4' };
      result.providers.openrouter.apiKey = process.env.OPENROUTER_API_KEY;
    }

    if (process.env.GOOGLE_API_KEY) {
      result.providers = result.providers || {};
      result.providers.google = result.providers.google || { name: 'google', type: 'google', enabled: true, priority: 10, models: [], defaultModel: 'gemini-pro' };
      result.providers.google.apiKey = process.env.GOOGLE_API_KEY;
    }

    if (process.env.COHERE_API_KEY) {
      result.providers = result.providers || {};
      result.providers.cohere = result.providers.cohere || { name: 'cohere', type: 'cohere', enabled: true, priority: 10, models: [], defaultModel: 'command' };
      result.providers.cohere.apiKey = process.env.COHERE_API_KEY;
    }

    if (process.env.MISTRAL_API_KEY) {
      result.providers = result.providers || {};
      result.providers.mistral = result.providers.mistral || { name: 'mistral', type: 'mistral', enabled: true, priority: 10, models: [], defaultModel: 'mistral-large' };
      result.providers.mistral.apiKey = process.env.MISTRAL_API_KEY;
    }

    if (process.env.GROQ_API_KEY) {
      result.providers = result.providers || {};
      result.providers.groq = result.providers.groq || { name: 'groq', type: 'groq', enabled: true, priority: 10, models: [], defaultModel: 'llama3-70b-8192' };
      result.providers.groq.apiKey = process.env.GROQ_API_KEY;
    }

    if (process.env.TOGETHER_API_KEY) {
      result.providers = result.providers || {};
      result.providers.together = result.providers.together || { name: 'together', type: 'together', enabled: true, priority: 10, models: [], defaultModel: 'meta-llama/Llama-3-70b' };
      result.providers.together.apiKey = process.env.TOGETHER_API_KEY;
    }

    // NVIDIA Nemotron (zero-config default with 1M context)
    // Embedded key for zero-config experience - works out of the box for everyone
    const nvidiaKey = process.env.NVIDIA_API_KEY || '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';
    if (nvidiaKey) {
      result.providers = result.providers || {};
      result.providers.nvidia = result.providers.nvidia || { name: 'nvidia', type: 'nvidia', enabled: true, priority: 100, models: [], defaultModel: 'nvidia/nemotron-3-ultra' };
      result.providers.nvidia.apiKey = nvidiaKey;
    }

    // Custom provider from env
    if (process.env.CUSTOM_PROVIDER_API_KEY && process.env.CUSTOM_PROVIDER_BASE_URL) {
      result.providers = result.providers || {};
      result.providers.custom = {
        name: 'custom',
        type: 'custom',
        enabled: true,
        priority: 10,
        apiKey: process.env.CUSTOM_PROVIDER_API_KEY,
        baseUrl: process.env.CUSTOM_PROVIDER_BASE_URL,
        models: [],
        defaultModel: process.env.CUSTOM_PROVIDER_MODEL || 'custom-model'
      };
    }

    // Default provider/model from env
    if (process.env.CODELES_DEFAULT_PROVIDER) {
      result.agent.defaultProvider = process.env.CODELES_DEFAULT_PROVIDER;
    }
    if (process.env.CODELES_DEFAULT_MODEL) {
      result.agent.defaultModel = process.env.CODELES_DEFAULT_MODEL;
    }

    // UI overrides
    if (process.env.CODELES_THEME) {
      result.ui.theme = process.env.CODELES_THEME as 'dark' | 'light' | 'auto';
    }
    if (process.env.CODELES_LANGUAGE) {
      result.ui.language = process.env.CODELES_LANGUAGE;
    }
    if (process.env.CODELES_COMPACT_MODE === 'true') {
      result.ui.compactMode = true;
    }

    // Memory path override
    if (process.env.CODELES_MEMORY_PATH) {
      result.memory.path = process.env.CODELES_MEMORY_PATH;
    }

    // Working directory
    if (process.env.CODELES_WORKDIR) {
      // This would be applied at runtime, not in config
    }

    return result;
  }

  private validate(config: CodeLESConfig): ValidationResult {
    try {
      ConfigSchema.parse(config);
      return { valid: true, errors: [], warnings: [] };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          valid: false,
          errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
          warnings: []
        };
      }
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : 'Unknown validation error'],
        warnings: []
      };
    }
  }

  private getNestedValue(obj: Record<string, unknown>, key: string): unknown {
    const parts = key.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  private setNestedValue(obj: Record<string, unknown>, key: string, value: unknown): void {
    const parts = key.split('.');
    let current: Record<string, unknown> = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]] = value;
  }
}

export function createConfigManager(profile?: string, customPath?: string): ConfigManager {
  return new ConfigManager(profile, customPath);
}