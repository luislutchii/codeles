/**
 * CodeLES Doctor Command - System Health Check
 */

import chalk from 'chalk';
import boxen from 'boxen';
import { providerRegistry } from '@codeles/providers';
import { toolRegistry } from '@codeles/tools';
import { ConfigManager, createConfigManager } from '@codeles/core';
import * as os from 'os';
import * as fs from 'fs/promises';
import * as path from 'path';

export async function runDoctor() {
  console.log(boxen(
    chalk.bold.cyan('CodeLES Doctor') + '\n' +
    chalk.gray('System health and configuration check'),
    { padding: 1, borderStyle: 'round', borderColor: 'cyan' }
  ));

  const checks: Array<{ name: string; status: 'ok' | 'warn' | 'error'; message: string; details?: string }> = [];

  // Check Node.js version
  const nodeVersion = process.version;
  const nodeMajor = parseInt(nodeVersion.slice(1).split('.')[0]);
  if (nodeMajor >= 20) {
    checks.push({ name: 'Node.js', status: 'ok', message: `v${nodeMajor}.x.x (${nodeVersion})` });
  } else if (nodeMajor >= 18) {
    checks.push({ name: 'Node.js', status: 'warn', message: `v${nodeMajor}.x.x (${nodeVersion}) - Recommend Node 20+` });
  } else {
    checks.push({ name: 'Node.js', status: 'error', message: `v${nodeMajor}.x.x (${nodeVersion}) - Requires Node 18+` });
  }

  // Check OS
  checks.push({ name: 'OS', status: 'ok', message: `${os.platform()} ${os.arch()} (${os.release()})` });

  // Check memory
  const totalMem = Math.round(os.totalmem() / 1024 / 1024 / 1024 * 10) / 10;
  const freeMem = Math.round(os.freemem() / 1024 / 1024 / 1024 * 10) / 10;
  checks.push({ name: 'Memory', status: freeMem > 1 ? 'ok' : 'warn', message: `${freeMem}GB free / ${totalMem}GB total` });

  // Check disk space
  try {
    const { execSync } = await import('child_process');
    const diskInfo = execSync('df -h .', { encoding: 'utf-8' });
    checks.push({ name: 'Disk', status: 'ok', message: 'Available', details: diskInfo.split('\n')[1] });
  } catch {
    checks.push({ name: 'Disk', status: 'warn', message: 'Could not check disk space' });
  }

  // Check config
  try {
    const manager = createConfigManager('default');
    const config = await manager.load();
    checks.push({ name: 'Config', status: 'ok', message: `Loaded (profile: ${config.profile})`, details: `Path: ${manager.getConfigPath()}` });
    
    // Check default provider
    const defaultProvider = config.providers[config.agent.defaultProvider];
    if (defaultProvider) {
      if (defaultProvider.enabled) {
        checks.push({ name: 'Default Provider', status: 'ok', message: `${config.agent.defaultProvider} (${defaultProvider.defaultModel})` });
      } else {
        checks.push({ name: 'Default Provider', status: 'warn', message: `${config.agent.defaultProvider} is disabled` });
      }
    } else {
      checks.push({ name: 'Default Provider', status: 'error', message: `${config.agent.defaultProvider} not configured` });
    }
  } catch (error) {
    checks.push({ name: 'Config', status: 'error', message: `Failed to load: ${error instanceof Error ? error.message : String(error)}` });
  }

  // Check providers
  const adapters = providerRegistry.listAdapters();
  for (const name of adapters) {
    try {
      const adapter = providerRegistry.getAdapter(name)!;
      const manager = createConfigManager('default');
      const config = await manager.load();
      const providerConfig = config.providers[name];
      
      if (providerConfig?.enabled) {
        await adapter.initialize(providerConfig);
        const health = await adapter.healthCheck();
        if (health.healthy) {
          checks.push({ name: `Provider: ${name}`, status: 'ok', message: `Healthy${health.latencyMs ? ` (${health.latencyMs}ms)` : ''}` });
        } else {
          checks.push({ name: `Provider: ${name}`, status: 'error', message: health.error || 'Unhealthy' });
        }
      } else {
        checks.push({ name: `Provider: ${name}`, status: 'warn', message: 'Disabled or not configured' });
      }
    } catch (error) {
      checks.push({ name: `Provider: ${name}`, status: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  // Check tools
  const tools = toolRegistry.listTools();
  for (const tool of tools) {
    try {
      const manager = createConfigManager('default');
      const config = await manager.load();
      const toolConfig = config.tools[tool.name];
      
      if (toolConfig?.enabled) {
        await tool.initialize(toolConfig.config);
        checks.push({ name: `Tool: ${tool.name}`, status: 'ok', message: 'Ready' });
      } else {
        checks.push({ name: `Tool: ${tool.name}`, status: 'warn', message: 'Disabled' });
      }
    } catch (error) {
      checks.push({ name: `Tool: ${tool.name}`, status: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }

  // Check CodeLES directories
  const homeDir = os.homedir();
  const codelesDir = path.join(homeDir, '.codeles');
  try {
    await fs.access(codelesDir);
    checks.push({ name: 'CodeLES Dir', status: 'ok', message: codelesDir });
  } catch {
    checks.push({ name: 'CodeLES Dir', status: 'warn', message: 'Not created yet (will be created on first run)' });
  }

  // Check .env file
  const envPath = path.join(process.cwd(), '.env');
  try {
    await fs.access(envPath);
    checks.push({ name: '.env File', status: 'ok', message: 'Found in project root' });
  } catch {
    checks.push({ name: '.env File', status: 'warn', message: 'Not found (create from .env.example)' });
  }

  // Print results
  console.log('\n' + chalk.bold('Health Checks:') + '\n');
  
  let hasErrors = false;
  let hasWarnings = false;
  
  for (const check of checks) {
    const icon = check.status === 'ok' ? chalk.green('✓') : check.status === 'warn' ? chalk.yellow('⚠') : chalk.red('✗');
    const statusColor = check.status === 'ok' ? chalk.green : check.status === 'warn' ? chalk.yellow : chalk.red;
    
    console.log(`  ${icon} ${chalk.bold(check.name)}: ${statusColor(check.status.toUpperCase())} - ${check.message}`);
    if (check.details) console.log(`    ${chalk.gray(check.details)}`);
    
    if (check.status === 'error') hasErrors = true;
    if (check.status === 'warn') hasWarnings = true;
  }

  console.log('\n' + chalk.bold('Summary:'));
  console.log(`  ${chalk.green('OK:')} ${checks.filter(c => c.status === 'ok').length}`);
  console.log(`  ${chalk.yellow('Warnings:')} ${checks.filter(c => c.status === 'warn').length}`);
  console.log(`  ${chalk.red('Errors:')} ${checks.filter(c => c.status === 'error').length}`);

  if (hasErrors) {
    console.log('\n' + chalk.red('⚠ Some checks failed. Run with --verbose for more details.'));
    process.exit(1);
  } else if (hasWarnings) {
    console.log('\n' + chalk.yellow('⚠ Some warnings. System functional but review recommended.'));
  } else {
    console.log('\n' + chalk.green('✓ All checks passed! CodeLES is ready to use.'));
  }
}