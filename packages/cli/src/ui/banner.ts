import chalk from 'chalk';

/**
 * CodeLES ASCII Banner & Visual Identity
 * Estilo similar ao Hermes
 */

export const CODELES_BANNER = `
${chalk.cyan('██████╗')} ${chalk.blue('███████╗')} ${chalk.cyan('███████╗')} ${chalk.blue('███████╗')} ${chalk.cyan('███╗   ███╗')} ${chalk.blue('██████╗')} 
${chalk.cyan('██╔══██╗')} ${chalk.blue('██╔════╝')} ${chalk.cyan('██╔════╝')} ${chalk.blue('██╔════╝')} ${chalk.cyan('████╗ ████║')} ${chalk.blue('██╔══██╗')}
${chalk.cyan('██████╔╝')} ${chalk.blue('█████╗  ')} ${chalk.cyan('███████╗')} ${chalk.blue('█████╗  ')} ${chalk.cyan('██╔████╔██║')} ${chalk.blue('██████╔╝')}
${chalk.cyan('██╔══██╗')} ${chalk.blue('██╔══╝  ')} ${chalk.cyan('██╔════╝')} ${chalk.blue('██╔════╝')} ${chalk.cyan('██║╚██╔╝██║')} ${chalk.blue('██╔══██╗')}
${chalk.cyan('██████╔╝')} ${chalk.blue('███████╗')} ${chalk.cyan('██║     ')} ${chalk.blue('███████╗')} ${chalk.cyan('██║ ╚═╝ ██║')} ${chalk.blue('██████╔╝')}
${chalk.cyan('╚═════╝ ')} ${chalk.blue('╚══════╝')} ${chalk.cyan('╚═╝     ')} ${chalk.blue('╚══════╝')} ${chalk.cyan('╚═╝     ╚═╝')} ${chalk.blue('╚═════╝ ')}

${chalk.bold.magenta('  CodeLES')}  ${chalk.gray('• AI Coding Agent with 1M Context')}

${chalk.gray('  ═══════════════════════════════════════════════════════════════')}
${chalk.gray('  │')}  ${chalk.bold('Powered by')} ${chalk.cyan('LES')} ${chalk.gray('│ Lutchi Enterprise Systems │ https://lutchi.vercel.app  │')}
${chalk.gray('  ════════════════════════════════════════════════════════════════')}
`;

export const CODELES_MINI_BANNER = `
${chalk.cyan('██████╗ ███████╗███████╗███████╗███╗   ███╗██████╗ ')}
${chalk.blue('██╔══██╗██╔════╝██╔════╝██╔════╝████╗ ████║██╔══██╗')}
${chalk.cyan('██████╔╝█████╗  ███████╗█████╗  ██╔████╔██║██████╔╝')}
${chalk.blue('██╔══██╗██╔══╝  ██╔════╝██╔══╝  ██║╚██╔╝██║██╔══██╗')}
${chalk.cyan('██████╔╝███████╗██║     ███████╗██║ ╚═╝ ██║██████╔╝')}
${chalk.blue('╚═════╝ ╚══════╝╚═╝     ╚══════╝╚═╝     ╚═╝╚═════╝ ')}

${chalk.bold.magenta('  CodeLES')}  ${chalk.gray('• 1M Context • Powered by LES')}
`;

export function getBanner(provider?: string, model?: string): string {
  const providerInfo = provider && model 
    ? `\n${chalk.gray('  Provider:')} ${chalk.cyan(provider)} ${chalk.gray('| Model:')} ${chalk.cyan(model)}`
    : '';
  
  return CODELES_MINI_BANNER + providerInfo + '\n';
}

export function getWelcomeBox(): string {
  return `
${chalk.gray('  ╭─────────────────────────────────────────────────────────────╮')}
${chalk.gray('  │')}  ${chalk.bold.cyan('CodeLES v1.0.0')} ${chalk.gray('                                          │')}
${chalk.gray('  │')}  ${chalk.gray('AI Coding Agent with 1M Context (Nemotron 3 Ultra)')}  ${chalk.gray('│')}
${chalk.gray('  │')}  ${chalk.magenta('Powered by LES')} ${chalk.gray('• Lutchi Enterprise Systems')}           ${chalk.gray('│')}
${chalk.gray('  │')}  ${chalk.gray('https://lutchi.vercel.app')}                              ${chalk.gray('│')}
${chalk.gray('  ╰─────────────────────────────────────────────────────────────╯')}
`;
}

export function getPrompt(provider: string, model: string): string {
  return `\n${chalk.cyan('› ')}`;
}

export function getHelpText(): string {
  return `
${chalk.bold('Comandos Internos:')}
  ${chalk.cyan('/help')}     - Mostra esta ajuda
  ${chalk.cyan('/exit')}     - Sai do chat
  ${chalk.cyan('/clear')}    - Limpa histórico da conversa
  ${chalk.cyan('/provider')} - Lista/troca provider
  ${chalk.cyan('/model')}    - Lista/troca modelo
  ${chalk.cyan('/tools')}    - Lista ferramentas disponíveis
  ${chalk.cyan('/memory')}   - Mostra estatísticas de memória
  ${chalk.cyan('/config')}   - Mostra configuração atual

${chalk.bold('Exemplos de uso:')}
  ${chalk.gray('› "Crie um componente React com TypeScript"')}
  ${chalk.gray('› "Refatore esta função para ser mais performática"')}
  ${chalk.gray('› "Escreva testes unitários para este código"')}
  ${chalk.gray('› "Explique este erro e como corrigir"')}
  ${chalk.gray('› "Gere documentação para esta API"')}
`;
}