/**
 * CodeLES Init Command - Initialize project
 */

import chalk from 'chalk';
import boxen from 'boxen';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfigManager, createConfigManager } from '@codeles/core';

export async function initProject(force: boolean = false) {
  console.log(boxen(
    chalk.bold.cyan('CodeLES Initialize') + '\n' +
    chalk.gray('Setting up CodeLES in current project'),
    { padding: 1, borderStyle: 'round', borderColor: 'cyan' }
  ));

  const cwd = process.cwd();
  const codelesDir = path.join(cwd, '.codeles');
  const envPath = path.join(cwd, '.env');
  const envExamplePath = path.join(cwd, '.env.example');

  // Check if already initialized
  try {
    await fs.access(codelesDir);
    if (!force) {
      console.log(chalk.yellow('CodeLES already initialized in this directory.'));
      console.log(chalk.gray('Use --force to reinitialize.'));
      return;
    }
  } catch {
    // Not initialized, continue
  }

  // Create .codeles directory structure
  await fs.mkdir(path.join(codelesDir, 'memory'), { recursive: true });
  await fs.mkdir(path.join(codelesDir, 'sessions'), { recursive: true });
  await fs.mkdir(path.join(codelesDir, 'cron'), { recursive: true });
  await fs.mkdir(path.join(codelesDir, 'skills'), { recursive: true });
  await fs.mkdir(path.join(codelesDir, 'logs'), { recursive: true });

  console.log(chalk.green('✓ Created .codeles directory structure'));

  // Copy .env.example to .env if not exists
  try {
    await fs.access(envPath);
    console.log(chalk.yellow('⚠ .env already exists, skipping'));
  } catch {
    try {
      await fs.copyFile(envExamplePath, envPath);
      console.log(chalk.green('✓ Created .env from .env.example'));
      console.log(chalk.gray('  Edit .env to add your API keys'));
    } catch {
      console.log(chalk.yellow('⚠ .env.example not found, creating minimal .env'));
      await fs.writeFile(envPath, '# CodeLES Environment Variables\nNVIDIA_API_KEY=\n', 'utf-8');
    }
  }

  // Initialize config
  const manager = createConfigManager('default');
  try {
    await manager.load();
    console.log(chalk.green('✓ Configuration loaded'));
  } catch {
    await manager.save();
    console.log(chalk.green('✓ Default configuration created'));
  }

  // Create example skill
  const skillDir = path.join(codelesDir, 'skills', 'example');
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(
    path.join(skillDir, 'skill.yaml'),
    `name: example
version: 1.0.0
description: Example skill for CodeLES
category: utility
triggers:
  - type: command
    command: /example
    description: Run example skill
commands:
  - name: hello
    description: Say hello
    usage: /example hello
    examples:
      - /example hello
    handler: example.hello
`,
    'utf-8'
  );
  console.log(chalk.green('✓ Created example skill'));

  // Create README for project
  const readmePath = path.join(cwd, 'CODELES.md');
  await fs.writeFile(readmePath, `# CodeLES Project Configuration

This directory contains CodeLES configuration for this project.

## Structure
- \`.codeles/memory/\` - Persistent memory (user, memory, session)
- \`.codeles/sessions/\` - Chat session history
- \`.codeles/cron/\` - Scheduled jobs
- \`.codeles/skills/\` - Custom skills
- \`.codeles/logs/\` - Log files

## Configuration
- \`config.yaml\` - Main configuration (managed by \`codeles config\`)
- \`.env\` - Environment variables (API keys, etc.)

## Quick Start
\`\`\`bash
# Start chat
codeles chat

# Check health
codeles doctor

# Configure provider
codeles provider add my-openai -t openai -k sk-... -m gpt-4o

# Add memory
codeles memory add user "Project uses TypeScript strict mode"
\`\`\`

## Default Provider
CodeLES uses **NVIDIA Nemotron 3 Ultra** by default with **1M token context** - no configuration needed!

Just run \`codeles chat\` and start coding.
`, 'utf-8');
  console.log(chalk.green('✓ Created CODELES.md'));

  console.log('\n' + boxen(
    chalk.bold.green('CodeLES initialized successfully!') + '\n\n' +
    chalk.white('Next steps:') + '\n' +
    `  1. ${chalk.cyan('Edit .env')} to add API keys (optional - NVIDIA works out of the box)\n` +
    `  2. ${chalk.cyan('Run: codeles chat')} to start coding\n` +
    `  3. ${chalk.cyan('Run: codeles doctor')} to verify setup`,
    { padding: 1, borderStyle: 'round', borderColor: 'green' }
  ));
}