/**
 * CodeLES Session Commands
 */

import chalk from 'chalk';
import boxen from 'boxen';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  provider: string;
  model: string;
  totalTokens: number;
}

function getSessionsDir(profile: string = 'default'): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.codeles', 'profiles', profile, 'sessions');
}

function getSessionFile(id: string, profile: string = 'default'): string {
  return path.join(getSessionsDir(profile), `${id}.json`);
}

export async function listSessions(): Promise<Session[]> {
  const dir = getSessionsDir();
  try {
    const files = await fs.readdir(dir);
    const sessions: Session[] = [];
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const content = await fs.readFile(path.join(dir, file), 'utf-8');
          const session = JSON.parse(content) as Session;
          sessions.push(session);
        } catch {}
      }
    }
    
    return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function listSessionsCmd() {
  const sessions = await listSessions();
  
  if (sessions.length === 0) {
    console.log(boxen(
      chalk.bold.cyan('Sessions') + '\n\n' +
      chalk.gray('No sessions found.') + '\n\n' +
      chalk.gray('Use: codeles session new [title]'),
      { padding: 1, borderStyle: 'round', borderColor: 'cyan' }
    ));
    return;
  }

  console.log(boxen(
    chalk.bold.cyan(`Sessions (${sessions.length})`) + '\n\n' +
    sessions.map((s, i) => 
      `${chalk.cyan(`${i + 1}.`)} ${chalk.bold(s.title || 'Untitled')}\n` +
      `    ID: ${s.id}\n` +
      `    ${chalk.gray(`${s.messageCount} msgs | ${s.provider}/${s.model} | ${s.totalTokens} tokens`)}` +
      `\n    ${chalk.gray(`Created: ${new Date(s.createdAt).toLocaleString()} | Updated: ${new Date(s.updatedAt).toLocaleString()}`)}`
    ).join('\n\n') + '\n\n' +
    chalk.gray('Use: codeles session load|delete <id>'),
    { padding: 1, borderStyle: 'round', borderColor: 'cyan' }
  ));
}

export async function newSession(title?: string) {
  const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const session: Session = {
    id: sessionId,
    title: title || 'New Session',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messageCount: 0,
    provider: 'nvidia',
    model: 'nvidia/nemotron-3-ultra',
    totalTokens: 0
  };

  const dir = getSessionsDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(getSessionFile(sessionId), JSON.stringify(session, null, 2), 'utf-8');
  
  console.log(chalk.green(`✓ Session created: ${sessionId}`));
  console.log(chalk.gray(`Title: ${session.title}`));
}

export async function loadSession(id: string) {
  try {
    const content = await fs.readFile(getSessionFile(id), 'utf-8');
    const session = JSON.parse(content) as Session;
    
    console.log(boxen(
      chalk.bold.cyan(`Session: ${session.title}`) + '\n\n' +
      `ID: ${session.id}\n` +
      `Messages: ${session.messageCount}\n` +
      `Provider: ${session.provider}\n` +
      `Model: ${session.model}\n` +
      `Total Tokens: ${session.totalTokens}\n` +
      `Created: ${new Date(session.createdAt).toLocaleString()}\n` +
      `Updated: ${new Date(session.updatedAt).toLocaleString()}`,
      { padding: 1, borderStyle: 'round', borderColor: 'cyan' }
    ));
    
    // In a real implementation, this would load the session into the chat
    console.log(chalk.gray('\nSession loaded. Use "codeles chat" to continue.'));
  } catch {
    console.log(chalk.red(`Session not found: ${id}`));
  }
}

export async function deleteSession(id: string) {
  try {
    await fs.unlink(getSessionFile(id));
    console.log(chalk.green(`✓ Session deleted: ${id}`));
  } catch {
    console.log(chalk.red(`Session not found: ${id}`));
  }
}