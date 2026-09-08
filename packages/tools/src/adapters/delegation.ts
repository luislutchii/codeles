/**
 * CodeLES Delegation Tool
 * Spawn subagents for parallel task execution
 */

import { BaseToolAdapter } from './base.js';
import { ToolDefinition, ToolResult, ToolContext, ToolArtifact, ValidationResult } from '@codeles/core';

export class DelegationTool extends BaseToolAdapter {
  name = 'delegation';
  description = 'Spawn subagents to work on tasks in parallel. Supports leaf agents (focused workers) and orchestrator agents (can spawn their own workers).';
  version = '1.0.0';

  definition: ToolDefinition = {
    type: 'function',
    function: {
      name: 'delegation',
      description: 'Delegate tasks to subagents for parallel execution. Each subagent gets isolated context and terminal session.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['spawn', 'batch', 'status', 'cancel', 'list'],
            description: 'Delegation action'
          },
          goal: {
            type: 'string',
            description: 'Task goal for the subagent (required for spawn/batch)'
          },
          context: {
            type: 'string',
            description: 'Background context for the subagent'
          },
          role: {
            type: 'string',
            enum: ['leaf', 'orchestrator'],
            description: 'Subagent role (default: leaf)',
            default: 'leaf'
          },
          tasks: {
            type: 'array',
            description: 'Array of tasks for batch mode',
            items: {
              type: 'object',
              properties: {
                goal: { type: 'string' },
                context: { type: 'string' },
                role: { type: 'string', enum: ['leaf', 'orchestrator'] }
              },
              required: ['goal']
            }
          },
          subagentId: {
            type: 'string',
            description: 'Subagent ID for status/cancel actions'
          }
        },
        required: ['action']
      }
    }
  };

  permissions = [
    { action: 'spawn', allowed: true },
    { action: 'batch', allowed: true },
    { action: 'status', allowed: true },
    { action: 'cancel', allowed: true }
  ];

  private activeDelegations: Map<string, { goal: string; context: string; role: string; status: string; startTime: number; result?: any }> = new Map();

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const { action, goal, context: taskContext, role = 'leaf', tasks, subagentId } = args as {
      action: string;
      goal?: string;
      context?: string;
      role?: 'leaf' | 'orchestrator';
      tasks?: Array<{ goal: string; context?: string; role?: 'leaf' | 'orchestrator' }>;
      subagentId?: string;
    };

    try {
      switch (action) {
        case 'spawn':
          if (!goal) return this.createErrorResult('goal is required for spawn');
          return await this.spawnSubagent(goal, taskContext || '', role, context);
        case 'batch':
          if (!tasks || tasks.length === 0) return this.createErrorResult('tasks array is required for batch');
          return await this.spawnBatch(tasks, context);
        case 'status':
          if (!subagentId) return this.createErrorResult('subagentId is required for status');
          return this.getStatus(subagentId);
        case 'cancel':
          if (!subagentId) return this.createErrorResult('subagentId is required for cancel');
          return this.cancelSubagent(subagentId);
        case 'list':
          return this.listDelegations();
        default:
          return this.createErrorResult(`Unknown action: ${action}`);
      }
    } catch (error) {
      return this.createErrorResult(`Delegation error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async spawnSubagent(goal: string, taskContext: string, role: 'leaf' | 'orchestrator', parentContext: ToolContext): Promise<ToolResult> {
    const subagentId = `delegation-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const startTime = Date.now();

    // In a real implementation, this would spawn a separate process/agent
    // For now, we simulate by storing the delegation info
    this.activeDelegations.set(subagentId, {
      goal,
      context: taskContext,
      role,
      status: 'running',
      startTime
    });

    // Simulate async completion (in real implementation, this would be a background process)
    setTimeout(() => {
      const delegation = this.activeDelegations.get(subagentId);
      if (delegation) {
        delegation.status = 'completed';
        delegation.result = {
          summary: `Completed: ${goal}`,
          output: `Subagent ${subagentId} finished task: ${goal}`,
          artifacts: []
        };
      }
    }, 1000);

    return this.createSuccessResult({
      subagentId,
      goal,
      role,
      status: 'running',
      startedAt: startTime
    }, [{
      type: 'stdout',
      content: `Spawned subagent ${subagentId} with goal: ${goal}`,
      size: 0
    }]);
  }

  private async spawnBatch(tasks: Array<{ goal: string; context?: string; role?: 'leaf' | 'orchestrator' }>, parentContext: ToolContext): Promise<ToolResult> {
    const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const subagentIds: string[] = [];

    for (const task of tasks.slice(0, 3)) { // Max 3 concurrent
      const subagentId = `delegation-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      subagentIds.push(subagentId);
      
      this.activeDelegations.set(subagentId, {
        goal: task.goal,
        context: task.context || '',
        role: task.role || 'leaf',
        status: 'running',
        startTime: Date.now()
      });
    }

    return this.createSuccessResult({
      batchId,
      subagentIds,
      totalTasks: tasks.length,
      status: 'running'
    }, [{
      type: 'stdout',
      content: `Spawned batch ${batchId} with ${subagentIds.length} subagents`,
      size: 0
    }]);
  }

  private getStatus(subagentId: string): ToolResult {
    const delegation = this.activeDelegations.get(subagentId);
    if (!delegation) {
      return this.createErrorResult(`Subagent not found: ${subagentId}`);
    }

    return this.createSuccessResult({
      subagentId,
      ...delegation,
      elapsedMs: Date.now() - delegation.startTime
    });
  }

  private cancelSubagent(subagentId: string): ToolResult {
    const delegation = this.activeDelegations.get(subagentId);
    if (!delegation) {
      return this.createErrorResult(`Subagent not found: ${subagentId}`);
    }

    delegation.status = 'cancelled';
    return this.createSuccessResult({ subagentId, status: 'cancelled' });
  }

  private listDelegations(): ToolResult {
    const delegations = Array.from(this.activeDelegations.entries()).map(([id, d]) => ({
      subagentId: id,
      goal: d.goal,
      role: d.role,
      status: d.status,
      startTime: d.startTime,
      elapsedMs: Date.now() - d.startTime
    }));

    return this.createSuccessResult({
      delegations,
      total: delegations.length
    });
  }

  validateArgs(args: Record<string, unknown>): ValidationResult {
    if (!args.action || typeof args.action !== 'string') {
      return { valid: false, errors: ['action is required'], warnings: [] };
    }
    if (['spawn', 'batch'].includes(args.action as string) && !args.goal && !args.tasks) {
      return { valid: false, errors: ['goal or tasks required for spawn/batch'], warnings: [] };
    }
    if (['status', 'cancel'].includes(args.action as string) && !args.subagentId) {
      return { valid: false, errors: ['subagentId required for status/cancel'], warnings: [] };
    }
    return { valid: true, errors: [], warnings: [] };
  }
}