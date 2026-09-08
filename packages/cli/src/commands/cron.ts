/**
 * CodeLES Cron Commands
 */

import chalk from 'chalk';
import boxen from 'boxen';
import { ConfigManager, createConfigManager } from '@codeles/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  prompt: string;
  skills?: string[];
  enabled: boolean;
  lastRun?: number;
  nextRun?: number;
  runCount: number;
  status: string;
  config?: {
    model?: { provider: string; model: string };
    deliver?: string;
    noAgent?: boolean;
    script?: string;
    workdir?: string;
    contextFrom?: string[];
    enabledToolsets?: string[];
    attachToSession?: boolean;
  };
}

function getCronDir(profile: string = 'default'): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.codeles', 'profiles', profile, 'cron');
}

function getCronFile(id: string, profile: string = 'default'): string {
  return path.join(getCronDir(profile), `${id}.json`);
}

async function listCronJobs(): Promise<CronJob[]> {
  const dir = getCronDir();
  try {
    const files = await fs.readdir(dir);
    const jobs: CronJob[] = [];
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const content = await fs.readFile(path.join(dir, file), 'utf-8');
          jobs.push(JSON.parse(content));
        } catch {}
      }
    }
    
    return jobs.sort((a, b) => (a.nextRun || 0) - (b.nextRun || 0));
  } catch {
    return [];
  }
}

export async function createCron(name: string, schedule: string, prompt: string, options: {
  skills?: string;
  model?: string;
  noAgent?: boolean;
  script?: string;
}) {
  const jobId = `cron-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  
  const job: CronJob = {
    id: jobId,
    name,
    schedule,
    prompt,
    skills: options.skills?.split(',').map(s => s.trim()),
    enabled: true,
    runCount: 0,
    status: 'idle',
    config: {
      noAgent: options.noAgent,
      script: options.script,
      model: options.model ? { provider: 'nvidia', model: options.model } : undefined
    }
  };

  const dir = getCronDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(getCronFile(jobId), JSON.stringify(job, null, 2), 'utf-8');
  
  console.log(chalk.green(`✓ Cron job created: ${jobId}`));
  console.log(chalk.gray(`Name: ${name}`));
  console.log(chalk.gray(`Schedule: ${schedule}`));
  console.log(chalk.gray(`Prompt: ${prompt.slice(0, 80)}${prompt.length > 80 ? '...' : ''}`));
}

export async function listCron() {
  const jobs = await listCronJobs();
  
  if (jobs.length === 0) {
    console.log(boxen(
      chalk.bold.cyan('Cron Jobs') + '\n\n' +
      chalk.gray('No cron jobs configured.') + '\n\n' +
      chalk.gray('Use: codeles cron create <name> <schedule> <prompt>'),
      { padding: 1, borderStyle: 'round', borderColor: 'cyan' }
    ));
    return;
  }

  console.log(boxen(
    chalk.bold.cyan(`Cron Jobs (${jobs.length})`) + '\n\n' +
    jobs.map(job => 
      `  ${chalk.cyan(job.name)} (${job.id})\n` +
      `    Schedule: ${chalk.white(job.schedule)}\n` +
      `    Status: ${job.enabled ? chalk.green('Enabled') : chalk.red('Disabled')} | Runs: ${job.runCount}\n` +
      `    Prompt: ${job.prompt.slice(0, 100)}${job.prompt.length > 100 ? '...' : ''}\n` +
      (job.lastRun ? `    Last: ${new Date(job.lastRun).toLocaleString()}` : '    Last: Never') +
      (job.nextRun ? ` | Next: ${new Date(job.nextRun).toLocaleString()}` : '')
    ).join('\n\n') + '\n\n' +
    chalk.gray('Use: codeles cron run|remove <id>'),
    { padding: 1, borderStyle: 'round', borderColor: 'cyan' }
  ));
}

export async function removeCron(id: string) {
  try {
    await fs.unlink(getCronFile(id));
    console.log(chalk.green(`✓ Cron job removed: ${id}`));
  } catch {
    console.log(chalk.red(`Cron job not found: ${id}`));
  }
}

export async function runCron(id: string) {
  try {
    const content = await fs.readFile(getCronFile(id), 'utf-8');
    const job = JSON.parse(content) as CronJob;
    
    console.log(chalk.cyan(`Running cron job: ${job.name}`));
    console.log(chalk.gray(`Prompt: ${job.prompt}`));
    
    // In a real implementation, this would trigger the agent
    console.log(chalk.yellow('Cron execution not fully implemented in CLI yet.'));
    console.log(chalk.gray('This would run the agent with the configured prompt.'));
    
    // Update job
    job.lastRun = Date.now();
    job.runCount++;
    job.status = 'completed';
    
    await fs.writeFile(getCronFile(id), JSON.stringify(job, null, 2), 'utf-8');
    
    console.log(chalk.green('✓ Cron job executed (simulated)'));
  } catch {
    console.log(chalk.red(`Cron job not found: ${id}`));
  }
}