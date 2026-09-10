/**
 * CodeLES Chat Command - Simple Interactive Session
 */

import { providerRegistry } from '@codeles/providers';
import { toolRegistry } from '@codeles/tools';
import { CodeLESConfig, ChatMessage, StreamChunk, ToolCall, ToolDefinition } from '@codeles/core';
import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import chalk from 'chalk';
import { getWelcomeBox, getPrompt, getHelpText } from '../ui/banner.js';

export async function startChatSession(options: {
  model?: string;
  provider?: string;
  systemPrompt?: string;
  maxTokens?: string;
  temperature?: string;
}) {
  const { createConfigManager } = await import('@codeles/core/config');
  const configManager = createConfigManager('default');
  const config = await configManager.load();

  // Apply CLI overrides
  if (options.model) config.agent.defaultModel = options.model;
  if (options.provider) config.agent.defaultProvider = options.provider;
  if (options.systemPrompt) config.agent.systemPrompt = options.systemPrompt;
  if (options.maxTokens) config.agent.maxTokens = parseInt(options.maxTokens);
  if (options.temperature) config.agent.temperature = parseFloat(options.temperature);

  // Initialize tools
  await toolRegistry.initializeAllTools();

  // Show beautiful welcome banner
  console.log(getWelcomeBox());
  console.log(`  ${chalk.gray('Provider:')} ${chalk.cyan(config.agent.defaultProvider)}  ${chalk.gray('| Model:')} ${chalk.cyan(config.agent.defaultModel)}`);
  console.log(`  ${chalk.gray('Type')} ${chalk.cyan('/help')} ${chalk.gray('for commands,')} ${chalk.cyan('/exit')} ${chalk.gray('to quit')}\n`);

  const rl = readline.createInterface({ input, output });
  const messages: ChatMessage[] = [];
  let isRunning = true;

  // Add system prompt if provided
  if (config.agent.systemPrompt) {
    messages.push({
      id: 'sys',
      role: 'system',
      content: config.agent.systemPrompt,
      timestamp: Date.now()
    });
  }

  while (isRunning) {
    try {
      const userInput = await rl.question(getPrompt(config.agent.defaultProvider, config.agent.defaultModel));
      
      if (!userInput.trim()) continue;

      // Handle internal commands
      if (userInput.startsWith('/')) {
        const handled = await handleCommand(userInput.trim(), config, messages, rl);
        if (handled === 'exit') {
          isRunning = false;
          break;
        }
        continue;
      }

      // Add user message
      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content: userInput.trim(),
        timestamp: Date.now()
      };
      messages.push(userMessage);

      // Get provider adapter
      const adapter = providerRegistry.getAdapter(config.agent.defaultProvider);
      if (!adapter) {
        console.log(chalk.red(`Provider ${config.agent.defaultProvider} not found`));
        continue;
      }

      // Initialize adapter with config
      await adapter.initialize(config.providers[config.agent.defaultProvider] || {
        name: config.agent.defaultProvider,
        type: config.agent.defaultProvider,
        enabled: true,
        priority: 10,
        apiKey: undefined,
        defaultModel: config.agent.defaultModel,
        models: []
      });

      // Show thinking indicator
      process.stdout.write(chalk.gray('\n[Thinking...]\n'));

      // Stream response
      let fullResponse = '';
      let hasToolCalls = false;
      let toolCalls: ToolCall[] = [];

      try {
        // Get tool definitions for the provider
        const toolDefs = toolRegistry.getToolDefinitions();
        
        for await (const chunk of adapter.streamChat({
          model: config.agent.defaultModel,
          messages: messages.map(m => ({ role: m.role, content: m.content, id: m.id, timestamp: m.timestamp })),
          temperature: config.agent.temperature,
          maxTokens: config.agent.maxTokens,
          tools: toolDefs,
          stream: true
        })) {
          if (chunk.choices[0]?.delta?.content) {
            const content = chunk.choices[0].delta.content;
            fullResponse += content;
            process.stdout.write(content);
          }
          
          if (chunk.choices[0]?.delta?.toolCalls) {
            hasToolCalls = true;
            toolCalls = chunk.choices[0].delta.toolCalls;
          }

          if (chunk.choices[0]?.finishReason) {
            // Response complete
          }
        }
      } catch (error) {
        process.stdout.write(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}\n`));
        continue;
      }

      process.stdout.write('\n');

      // Add assistant message to history
      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: fullResponse,
        toolCalls: hasToolCalls ? toolCalls : undefined,
        timestamp: Date.now()
      };
      messages.push(assistantMessage);

    } catch (error) {
      if (error instanceof Error && error.message === 'Aborted') {
        break;
      }
      console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  rl.close();
  console.log(chalk.gray('\nAté logo! 👋\n'));
}

async function handleCommand(command: string, config: CodeLESConfig, messages: ChatMessage[], rl: any): Promise<string | void> {
  const parts = command.split(' ');
  const cmd = parts[0].toLowerCase();

  switch (cmd) {
    case '/help':
      console.log(getHelpText());
      break;

    case '/exit':
      return 'exit';

    case '/clear':
      messages.length = 0;
      console.log(chalk.green('✓ Histórico da conversa limpo'));
      break;

    case '/provider':
      if (parts[1] === 'list') {
        const providers = Object.keys(config.providers);
        console.log(chalk.bold('\nProviders configurados:'));
        for (const p of providers) {
          const prov = config.providers[p];
          const marker = p === config.agent.defaultProvider ? chalk.cyan(' →') : '';
          console.log(`  ${prov.enabled ? chalk.green('●') : chalk.red('○')} ${chalk.cyan(p)}${marker} (${prov.type}) - ${prov.defaultModel}`);
        }
      } else {
        console.log(chalk.yellow('Uso: /provider list'));
      }
      break;

    case '/model':
      console.log(chalk.yellow('Modelo atual: ') + chalk.cyan(config.agent.defaultModel));
      console.log(chalk.gray('Para trocar: codeles chat --model <modelo>'));
      break;

    case '/tools':
      const tools = toolRegistry.listTools();
      console.log(chalk.bold('\nFerramentas disponíveis:'));
      for (const tool of tools) {
        const enabled = config.tools[tool.name]?.enabled;
        console.log(`  ${enabled ? chalk.green('●') : chalk.red('○')} ${chalk.cyan(tool.name)} - ${tool.description}`);
      }
      break;

    case '/memory':
      const { createConfigManager } = await import('@codeles/core/config');
      const manager = createConfigManager('default');
      const cfg = await manager.load();
      console.log(chalk.bold('\nMemória:'));
      console.log(`  ${cfg.memory.enabled ? chalk.green('Ativada') : chalk.red('Desativada')}`);
      console.log(`  Path: ${cfg.memory.path}`);
      console.log(`  Max entries: ${cfg.memory.maxEntries}`);
      break;

    case '/config':
      console.log(chalk.bold('\nConfiguração Atual:'));
      console.log(`  Provider: ${chalk.cyan(config.agent.defaultProvider)}`);
      console.log(`  Modelo: ${chalk.cyan(config.agent.defaultModel)}`);
      console.log(`  Max Tokens: ${config.agent.maxTokens}`);
      console.log(`  Temperature: ${config.agent.temperature}`);
      console.log(`  System Prompt: ${config.agent.systemPrompt ? 'Definido' : 'Nenhum'}`);
      break;

    default:
      console.log(chalk.yellow(`Comando desconhecido: ${cmd}. Use /help para ver comandos disponíveis.`));
  }
}