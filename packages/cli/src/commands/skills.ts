/**
 * CodeLES Skills Commands
 */

import chalk from 'chalk';
import boxen from 'boxen';
import { ConfigManager, createConfigManager } from '@codeles/core';

export async function listSkills() {
  const manager = createConfigManager('default');
  const config = await manager.load();

  const skills = Object.entries(config.skills);
  
  if (skills.length === 0) {
    console.log(boxen(
      chalk.bold.cyan('Skills') + '\n\n' +
      chalk.gray('No skills loaded.') + '\n\n' +
      chalk.gray('Use: codeles skills load <name> <path>'),
      { padding: 1, borderStyle: 'round', borderColor: 'cyan' }
    ));
    return;
  }

  console.log(boxen(
    chalk.bold.cyan('Loaded Skills') + '\n\n' +
    skills.map(([name, skill]) => 
      `  ${chalk.cyan(name)} ${skill.enabled ? chalk.green('●') : chalk.red('○')} v${skill.version}\n` +
      `    Path: ${skill.path}\n` +
      `    Auto-load: ${skill.autoLoad ? 'Yes' : 'No'}` +
      (skill.dependencies && skill.dependencies.length > 0 ? `\n    Deps: ${skill.dependencies.join(', ')}` : '')
    ).join('\n\n') + '\n\n' +
    chalk.gray('Use: codeles skills load|unload <name>'),
    { padding: 1, borderStyle: 'round', borderColor: 'cyan' }
  ));
}

export async function loadSkill(name: string, path: string) {
  const manager = createConfigManager('default');
  const config = await manager.load();

  // In a real implementation, this would load the skill from the path
  // For now, just register it in config
  config.skills[name] = {
    name,
    enabled: true,
    version: '1.0.0',
    path,
    autoLoad: true,
    dependencies: [],
    config: {}
  };

  await manager.save(config);
  console.log(chalk.green(`✓ Skill ${name} loaded from ${path}`));
}

export async function unloadSkill(name: string) {
  const manager = createConfigManager('default');
  const config = await manager.load();

  if (!config.skills[name]) {
    console.log(chalk.red(`Skill not found: ${name}`));
    return;
  }

  delete config.skills[name];
  await manager.save(config);
  console.log(chalk.green(`✓ Skill ${name} unloaded`));
}