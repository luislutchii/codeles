/**
 * CodeLES Delegation Commands
 */

import chalk from 'chalk';
import boxen from 'boxen';
import { toolRegistry } from '@codeles/tools';

export async function spawnDelegation(goal: string, options: { context?: string; role?: 'leaf' | 'orchestrator' }) {
  console.log(boxen(
    chalk.bold.cyan('Spawning Subagent') + '\n\n' +
    `Goal: ${chalk.white(goal)}\n` +
    `Context: ${chalk.gray(options.context || 'None')}\n` +
    `Role: ${chalk.cyan(options.role || 'leaf')}`,
    { padding: 1, borderStyle: 'round', borderColor: 'cyan' }
  ));

  try {
    const result = await toolRegistry.executeTool('delegation', {
      action: 'spawn',
      goal,
      context: options.context,
      role: options.role || 'leaf'
    }, {
      session: {} as any,
      config: {} as any,
      workingDirectory: process.cwd(),
      environmentVariables: process.env as Record<string, string>,
      memory: {} as any,
      skills: {} as any
    });

    if (result.success) {
      console.log(chalk.green(`✓ Subagent spawned: ${result.output?.subagentId}`));
      console.log(chalk.gray(`Status: ${result.output?.status}`));
    } else {
      console.log(chalk.red(`✗ Failed: ${result.error}`));
    }
  } catch (error) {
    console.log(chalk.red(`✗ Error: ${error instanceof Error ? error.message : String(error)}`));
  }
}

export async function batchDelegation(options: { file?: string }) {
  console.log(chalk.yellow('Batch delegation not fully implemented yet.'));
  console.log(chalk.gray('Use a JSON file with tasks array.'));
}

export async function listDelegations() {
  try {
    const result = await toolRegistry.executeTool('delegation', {
      action: 'list'
    }, {
      session: {} as any,
      config: {} as any,
      workingDirectory: process.cwd(),
      environmentVariables: process.env as Record<string, string>,
      memory: {} as any,
      skills: {} as any
    });

    if (result.success && result.output?.delegations) {
      const delegations = result.output.delegations;
      
      if (delegations.length === 0) {
        console.log(chalk.gray('No active delegations.'));
        return;
      }

      console.log(boxen(
        chalk.bold.cyan(`Active Delegations (${delegations.length})`) + '\n\n' +
        delegations.map((d: any) => 
          `  ${chalk.cyan(d.subagentId)}\n` +
          `    Goal: ${d.goal}\n` +
          `    Role: ${d.role} | Status: ${d.status}\n` +
          `    Elapsed: ${Math.round(d.elapsedMs / 1000)}s`
        ).join('\n\n'),
        { padding: 1, borderStyle: 'round', borderColor: 'cyan' }
      ));
    }
  } catch (error) {
    console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
  }
}

export async function cancelDelegation(id: string) {
  try {
    const result = await toolRegistry.executeTool('delegation', {
      action: 'cancel',
      subagentId: id
    }, {
      session: {} as any,
      config: {} as any,
      workingDirectory: process.cwd(),
      environmentVariables: process.env as Record<string, string>,
      memory: {} as any,
      skills: {} as any
    });

    if (result.success) {
      console.log(chalk.green(`✓ Delegation ${id} cancelled`));
    } else {
      console.log(chalk.red(`✗ ${result.error}`));
    }
  } catch (error) {
    console.log(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
  }
}