import figlet from 'figlet';
import chalk from 'chalk';

/**
 * CodeLES ASCII Banner & Visual Identity
 * Estilo similar ao Hermes - usando figlet dinamicamente
 */

/**
 * Gera o banner principal usado em toda a aplicação
 * @returns {string} Banner formatado com cores
 */
export function getWelcomeBox(): string {
  // Gera o texto ASCII usando figlet
  const asciiArt = figlet.textSync('CodeLES', {
    font: 'Standard',
    horizontalLayout: 'default',
    verticalLayout: 'default'
  });

  // Cria um gradiente de cores (azul para branco)
  const lines = asciiArt.split('\n');
  const gradientLines = lines.map((line, index) => {
    // Interpolar entre azul (0,0,255) e branco (255,255,255) baseado na posição da linha
    const ratio = index / Math.max(lines.length - 1, 1);
    const redVal = Math.floor(255 * ratio);      // 0 → 255
    const greenVal = Math.floor(255 * ratio);    // 0 → 255
    const blueVal = 255;                         // constante 255 (azul puro no topo)
    const hex = `#${redVal.toString(16).padStart(2, '0')}${greenVal.toString(16).padStart(2, '0')}${blueVal.toString(16).padStart(2, '0')}`;
    return chalk.hex(hex)(line);
  });

  const banner = gradientLines.join('\n');

  return `
${banner}

  CodeLES  • AI Coding Agent with 1M Context
  ═══════════════════════════════════════════════════════════════
  │  Powered by LES │ Lutchi Enterprise Systems │ https://lutchi.vercel.app  │
  ════════════════════════════════════════════════════════════════
`;
}

/**
 * Gera a barra de status estilo Hermes
 * @param {Object} options - Opções da barra de status
 * @returns {string} Barra de status formatada
 */
export function getStatusBar(options: {
  model: string;
  tokensUsed: number;
  tokensMax: number;
  toolsCount: number;
  sessionElapsedMs: number;     // Tempo total da sessão
  responseElapsedMs: number;    // Tempo da resposta atual (ms)
  isResponding: boolean;
  isDone: boolean;
}): string {
  const { model, tokensUsed, tokensMax, toolsCount, sessionElapsedMs, responseElapsedMs, isResponding, isDone } = options;
  
  // Format tokens (K/M)
  const formatTokens = (tokens: number) => {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
    if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`;
    return `${tokens}`;
  };
  
  const usedStr = formatTokens(tokensUsed);
  const maxStr = formatTokens(tokensMax);
  const percentage = Math.min(Math.round((tokensUsed / tokensMax) * 100), 100);
  
  // Progress bar (10 chars)
  const barLength = 10;
  const filled = Math.round((percentage / 100) * barLength);
  const empty = barLength - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  
  // Session elapsed time (only minutes)
  const sessionMinutes = Math.floor(sessionElapsedMs / 60000);
  const sessionTimeStr = `${sessionMinutes}m`;
  
  // Response elapsed time (minutes and seconds)
  const responseMinutes = Math.floor(responseElapsedMs / 60000);
  const responseSeconds = Math.floor((responseElapsedMs % 60000) / 1000);
  const responseTimeStr = responseMinutes > 0 
    ? `${responseMinutes}m ${responseSeconds.toString().padStart(2, '0')}s`
    : `${responseSeconds}s`;
  
  // Model name (shortened if needed)
  const modelDisplay = model.length > 40 ? model.substring(0, 37) + '...' : model;
  
  // Status indicator
  let statusIcon: string;
  
  if (isDone) {
    statusIcon = chalk.green('✓');
  } else if (isResponding) {
    statusIcon = chalk.yellow('◐');
  } else {
    statusIcon = chalk.gray('○');
  }
  
  const statusLabel = isDone ? chalk.green('CONCLUÍDO') : (isResponding ? chalk.yellow('RESPONDENDO') : chalk.gray('AGUARDANDO'));
  
  // Tools emoji - use text fallback for compatibility
  const toolsIcon = 'TLS';
  
  if (isResponding || isDone) {
    // Durante ou após resposta: mostra tokens, tempo de resposta, session time
    return `${chalk.cyan('┌')} ${chalk.bold(modelDisplay)} ${chalk.gray('│')} ${chalk.cyan(usedStr)}/${chalk.cyan(maxStr)} ${chalk.gray('│')} ${chalk.yellow(`[${bar}]`)} ${chalk.yellow(`${percentage}%`)} ${chalk.gray('│')} ${chalk.magenta(toolsIcon)} ${chalk.magenta(toolsCount)} ${chalk.gray('│')} ${chalk.blue(sessionTimeStr)} ${chalk.gray('│')} ${chalk.cyan('⏱')} ${chalk.cyan(responseTimeStr)} ${chalk.gray('│')} ${statusIcon} ${statusLabel} ${chalk.gray('│')} ${chalk.cyan('┐')}`;
  } else {
    // Aguardando: mostra barra minimalista
    return `${chalk.cyan('┌')} ${chalk.bold(modelDisplay)} ${chalk.gray('│')} ${chalk.cyan('0')}/${chalk.cyan(maxStr)} ${chalk.gray('│')} ${chalk.yellow(`[${'░'.repeat(10)}]`)} ${chalk.yellow('0%')} ${chalk.gray('│')} ${chalk.magenta(toolsIcon)} ${chalk.magenta('0')} ${chalk.gray('│')} ${chalk.blue(sessionTimeStr)} ${chalk.gray('│')} ${chalk.gray('aguardando')} ${chalk.gray('│')} ${statusIcon} ${statusLabel} ${chalk.gray('│')} ${chalk.cyan('┐')}`;
  }
}

/**
 * Gera o prompt de entrada do usuário
 * @param {string} provider - Nome do provider
 * @param {string} model - Nome do modelo
 * @returns {string} Prompt formatado
 */
export function getPrompt(provider: string, model: string): string {
  return chalk.cyan('› ');
}

/**
 * Gera o texto de ajuda para comandos internos
 * @returns {string} Texto de ajuda formatado
 */
export function getHelpText(): string {
  return `
${chalk.bold('Comandos disponíveis:')}

  ${chalk.cyan('/help')}     Mostra esta ajuda
  ${chalk.cyan('/exit')}     Encerra a sessão de chat
  ${chalk.cyan('/clear')}    Limpa o histórico da conversa
  ${chalk.cyan('/provider list')}  Lista os providers configurados
  ${chalk.cyan('/model')}     Mostra o modelo atual
  ${chalk.cyan('/tools')}     Lista ferramentas disponíveis
  ${chalk.cyan('/memory')}    Mostra status da memória
  ${chalk.cyan('/config')}    Mostra a configuração atual

${chalk.gray('Dicas:')}
${chalk.gray('  • Use a seta ↑ para acessar histórico de comandos')}
${chalk.gray('  • Use Tab para autocomplete (quando disponível)')}
${chalk.gray('  • Mensagens vazias são ignoradas')}
${chalk.gray('  • Pressione / para abrir o menu de comandos com navegação por setas')}
`;
}

/**
 * Lista de todos os comandos disponíveis para o menu de sugestões
 */
export const COMMAND_SUGGESTIONS = [
  { name: '/help', description: 'Mostra esta ajuda', category: 'Geral' },
  { name: '/exit', description: 'Encerra a sessão de chat', category: 'Geral' },
  { name: '/clear', description: 'Limpa o histórico da conversa', category: 'Geral' },
  { name: '/provider list', description: 'Lista os providers configurados', category: 'Provider' },
  { name: '/provider select', description: 'Seleciona o provider ativo', category: 'Provider' },
  { name: '/model list', description: 'Lista modelos disponíveis', category: 'Modelo' },
  { name: '/model select', description: 'Seleciona o modelo ativo', category: 'Modelo' },
  { name: '/tools', description: 'Lista ferramentas disponíveis', category: 'Ferramentas' },
  { name: '/memory', description: 'Mostra status da memória', category: 'Memória' },
  { name: '/config', description: 'Mostra configuração atual', category: 'Config' },
];