/**
 * CodeLES Provider Commands
 */

import chalk from 'chalk';
import boxen from 'boxen';
import { providerRegistry } from '@codeles/providers';
import { ConfigManager, createConfigManager } from '@codeles/core';

export async function listProviders() {
  const manager = createConfigManager('default');
  const config = await manager.load();
  const adapters = providerRegistry.listAdapters();

  console.log(boxen(
    chalk.bold.cyan('Available Providers') + '\n\n' +
    adapters.map(name => {
      const adapter = providerRegistry.getAdapter(name);
      const cfg = config.providers[name];
      const isDefault = name === config.agent.defaultProvider;
      const status = cfg?.enabled ? chalk.green('● Enabled') : chalk.red('○ Disabled');
      const defaultBadge = isDefault ? chalk.yellow(' (DEFAULT)') : '';
      const modelInfo = cfg ? ` - ${cfg.defaultModel}` : '';
      return `  ${chalk.cyan(name)}${defaultBadge} ${status}${modelInfo}`;
    }).join('\n') + '\n\n' +
    chalk.gray('Use: codeles provider add <name> -t <type> -k <key> -m <model>'),
    { padding: 1, borderStyle: 'round', borderColor: 'cyan' }
  ));
}

export async function addProvider(name: string, options: { type?: string; apiKey?: string; baseUrl?: string; model?: string }) {
  const manager = createConfigManager('default');
  const config = await manager.load();

  const type = options.type || 'custom';
  const validTypes = ['openai', 'anthropic', 'openrouter', 'google', 'cohere', 'mistral', 'groq', 'together', 'nvidia', 'custom'];
  
  if (!validTypes.includes(type)) {
    console.log(chalk.red(`Invalid provider type: ${type}`));
    console.log(chalk.gray(`Valid types: ${validTypes.join(', ')}`));
    return;
  }

  if (!options.apiKey && type !== 'custom') {
    console.log(chalk.yellow('Warning: No API key provided. Set it later with config set.'));
  }

  const newProvider = {
    name,
    type: type as any,
    enabled: true,
    priority: 50,
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    models: [],
    defaultModel: options.model || getDefaultModel(type)
  };

  config.providers[name] = newProvider;
  await manager.save(config);
  
  console.log(chalk.green(`✓ Provider ${name} (${type}) added successfully`));
  console.log(chalk.gray(`Default model: ${newProvider.defaultModel}`));
}

function getDefaultModel(type: string): string {
  const defaults: Record<string, string> = {
    openai: 'gpt-4o',
    anthropic: 'claude-3-5-sonnet-20241022',
    openrouter: 'anthropic/claude-3.5-sonnet',
    google: 'gemini-1.5-pro',
    cohere: 'command-r-plus',
    mistral: 'mistral-large-latest',
    groq: 'llama-3.1-70b-versatile',
    together: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    nvidia: 'nvidia/nemotron-3-ultra',
    custom: 'custom-model'
  };
  return defaults[type] || 'default';
}

export async function removeProvider(name: string) {
  const manager = createConfigManager('default');
  const config = await manager.load();

  if (!config.providers[name]) {
    console.log(chalk.red(`Provider not found: ${name}`));
    return;
  }

  if (name === config.agent.defaultProvider) {
    console.log(chalk.yellow('Warning: This is the default provider. Consider setting a new default first.'));
  }

  delete config.providers[name];
  await manager.save(config);
  
  console.log(chalk.green(`✓ Provider ${name} removed`));
}

export async function testProvider(name: string) {
  const manager = createConfigManager('default');
  const config = await manager.load();

  if (!config.providers[name]) {
    console.log(chalk.red(`Provider not found: ${name}`));
    return;
  }

  const adapter = providerRegistry.getAdapter(name);
  if (!adapter) {
    console.log(chalk.red(`Adapter not found for: ${name}`));
    return;
  }

  console.log(chalk.cyan(`Testing ${name}...`));
  
  try {
    await adapter.initialize(config.providers[name]);
    const result = await adapter.healthCheck();
    
    if (result.healthy) {
      console.log(chalk.green(`✓ ${name} is healthy`));
      if (result.latencyMs) console.log(chalk.gray(`  Latency: ${result.latencyMs}ms`));
      if (result.details) console.log(chalk.gray(`  Details: ${JSON.stringify(result.details)}`));
    } else {
      console.log(chalk.red(`✗ ${name} health check failed`));
      if (result.error) console.log(chalk.red(`  Error: ${result.error}`));
    }
  } catch (error) {
    console.log(chalk.red(`✗ ${name} initialization failed`));
    console.log(chalk.red(`  Error: ${error instanceof Error ? error.message : String(error)}`));
  }
}

export async function listModels(name: string) {
  const manager = createConfigManager('default');
  const config = await manager.load();

  if (!config.providers[name]) {
    console.log(chalk.red(`Provider not found: ${name}`));
    return;
  }

  const adapter = providerRegistry.getAdapter(name);
  if (!adapter) {
    console.log(chalk.red(`Adapter not found for: ${name}`));
    return;
  }

  console.log(chalk.cyan(`Fetching models for ${name}...`));
  
  try {
    await adapter.initialize(config.providers[name]);
    const models = await adapter.listModels();
    
    console.log(boxen(
      chalk.bold.cyan(`Models for ${name}`) + '\n\n' +
      models.map(m => 
        `  ${chalk.cyan(m.id)} (${m.contextWindow.toLocaleString()} ctx, ${m.maxOutputTokens} max out)\n` +
        `    ${m.supportsStreaming ? chalk.green('✓') : chalk.red('✗')} Streaming ` +
        `${m.supportsTools ? chalk.green('✓') : chalk.red('✗')} Tools ` +
        `${m.supportsVision ? chalk.green('✓') : chalk.red('✗')} Vision ` +
        `${m.supportsJsonMode ? chalk.green('✓') : chalk.red('✗')} JSON`
      ).join('\n\n'),
      { padding: 1, borderStyle: 'round', borderColor: 'cyan' }
    ));
  } catch (error) {
    console.log(chalk.red(`Failed to list models: ${error instanceof Error ? error.message : String(error)}`));
  }
}