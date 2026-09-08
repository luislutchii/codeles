/**
 * CodeLES Terminal Tool
 * Executa comandos no terminal/shell
 */

import { BaseToolAdapter } from './base.js';
import { ToolDefinition, ToolResult, ToolContext, ToolArtifact, ValidationResult } from '@codeles/core';
import { spawn } from 'child_process';
import * as os from 'os';

export class TerminalTool extends BaseToolAdapter {
  name = 'terminal';
  description = 'Execute shell commands in the terminal. Supports background processes, streaming output, and working directory management.';
  version = '1.0.0';

  definition: ToolDefinition = {
    type: 'function',
    function: {
      name: 'terminal',
      description: 'Execute shell commands. Use for running scripts, builds, git commands, package managers, and system operations.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The shell command to execute (e.g., "npm install", "git status", "ls -la")'
          },
          workdir: {
            type: 'string',
            description: 'Working directory for the command (default: current session working directory)'
          },
          timeout: {
            type: 'number',
            description: 'Timeout in seconds (default: 180, max: 600)',
            default: 180
          },
          background: {
            type: 'boolean',
            description: 'Run command in background (returns session_id for polling)',
            default: false
          },
          notifyOnComplete: {
            type: 'boolean',
            description: 'Notify when background process completes',
            default: true
          },
          pty: {
            type: 'boolean',
            description: 'Run in pseudo-terminal mode (for interactive CLI tools)',
            default: false
          }
        },
        required: ['command']
      }
    }
  };

  permissions = [
    { action: 'execute', allowed: true },
    { action: 'background', allowed: true }
  ];

  private backgroundProcesses: Map<string, { process: any; startTime: number; resolve: Function; reject: Function }> = new Map();

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const { command, workdir, timeout = 180, background = false, notifyOnComplete = true, pty = false } = args as {
      command: string;
      workdir?: string;
      timeout?: number;
      background?: boolean;
      notifyOnComplete?: boolean;
      pty?: boolean;
    };

    const cwd = workdir || context.workingDirectory;
    const maxTimeout = Math.min(timeout * 1000, 600000);

    if (background) {
      return this.executeBackground(command, cwd, maxTimeout, notifyOnComplete, pty);
    }

    return this.executeForeground(command, cwd, maxTimeout, pty);
  }

  private executeForeground(command: string, cwd: string, timeout: number, pty: boolean): Promise<ToolResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';

      const child = spawn(command, {
        shell: true,
        cwd,
        stdio: pty ? 'inherit' : ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, TERM: 'xterm-256color', COLUMNS: '120' }
      });

      if (!pty) {
        child.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data) => {
          stderr += data.toString();
        });
      }

      const timeoutHandle = setTimeout(() => {
        child.kill('SIGKILL');
        resolve(this.createErrorResult(`Command timed out after ${timeout}ms`, [
          this.createStdoutArtifact(stdout),
          { type: 'stderr', content: stderr, size: Buffer.byteLength(stderr, 'utf-8') }
        ]));
      }, timeout);

      child.on('close', (code) => {
        clearTimeout(timeoutHandle);
        const latencyMs = Date.now() - startTime;
        
        if (code === 0) {
          resolve(this.createSuccessResult({
            exitCode: code,
            stdout,
            stderr,
            latencyMs
          }, [
            this.createStdoutArtifact(stdout),
            { type: 'stderr', content: stderr, size: Buffer.byteLength(stderr, 'utf-8') }
          ]));
        } else {
          resolve(this.createErrorResult(`Command exited with code ${code}`, [
            this.createStdoutArtifact(stdout),
            { type: 'stderr', content: stderr, size: Buffer.byteLength(stderr, 'utf-8') }
          ]));
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeoutHandle);
        resolve(this.createErrorResult(`Failed to execute command: ${error.message}`, [
          this.createStdoutArtifact(stdout),
          { type: 'stderr', content: stderr, size: Buffer.byteLength(stderr, 'utf-8') }
        ]));
      });
    });
  }

  private executeBackground(command: string, cwd: string, timeout: number, notifyOnComplete: boolean, pty: boolean): Promise<ToolResult> {
    return new Promise((resolve) => {
      const sessionId = `term-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const startTime = Date.now();
      let stdout = '';
      let stderr = '';

      const child = spawn(command, {
        shell: true,
        cwd,
        stdio: pty ? 'inherit' : ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, TERM: 'xterm-256color', COLUMNS: '120' },
        detached: true
      });

      if (!pty) {
        child.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data) => {
          stderr += data.toString();
        });
      }

      const timeoutHandle = setTimeout(() => {
        child.kill('SIGKILL');
        this.backgroundProcesses.delete(sessionId);
        resolve(this.createErrorResult(`Background command timed out after ${timeout}ms`, [
          this.createStdoutArtifact(stdout),
          { type: 'stderr', content: stderr, size: Buffer.byteLength(stderr, 'utf-8') }
        ]));
      }, timeout);

      child.on('close', (code) => {
        clearTimeout(timeoutHandle);
        this.backgroundProcesses.delete(sessionId);
        
        if (notifyOnComplete) {
          // In a real implementation, this would trigger a notification
          console.log(`[Background] Process ${sessionId} completed with code ${code}`);
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeoutHandle);
        this.backgroundProcesses.delete(sessionId);
      });

      this.backgroundProcesses.set(sessionId, { 
        process: child, 
        startTime,
        resolve: () => {},
        reject: () => {}
      });

      resolve(this.createSuccessResult({
        sessionId,
        command,
        cwd,
        startedAt: startTime,
        status: 'running'
      }));
    });
  }

  validateArgs(args: Record<string, unknown>): ValidationResult {
    if (!args.command || typeof args.command !== 'string') {
      return { valid: false, errors: ['command is required and must be a string'], warnings: [] };
    }
    return { valid: true, errors: [], warnings: [] };
  }

  async shutdown(): Promise<void> {
    // Kill all background processes
    for (const [sessionId, proc] of this.backgroundProcesses) {
      try {
        proc.process.kill('SIGTERM');
      } catch {}
    }
    this.backgroundProcesses.clear();
  }
}