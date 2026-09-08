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
  .hook('preAction', async (thisCommand) => {
    const opts = thisCommand.opts();
    // Load config early for all commands
    try {
      const configManager = createConfigManager(opts.profile, opts.config);
      await configManager.load();
      // Store for later use
      (global as any).codelesConfig = configManager.getConfig();
      (global as any).codelesConfigManager = configManager;
    } catch (error) {
      console.error(chalk.red('Failed to load config:'), error instanceof Error ? error.message : String(error));
    }
  });

// Chat command - main interactive mode
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
    await startChatSession(options);
  });

// Config commands
const configCmd = program
  .command('config')
  .description('Manage CodeLES configuration');

configCmd
  .command('show')
  .description('Show current configuration')
  .action(async () => {
    const { showConfig } = await import('./commands/config.js');
    await showConfig();
  });

configCmd
  .command('set <key> <value>')
  .description('Set a configuration value')
  .action(async (key, value) => {
    const { setConfig } = await import('./commands/config.js');
    await setConfig(key, value);
  });

configCmd
  .command('get <key>')
  .description('Get a configuration value')
  .action(async (key) => {
    const { getConfigValue } = await import('./commands/config.js');
    await getConfigValue(key);
  });

configCmd
  .command('reset')
  .description('Reset configuration to defaults')
  .action(async () => {
    const { resetConfig } = await import('./commands/config.js');
    await resetConfig();
  });

configCmd
  .command('edit')
  .description('Open config file in editor')
  .action(async () => {
    const { editConfig } = await import('./commands/config.js');
    await editConfig();
  });

// Provider commands
const providerCmd = program
  .command('provider')
  .description('Manage AI providers');

providerCmd
  .command('list')
  .description('List available providers')
  .action(async () => {
    const { listProviders } = await import('./commands/provider.js');
    await listProviders();
  });

providerCmd
  .command('add <name>')
  .description('Add a new provider')
  .option('-t, --type <type>', 'Provider type (openai, anthropic, openrouter, google, cohere, mistral, groq, together, nvidia, custom)')
  .option('-k, --api-key <key>', 'API key')
  .option('-u, --base-url <url>', 'Base URL (for custom providers)')
  .option('-m, --model <model>', 'Default model')
  .action(async (name, options) => {
    const { addProvider } = await import('./commands/provider.js');
    await addProvider(name, options);
  });

providerCmd
  .command('remove <name>')
  .description('Remove a provider')
  .action(async (name) => {
    const { removeProvider } = await import('./commands/provider.js');
    await removeProvider(name);
  });

providerCmd
  .command('test <name>')
  .description('Test provider connection')
  .action(async (name) => {
    const { testProvider } = await import('./commands/provider.js');
    await testProvider(name);
  });

providerCmd
  .command('models <name>')
  .description('List models for a provider')
  .action(async (name) => {
    const { listModels } = await import('./commands/provider.js');
    await listModels(name);
  });

// Tools commands
const toolsCmd = program
  .command('tools')
  .description('Manage tools');

toolsCmd
  .command('list')
  .description('List available tools')
  .action(async () => {
    const { listTools } = await import('./commands/tools.js');
    await listTools();
  });

toolsCmd
  .command('enable <name>')
  .description('Enable a tool')
  .action(async (name) => {
    const { enableTool } = await import('./commands/tools.js');
    await enableTool(name);
  });

toolsCmd
  .command('disable <name>')
  .description('Disable a tool')
  .action(async (name) => {
    const { disableTool } = await import('./commands/tools.js');
    await disableTool(name);
  });

// Skills commands
const skillsCmd = program
  .command('skills')
  .description('Manage skills');

skillsCmd
  .command('list')
  .description('List available skills')
  .action(async () => {
    const { listSkills } = await import('./commands/skills.js');
    await listSkills();
  });

skillsCmd
  .command('load <name> <path>')
  .description('Load a skill from path')
  .action(async (name, path) => {
    const { loadSkill } = await import('./commands/skills.js');
    await loadSkill(name, path);
  });

skillsCmd
  .command('unload <name>')
  .description('Unload a skill')
  .action(async (name) => {
    const { unloadSkill } = await import('./commands/skills.js');
    await unloadSkill(name);
  });

// Memory commands
const memoryCmd = program
  .command('memory')
  .description('Manage memory');

memoryCmd
  .command('add <target> <content>')
  .description('Add memory entry (target: user|memory)')
  .action(async (target, content) => {
    const { addMemory } = await import('./commands/memory.js');
    await addMemory(target, content);
  });

memoryCmd
  .command('search <target> <query>')
  .description('Search memory (target: user|memory)')
  .option('-l, --limit <limit>', 'Max results', '10')
  .action(async (target, query, options) => {
    const { searchMemory } = await import('./commands/memory.js');
    await searchMemory(target, query, parseInt(options.limit));
  });

memoryCmd
  .command('list <target>')
  .description('List memory entries (target: user|memory)')
  .option('-l, --limit <limit>', 'Max results', '20')
  .action(async (target, options) => {
    const { listMemory } = await import('./commands/memory.js');
    await listMemory(target, parseInt(options.limit));
  });

memoryCmd
  .command('clear <target>')
  .description('Clear memory (target: user|memory)')
  .action(async (target) => {
    const { clearMemory } = await import('./commands/memory.js');
    await clearMemory(target);
  });

// Session commands
const sessionCmd = program
  .command('session')
  .description('Manage chat sessions');

sessionCmd
  .command('list')
  .description('List sessions')
  .action(async () => {
    const { listSessions } = await import('./commands/session.js');
    await listSessions();
  });

sessionCmd
  .command('new [title]')
  .description('Start new session')
  .action(async (title) => {
    const { newSession } = await import('./commands/session.js');
    await newSession(title);
  });

sessionCmd
  .command('load <id>')
  .description('Load a session')
  .action(async (id) => {
    const { loadSession } = await import('./commands/session.js');
    await loadSession(id);
  });

sessionCmd
  .command('delete <id>')
  .description('Delete a session')
  .action(async (id) => {
    const { deleteSession } = await import('./commands/session.js');
    await deleteSession(id);
  });

// Delegation commands
const delegationCmd = program
  .command('delegate')
  .description('Manage task delegation');

delegationCmd
  .command('spawn <goal>')
  .description('Spawn a subagent for a task')
  .option('-c, --context <context>', 'Task context')
  .option('-r, --role <role>', 'Agent role (leaf|orchestrator)', 'leaf')
  .action(async (goal, options) => {
    const { spawnDelegation } = await import('./commands/delegation.js');
    await spawnDelegation(goal, options);
  });

delegationCmd
  .command('batch')
  .description('Spawn multiple subagents in parallel')
  .option('-f, --file <file>', 'JSON file with tasks')
  .action(async (options) => {
    const { batchDelegation } = await import('./commands/delegation.js');
    await batchDelegation(options);
  });

delegationCmd
  .command('list')
  .description('List active delegations')
  .action(async () => {
    const { listDelegations } = await import('./commands/delegation.js');
    await listDelegations();
  });

delegationCmd
  .command('cancel <id>')
  .description('Cancel a delegation')
  .action(async (id) => {
    const { cancelDelegation } = await import('./commands/delegation.js');
    await cancelDelegation(id);
  });

// Cron commands
const cronCmd = program
  .command('cron')
  .description('Manage scheduled jobs');

cronCmd
  .command('create <name> <schedule> <prompt>')
  .description('Create a cron job')
  .option('-s, --skills <skills>', 'Comma-separated skills')
  .option('-m, --model <model>', 'Model to use')
  .option('--no-agent', 'Run as script only (no agent)')
  .option('--script <script>', 'Script path for no-agent mode')
  .action(async (name, schedule, prompt, options) => {
    const { createCron } = await import('./commands/cron.js');
    await createCron(name, schedule, prompt, options);
  });

cronCmd
  .command('list')
  .description('List cron jobs')
  .action(async () => {
    const { listCron } = await import('./commands/cron.js');
    await listCron();
  });

cronCmd
  .command('remove <id>')
  .description('Remove a cron job')
  .action(async (id) => {
    const { removeCron } = await import('./commands/cron.js');
    await removeCron(id);
  });

cronCmd
  .command('run <id>')
  .description('Run a cron job manually')
  .action(async (id) => {
    const { runCron } = await import('./commands/cron.js');
    await runCron(id);
  });

// Doctor command
program
  .command('doctor')
  .description('Check system health and configuration')
  .action(async () => {
    const { runDoctor } = await import('./commands/doctor.js');
    await runDoctor();
  });

// Init command
program
  .command('init')
  .description('Initialize CodeLES in current directory')
  .option('-f, --force', 'Overwrite existing config')
  .action(async (options) => {
    const { initProject } = await import('./commands/init.js');
    await initProject(options.force);
  });

// Version info
program
  .command('version')
  .description('Show version information')
  .action(() => {
    console.log(boxen(
      chalk.bold.cyan('CodeLES v1.0.0') + '\n' +
      chalk.gray('AI Coding Agent with 1M Context') + '\n' +
      chalk.gray('Powered by NVIDIA Nemotron 3 Ultra') + '\n\n' +
      chalk.blue('Lutchi Enterprise Systems') + '\n' +
      chalk.gray('https://lutchi.vercel.app'),
      { padding: 1, borderStyle: 'round', borderColor: 'cyan' }
    ));
  });

// Help customization
program.addHelpText('after', `
${chalk.bold('Examples:')}
  $ codeles chat                    # Start interactive chat
  $ codeles chat -m gpt-4o          # Use specific model
  $ codeles provider add my-openai -t openai -k sk-... -m gpt-4o
  $ codeles config set agent.temperature 0.5
  $ codeles memory add user "Prefiro TypeScript estrito"
  $ codeles delegate spawn "Refatorar auth module" -c "Usar JWT"
  $ codeles cron create daily-backup "0 2 * * *" "Fazer backup do projeto"

${chalk.bold('Default Provider:')} NVIDIA Nemotron 3 Ultra (1M context, zero-config)
${chalk.bold('Config:')} ~/.codeles/profiles/default/config.yaml
`);

// Error handling
program.exitOverride();

async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (error: any) {
    if (error.code === 'COMMANDER_HELP') {
      process.exit(0);
    }
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }

  // Show help if no command provided
  if (!process.argv.slice(2).length) {
    program.outputHelp();
    console.log();
  }
}

main();