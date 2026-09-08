/**
 * CodeLES File System Tool
 * Operações de leitura, escrita, busca e manipulação de arquivos
 */

import { BaseToolAdapter } from './base.js';
import { ToolDefinition, ToolResult, ToolContext, ToolArtifact, ValidationResult } from '@codeles/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { glob } from 'glob';

export class FileSystemTool extends BaseToolAdapter {
  name = 'filesystem';
  description = 'Read, write, search, and manipulate files and directories. Supports glob patterns, recursive operations, and safe path resolution.';
  version = '1.0.0';

  definition: ToolDefinition = {
    type: 'function',
    function: {
      name: 'filesystem',
      description: 'File system operations: read, write, list, search, copy, move, delete, and glob patterns.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['read', 'write', 'append', 'delete', 'list', 'glob', 'search', 'exists', 'mkdir', 'copy', 'move', 'stat'],
            description: 'Operation to perform'
          },
          path: {
            type: 'string',
            description: 'File or directory path (relative to working directory or absolute)'
          },
          content: {
            type: 'string',
            description: 'Content for write/append operations'
          },
          pattern: {
            type: 'string',
            description: 'Glob pattern for glob/search actions (e.g., "**/*.ts", "src/**/*.test.ts")'
          },
          recursive: {
            type: 'boolean',
            description: 'Recursive operation for list/copy/move/delete',
            default: false
          },
          encoding: {
            type: 'string',
            description: 'File encoding (default: utf-8)',
            default: 'utf-8'
          },
          limit: {
            type: 'number',
            description: 'Maximum results for list/glob/search',
            default: 100
          },
          offset: {
            type: 'number',
            description: 'Offset for pagination',
            default: 0
          }
        },
        required: ['action', 'path']
      }
    }
  };

  permissions = [
    { action: 'read', allowed: true },
    { action: 'write', allowed: true },
    { action: 'delete', allowed: true, conditions: { requireConfirmation: true } },
    { action: 'list', allowed: true },
    { action: 'search', allowed: true }
  ];

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const { action, path: inputPath, content, pattern, recursive = false, encoding = 'utf-8', limit = 100, offset = 0 } = args as {
      action: string;
      path: string;
      content?: string;
      pattern?: string;
      recursive?: boolean;
      encoding?: string;
      limit?: number;
      offset?: number;
    };

    const resolvedPath = this.resolvePath(inputPath, context.workingDirectory);

    try {
      switch (action) {
        case 'read':
          return await this.readFile(resolvedPath, encoding, limit, offset);
        case 'write':
          return await this.writeFile(resolvedPath, content || '', encoding);
        case 'append':
          return await this.appendFile(resolvedPath, content || '', encoding);
        case 'delete':
          return await this.deletePath(resolvedPath, recursive);
        case 'list':
          return await this.listDirectory(resolvedPath, recursive, limit, offset);
        case 'glob':
          return await this.globFiles(pattern || '**/*', resolvedPath, limit);
        case 'search':
          return await this.searchFiles(pattern || '', resolvedPath, limit, encoding);
        case 'exists':
          return await this.checkExists(resolvedPath);
        case 'mkdir':
          return await this.makeDirectory(resolvedPath, recursive);
        case 'copy':
          return await this.copyPath(resolvedPath, content || '', recursive);
        case 'move':
          return await this.movePath(resolvedPath, content || '');
        case 'stat':
          return await this.getStats(resolvedPath);
        default:
          return this.createErrorResult(`Unknown action: ${action}`);
      }
    } catch (error) {
      return this.createErrorResult(`Filesystem error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private resolvePath(inputPath: string, workingDir: string): string {
    if (path.isAbsolute(inputPath)) {
      return inputPath;
    }
    return path.resolve(workingDir, inputPath);
  }

  private async readFile(filePath: string, encoding: string, limit: number, offset: number): Promise<ToolResult> {
    const stats = await fs.stat(filePath);
    if (stats.isDirectory()) {
      return this.createErrorResult('Path is a directory, use list action');
    }

    const fileHandle = await fs.open(filePath, 'r');
    const buffer = Buffer.alloc(Math.min(limit * 1000, stats.size));
    const { bytesRead } = await fileHandle.read(buffer, 0, buffer.length, offset * 1000);
    await fileHandle.close();

    const content = buffer.subarray(0, bytesRead).toString(encoding as BufferEncoding);
    
    return this.createSuccessResult({
      path: filePath,
      content,
      size: stats.size,
      lines: content.split('\n').length,
      truncated: bytesRead < stats.size
    }, [this.createFileArtifact(filePath, content)]);
  }

  private async writeFile(filePath: string, content: string, encoding: string): Promise<ToolResult> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, encoding as BufferEncoding);
    
    return this.createSuccessResult({
      path: filePath,
      bytesWritten: Buffer.byteLength(content, encoding as BufferEncoding),
      lines: content.split('\n').length
    }, [this.createFileArtifact(filePath, content)]);
  }

  private async appendFile(filePath: string, content: string, encoding: string): Promise<ToolResult> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.appendFile(filePath, content, encoding as BufferEncoding);
    
    const stats = await fs.stat(filePath);
    return this.createSuccessResult({
      path: filePath,
      bytesAppended: Buffer.byteLength(content, encoding as BufferEncoding),
      newSize: stats.size
    });
  }

  private async deletePath(filePath: string, recursive: boolean): Promise<ToolResult> {
    const stats = await fs.stat(filePath);
    
    if (stats.isDirectory()) {
      if (!recursive) {
        return this.createErrorResult('Directory not empty, use recursive: true');
      }
      await fs.rm(filePath, { recursive: true, force: true });
    } else {
      await fs.unlink(filePath);
    }

    return this.createSuccessResult({ path: filePath, deleted: true });
  }

  private async listDirectory(dirPath: string, recursive: boolean, limit: number, offset: number): Promise<ToolResult> {
    const entries: Array<{ name: string; type: 'file' | 'directory' | 'symlink'; size: number; modified: number }> = [];
    
    const listDir = async (currentPath: string, basePath: string) => {
      const items = await fs.readdir(currentPath, { withFileTypes: true });
      
      for (const item of items) {
        if (entries.length >= offset + limit) break;
        
        const fullPath = path.join(currentPath, item.name);
        const relativePath = path.relative(basePath, fullPath);
        const stats = await fs.stat(fullPath);
        
        if (entries.length >= offset) {
          entries.push({
            name: relativePath,
            type: item.isDirectory() ? 'directory' : item.isSymbolicLink() ? 'symlink' : 'file',
            size: stats.size,
            modified: stats.mtimeMs
          });
        }
        
        if (recursive && item.isDirectory() && !item.isSymbolicLink()) {
          await listDir(fullPath, basePath);
        }
      }
    };

    await listDir(dirPath, dirPath);
    
    return this.createSuccessResult({
      path: dirPath,
      entries: entries.slice(0, limit),
      total: entries.length
    });
  }

  private async globFiles(pattern: string, basePath: string, limit: number): Promise<ToolResult> {
    const files = await glob(pattern, {
      cwd: basePath,
      absolute: true,
      nodir: true
    });

    const results = await Promise.all(
      files.slice(0, limit).map(async (file) => {
        const stats = await fs.stat(file);
        const relativePath = path.relative(basePath, file);
        return {
          path: relativePath,
          absolutePath: file,
          size: stats.size,
          modified: stats.mtimeMs
        };
      })
    );

    return this.createSuccessResult({
      pattern,
      basePath,
      files: results,
      total: results.length
    });
  }

  private async searchFiles(pattern: string, basePath: string, limit: number, encoding: string): Promise<ToolResult> {
    const results: Array<{ file: string; line: number; column: number; match: string; context: string }> = [];
    
    const files = await glob('**/*', { cwd: basePath, absolute: true, nodir: true });
    
    for (const file of files) {
      if (results.length >= limit) break;
      
      try {
        const content = await fs.readFile(file, encoding as BufferEncoding);
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
          if (results.length >= limit) break;
          
          const line = lines[i];
          const index = line.toLowerCase().indexOf(pattern.toLowerCase());
          if (index !== -1) {
            const relativePath = path.relative(basePath, file);
            results.push({
              file: relativePath,
              line: i + 1,
              column: index + 1,
              match: line.trim(),
              context: lines.slice(Math.max(0, i - 1), i + 2).join('\n')
            });
          }
        }
      } catch {
        // Skip binary/unreadable files
      }
    }

    return this.createSuccessResult({
      pattern,
      basePath,
      matches: results,
      total: results.length
    });
  }

  private async checkExists(filePath: string): Promise<ToolResult> {
    try {
      const stats = await fs.stat(filePath);
      return this.createSuccessResult({
        path: filePath,
        exists: true,
        type: stats.isDirectory() ? 'directory' : 'file',
        size: stats.size,
        modified: stats.mtimeMs
      });
    } catch {
      return this.createSuccessResult({
        path: filePath,
        exists: false
      });
    }
  }

  private async makeDirectory(dirPath: string, recursive: boolean): Promise<ToolResult> {
    await fs.mkdir(dirPath, { recursive });
    return this.createSuccessResult({ path: dirPath, created: true });
  }

  private async copyPath(srcPath: string, destPath: string, recursive: boolean): Promise<ToolResult> {
    const resolvedDest = path.isAbsolute(destPath) ? destPath : path.join(path.dirname(srcPath), destPath);
    
    const stats = await fs.stat(srcPath);
    if (stats.isDirectory()) {
      if (!recursive) {
        return this.createErrorResult('Directory copy requires recursive: true');
      }
      await this.copyDirRecursive(srcPath, resolvedDest);
    } else {
      await fs.mkdir(path.dirname(resolvedDest), { recursive: true });
      await fs.copyFile(srcPath, resolvedDest);
    }

    return this.createSuccessResult({ source: srcPath, destination: resolvedDest, copied: true });
  }

  private async copyDirRecursive(src: string, dest: string): Promise<void> {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      if (entry.isDirectory()) {
        await this.copyDirRecursive(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  private async movePath(srcPath: string, destPath: string): Promise<ToolResult> {
    const resolvedDest = path.isAbsolute(destPath) ? destPath : path.join(path.dirname(srcPath), destPath);
    await fs.mkdir(path.dirname(resolvedDest), { recursive: true });
    await fs.rename(srcPath, resolvedDest);
    
    return this.createSuccessResult({ source: srcPath, destination: resolvedDest, moved: true });
  }

  private async getStats(filePath: string): Promise<ToolResult> {
    const stats = await fs.stat(filePath);
    return this.createSuccessResult({
      path: filePath,
      size: stats.size,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
      isSymbolicLink: stats.isSymbolicLink(),
      created: stats.birthtimeMs,
      modified: stats.mtimeMs,
      accessed: stats.atimeMs,
      permissions: stats.mode.toString(8).slice(-3)
    });
  }

  validateArgs(args: Record<string, unknown>): ValidationResult {
    if (!args.action || typeof args.action !== 'string') {
      return { valid: false, errors: ['action is required'], warnings: [] };
    }
    if (!args.path || typeof args.path !== 'string') {
      return { valid: false, errors: ['path is required'], warnings: [] };
    }
    if (['write', 'append'].includes(args.action) && args.content === undefined) {
      return { valid: false, errors: ['content is required for write/append'], warnings: [] };
    }
    if (['copy', 'move'].includes(args.action) && !args.content) {
      return { valid: false, errors: ['destination path (content) is required for copy/move'], warnings: [] };
    }
    return { valid: true, errors: [], warnings: [] };
  }
}