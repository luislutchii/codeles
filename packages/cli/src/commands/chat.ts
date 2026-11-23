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

  // State for submenu (provider/model selection)
  let inSubmenuMode = false;
  let submenuType: 'provider' | 'model' | null = null;
  let submenuItems: string[] = [];
  let selectedSubmenuIndex = 0;
  let submenuStarted = false;
  let lastSubmenuLineCount = 0;

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
  let isFirstRender = true;

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

    if (isFirstRender) {
      // First render: write status bar and prompt
      output.write(statusBar + '\n');
      isFirstRender = false;
    } else {
      // Update in-place: move cursor up to status bar line and clear it
      const linesToMoveUp = 1;
      readline.cursorTo(output, 0);
      readline.moveCursor(output, 0, -linesToMoveUp);
      readline.clearLine(output, 0);
      output.write(statusBar);
      // Move cursor back down to prompt line
      readline.cursorTo(output, 0);
      readline.moveCursor(output, 0, linesToMoveUp);
    }

    // Show prompt - clear current line and write prompt + buffer
    readline.cursorTo(output, 0);
    readline.clearLine(output, 0);
    const promptText = getPrompt(config.agent.defaultProvider, config.agent.defaultModel);
    output.write(promptText + inputBuffer);

    if (inCommandMode) {
      if (!commandModeStarted) {
        // First time entering command mode - render full menu below prompt
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
        lastMenuLineCount = lineCount + 3;

        output.write(chalk.gray('─'.repeat(56)) + '\n');
        output.write(chalk.gray('  ↑/↓ navega  •  Enter seleciona  •  ESC/Q cancela') + '\n');
        output.write(chalk.gray('─'.repeat(56)) + '\n');
      } else {
        // Re-render menu by moving cursor up and clearing menu area
        readline.cursorTo(output, 0);
        readline.moveCursor(output, 0, - (lastMenuLineCount + 1));

        for (let i = 0; i < lastMenuLineCount + 1; i++) {
          readline.clearLine(output, 0);
          if (i < lastMenuLineCount) readline.moveCursor(output, 0, 1);
        }

        readline.cursorTo(output, 0);
        readline.moveCursor(output, 0, - (lastMenuLineCount + 1));

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
      readline.cursorTo(output, 0);
      readline.moveCursor(output, 0, lastMenuLineCount + 2);
      readline.clearLine(output, 0);
      const promptText = getPrompt(config.agent.defaultProvider, config.agent.defaultModel);
      output.write(promptText + inputBuffer);
    } else if (inSubmenuMode) {
      // Render submenu (provider/model selection)
      if (!submenuStarted) {
        submenuStarted = true;
        output.write('\n');
        output.write(chalk.gray('─'.repeat(56)) + '\n');
        const title = submenuType === 'provider' ? '  SELECIONAR PROVIDER' : '  SELECIONAR MODELO';
        output.write(chalk.bold.cyan(title) + '\n');
        output.write(chalk.gray('─'.repeat(56)) + '\n');

        submenuItems.forEach((item, idx) => {
          if (idx === selectedSubmenuIndex) {
            output.write(chalk.cyan(`    ▸ ${item}`) + '\n');
          } else {
            output.write(chalk.gray(`      ${item}`) + '\n');
          }
        });
        lastSubmenuLineCount = submenuItems.length + 3;

        output.write(chalk.gray('─'.repeat(56)) + '\n');
        output.write(chalk.gray('  ↑/↓ navega  •  Enter seleciona  •  ESC/Q cancela') + '\n');
        output.write(chalk.gray('─'.repeat(56)) + '\n');
      } else {
        // Re-render submenu
        readline.cursorTo(output, 0);
        readline.moveCursor(output, 0, - (lastSubmenuLineCount + 1));

        for (let i = 0; i < lastSubmenuLineCount + 1; i++) {
          readline.clearLine(output, 0);
          if (i < lastSubmenuLineCount) readline.moveCursor(output, 0, 1);
        }

        readline.cursorTo(output, 0);
        readline.moveCursor(output, 0, - (lastSubmenuLineCount + 1));

        output.write(chalk.gray('─'.repeat(56)) + '\n');
        const title = submenuType === 'provider' ? '  SELECIONAR PROVIDER' : '  SELECIONAR MODELO';
        output.write(chalk.bold.cyan(title) + '\n');
        output.write(chalk.gray('─'.repeat(56)) + '\n');

        let lineCount = 0;
        submenuItems.forEach((item, idx) => {
          if (idx === selectedSubmenuIndex) {
            output.write(chalk.cyan(`    ▸ ${item}`) + '\n');
          } else {
            output.write(chalk.gray(`      ${item}`) + '\n');
          }
          lineCount++;
        });
        lastSubmenuLineCount = lineCount + 3;

        output.write(chalk.gray('─'.repeat(56)) + '\n');
        output.write(chalk.gray('  ↑/↓ navega  •  Enter seleciona  •  ESC/Q cancela') + '\n');
        output.write(chalk.gray('─'.repeat(56)) + '\n');
      }

      // Re-show prompt
      readline.cursorTo(output, 0);
      readline.moveCursor(output, 0, lastSubmenuLineCount + 2);
      readline.clearLine(output, 0);
      const promptText = getPrompt(config.agent.defaultProvider, config.agent.defaultModel);
      output.write(promptText + inputBuffer);
    } else {
      // Normal mode: if we were in command mode, clear the menu area
      if (commandModeStarted) {
        commandModeStarted = false;
        readline.cursorTo(output, 0);
        readline.moveCursor(output, 0, - (lastMenuLineCount + 1));
        for (let i = 0; i < lastMenuLineCount + 1; i++) {
          readline.clearLine(output, 0);
          readline.cursorTo(output, 0);
          if (i < lastMenuLineCount) readline.moveCursor(output, 0, 1);
        }
        readline.cursorTo(output, 0);
        readline.clearLine(output, 0);
        const promptText = getPrompt(config.agent.defaultProvider, config.agent.defaultModel);
        output.write(promptText + inputBuffer);
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
        if (filteredCommands.length > 0) {
          const selectedCommand = filteredCommands[selectedCommandIndex].name;
          inputBuffer = selectedCommand;
        }
        inCommandMode = false;
        selectedCommandIndex = 0;
        renderLine();
        submitLine();
      } else if (key === '\u001b' || key === 'q') { // ESC or q
        inCommandMode = false;
        selectedCommandIndex = 0;
        inputBuffer = '';
        filterCommands('');
        renderLine();
      } else if (key === '\u007f' || key === '\b' || key === '\x08') { // Backspace
        if (inputBuffer.length > 0) {
          inputBuffer = inputBuffer.slice(0, -1);
          filterCommands(inputBuffer);
          renderLine();
        } else {
          inCommandMode = false;
          selectedCommandIndex = 0;
          filterCommands('');
          renderLine();
        }
      } else if (key.length === 1 && key >= ' ' && key <= '~') { // Printable ASCII
        inputBuffer += key;
        filterCommands(inputBuffer);
        renderLine();
      } else if (key.length > 0) { // Non-ASCII characters
        inputBuffer += key;
        filterCommands(inputBuffer);
        renderLine();
      }
    } else if (inSubmenuMode) {
      // Handle submenu navigation
      if (key === '\u001b[A' || key === 'k' || key === 'w') { // Up
        selectedSubmenuIndex = Math.max(0, selectedSubmenuIndex - 1);
        renderLine();
      } else if (key === '\u001b[B' || key === 'j' || key === 's') { // Down
        selectedSubmenuIndex = Math.min(submenuItems.length - 1, selectedSubmenuIndex + 1);
        renderLine();
      } else if (key === '\r' || key === '\n') { // Enter - select item
        const selectedItem = submenuItems[selectedSubmenuIndex];
        if (submenuType === 'provider') {
          const providerName = selectedItem.split(' ')[0].replace(/^[0-9]+\.\s*/, '');
          config.agent.defaultProvider = providerName;
          console.log(chalk.green(`\n✓ Provider alterado para: ${providerName}`));
        } else if (submenuType === 'model') {
          const modelName = selectedItem.split(' ')[0].replace(/^[0-9]+\.\s*/, '').split(' (')[0];
          config.agent.defaultModel = modelName;
          console.log(chalk.green(`\n✓ Modelo alterado para: ${modelName}`));
        }
        inSubmenuMode = false;
        submenuType = null;
        submenuItems = [];
        selectedSubmenuIndex = 0;
        submenuStarted = false;
        renderLine();
      } else if (key === '\u001b' || key === 'q') { // ESC or q - cancel
        inSubmenuMode = false;
        submenuType = null;
        submenuItems = [];
        selectedSubmenuIndex = 0;
        submenuStarted = false;
        renderLine();
      }
    } else {
      // Handle normal mode
      if (key === '\r') { // Enter
        submitLine();
      } else if (key === '\n') {
        // Ignore Line Feed
      } else if (key === '\u007f' || key === '\b' || key === '\x08') { // Backspace
        if (inputBuffer.length > 0) {
          inputBuffer = inputBuffer.slice(0, -1);
          renderLine();
        }
      } else if (key === '/') {
        inCommandMode = true;
        selectedCommandIndex = 0;
        inputBuffer = '/';
        filterCommands('/');
        renderLine();
      } else if (key.length === 1 && key >= ' ' && key <= '~') { // Printable ASCII
        inputBuffer += key;
        renderLine();
      } else if (key.length > 0) { // Non-ASCII characters
        inputBuffer += key;
        renderLine();
      }
    }
  };

  // Function to submit the current line
  const submitLine = async () => {
    if (!isRunning) return;

    output.write('\n');

    const userInput = inputBuffer;
    inputBuffer = '';
    inCommandMode = false;
    selectedCommandIndex = 0;
    filterCommands('');

    if (!userInput.trim()) {
      renderLine();
      return;
    }

    // Handle internal commands
    if (userInput.startsWith('/')) {
      const handled = await handleCommand(userInput.trim());
      if (handled === 'exit') {
        isRunning = false;
        stopStatusTimer();
        process.stdin.setRawMode(false);
        rl.close();
        console.log(chalk.gray('\nAté logo! 👋\n'));
        return;
      }
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

    const providerConfig = config.providers[config.agent.defaultProvider];
    if (!providerConfig) {
      console.log(chalk.red(`Configuration for provider ${config.agent.defaultProvider} not found`));
      renderLine();
      return;
    }

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
          tokensUsed += content.length / 4;
          output.write(content);
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

      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: fullResponse,
        toolCalls: hasToolCalls ? toolCalls : undefined,
        timestamp: Date.now()
      };
      messages.push(assistantMessage);

      renderLine();

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

  // Handle internal commands (has access to submenu state via closure)
  const handleCommand = async (command: string): Promise<string | void> => {
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
            const marker = p === config.agent.defaultProvider ? chalk.cyan(' ← atual') : '';
            console.log(`  ${prov.enabled ? chalk.green('●') : chalk.red('○')} ${chalk.cyan(p)}${marker} (${prov.type}) - ${prov.defaultModel}`);
          }
        } else if (parts[1] === 'select') {
          const providers = Object.keys(config.providers);
          if (providers.length === 0) {
            console.log(chalk.yellow('Nenhum provider configurado. Use codeles config wizard'));
          } else {
            inSubmenuMode = true;
            submenuType = 'provider';
            submenuItems = providers.map(p => {
              const prov = config.providers[p];
              const marker = p === config.agent.defaultProvider ? ' ← atual' : '';
              return `${p} (${prov.type}) - ${prov.defaultModel}${marker}`;
            });
            selectedSubmenuIndex = providers.findIndex(p => p === config.agent.defaultProvider);
            if (selectedSubmenuIndex === -1) selectedSubmenuIndex = 0;
            submenuStarted = false;
            renderLine();
          }
        } else if (parts[1] === 'add') {
          console.log(chalk.yellow('Use: codeles config wizard para adicionar providers'));
        } else if (parts[1] === 'remove') {
          console.log(chalk.yellow('Use: codeles config wizard para remover providers'));
        } else {
          console.log(chalk.yellow('Uso: /provider list | select | add | remove'));
        }
        break;

      case '/model':
        if (parts[1] === 'list' || parts[1] === 'select') {
          const adapter = providerRegistry.getAdapter(config.agent.defaultProvider);
          if (adapter && typeof adapter.listModels === 'function') {
            try {
              const models = await adapter.listModels();
              if (models && models.length > 0) {
                inSubmenuMode = true;
                submenuType = 'model';
                submenuItems = models.map((m: any) => {
                  const marker = m.id === config.agent.defaultModel ? ' ← atual' : '';
                  const ctxInfo = m.contextWindow ? ` (${m.contextWindow.toLocaleString()} ctx)` : '';
                  return `${m.id}${ctxInfo}${marker}`;
                });
                selectedSubmenuIndex = models.findIndex((m: any) => m.id === config.agent.defaultModel);
                if (selectedSubmenuIndex === -1) selectedSubmenuIndex = 0;
                submenuStarted = false;
                renderLine();
              } else {
                console.log(chalk.gray('  Nenhum modelo disponível'));
              }
            } catch (error) {
              console.log(chalk.gray('  Erro ao buscar modelos: ') + chalk.red(String(error)));
              console.log(chalk.gray('  Modelo atual: ') + chalk.cyan(config.agent.defaultModel));
            }
          } else {
            const providerConfig = config.providers[config.agent.defaultProvider];
            if (providerConfig && providerConfig.models && providerConfig.models.length > 0) {
              inSubmenuMode = true;
              submenuType = 'model';
              submenuItems = providerConfig.models.map((m: any) => {
                const marker = m.id === config.agent.defaultModel ? ' ← atual' : '';
                return `${m.id}${marker}`;
              });
              selectedSubmenuIndex = providerConfig.models.findIndex((m: any) => m.id === config.agent.defaultModel);
              if (selectedSubmenuIndex === -1) selectedSubmenuIndex = 0;
              submenuStarted = false;
              renderLine();
            } else {
              console.log(chalk.gray('  Nenhum modelo listado na configuração'));
              console.log(chalk.gray('  Modelo atual: ') + chalk.cyan(config.agent.defaultModel));
            }
          }
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
  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    chunks.push(chunk);
  }
  const allInput = Buffer.concat(chunks).toString('utf8').trim();

  if (!allInput) {
    console.log(chalk.gray('\nNenhuma entrada fornecida. Use codeles chat para modo interativo.\n'));
    return;
  }

  const lines = allInput.split('\n').filter(line => line.trim() !== '');

  for (const userInput of lines) {
    if (userInput.startsWith('/')) {
      const handled = await handleSimpleCommand(userInput.trim(), config, messages);
      if (handled === 'exit') break;
      continue;
    }

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: userInput.trim(),
      timestamp: Date.now()
    };
    messages.push(userMessage);

    const adapter = providerRegistry.getAdapter(config.agent.defaultProvider);
    if (!adapter) {
      console.log(chalk.red(`Provider ${config.agent.defaultProvider} not found`));
      continue;
    }

    const providerConfig = config.providers[config.agent.defaultProvider];
    if (!providerConfig) {
      console.log(chalk.red(`Configuration for provider ${config.agent.defaultProvider} not found`));
      continue;
    }

    await adapter.initialize(providerConfig);

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

        if (chunk.choices[0]?.finishReason) {}
      }

      output.write('\n');

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

// Separate handler for simple mode (no submenu support)
async function handleSimpleCommand(command: string, config: CodeLESConfig, messages: ChatMessage[]): Promise<string | void> {
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
          const marker = p === config.agent.defaultProvider ? chalk.cyan(' ← atual') : '';
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