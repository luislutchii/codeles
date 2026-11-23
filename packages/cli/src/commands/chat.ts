/**
 * CodeLES Chat Command - Advanced Interactive Session with Raw Mode
 */

import { providerRegistry } from '@codeles/providers';
import { toolRegistry } from '@codeles/tools';
import { CodeLESConfig, ChatMessage, StreamChunk, ToolCall, ToolDefinition } from '@codeles/core';
import * as readlinePromises from 'readline/promises';
import * as readline from 'readline';
import { stdin as input, stdout as output } from 'process';
import * as tty from 'tty';
import chalk from 'chalk';
import { getWelcomeBox, getPrompt, getHelpText, getStatusBar, COMMAND_SUGGESTIONS } from '../ui/banner.js';
import { runConfigWizard } from './config-interactive.js';

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

  // Check if we have a valid provider configured
  const hasValidProvider = config.agent.defaultProvider &&
                          config.providers[config.agent.defaultProvider] &&
                          config.providers[config.agent.defaultProvider].apiKey;

  // If no valid provider, run the configuration wizard
  if (!hasValidProvider) {
    console.log(chalk.yellow('⚠ Nenhum provider configurado. Iniciando assistente de configuração...\n'));
    await runConfigWizard();
    // Reload config after wizard
    const updatedConfig = await configManager.load();
    // Apply CLI overrides again after wizard
    if (options.model) updatedConfig.agent.defaultModel = options.model;
    if (options.provider) updatedConfig.agent.defaultProvider = options.provider;
    if (options.systemPrompt) updatedConfig.agent.systemPrompt = options.systemPrompt;
    if (options.maxTokens) updatedConfig.agent.maxTokens = parseInt(options.maxTokens);
    if (options.temperature) updatedConfig.agent.temperature = parseFloat(options.temperature);
    console.log(chalk.green('✓ Configuração atualizada!\n'));
  }

  // Show beautiful welcome banner
  console.log(getWelcomeBox());
  console.log(`  ${chalk.gray('Type')} ${chalk.cyan('/help')} ${chalk.gray('for commands,')} ${chalk.cyan('/exit')} ${chalk.gray('to quit')}\n`);

  const messages: ChatMessage[] = [];

  // Add system prompt if provided
  if (config.agent.systemPrompt) {
    messages.push({
      id: 'sys',
      role: 'system',
      content: config.agent.systemPrompt,
      timestamp: Date.now()
    });
  }

  // Check if we're in an interactive TTY
  const isTTY = tty.isatty(process.stdin.fd) && tty.isatty(process.stdout.fd);

  if (isTTY) {
    // Interactive mode with raw input handling and command popup
    await runInteractiveMode(config, messages);
  } else {
    // Non-interactive mode (piped input) - read all input first, then process
    await runSimpleMode(config, messages);
  }
}

async function runInteractiveMode(config: CodeLESConfig, messages: ChatMessage[]) {
  // Create readline interface for output handling
  const rl = readlinePromises.createInterface({
    input,
    output,
    terminal: true
  });

  // Enable raw mode to capture keypresses
  process.stdin.setRawMode(true);
  process.stdin.resume();

  let isRunning = true;
  let isResponding = false;
  let isDone = false;
  let responseStartTime = 0;
  const sessionStartTime = Date.now();
  let tokensUsed = 0;
  const tokensMax = config.agent.maxTokens || 1000000;
  let toolsCount = 0;

  // State for input handling
  let inputBuffer = '';
  let inCommandMode = false;
  let selectedCommandIndex = 0;
  let filteredCommands = COMMAND_SUGGESTIONS;
  let commandModeStarted = false;

  // Timer for updating status bar in real-time (only when not actively streaming)
  let statusTimer: NodeJS.Timeout | null = null;
  let isStreamingContent = false;

  const startStatusTimer = () => {
    if (statusTimer) clearInterval(statusTimer);
    statusTimer = setInterval(() => {
      if (!isRunning || isStreamingContent) {
        return;
      }
      renderLine();
    }, 1000);
  };

  const stopStatusTimer = () => {
    if (statusTimer) {
      clearInterval(statusTimer);
      statusTimer = null;
    }
  };

  // Track rendered lines for efficient updates
  let menuRendered = false;
  let lastMenuLineCount = 0;

  // Function to render the prompt, status bar, and current input
  const renderLine = () => {
    // Calculate session elapsed time
    const sessionElapsedMs = Date.now() - sessionStartTime;

    // Calculate response elapsed time
    let responseElapsedMs = 0;
    if (isResponding && responseStartTime > 0) {
      responseElapsedMs = Date.now() - responseStartTime;
    }

    // Show status bar (Hermes-style)
    const statusBar = getStatusBar({
      model: config.agent.defaultModel,
      tokensUsed,
      tokensMax,
      toolsCount,
      sessionElapsedMs,
      responseElapsedMs,
      isResponding,
      isDone
    });

    // Clear current line and move to beginning
    readline.cursorTo(output, 0);
    readline.clearLine(output, 0);
    output.write(statusBar + '\n');

    // Show prompt
    const promptText = getPrompt(config.agent.defaultProvider, config.agent.defaultModel);
    output.write(promptText);

    if (inCommandMode) {
      if (!commandModeStarted) {
        // First time entering command mode - render full menu
        commandModeStarted = true;
        output.write('\n');
        output.write(chalk.gray('─'.repeat(56)) + '\n');
        output.write(chalk.bold.cyan('  COMANDOS DISPONÍVEIS') + '\n');
        output.write(chalk.gray('─'.repeat(56)) + '\n');

        // Group by category
        const categories = [...new Set(filteredCommands.map(c => c.category))];
        let lineCount = 0;
        categories.forEach((cat, catIdx) => {
          const catCommands = filteredCommands.filter(c => c.category === cat);
          output.write(chalk.gray(`  ${cat}:`) + '\n');
          lineCount++;
          catCommands.forEach((cmd, idx) => {
            const globalIdx = filteredCommands.indexOf(cmd);
            if (globalIdx === selectedCommandIndex) {
              output.write(chalk.cyan(`    ▸ ${cmd.name}`) + chalk.gray(` - ${cmd.description}`) + '\n');
            } else {
              output.write(chalk.gray(`      ${cmd.name}`) + chalk.gray(` - ${cmd.description}`) + '\n');
            }
            lineCount++;
          });
        });
        lastMenuLineCount = lineCount + 3; // category lines + command lines + separators

        output.write(chalk.gray('─'.repeat(56)) + '\n');
        output.write(chalk.gray('  ↑/↓ navega  •  Enter seleciona  •  ESC/Q cancela') + '\n');
        output.write(chalk.gray('─'.repeat(56)) + '\n');
      } else {
        // Re-render menu by moving cursor up and clearing menu area
        // Move cursor up to the line after status bar (menu starts 2 lines after status bar)
        readline.cursorTo(output, 0);
        readline.moveCursor(output, 0, - (lastMenuLineCount + 2)); // -2 for prompt line and status bar

        // Clear menu lines
        for (let i = 0; i < lastMenuLineCount + 2; i++) {
          readline.clearLine(output, 0);
          if (i < lastMenuLineCount + 1) readline.moveCursor(output, 0, 1);
        }

        // Go back to menu start
        readline.cursorTo(output, 0);
        readline.moveCursor(output, 0, - (lastMenuLineCount + 2));

        // Re-render menu
        output.write(chalk.gray('─'.repeat(56)) + '\n');
        output.write(chalk.bold.cyan('  COMANDOS DISPONÍVEIS') + '\n');
        output.write(chalk.gray('─'.repeat(56)) + '\n');

        let lineCount = 0;
        const categories = [...new Set(filteredCommands.map(c => c.category))];
        categories.forEach((cat, catIdx) => {
          const catCommands = filteredCommands.filter(c => c.category === cat);
          output.write(chalk.gray(`  ${cat}:`) + '\n');
          lineCount++;
          catCommands.forEach((cmd, idx) => {
            const globalIdx = filteredCommands.indexOf(cmd);
            if (globalIdx === selectedCommandIndex) {
              output.write(chalk.cyan(`    ▸ ${cmd.name}`) + chalk.gray(` - ${cmd.description}`) + '\n');
            } else {
              output.write(chalk.gray(`      ${cmd.name}`) + chalk.gray(` - ${cmd.description}`) + '\n');
            }
            lineCount++;
          });
        });
        lastMenuLineCount = lineCount + 3;

        output.write(chalk.gray('─'.repeat(56)) + '\n');
        output.write(chalk.gray('  ↑/↓ navega  •  Enter seleciona  •  ESC/Q cancela') + '\n');
        output.write(chalk.gray('─'.repeat(56)) + '\n');
      }

      // Re-show the prompt and buffer on the line after the popup
      output.write(promptText + inputBuffer);
    } else {
      // Normal mode: show current input
      if (commandModeStarted) {
        // We were in command mode, need to clear the menu area
        commandModeStarted = false;
        // Clear the menu lines by moving up and clearing
        readline.cursorTo(output, 0);
        // Move up past the menu
        readline.moveCursor(output, 0, - (lastMenuLineCount + 3));
        for (let i = 0; i < lastMenuLineCount + 3; i++) {
          readline.clearLine(output, 0);
          readline.cursorTo(output, 0);
          if (i < lastMenuLineCount + 2) readline.moveCursor(output, 0, 1);
        }
        // Go back to prompt line
        readline.cursorTo(output, 0);
        readline.clearLine(output, 0);
        output.write(statusBar + '\n');
        output.write(promptText + inputBuffer);
      } else {
        output.write(inputBuffer);
      }
    }
  };

  // Filter commands based on input buffer
  const filterCommands = (query: string) => {
    if (!query || query === '/') {
      filteredCommands = COMMAND_SUGGESTIONS;
    } else {
      const lowerQuery = query.toLowerCase();
      filteredCommands = COMMAND_SUGGESTIONS.filter(cmd =>
        cmd.name.toLowerCase().includes(lowerQuery) ||
        cmd.description.toLowerCase().includes(lowerQuery)
      );
    }
    selectedCommandIndex = 0;
  };

  // Function to handle a keypress
  const handleKey = (key: string) => {
    if (key === '\u0003') { // Ctrl+C
      isRunning = false;
      stopStatusTimer();
      rl.close();
      return;
    }

    if (inCommandMode) {
      // Handle command mode navigation
      if (key === '\u001b[A' || key === 'k' || key === 'w') { // Up
        selectedCommandIndex = Math.max(0, selectedCommandIndex - 1);
        renderLine();
      } else if (key === '\u001b[B' || key === 'j' || key === 's') { // Down
        selectedCommandIndex = Math.min(filteredCommands.length - 1, selectedCommandIndex + 1);
        renderLine();
      } else if (key === '\r' || key === '\n') { // Enter
        // Select the command and exit command mode
        if (filteredCommands.length > 0) {
          const selectedCommand = filteredCommands[selectedCommandIndex].name;
          inputBuffer = selectedCommand;
        }
        inCommandMode = false;
        selectedCommandIndex = 0;
        renderLine();
        // Simulate Enter to submit the line
        submitLine();
      } else if (key === '\u001b' || key === 'q') { // ESC or q
        // Exit command mode
        inCommandMode = false;
        selectedCommandIndex = 0;
        inputBuffer = '';
        filterCommands('');
        renderLine();
      } else if (key === '\u007f' || key === '\b' || key === '\x08') { // Backspace
              if (inputBuffer.length > 0) {
                inputBuffer = inputBuffer.slice(0, -1);
                filterCommands(inputBuffer);
                // Exit command mode if buffer is empty or no longer starts with "/"
                if (inputBuffer.length === 0 || !inputBuffer.startsWith('/')) {
                  inCommandMode = false;
                  selectedCommandIndex = 0;
                  filterCommands('');
                }
                renderLine();
              } else {
                // Exit command mode if buffer is empty
                inCommandMode = false;
                selectedCommandIndex = 0;
                filterCommands('');
                renderLine();
              }
      } else if (key.length === 1 && key >= ' ' && key <= '~') { // Printable characters
        inputBuffer += key;
        filterCommands(inputBuffer);
        renderLine();
      }
    } else {
      // Handle normal mode
      if (key === '\r') { // Enter (Carriage Return) - ignore \n (Line Feed) to prevent double submit
        submitLine();
      } else if (key === '\n') {
        // Ignore Line Feed - already handled by Carriage Return in raw mode
      } else if (key === '\u007f' || key === '\b' || key === '\x08') { // Backspace
        if (inputBuffer.length > 0) {
          inputBuffer = inputBuffer.slice(0, -1);
          renderLine();
        }
      } else if (key === '/') {
        // Enter command mode when '/' is pressed
        inCommandMode = true;
        selectedCommandIndex = 0;
        inputBuffer = '/';
        filterCommands('/');
        renderLine();
      } else if (key.length === 1 && key >= ' ' && key <= '~') { // Printable characters
        inputBuffer += key;
        renderLine();
      }
      // Ignore other keys (like arrow keys in normal mode)
    }
  };

  // Function to submit the current line (simulate Enter)
  const submitLine = async () => {
    if (!isRunning) return;

    // Move to next line after the prompt
    output.write('\n');

    const userInput = inputBuffer;
    inputBuffer = '';
    inCommandMode = false;
    selectedCommandIndex = 0;
    filterCommands('');

    // Process the input
    if (!userInput.trim()) {
      // If empty, just re-prompt
      renderLine();
      return;
    }

    // Handle internal commands
    if (userInput.startsWith('/')) {
      const handled = await handleCommand(userInput.trim(), config, messages);
      if (handled === 'exit') {
        isRunning = false;
        stopStatusTimer();
        process.stdin.setRawMode(false);
        rl.close();
        console.log(chalk.gray('\nAté logo! 👋\n'));
        return;
      }
      // After handling command, re-prompt
      renderLine();
      return;
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
      renderLine();
      return;
    }

    // Get provider config - should exist from config load
    const providerConfig = config.providers[config.agent.defaultProvider];
    if (!providerConfig) {
      console.log(chalk.red(`Configuration for provider ${config.agent.defaultProvider} not found`));
      renderLine();
      return;
    }

    // Initialize adapter with config
    await adapter.initialize(providerConfig);

    // Stream response
    let fullResponse = '';
    let hasToolCalls = false;
    let toolCalls: ToolCall[] = [];
    isResponding = true;
    isDone = false;
    responseStartTime = Date.now();
    tokensUsed = 0;
    toolsCount = 0;
    startStatusTimer();

    const stream = adapter.streamChat({
      model: config.agent.defaultModel,
      messages: messages.map(m => ({ role: m.role, content: m.content, id: m.id, timestamp: m.timestamp })),
      temperature: config.agent.temperature,
      maxTokens: config.agent.maxTokens,
      tools: toolRegistry.getToolDefinitions(),
      stream: true
    });

    try {
      isStreamingContent = true;
      for await (const chunk of stream) {
        if (chunk.choices[0]?.delta?.content) {
          const content = chunk.choices[0].delta.content;
          fullResponse += content;
          tokensUsed += content.length / 4; // Rough token estimate
          output.write(content);
          // Don't call renderLine() here - let the timer update status bar
        }

        if (chunk.choices[0]?.delta?.toolCalls) {
          hasToolCalls = true;
          toolCalls = chunk.choices[0].delta.toolCalls;
          toolsCount = toolCalls.length;
        }

        if (chunk.choices[0]?.finishReason) {
          // Response complete
        }
      }
      isStreamingContent = false;

      output.write('\n');
      isResponding = false;
      isDone = true;
      stopStatusTimer();

      // Add assistant message to history
      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: fullResponse,
        toolCalls: hasToolCalls ? toolCalls : undefined,
        timestamp: Date.now()
      };
      messages.push(assistantMessage);

      // Show done state briefly, then reset
      renderLine();

      // Reset done state after a short delay
      setTimeout(() => {
        if (isRunning) {
          isDone = false;
          tokensUsed = 0;
          toolsCount = 0;
          renderLine();
        }
      }, 2000);
    } catch (error: unknown) {
      isResponding = false;
      isDone = false;
      stopStatusTimer();
      const errMsg = error instanceof Error ? error.message : String(error);
      output.write(chalk.red(`\nError: ${errMsg}\n`));
      renderLine();
    }
  };

  // Initial render
  renderLine();

  // Keypress handler
  process.stdin.on('data', (key) => {
    handleKey(key.toString());
  });

  // Wait until isRunning becomes false
  while (isRunning) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Clean up
  stopStatusTimer();
  process.stdin.setRawMode(false);
  rl.close();
}

async function runSimpleMode(config: CodeLESConfig, messages: ChatMessage[]) {
  // Read all input from stdin first (for piped input)
  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    chunks.push(chunk);
  }
  const allInput = Buffer.concat(chunks).toString('utf8').trim();

  if (!allInput) {
    console.log(chalk.gray('\nNenhuma entrada fornecida. Use codeles chat para modo interativo.\n'));
    return;
  }

  // Split by lines and process each line
  const lines = allInput.split('\n').filter(line => line.trim() !== '');

  for (const userInput of lines) {
    // Handle internal commands
    if (userInput.startsWith('/')) {
      const handled = await handleCommand(userInput.trim(), config, messages);
      if (handled === 'exit') {
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

    // Get provider config - should exist from config load
    const providerConfig = config.providers[config.agent.defaultProvider];
    if (!providerConfig) {
      console.log(chalk.red(`Configuration for provider ${config.agent.defaultProvider} not found`));
      continue;
    }

    // Initialize adapter with config
    await adapter.initialize(providerConfig);

    // Stream response
    let fullResponse = '';
    let hasToolCalls = false;
    let toolCalls: ToolCall[] = [];

    try {
      const stream = adapter.streamChat({
        model: config.agent.defaultModel,
        messages: messages.map(m => ({ role: m.role, content: m.content, id: m.id, timestamp: m.timestamp })),
        temperature: config.agent.temperature,
        maxTokens: config.agent.maxTokens,
        tools: toolRegistry.getToolDefinitions(),
        stream: true
      });

      for await (const chunk of stream) {
        if (chunk.choices[0]?.delta?.content) {
          const content = chunk.choices[0].delta.content;
          fullResponse += content;
          output.write(content);
        }

        if (chunk.choices[0]?.delta?.toolCalls) {
          hasToolCalls = true;
          toolCalls = chunk.choices[0].delta.toolCalls;
        }

        if (chunk.choices[0]?.finishReason) {
          // Response complete
        }
      }

      output.write('\n');

      // Add assistant message to history
      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: fullResponse,
        toolCalls: hasToolCalls ? toolCalls : undefined,
        timestamp: Date.now()
      };
      messages.push(assistantMessage);

    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      output.write(chalk.red(`\nError: ${errMsg}\n`));
    }
  }

  console.log(chalk.gray('\nAté logo! 👋\n'));
}

async function handleCommand(command: string, config: CodeLESConfig, messages: ChatMessage[]): Promise<string | void> {
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
      } else if (parts[1] === 'add') {
        console.log(chalk.yellow('Use: codeles config wizard para adicionar providers'));
      } else if (parts[1] === 'remove') {
        console.log(chalk.yellow('Use: codeles config wizard para remover providers'));
      } else {
        console.log(chalk.yellow('Uso: /provider list | add | remove'));
      }
      break;

    case '/model':
      if (parts[1] === 'list' || parts[1] === 'select') {
        // Show model picker - fetch from provider adapter
        console.log(chalk.bold('\nModelos disponíveis para ' + chalk.cyan(config.agent.defaultProvider) + ':'));

        // Try to get models from provider adapter
        const adapter = providerRegistry.getAdapter(config.agent.defaultProvider);
        if (adapter && typeof adapter.listModels === 'function') {
          try {
            const models = await adapter.listModels();
            if (models && models.length > 0) {
              models.forEach((m: any, i: number) => {
                const marker = m.id === config.agent.defaultModel ? chalk.cyan(' →') : '';
                const ctxInfo = m.contextWindow ? chalk.gray(` (${m.contextWindow.toLocaleString()} ctx)`) : '';
                console.log(`  ${i + 1}. ${chalk.cyan(m.id)}${ctxInfo}${marker}`);
              });
            } else {
              console.log(chalk.gray('  Nenhum modelo disponível'));
            }
          } catch (error) {
            console.log(chalk.gray('  Erro ao buscar modelos: ') + chalk.red(String(error)));
            console.log(chalk.gray('  Modelo atual: ') + chalk.cyan(config.agent.defaultModel));
          }
        } else {
          // Fallback to config models
          const providerConfig = config.providers[config.agent.defaultProvider];
          if (providerConfig && providerConfig.models && providerConfig.models.length > 0) {
            providerConfig.models.forEach((m: any, i: number) => {
              const marker = m.id === config.agent.defaultModel ? chalk.cyan(' →') : '';
              console.log(`  ${i + 1}. ${chalk.cyan(m.id)}${marker}`);
            });
          } else {
            console.log(chalk.gray('  Nenhum modelo listado na configuração'));
            console.log(chalk.gray('  Modelo atual: ') + chalk.cyan(config.agent.defaultModel));
          }
        }
        console.log(chalk.gray('\nUse: codeles chat --model <modelo> para trocar'));
      } else {
        console.log(chalk.yellow('Modelo atual: ') + chalk.cyan(config.agent.defaultModel));
        console.log(chalk.gray('Comandos: /model list | /model select'));
        console.log(chalk.gray('Para trocar: codeles chat --model <modelo>'));
      }
      break;

    case '/tools':
      if (parts[1] === 'enable' || parts[1] === 'disable') {
        console.log(chalk.yellow('Use: codeles config wizard para gerenciar ferramentas'));
      } else {
        const tools = toolRegistry.listTools();
        console.log(chalk.bold('\nFerramentas disponíveis:'));
        for (const tool of tools) {
          const enabled = config.tools[tool.name]?.enabled;
          console.log(`  ${enabled ? chalk.green('●') : chalk.red('○')} ${chalk.cyan(tool.name)} - ${tool.description}`);
        }
      }
      break;

    case '/memory':
      if (parts[1] === 'clear') {
        const { createConfigManager } = await import('@codeles/core/config');
        const manager = createConfigManager('default');
        const cfg = await manager.load();
        // Would need to implement memory clearing
        console.log(chalk.yellow('Memória limpa (funcionalidade a implementar)'));
      } else {
        const { createConfigManager } = await import('@codeles/core/config');
        const manager = createConfigManager('default');
        const cfg = await manager.load();
        console.log(chalk.bold('\nMemória:'));
        console.log(`  ${cfg.memory.enabled ? chalk.green('Ativada') : chalk.red('Desativada')}`);
        console.log(`  Path: ${cfg.memory.path}`);
        console.log(`  Max entries: ${cfg.memory.maxEntries}`);
      }
      break;

    case '/config':
      if (parts[1] === 'reset') {
        console.log(chalk.yellow('Use: codeles config reset para resetar configuração'));
      } else {
        console.log(chalk.bold('\nConfiguração Atual:'));
        console.log(`  Provider: ${chalk.cyan(config.agent.defaultProvider)}`);
        console.log(`  Modelo: ${chalk.cyan(config.agent.defaultModel)}`);
        console.log(`  Max Tokens: ${config.agent.maxTokens}`);
        console.log(`  Temperature: ${config.agent.temperature}`);
        console.log(`  System Prompt: ${config.agent.systemPrompt ? 'Definido' : 'Nenhum'}`);
      }
      break;

    default:
      console.log(chalk.yellow(`Comando desconhecido: ${cmd}. Use /help para ver comandos disponíveis.`));
  }
}