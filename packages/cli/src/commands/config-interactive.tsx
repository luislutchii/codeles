import { render, Text, Box, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Select from 'ink-select-input';
import { providerRegistry } from '@codeles/providers';
import { createConfigManager } from '@codeles/core';
import chalk from 'chalk';
import { useState, useEffect } from 'react';

interface ProviderOption {
  name: string;
  type: string;
  enabled: boolean;
  apiKey?: string;
  defaultModel?: string;
  models?: string[];
}

interface ConfigState {
  step: 'main' | 'providers' | 'models' | 'apikey' | 'done';
  selectedProvider?: string;
  selectedModel?: string;
  apiKeyInput: string;
  showApiKey: boolean;
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

interface ConfigWizardProps {
  configManager: ReturnType<typeof createConfigManager>;
  config: any;
}

const ConfigWizard: React.FC<ConfigWizardProps> = ({ configManager, config }) => {
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

  // Find current provider index
  const currentProviderIdx = providerOptions.findIndex((p: ProviderOption) => p.type === currentProvider);

  // State
  const [state, setState] = useState<ConfigState>({
    step: 'main',
    selectedProvider: currentProvider,
    selectedModel: currentModel,
    apiKeyInput: '',
    showApiKey: false,
  });

  const [selectedIndex, setSelectedIndex] = useState<number>(Math.max(0, currentProviderIdx));
  const [providerConfigs, setProviderConfigs] = useState<ProviderOption[]>(providerOptions);

  // Handle keyboard input
  useInput((input: string, key: { upArrow?: boolean; downArrow?: boolean; return?: boolean; escape?: boolean; ctrlC?: boolean; backspace?: boolean; ctrl?: boolean; meta?: boolean }) => {
    if (key.ctrlC) {
      process.exit(0);
    }

    const currentState = state;
    
    if (currentState.step === 'main') {
      if (key.upArrow) {
        setSelectedIndex((i: number) => Math.max(0, i - 1));
      } else if (key.downArrow) {
        setSelectedIndex((i: number) => Math.min(providerOptions.length - 1, i + 1));
      } else if (key.return) {
        const provider = providerOptions[selectedIndex];
        if (provider.type === 'custom') {
          setState({ ...currentState, step: 'apikey', selectedProvider: provider.type });
        } else if (provider.apiKey) {
          setState({ ...currentState, step: 'models', selectedProvider: provider.type, selectedModel: provider.defaultModel });
        } else {
          setState({ ...currentState, step: 'apikey', selectedProvider: provider.type });
        }
      } else if (key.escape) {
        process.exit(0);
      }
    } else if (currentState.step === 'models') {
      const provider = providerOptions.find((p: ProviderOption) => p.type === currentState.selectedProvider);
      const models = provider?.models || [];
      const modelIndex = models.indexOf(currentState.selectedModel || '');
      
      if (key.upArrow) {
        setState((s: ConfigState) => ({ ...s, selectedModel: models[Math.max(0, modelIndex - 1)] }));
      } else if (key.downArrow) {
        setState((s: ConfigState) => ({ ...s, selectedModel: models[Math.min(models.length - 1, modelIndex + 1)] }));
      } else if (key.return) {
        setState({ ...currentState, step: 'done' });
      } else if (key.escape) {
        setState({ ...currentState, step: 'main' });
      }
    } else if (currentState.step === 'apikey') {
      if (key.return && currentState.apiKeyInput.trim()) {
        // Save API key
        const newConfigs = providerConfigs.map((p: ProviderOption) => 
          p.type === currentState.selectedProvider 
            ? { ...p, enabled: true, apiKey: currentState.apiKeyInput.trim() }
            : p
        );
        setProviderConfigs(newConfigs);
        setState({ ...currentState, step: 'models', apiKeyInput: '' });
      } else if (key.escape) {
        setState({ ...currentState, step: 'main', apiKeyInput: '' });
      } else if (key.backspace) {
        setState((s: ConfigState) => ({ ...s, apiKeyInput: s.apiKeyInput.slice(0, -1) }));
      } else if (input && input.length === 1 && !key.ctrl && !key.meta) {
        setState((s: ConfigState) => ({ ...s, apiKeyInput: s.apiKeyInput + input }));
      }
    } else if (currentState.step === 'done') {
      if (key.return || key.escape) {
        process.exit(0);
      }
    }
  });

  // Save config when done
  useEffect(() => {
    if (state.step === 'done' && state.selectedProvider && state.selectedModel) {
      const providerConfig = providerConfigs.find((p: ProviderOption) => p.type === state.selectedProvider);
      if (providerConfig) {
        // Update config
        const updatedConfig = {
          ...config,
          agent: {
            ...config.agent,
            defaultProvider: state.selectedProvider,
            defaultModel: state.selectedModel,
          },
          providers: {
            ...config.providers,
            [state.selectedProvider]: {
              ...providerConfig,
              enabled: true,
              defaultModel: state.selectedModel,
              apiKey: providerConfig.apiKey,
            }
          }
        };
        
        configManager.save(updatedConfig as any).then(() => {
          console.log(chalk.green('\n✓ Configuração salva com sucesso!'));
        }).catch((err: Error) => {
          console.error(chalk.red('\n✗ Erro ao salvar:'), err.message);
        });
      }
    }
  }, [state.step]);

  // Render UI based on step
  if (state.step === 'main') {
    const items = providerOptions.map((p: ProviderOption) => ({
      label: `${p.enabled ? chalk.green('●') : chalk.gray('○')} ${p.name} ${p.apiKey ? chalk.green('(configurado)') : chalk.gray('(sem key)')} ${p.type === currentProvider ? chalk.cyan('← atual') : ''}`,
      value: p.type,
    }));
    const initialIndex = items.findIndex(item => item.value === currentProvider);

    return (
      <Box flexDirection="column" padding={2}>
        <Text>
          {chalk.bold.cyan('CodeLES Config')}\n
          {chalk.gray('Configure providers, models e API keys\n')}\n
        </Text>
        <Text>
          {chalk.gray('Provider atual:')} {chalk.cyan(currentProvider)} {chalk.gray('| Modelo:')} {chalk.cyan(currentModel)}\n\n
        </Text>
        <Select
          items={items}
          initialIndex={initialIndex >= 0 ? initialIndex : 0}
          onSelect={(item: { value: string }) => setSelectedIndex(providerOptions.findIndex((p: ProviderOption) => p.type === item.value))}
        />
        <Text>\n{chalk.gray('↑/↓ navega  •  Enter seleciona  •  ESC sai')}</Text>
      </Box>
    );
  }

  if (state.step === 'models') {
    const provider = providerOptions.find((p: ProviderOption) => p.type === state.selectedProvider);
    const models = provider?.models || [];
    const items = models.map((m: string) => ({ label: m, value: m }));
    const initialIndex = models.indexOf(state.selectedModel || '');

    return (
      <Box flexDirection="column" padding={2}>
        <Text>
          {chalk.bold.cyan('Selecionar Modelo')}\n
          {chalk.gray(`Provider: ${providerOptions.find(p => p.type === state.selectedProvider)?.name}\n\n`)}
        </Text>
        <Select
          items={items}
          initialIndex={initialIndex >= 0 ? initialIndex : 0}
          onSelect={(item: { value: string }) => setState((s: ConfigState) => ({ ...s, selectedModel: item.value }))}
        />
        <Text>\n{chalk.gray('↑/↓ navega  •  Enter confirma  •  ESC volta')}</Text>
      </Box>
    );
  }

  if (state.step === 'apikey') {
    return (
      <Box flexDirection="column" padding={2}>
        <Text>
          {chalk.bold.cyan('API Key')}\n
          {chalk.gray(`Provider: ${state.selectedProvider}\n\n`)}
        </Text>
        <Text>{chalk.gray('Cole sua API key (não será exibida):\n')}</Text>
        <TextInput
          value={state.apiKeyInput}
          onChange={(val: string) => setState((s: ConfigState) => ({ ...s, apiKeyInput: val }))}
          placeholder="sk-or-... ou nvapi-..."
          showCursor
        />
        <Text>\n{chalk.gray('Enter salva  •  ESC volta')}</Text>
      </Box>
    );
  }

  if (state.step === 'done') {
    return (
      <Box flexDirection="column" padding={2}>
        <Text>
          {chalk.bold.green('✓ Configuração Concluída!')}\n\n
          {chalk.gray('Provider:')} {chalk.cyan(state.selectedProvider)}\n
          {chalk.gray('Modelo:')} {chalk.cyan(state.selectedModel)}\n\n
          {chalk.gray('Pressione Enter ou ESC para sair')}
        </Text>
      </Box>
    );
  }

  return null;
};

export async function runConfigWizard() {
  const configManager = createConfigManager('default');
  const config = await configManager.load();

  const { waitUntilExit } = render(<ConfigWizard configManager={configManager} config={config} />);
  await waitUntilExit();
}

export default runConfigWizard;