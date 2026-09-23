#!/usr/bin/env node
/**
 * CodeLES CLI - Main Entry Point
 */

import { Command } from 'commander';
import { ConfigManager, createConfigManager } from '@codeles/core';
import { providerRegistry } from '@codeles/providers';
import { toolRegistry } from '@codeles/tools';
import { CodeLESConfig } from '@codeles/core';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import chalk from 'chalk';
import boxen from 'boxen';

const program = new Command();

program
  .name('codeles')
  .description('CodeLES - AI Coding Agent with 1M Context (Nemotron 3 Ultra)')
  .version('1.0.0')
  .option('-p, --profile <profile>', 'Configuration profile to use', 'default')
  .option('-c, --config <path>', 'Custom config file path')
  .option('--no-color', 'Disable colored output')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.noColor) {
      chalk.level = 0;
    }
  });

// Chat command
program
  .command('chat')
  .description('Start interactive chat session with CodeLES')
  .option('-m, --model <model>', 'Model to use (overrides default)')
  .option('--provider <provider>', 'Provider to use (overrides default)')
  .option('--system-prompt <prompt>', 'Custom system prompt')
  .option('--max-tokens <tokens>', 'Max tokens per response', '8192')
  .option('--temperature <temp>', 'Temperature (0-2)', '0.7')
  .action(async (options) => {
    const { startChatSession } = await import('./commands/chat.js');
    await startChatSession({
      model: options.model,
      provider: options.provider,
      systemPrompt: options.systemPrompt,
      maxTokens: options.maxTokens,
      temperature: options.temperature
    });
  });

// Config command
program
  .command('config')
  .description('Manage CodeLES configuration')
  .addCommand(
    new Command('show')
      .description('Show current configuration')
      .action(async () => {
        const { showConfig } = await import('./commands/config.js');
        await showConfig();
      })
  )
  .addCommand(
    new Command('set')
      .description('Set a configuration value')
      .argument('<key>', 'Configuration key (e.g. agent.temperature)')
      .argument('<value>', 'Configuration value')
      .action(async (key, value) => {
        const { setConfig } = await import('./commands/config.js');
        await setConfig(key, value);
      })
  )
  .addCommand(
    new Command('get')
      .description('Get a configuration value')
      .argument('<key>', 'Configuration key')
      .action(async (key) => {
        const { getConfigValue } = await import('./commands/config.js');
        await getConfigValue(key);
      })
  )
  .addCommand(
    new Command('reset')
      .description('Reset configuration to defaults')
      .action(async () => {
        const { resetConfig } = await import('./commands/config.js');
        await resetConfig();
      })
  )
  .addCommand(
    new Command('edit')
      .description('Open configuration in editor')
      .action(async () => {
        const { editConfig } = await import('./commands/config.js');
        await editConfig();
      })
  )
  .addCommand(
    new Command('wizard')
      .description('Interactive configuration wizard (set providers, models, API keys)')
      .action(async () => {
        const { runConfigWizard } = await import('./commands/config-interactive.js');
        await runConfigWizard();
      })
  );

// Provider command
program
  .command('provider')
  .description('Manage AI providers')
  .addCommand(
    new Command('list')
      .description('List configured providers')
      .action(async () => {
        const { listProviders } = await import('./commands/provider.js');
        await listProviders();
      })
  )
  .addCommand(
    new Command('add')
      .description('Add a new provider')
      .argument('<name>', 'Provider name')
      .option('-t, --type <type>', 'Provider type (openai, anthropic, openrouter, google, nvidia, etc.)')
      .option('-k, --api-key <key>', 'API key')
      .option('-u, --base-url <url>', 'Base URL')
      .option('-m, --model <model>', 'Default model')
      .action(async (name, options) => {
        const { addProvider } = await import('./commands/provider.js');
        await addProvider(name, options);
      })
  )
  .addCommand(
    new Command('remove')
      .description('Remove a provider')
      .argument('<name>', 'Provider name')
      .action(async (name) => {
        const { removeProvider } = await import('./commands/provider.js');
        await removeProvider(name);
      })
  )
  .addCommand(
    new Command('test')
      .description('Test provider connection')
      .argument('<name>', 'Provider name')
      .action(async (name) => {
        const { testProvider } = await import('./commands/provider.js');
        await testProvider(name);
      })
  )
  .addCommand(
    new Command('models')
      .description('List models for a provider')
      .argument('<name>', 'Provider name')
      .action(async (name) => {
        const { listModels } = await import('./commands/provider.js');
        await listModels(name);
      })
  );

// Tools command
program
  .command('tools')
  .description('Manage tools')
  .addCommand(
    new Command('list')
      .description('List available tools')
      .action(async () => {
        const { listTools } = await import('./commands/tools.js');
        await listTools();
      })
  )
  .addCommand(
    new Command('enable')
      .description('Enable a tool')
      .argument('<name>', 'Tool name')
      .action(async (name) => {
        const { enableTool } = await import('./commands/tools.js');
        await enableTool(name);
      })
  )
  .addCommand(
    new Command('disable')
      .description('Disable a tool')
      .argument('<name>', 'Tool name')
      .action(async (name) => {
        const { disableTool } = await import('./commands/tools.js');
        await disableTool(name);
      })
  );

// Memory command
program
  .command('memory')
  .description('Manage memory')
  .addCommand(
    new Command('add')
      .description('Add memory entry')
      .argument('<target>', 'Target (user|memory|session)')
      .argument('<content>', 'Content to remember')
      .action(async (target, content) => {
        const { addMemory } = await import('./commands/memory.js');
        await addMemory(target, content);
      })
  )
  .addCommand(
    new Command('search')
      .description('Search memory')
      .argument('<target>', 'Target (user|memory|session)')
      .argument('<query>', 'Search query')
      .option('-l, --limit <limit>', 'Limit results', '10')
      .action(async (target, query, options) => {
        const { searchMemory } = await import('./commands/memory.js');
        await searchMemory(target, query, parseInt(options.limit));
      })
  )
  .addCommand(
    new Command('list')
      .description('List memory entries')
      .argument('<target>', 'Target (user|memory|session)')
      .option('-l, --limit <limit>', 'Limit results', '20')
      .action(async (target, options) => {
        const { listMemory } = await import('./commands/memory.js');
        await listMemory(target, parseInt(options.limit));
      })
  )
  .addCommand(
    new Command('clear')
      .description('Clear memory')
      .argument('<target>', 'Target (user|memory|session)')
      .action(async (target) => {
        const { clearMemory } = await import('./commands/memory.js');
        await clearMemory(target);
      })
  );

// Session command
program
  .command('session')
  .description('Manage chat sessions')
  .addCommand(
    new Command('list')
      .description('List saved sessions')
      .action(async () => {
        const { listSessions } = await import('./commands/session.js');
        await listSessions();
      })
  )
  .addCommand(
    new Command('new')
      .description('Start new session')
      .argument('[title]', 'Session title')
      .action(async (title) => {
        const { newSession } = await import('./commands/session.js');
        await newSession(title);
      })
  )
  .addCommand(
    new Command('load')
      .description('Load a session')
      .argument('<id>', 'Session ID')
      .action(async (id) => {
        const { loadSession } = await import('./commands/session.js');
        await loadSession(id);
      })
  )
  .addCommand(
    new Command('delete')
      .description('Delete a session')
      .argument('<id>', 'Session ID')
      .action(async (id) => {
        const { deleteSession } = await import('./commands/session.js');
        await deleteSession(id);
      })
  );

// Delegate command
program
  .command('delegate')
  .description('Manage task delegation')
  .addCommand(
    new Command('spawn')
      .description('Spawn a subagent')
      .argument('<goal>', 'Task goal')
      .option('-c, --context <context>', 'Additional context')
      .option('-r, --role <role>', 'Role (leaf|orchestrator)', 'leaf')
      .action(async (goal, options) => {
        const { spawnDelegation } = await import('./commands/delegation.js');
        await spawnDelegation(goal, { context: options.context, role: options.role as 'leaf' | 'orchestrator' });
      })
  )
  .addCommand(
    new Command('list')
      .description('List active delegations')
      .action(async () => {
        const { listDelegations } = await import('./commands/delegation.js');
        await listDelegations();
      })
  )
  .addCommand(
    new Command('cancel')
      .description('Cancel a delegation')
      .argument('<id>', 'Delegation ID')
      .action(async (id) => {
        const { cancelDelegation } = await import('./commands/delegation.js');
        await cancelDelegation(id);
      })
  );

// Cron command
program
  .command('cron')
  .description('Manage scheduled jobs')
  .addCommand(
    new Command('create')
      .description('Create a scheduled job')
      .argument('<name>', 'Job name')
      .argument('<schedule>', 'Cron schedule (e.g. "0 2 * * *")')
      .argument('<prompt>', 'Prompt for the agent')
      .option('--skills <skills>', 'Comma-separated skills')
      .option('--model <model>', 'Model to use')
      .option('--no-agent', 'Run as script only')
      .option('--script <path>', 'Script path')
      .action(async (name, schedule, prompt, options) => {
        const { createCron } = await import('./commands/cron.js');
        await createCron(name, schedule, prompt, options);
      })
  )
  .addCommand(
    new Command('list')
      .description('List scheduled jobs')
      .action(async () => {
        const { listCron } = await import('./commands/cron.js');
        await listCron();
      })
  )
  .addCommand(
    new Command('run')
      .description('Run a job manually')
      .argument('<id>', 'Job ID')
      .action(async (id) => {
        const { runCron } = await import('./commands/cron.js');
        await runCron(id);
      })
  )
  .addCommand(
    new Command('remove')
      .description('Remove a scheduled job')
      .argument('<id>', 'Job ID')
      .action(async (id) => {
        const { removeCron } = await import('./commands/cron.js');
        await removeCron(id);
      })
  );

// Doctor command
program
  .command('doctor')
  .description('Check system health and configuration')
  .option('--verbose', 'Verbose output')
  .action(async () => {
    const { runDoctor } = await import('./commands/doctor.js');
    await runDoctor();
  });

// Init command
program
  .command('init')
  .description('Initialize CodeLES in current directory')
  .option('-f, --force', 'Force reinitialize')
  .action(async (options) => {
    const { initProject } = await import('./commands/init.js');
    await initProject(options.force);
  });

// Version command
program
  .command('version')
  .description('Show version information')
  .action(() => {
    console.log('CodeLES v1.0.0');
    console.log('AI Coding Agent with 1M Context');
    console.log('Powered by LES - Lutchi Enterprise Systems');
  });

// Error handling
program.exitOverride();

async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (error: any) {
    if (error.code === 'COMMANDER_HELP') {
      process.exit(0);
    }
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
}

main();