/**
 * CodeLES Core Types
 * Tipos fundamentais do agente CodeLES
 */

export interface CodeLESConfig {
  version: string;
  profile: string;
  agent: AgentConfig;
  providers: ProviderConfigMap;
  tools: ToolConfigMap;
  skills: SkillConfigMap;
  memory: MemoryConfig;
  delegation: DelegationConfig;
  cron: CronConfig;
  ui: UIConfig;
}

export interface AgentConfig {
  name: string;
  version: string;
  identity: AgentIdentity;
  defaultProvider: string;
  defaultModel: string;
  systemPrompt: string;
  maxTokens: number;
  temperature: number;
  topP: number;
  presencePenalty: number;
  frequencyPenalty: number;
}

export interface AgentIdentity {
  name: string;
  role: string;
  personality: string[];
  mission: string;
  represents: string;
  founder: string;
  website: string;
}

export interface ProviderConfigMap {
  [key: string]: ProviderConfig;
}

export interface ProviderConfig {
  name: string;
  type: ProviderType;
  enabled: boolean;
  priority: number;
  apiKey?: string;
  baseUrl?: string;
  organization?: string;
  models: ModelConfig[];
  defaultModel: string;
  headers?: Record<string, string>;
  rateLimit?: RateLimitConfig;
  retry?: RetryConfig;
}

export type ProviderType = 
  | 'openai' 
  | 'anthropic' 
  | 'openrouter' 
  | 'google' 
  | 'cohere' 
  | 'mistral' 
  | 'groq' 
  | 'together' 
  | 'custom'
  | 'nvidia';

export interface ModelConfig {
  id: string;
  name: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsJsonMode: boolean;
  pricing?: ModelPricing;
  capabilities: ModelCapability[];
}

export interface ModelPricing {
  inputPer1k: number;
  outputPer1k: number;
  currency: string;
}

export type ModelCapability = 
  | 'chat' 
  | 'completion' 
  | 'embedding' 
  | 'vision' 
  | 'audio' 
  | 'tools' 
  | 'json_mode' 
  | 'streaming'
  | string;  // Allow custom capabilities

export interface RateLimitConfig {
  requestsPerMinute: number;
  tokensPerMinute: number;
  concurrentRequests: number;
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  exponentialBase: number;
  retryableStatusCodes: number[];
}

export interface ToolConfigMap {
  [key: string]: ToolConfig;
}

export interface ToolConfig {
  name: string;
  enabled: boolean;
  priority: number;
  config?: Record<string, unknown>;
  permissions?: ToolPermission[];
}

export interface ToolPermission {
  action: string;
  allowed: boolean;
  conditions?: Record<string, unknown>;
}

export interface SkillConfigMap {
  [key: string]: SkillConfig;
}

export interface SkillConfig {
  name: string;
  enabled: boolean;
  version: string;
  path: string;
  autoLoad: boolean;
  dependencies?: string[];
  config?: Record<string, unknown>;
}

export interface MemoryConfig {
  enabled: boolean;
  path: string;
  maxEntries: number;
  maxCharsPerEntry: number;
  targets: MemoryTarget[];
  persistence: MemoryPersistenceConfig;
}

export interface MemoryTarget {
  name: 'user' | 'memory' | 'session';
  enabled: boolean;
  maxEntries: number;
  ttlDays?: number;
}

export interface MemoryPersistenceConfig {
  type: 'file' | 'sqlite' | 'redis';
  path?: string;
  connectionString?: string;
  encryption?: EncryptionConfig;
}

export interface EncryptionConfig {
  enabled: boolean;
  algorithm: string;
  keyDerivation: string;
}

export interface DelegationConfig {
  enabled: boolean;
  maxConcurrentChildren: number;
  maxSpawnDepth: number;
  orchestratorEnabled: boolean;
  defaultModel?: string;
  timeoutMs: number;
}

export interface CronConfig {
  enabled: boolean;
  maxJobs: number;
  defaultTimezone: string;
  historyRetentionDays: number;
}

export interface UIConfig {
  theme: 'dark' | 'light' | 'auto';
  language: string;
  showTokenUsage: boolean;
  showToolCalls: boolean;
  compactMode: boolean;
  animations: boolean;
  markdown: boolean;
  syntaxHighlighting: boolean;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  name?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  timestamp: number;
  metadata?: MessageMetadata;
}

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool' | 'function' | 'developer';

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface MessageMetadata {
  provider?: string;
  model?: string;
  tokens?: TokenUsage;
  latencyMs?: number;
  finishReason?: string;
}

export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

export interface ProviderRequest {
  messages: ChatMessage[];
  model: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  stream?: boolean;
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
  responseFormat?: { type: 'json_object' | 'text' };
  stop?: string[];
  presencePenalty?: number;
  frequencyPenalty?: number;
  user?: string;
  metadata?: Record<string, unknown>;
}

export interface ProviderResponse {
  id: string;
  choices: ProviderChoice[];
  usage: TokenUsage;
  model: string;
  provider: string;
  latencyMs: number;
}

export interface ProviderChoice {
  index: number;
  message: ChatMessage;
  finishReason: string;
  logprobs?: unknown;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JSONSchema;
  };
}

export interface JSONSchema {
  type: string;
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  enum?: unknown[];
  description?: string;
  default?: unknown;
  format?: string;
}

export interface StreamChunk {
  id: string;
  choices: StreamChoice[];
  model: string;
  provider: string;
}

export interface StreamChoice {
  index: number;
  delta: {
    role?: string;
    content?: string;
    toolCalls?: ToolCall[];
  };
  finishReason: string | null;
}

export interface Session {
  id: string;
  profile: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  metadata: SessionMetadata;
  context: SessionContext;
}

export interface SessionMetadata {
  title?: string;
  tags?: string[];
  provider?: string;
  model?: string;
  totalTokens: number;
  totalCost: number;
  messageCount: number;
}

export interface SessionContext {
  workingDirectory: string;
  environmentVariables: Record<string, string>;
  activeSkills: string[];
  loadedTools: string[];
  memoryContext: string[];
}

export interface Skill {
  name: string;
  version: string;
  description: string;
  author?: string;
  license?: string;
  category?: string;
  triggers: SkillTrigger[];
  commands: SkillCommand[];
  hooks: SkillHook[];
  config?: SkillConfigSchema;
}

export type SkillTrigger = 
  | { type: 'command'; command: string; description: string }
  | { type: 'event'; event: string; description: string }
  | { type: 'schedule'; cron: string; description: string }
  | { type: 'keyword'; keywords: string[]; description: string };

export interface SkillCommand {
  name: string;
  description: string;
  usage: string;
  examples: string[];
  handler: string;
  permissions?: string[];
}

export interface SkillHook {
  event: 'pre_chat' | 'post_chat' | 'pre_tool' | 'post_tool' | 'pre_delegation' | 'post_delegation' | 'session_start' | 'session_end';
  handler: string;
  priority: number;
}

export interface SkillConfigSchema {
  type: 'object';
  properties: Record<string, JSONSchema>;
  required?: string[];
}

export interface DelegationTask {
  id: string;
  parentId?: string;
  goal: string;
  context: string;
  role: 'leaf' | 'orchestrator';
  status: DelegationStatus;
  result?: DelegationResult;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export type DelegationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface DelegationResult {
  summary: string;
  output?: unknown;
  artifacts?: DelegationArtifact[];
  tokensUsed?: TokenUsage;
}

export interface DelegationArtifact {
  type: 'file' | 'url' | 'code' | 'data';
  path?: string;
  url?: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  prompt: string;
  skills?: string[];
  enabled: boolean;
  lastRun?: number;
  nextRun?: number;
  runCount: number;
  status: CronJobStatus;
  config?: CronJobConfig;
}

export type CronJobStatus = 'idle' | 'running' | 'completed' | 'failed' | 'paused';

export interface CronJobConfig {
  model?: { provider: string; model: string };
  deliver?: string;
  noAgent?: boolean;
  script?: string;
  workdir?: string;
  contextFrom?: string[];
  enabledToolsets?: string[];
  attachToSession?: boolean;
}

export interface ToolResult {
  success: boolean;
  output?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
  artifacts?: ToolArtifact[];
}

export interface ToolArtifact {
  type: 'file' | 'stdout' | 'stderr' | 'json' | 'image' | 'url';
  path?: string;
  content?: string;
  url?: string;
  mimeType?: string;
  size?: number;
}

export interface ProviderAdapter {
  name: string;
  type: ProviderType;
  initialize(config: ProviderConfig): Promise<void>;
  chat(request: ProviderRequest): Promise<ProviderResponse>;
  streamChat(request: ProviderRequest): AsyncIterable<StreamChunk>;
  listModels(): Promise<ModelConfig[]>;
  validateConfig(config: ProviderConfig): Promise<ValidationResult>;
  healthCheck(): Promise<HealthCheckResult>;
  shutdown(): Promise<void>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface HealthCheckResult {
  healthy: boolean;
  latencyMs?: number;
  error?: string;
  details?: Record<string, unknown>;
}

export interface ToolAdapter {
  name: string;
  description: string;
  version: string;
  definition: ToolDefinition;
  permissions: ToolPermission[];
  initialize(config?: Record<string, unknown>): Promise<void>;
  execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
  validateArgs(args: Record<string, unknown>): ValidationResult;
  shutdown(): Promise<void>;
}

export interface ToolContext {
  session: Session;
  config: CodeLESConfig;
  workingDirectory: string;
  environmentVariables: Record<string, string>;
  memory: MemoryInterface;
  skills: SkillManagerInterface;
}

export interface MemoryInterface {
  add(target: 'user' | 'memory', content: string): Promise<string>;
  search(target: 'user' | 'memory', query: string, limit?: number): Promise<MemoryEntry[]>;
  get(target: 'user' | 'memory', id: string): Promise<MemoryEntry | null>;
  update(target: 'user' | 'memory', id: string, content: string): Promise<void>;
  delete(target: 'user' | 'memory', id: string): Promise<void>;
  list(target: 'user' | 'memory', limit?: number, offset?: number): Promise<MemoryEntry[]>;
  clear(target: 'user' | 'memory'): Promise<void>;
}

export interface MemoryEntry {
  id: string;
  target: 'user' | 'memory' | 'session';
  content: string;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
  tags?: string[];
  ttlDays?: number;
}

export interface SkillManagerInterface {
  loadSkill(name: string, path: string): Promise<Skill>;
  unloadSkill(name: string): Promise<void>;
  getSkill(name: string): Skill | undefined;
  listSkills(): Skill[];
  executeSkillCommand(skillName: string, commandName: string, args: string[]): Promise<ToolResult>;
  triggerSkillEvent(event: string, data: unknown): Promise<void>;
}

export interface EventEmitter {
  on(event: string, listener: (...args: unknown[]) => void): this;
  off(event: string, listener: (...args: unknown[]) => void): this;
  emit(event: string, ...args: unknown[]): boolean;
  once(event: string, listener: (...args: unknown[]) => void): this;
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  child(meta: Record<string, unknown>): Logger;
}

export const DEFAULT_CONFIG: Partial<CodeLESConfig> = {
  version: '1.0.0',
  profile: 'default',
  agent: {
    name: 'CodeLES',
    version: '1.0.0',
    identity: {
      name: 'CodeLES',
      role: 'AI Coding Agent',
      personality: ['Profissional', 'Prestativo', 'Inteligente', 'Estratégico', 'Amigável'],
      mission: 'Ajudar desenvolvedores a codificar, depurar, arquitetar e entregar software de qualidade',
      represents: 'Lutchi Enterprise Systems',
      founder: 'Luís Lutchi',
      website: 'https://lutchi.vercel.app'
    },
    defaultProvider: 'openrouter',
    defaultModel: 'nvidia/nemotron-3-ultra',
    systemPrompt: '',
    maxTokens: 8192,
    temperature: 0.7,
    topP: 0.95,
    presencePenalty: 0,
    frequencyPenalty: 0
  },
  providers: {},
  tools: {},
  skills: {},
  memory: {
    enabled: true,
    path: '~/.codeles/memory',
    maxEntries: 10000,
    maxCharsPerEntry: 5000,
    targets: [
      { name: 'user', enabled: true, maxEntries: 1000 },
      { name: 'memory', enabled: true, maxEntries: 5000 },
      { name: 'session', enabled: true, maxEntries: 100 }
    ],
    persistence: {
      type: 'file',
      path: '~/.codeles/memory'
    }
  },
  delegation: {
    enabled: true,
    maxConcurrentChildren: 3,
    maxSpawnDepth: 1,
    orchestratorEnabled: false,
    timeoutMs: 300000
  },
  cron: {
    enabled: true,
    maxJobs: 50,
    defaultTimezone: 'UTC',
    historyRetentionDays: 30
  },
  ui: {
    theme: 'dark',
    language: 'pt-BR',
    showTokenUsage: true,
    showToolCalls: true,
    compactMode: false,
    animations: true,
    markdown: true,
    syntaxHighlighting: true
  }
};