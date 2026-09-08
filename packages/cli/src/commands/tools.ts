/**
 * CodeLES Tools Commands
 */

import chalk from 'chalk';
import boxen from 'boxen';
import { toolRegistry } from '@codeles/tools';
import { ConfigManager, createConfigManager } from '@codeles/core';

export async function listTools() {
  const manager = createConfigManager('default');
  const config = await manager.load();
  const tools = toolRegistry.listTools();

  console.log(boxen(
    chalk.bold.cyan('Available Tools') + '\n\n' +
    tools.map(tool => {
      const cfg = config.tools[tool.name];
      const status = cfg?.enabled ? chalk.green('● Enabled') : chalk.red('○ Disabled');
      return `  ${chalk.cyan(tool.name)} ${status}\n    ${tool.description}\n    Version: ${tool.version}`;
    }).join('\n\n') + '\n\n' +
    chalk.gray('Use: codeles tools enable|disable <name>'),
    { padding: 1, borderStyle: 'round', borderColor: 'cyan' }
  ));
}

export async function enableTool(name: string) {
  const manager = createConfigManager('default');
  const config = await manager.load();

  if (!config.tools[name]) {
    // Add with defaults
    config.tools[name] = {
      name,
      enabled: true,
      priority: 50,
      permissions: []
    };
  } else {
    config.tools[name].enabled = true;
  }

  await manager.save(config);
  console.log(chalk.green(`✓ Tool ${name} enabled`));
}

export async function disableTool(name: string) {
  const manager = createConfigManager('default');
  const config = await manager.load();

  if (!config.tools[name]) {
    console.log(chalk.red(`Tool not found: ${name}`));
    return;
  }

  config.tools[name].enabled = false;
  await manager.save(config);
  console.log(chalk.green(`✓ Tool ${name} disabled`));
}