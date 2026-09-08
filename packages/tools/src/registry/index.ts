/**
 * CodeLES Tools Registry
 * Central registry for all tools
 */

import { ToolAdapter, ToolDefinition, ToolPermission, ValidationResult, ToolContext } from '@codeles/core';
import { TerminalTool } from '../adapters/terminal.js';
import { FileSystemTool } from '../adapters/filesystem.js';
import { WebTool } from '../adapters/web.js';
import { DelegationTool } from '../adapters/delegation.js';

export class ToolRegistry {
  private tools: Map<string, ToolAdapter> = new Map();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    this.registerTool(new TerminalTool());
    this.registerTool(new FileSystemTool());
    this.registerTool(new WebTool());
    this.registerTool(new DelegationTool());
  }

  registerTool(tool: ToolAdapter): void {
    this.tools.set(tool.name, tool);
  }

  unregisterTool(name: string): void {
    this.tools.delete(name);
  }

  getTool(name: string): ToolAdapter | undefined {
    return this.tools.get(name);
  }

  listTools(): ToolAdapter[] {
    return Array.from(this.tools.values());
  }

  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => t.definition);
  }

  getToolsByPermission(action: string): ToolAdapter[] {
    return Array.from(this.tools.values()).filter(tool => 
      tool.permissions.some(p => p.action === action && p.allowed)
    );
  }

  async initializeTool(name: string, config?: Record<string, unknown>): Promise<ToolAdapter> {
    const tool = this.getTool(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    await tool.initialize(config);
    return tool;
  }

  async initializeAllTools(configs?: Record<string, Record<string, unknown>>): Promise<void> {
    for (const [name, tool] of this.tools) {
      const config = configs?.[name];
      await tool.initialize(config);
    }
  }

  async shutdownAllTools(): Promise<void> {
    for (const tool of this.tools.values()) {
      await tool.shutdown();
    }
  }

  async validateToolArgs(name: string, args: Record<string, unknown>): Promise<ValidationResult> {
    const tool = this.getTool(name);
    if (!tool) {
      return { valid: false, errors: [`Tool not found: ${name}`], warnings: [] };
    }
    return tool.validateArgs(args);
  }

  async executeTool(name: string, args: Record<string, unknown>, context: ToolContext): Promise<any> {
    const tool = this.getTool(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    return tool.execute(args, context);
  }
}

// Singleton instance
export const toolRegistry = new ToolRegistry();