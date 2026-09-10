/**
 * CodeLES Chat Command - Simple Interactive Session
 */

import { providerRegistry } from '@codeles/providers';
import { toolRegistry } from '@codeles/tools';
import { CodeLESConfig, ChatMessage, StreamChunk, ToolResult } from '@codeles/core';
import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import chalk from 'chalk';
import boxen from 'boxen';

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

  console.log(boxen(
    chalk.bold.cyan('CodeLES v1.0.0') + '\n' +
    chalk.gray('AI Coding Agent with 1M Context') + '\n' +
    chalk.gray('Powered by LES') + '\n\n' +
    chalk.blue('Lutchi Enterprise Systems') + '\n' +
    chalk.gray('https://lutchi.vercel.app') + '\n\n' +
    chalk.green('Provider: ') + chalk.cyan(config.agent.defaultProvider) +
    chalk.green(' | Model: ') + chalk.cyan(config.agent.defaultModel) + '\n' +
    chalk.gray('Type "/help" for commands, "/exit" to quit'),
    { padding: 1, borderStyle: 'round', borderColor: 'cyan' }
  ));

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
      const userInput = await rl.question(chalk.cyan('\n› '));
      
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
        console.log(chalk.red(`Provider not found: ${config.agent.defaultProvider}`));
        continue;
      }

      // Initialize adapter
      const providerConfig = config.providers[config.agent.defaultProvider] || {
        name: config.agent.defaultProvider,
        type: config.agent.defaultProvider,
        enabled: true,
        priority: 10,
        models: [],
        defaultModel: config.agent.defaultModel,
        headers: {}
      };
      await adapter.initialize(providerConfig);

      // Prepare messages for API
      const apiMessages: ChatMessage[] = messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        toolCalls: m.toolCalls,
        toolCallId: m.toolCalls?.[0]?.id,
        timestamp: m.timestamp
      }));

      const tools = toolRegistry.getToolDefinitions();

      console.log(chalk.gray('\n[Thinking...]'));

      try {
        // Stream response
        let fullContent = '';
        let toolCalls: any[] = [];

        for await (const chunk of adapter.streamChat({
          messages: apiMessages,
          model: config.agent.defaultModel,
          temperature: config.agent.temperature,
          topP: config.agent.topP,
          maxTokens: config.agent.maxTokens,
          stream: true,
          tools: tools.length > 0 ? tools : undefined
        })) {
          const delta = chunk.choices[0]?.delta;
          if (delta?.content) {
            fullContent += delta.content;
            process.stdout.write(delta.content);
          }
          if (delta?.toolCalls) {
            toolCalls = delta.toolCalls;
          }
          if (chunk.choices[0]?.finishReason) {
            break;
          }
        }

        console.log(); // New line after streaming

        // Add assistant message
        const assistantMessage: ChatMessage = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: fullContent,
          timestamp: Date.now(),
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined
        };
        messages.push(assistantMessage);

        // Execute tool calls if any
        if (toolCalls.length > 0) {
          for (const tc of toolCalls) {
            try {
              const result = await toolRegistry.executeTool(tc.function.name, JSON.parse(tc.function.arguments), {
                session: {} as any,
                config,
                workingDirectory: process.cwd(),
                environmentVariables: process.env as Record<string, string>,
                memory: {} as any,
                skills: {} as any
              });
              
              const toolMessage: ChatMessage = {
                id: `tool-${Date.now()}`,
                role: 'tool',
                content: `Tool ${tc.function.name} executed: ${result.success ? 'success' : result.error || 'failed'}`,
                timestamp: Date.now()
              };
              messages.push(toolMessage);
              
              if (result.success) {
                console.log(chalk.green(`✓ Tool ${tc.function.name} completed`));
              } else {
                console.log(chalk.red(`✗ Tool ${tc.function.name} failed: ${result.error}`));
              }
            } catch (toolError) {
              console.log(chalk.red(`✗ Tool error: ${toolError}`));
            }
          }
        }

      } catch (error) {
        console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      }

    } catch (error) {
      if (error instanceof Error && error.message.includes('Aborted')) {
        isRunning = false;
      } else {
        console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      }
    }
  }

  rl.close();
  console.log(chalk.gray('\nGoodbye!'));
}

async function handleCommand(
  cmd: string, 
  config: CodeLESConfig, 
  messages: ChatMessage[],
  rl: readline.Interface
): Promise<string | void> {
  const parts = cmd.slice(1).split(' ');
  const command = parts[0];
  const args = parts.slice(1);

  switch (command) {
    case 'help':
      console.log(boxen(
        chalk.bold('Available Commands:') + '\n\n' +
        '/help          - Show this help\n' +
        '/exit          - Exit chat\n' +
        '/clear         - Clear conversation history\n' +
        '/provider      - List/switch provider\n' +
        '/model         - List/switch model\n' +
        '/tools         - List available tools\n' +
        '/memory        - Show memory stats\n' +
        '/config        - Show current config',
        { padding: 1, borderStyle: 'round', borderColor: 'cyan' }
      ));
      break;

    case 'exit':
    case 'quit':
      return 'exit';

    case 'clear':
      messages.length = 0;
      if (config.agent.systemPrompt) {
        messages.push({
          id: 'sys',
          role: 'system',
          content: config.agent.systemPrompt,
          timestamp: Date.now()
        });
      }
      console.log(chalk.green('Conversation cleared'));
      break;

    case 'provider':
      if (args[0]) {
        const adapter = providerRegistry.getAdapter(args[0]);
        if (adapter) {
          config.agent.defaultProvider = args[0];
          console.log(chalk.green(`Provider switched to: ${args[0]}`));
        } else {
          console.log(chalk.red(`Provider not found: ${args[0]}`));
        }
      } else {
        const adapters = providerRegistry.listAdapters();
        console.log(chalk.bold('Available providers:'));
        adapters.forEach(a => {
          const isDefault = a === config.agent.defaultProvider;
          console.log(`  ${isDefault ? '→' : ' '} ${a}${isDefault ? ' (default)' : ''}`);
        });
      }
      break;

    case 'model':
      if (args[0]) {
        config.agent.defaultModel = args[0];
        console.log(chalk.green(`Model switched to: ${args[0]}`));
      } else {
        const adapter = providerRegistry.getAdapter(config.agent.defaultProvider);
        if (adapter) {
          const models = await adapter.listModels();
          console.log(chalk.bold(`Models for ${config.agent.defaultProvider}:`));
          models.forEach(m => console.log(`  ${m.id} (${m.contextWindow.toLocaleString()} ctx)`));
        }
      }
      break;

    case 'tools':
      const tools = toolRegistry.listTools();
      console.log(chalk.bold('Available tools:'));
      tools.forEach(t => console.log(`  ${t.name} - ${t.description}`));
      break;

    case 'memory':
      console.log(chalk.yellow('Memory commands not fully implemented in simple chat mode'));
      break;

    case 'config':
      console.log(boxen(
        chalk.bold('Current Configuration:') + '\n\n' +
        `Provider: ${config.agent.defaultProvider}\n` +
        `Model: ${config.agent.defaultModel}\n` +
        `Max Tokens: ${config.agent.maxTokens}\n` +
        `Temperature: ${config.agent.temperature}`,
        { padding: 1, borderStyle: 'round', borderColor: 'cyan' }
      ));
      break;

    default:
      console.log(chalk.red(`Unknown command: ${command}. Type /help for help.`));
  }
}