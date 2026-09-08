/**
 * CodeLES Memory Commands
 */

import chalk from 'chalk';
import boxen from 'boxen';
import { ConfigManager, createConfigManager } from '@codeles/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

interface MemoryEntry {
  id: string;
  target: 'user' | 'memory' | 'session';
  content: string;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

function getMemoryPath(target: string, profile: string = 'default'): string {
  const homeDir = os.homedir();
  const baseDir = path.join(homeDir, '.codeles', 'profiles', profile, 'memory');
  return path.join(baseDir, `${target}.json`);
}

async function loadMemory(target: string): Promise<MemoryEntry[]> {
  const filePath = getMemoryPath(target);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

async function saveMemory(target: string, entries: MemoryEntry[]): Promise<void> {
  const filePath = getMemoryPath(target);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(entries, null, 2), 'utf-8');
}

export async function addMemory(target: string, content: string) {
  if (!['user', 'memory'].includes(target)) {
    console.log(chalk.red('Target must be "user" or "memory"'));
    return;
  }

  const entries = await loadMemory(target);
  const newEntry: MemoryEntry = {
    id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    target: target as 'user' | 'memory',
    content,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  entries.unshift(newEntry);
  // Keep only last 1000 entries
  if (entries.length > 1000) entries.length = 1000;
  
  await saveMemory(target, entries);
  console.log(chalk.green(`✓ Memory added to ${target}: ${newEntry.id}`));
}

export async function searchMemory(target: string, query: string, limit: number = 10) {
  if (!['user', 'memory'].includes(target)) {
    console.log(chalk.red('Target must be "user" or "memory"'));
    return;
  }

  const entries = await loadMemory(target);
  const results = entries
    .filter(e => e.content.toLowerCase().includes(query.toLowerCase()))
    .slice(0, limit);

  if (results.length === 0) {
    console.log(chalk.yellow(`No results found for "${query}" in ${target}`));
    return;
  }

  console.log(boxen(
    chalk.bold.cyan(`Memory Search: "${query}" (${target})`) + '\n\n' +
    results.map((e, i) => 
      `${chalk.cyan(`${i + 1}.`)} ${e.content.slice(0, 200)}${e.content.length > 200 ? '...' : ''}\n` +
      `    ${chalk.gray(`ID: ${e.id} | ${new Date(e.createdAt).toLocaleString()}`)}`
    ).join('\n\n'),
    { padding: 1, borderStyle: 'round', borderColor: 'cyan' }
  ));
}

export async function listMemory(target: string, limit: number = 20) {
  if (!['user', 'memory'].includes(target)) {
    console.log(chalk.red('Target must be "user" or "memory"'));
    return;
  }

  const entries = await loadMemory(target).then(e => e.slice(0, limit));

  if (entries.length === 0) {
    console.log(chalk.yellow(`No memories in ${target}`));
    return;
  }

  console.log(boxen(
    chalk.bold.cyan(`Memory: ${target} (${entries.length} entries)`) + '\n\n' +
    entries.map((e, i) => 
      `${chalk.cyan(`${i + 1}.`)} ${e.content.slice(0, 150)}${e.content.length > 150 ? '...' : ''}\n` +
      `    ${chalk.gray(`ID: ${e.id} | ${new Date(e.createdAt).toLocaleString()}`)}`
    ).join('\n\n'),
    { padding: 1, borderStyle: 'round', borderColor: 'cyan' }
  ));
}

export async function clearMemory(target: string) {
  if (!['user', 'memory'].includes(target)) {
    console.log(chalk.red('Target must be "user" or "memory"'));
    return;
  }

  await saveMemory(target, []);
  console.log(chalk.green(`✓ ${target} memory cleared`));
}