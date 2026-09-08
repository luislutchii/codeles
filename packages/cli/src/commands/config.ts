/**
 * CodeLES Config Commands
 */

import chalk from 'chalk';
import boxen from 'boxen';
import { CodeLESConfig } from '@codeles/core';
import { ConfigManager, createConfigManager } from '@codeles/core';

let configCache: CodeLESConfig | null = null;

async function getConfig(): Promise<CodeLESConfig> {
  if (configCache) return configCache;
  const manager = createConfigManager('default');
  configCache = await manager.load();
  return configCache;
}

export async function showConfig() {
  const config = await getConfig();
  
  console.log(boxen(
    chalk.bold.cyan('CodeLES Configuration') + '\n\n' +
    chalk.bold('Profile:') + ` ${config.profile}\n` +
    chalk.bold('Version:') + ` ${config.version}\n\n` +
    chalk.bold('Agent:') + '\n' +
    `  Name: ${config.agent.name}\n` +
    `  Default Provider: ${chalk.cyan(config.agent.defaultProvider)}\n` +
    `  Default Model: ${chalk.cyan(config.agent.defaultModel)}\n` +
    `  Max Tokens: ${config.agent.maxTokens}\n` +
    `  Temperature: ${config.agent.temperature}\n\n` +
    chalk.bold('Providers:') + '\n' +
    Object.entries(config.providers).map(([k, v]) => 
      `  ${k}: ${v.enabled ? chalk.green('●') : chalk.red('○')} (${v.type}) - Default: ${v.defaultModel}`
    ).join('\n') + '\n\n' +
    chalk.bold('Tools:') + '\n' +
    Object.entries(config.tools).map(([k, v]) => 
      `  ${k}: ${v.enabled ? chalk.green('●') : chalk.red('○')}`
    ).join('\n') + '\n\n' +
    chalk.bold('Memory:') + ` ${config.memory.enabled ? chalk.green('Enabled') : chalk.red('Disabled')}\n` +
    chalk.bold('Delegation:') + ` ${config.delegation.enabled ? chalk.green('Enabled') : chalk.red('Disabled')}\n` +
    chalk.bold('Cron:') + ` ${config.cron.enabled ? chalk.green('Enabled') : chalk.red('Disabled')}`,
    { padding: 1, borderStyle: 'round', borderColor: 'cyan' }
  ));
}

export async function setConfig(key: string, value: string) {
  const manager = createConfigManager('default');
  const config = await manager.load();
  
  // Parse value (try JSON, fallback to string)
  let parsedValue: any = value;
  try {
    parsedValue = JSON.parse(value);
  } catch {
    // Try boolean
    if (value === 'true') parsedValue = true;
    else if (value === 'false') parsedValue = false;
    // Try number
    else if (!isNaN(Number(value))) parsedValue = Number(value);
  }
  
  manager.set(key, parsedValue);
  await manager.save();
  
  console.log(chalk.green(`✓ Config updated: ${key} = ${JSON.stringify(parsedValue)}`));
}

export async function getConfigValue(key: string) {
  const manager = createConfigManager('default');
  const config = await manager.load();
  const value = manager.get(key);
  
  if (value === undefined) {
    console.log(chalk.yellow(`Key not found: ${key}`));
    return;
  }
  
  console.log(chalk.cyan(`${key}:`) + ` ${JSON.stringify(value, null, 2)}`);
}

export async function resetConfig() {
  const manager = createConfigManager('default');
  await manager.reset();
  console.log(chalk.green('✓ Configuration reset to defaults'));
}

export async function editConfig() {
  const manager = createConfigManager('default');
  const configPath = manager.getConfigPath();
  
  console.log(chalk.cyan(`Config file: ${configPath}`));
  console.log(chalk.gray('Opening in default editor...'));
  
  // In a real implementation, this would open the editor
  // For now, just show the path
  const { spawn } = await import('child_process');
  const editor = process.env.EDITOR || 'code';
  
  spawn(editor, [configPath], { stdio: 'inherit' });
}