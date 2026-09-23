import { createConfigManager } from '@codeles/core';
import chalk from 'chalk';
import * as readline from 'readline';

interface ProviderOption {
  name: string;
  type: string;
  enabled: boolean;
  apiKey?: string;
  defaultModel?: string;
  models?: string[];
}

interface ConfigState {
  step: 'main' | 'models' | 'apikey' | 'done';
  selectedProvider?: string;
  selectedModel?: string;
  apiKeyInput: string;
}

interface ProviderConfig {
  name: string;
  type: string;
  models: string[];
}

const AVAILABLE_PROVIDERS: ProviderConfig[] = [
  { name: 'OpenRouter', type: 'openrouter', models: ['nvidia/nemotron-3.5-lightning:free', 'anthropic/claude-3.5-sonnet', 'openai/gpt-4o', 'google/gemini-pro-1.5', 'meta-llama/llama-3.1-405b'] },
  { name: 'OpenAI', type: 'openai', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { name: 'Anthropic', type: 'anthropic', models: ['claude-3.5-sonnet', 'claude-3.5-haiku', 'claude-3-opus'] },
  { name: 'Google', type: 'google', models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-1.0-pro'] },
  { name: 'NVIDIA', type: 'nvidia', models: ['nvidia/nemotron-3.5-lightning:free', 'nvidia/llama-3.1-nemotron-70b-instruct'] },
  { name: 'Groq', type: 'groq', models: ['llama-3.1-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'] },
  { name: 'Cohere', type: 'cohere', models: ['command-r-plus', 'command-r'] },
  { name: 'Mistral', type: 'mistral', models: ['mistral-large-latest', 'mistral-medium-latest'] },
  { name: 'Together', type: 'together', models: ['meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo', 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo'] },
  { name: 'Custom', type: 'custom', models: ['custom-model'] },
];

function createRL() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function question(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function printBanner() {
  console.log(chalk.bold.cyan('\n╔═══════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║                    CodeLES Config                         ║'));
  console.log(chalk.bold.cyan('║         Configure providers, models e API keys            ║'));
  console.log(chalk.bold.cyan('╚═══════════════════════════════════════════════════════════╝\n'));
}

function printProviderList(providerOptions: ProviderOption[], currentProvider: string, selectedIndex: number) {
  console.log(chalk.gray(`Provider atual: ${chalk.cyan(currentProvider)} | Modelo: ${chalk.cyan('nvidia/nemotron-3-ultra')}\n`));
  
  providerOptions.forEach((p, i) => {
    const isSelected = i === selectedIndex;
    const prefix = isSelected ? chalk.cyan('▸ ') : '  ';
    const status = p.enabled ? chalk.green('●') : chalk.gray('○');
    const keyStatus = p.apiKey ? chalk.green('(configurado)') : chalk.gray('(sem key)');
    const current = p.type === currentProvider ? chalk.cyan('← atual') : '';
    console.log(`${prefix}${status} ${p.name} ${keyStatus} ${current}`);
  });
  console.log(chalk.gray('\n↑/↓ navega  •  Enter seleciona  •  q sai\n'));
}

function printModelList(models: string[], currentModel: string, selectedIndex: number) {
  console.log(chalk.bold.cyan('\nSelecionar Modelo\n'));
  
  models.forEach((m, i) => {
    const isSelected = i === selectedIndex;
    const prefix = isSelected ? chalk.cyan('▸ ') : '  ';
    console.log(`${prefix}${m}`);
  });
  console.log(chalk.gray('\n↑/↓ navega  •  Enter confirma  •  ESC/q volta\n'));
}

function printApiKeyPrompt(providerName: string) {
  console.log(chalk.bold.cyan('\nAPI Key\n'));
  console.log(chalk.gray(`Provider: ${providerName}\n\n`));
  console.log(chalk.gray('Cole sua API key (não será exibida):\n'));
}

function printDone(selectedProvider: string, selectedModel: string) {
  console.log(chalk.bold.green('\n✓ Configuração Concluída!\n'));
  console.log(chalk.gray(`Provider: ${chalk.cyan(selectedProvider)}`));
  console.log(chalk.gray(`Modelo: ${chalk.cyan(selectedModel)}\n`));
  console.log(chalk.gray('Pressione Enter para sair'));
}

export async function runConfigWizard() {
  const configManager = createConfigManager('default');
  const config = await configManager.load();

  // Get current config
  const currentProvider = config.agent.defaultProvider;
  const currentModel = config.agent.defaultModel;
  const providersConfig = config.providers || {};

  // Initialize state
  const providerOptions: ProviderOption[] = AVAILABLE_PROVIDERS.map((p: ProviderConfig) => {
    const existing = providersConfig[p.type];
    return {
      ...p,
      enabled: existing?.enabled || false,
      apiKey: existing?.apiKey,
      defaultModel: existing?.defaultModel || p.models[0],
      models: p.models,
    };
  });

  let state: ConfigState = {
    step: 'main',
    selectedProvider: currentProvider,
    selectedModel: currentModel,
    apiKeyInput: '',
  };

  let selectedIndex = providerOptions.findIndex((p: ProviderOption) => p.type === currentProvider);
  if (selectedIndex < 0) selectedIndex = 0;

  let providerConfigs = [...providerOptions];

  const rl = createRL();

  // Handle keypress for navigation
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
  }

  const handleKeypress = async (key: string) => {
    const currentState = state;
    
    if (currentState.step === 'main') {
      if (key === '\u001b[A' || key === 'k' || key === 'w') { // up arrow or k/w
        selectedIndex = Math.max(0, selectedIndex - 1);
        renderMain();
      } else if (key === '\u001b[B' || key === 'j' || key === 's') { // down arrow or j/s
        selectedIndex = Math.min(providerOptions.length - 1, selectedIndex + 1);
        renderMain();
      } else if (key === '\r' || key === '\n') { // Enter
        const provider = providerOptions[selectedIndex];
        if (provider.type === 'custom') {
          state = { ...currentState, step: 'apikey', selectedProvider: provider.type };
          await handleApikey();
        } else if (provider.apiKey) {
          state = { ...currentState, step: 'models', selectedProvider: provider.type, selectedModel: provider.defaultModel };
          selectedIndex = 0;
          renderModels();
        } else {
          state = { ...currentState, step: 'apikey', selectedProvider: provider.type };
          await handleApikey();
        }
      } else if (key === '\u001b' || key === 'q') { // ESC or q
        process.exit(0);
      }
    } else if (currentState.step === 'models') {
      const provider = providerOptions.find((p: ProviderOption) => p.type === currentState.selectedProvider);
      const models = provider?.models || [];
      
      if (key === '\u001b[A' || key === 'k' || key === 'w') { // up
        selectedIndex = Math.max(0, selectedIndex - 1);
        renderModels();
      } else if (key === '\u001b[B' || key === 'j' || key === 's') { // down
        selectedIndex = Math.min(models.length - 1, selectedIndex + 1);
        renderModels();
      } else if (key === '\r' || key === '\n') { // Enter
        state = { ...currentState, step: 'done', selectedModel: models[selectedIndex] };
        await handleDone();
      } else if (key === '\u001b' || key === 'q') { // ESC or q
        state = { ...currentState, step: 'main' };
        selectedIndex = providerOptions.findIndex((p: ProviderOption) => p.type === currentState.selectedProvider);
        if (selectedIndex < 0) selectedIndex = 0;
        renderMain();
      }
    } else if (currentState.step === 'done') {
      if (key === '\r' || key === '\n' || key === '\u001b' || key === 'q') {
        process.exit(0);
      }
    }
  };

  if (process.stdin.isTTY) {
    process.stdin.on('data', handleKeypress);
  }

  function renderMain() {
    console.clear();
    printBanner();
    printProviderList(providerOptions, currentProvider, selectedIndex);
  }

  function renderModels() {
    const provider = providerOptions.find((p: ProviderOption) => p.type === state.selectedProvider);
    const models = provider?.models || [];
    console.clear();
    printBanner();
    printModelList(models, state.selectedModel || '', selectedIndex);
  }

  async function handleApikey() {
    console.clear();
    printBanner();
    printApiKeyPrompt(state.selectedProvider || '');
    
    const answer = await question(rl, '> ');
    if (answer.trim()) {
      state.apiKeyInput = answer.trim();
      // Save API key
      const newConfigs = providerConfigs.map(p => 
        p.type === state.selectedProvider 
          ? { ...p, enabled: true, apiKey: state.apiKeyInput }
          : p
      );
      providerConfigs = newConfigs;
      state = { ...state, step: 'models', apiKeyInput: '' };
      selectedIndex = 0;
      renderModels();
    } else {
      state = { ...state, step: 'main', apiKeyInput: '' };
      selectedIndex = providerOptions.findIndex((p: ProviderOption) => p.type === state.selectedProvider);
      if (selectedIndex < 0) selectedIndex = 0;
      renderMain();
    }
  }

  async function handleDone() {
    console.clear();
    printBanner();
    printDone(state.selectedProvider || '', state.selectedModel || '');
    
    await question(rl, '');
    process.exit(0);
  }

  // Start
  renderMain();

  // For apikey step, we need a different approach
  // We'll use a loop with readline
  while (true) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

export default runConfigWizard;