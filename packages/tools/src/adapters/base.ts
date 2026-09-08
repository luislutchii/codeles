/**
 * CodeLES Base Tool Adapter
 * Classe base para todas as ferramentas
 */

import {
  ToolAdapter,
  ToolDefinition,
  ToolResult,
  ToolContext,
  ToolPermission,
  ValidationResult,
  ToolArtifact
} from '@codeles/core';

export abstract class BaseToolAdapter implements ToolAdapter {
  abstract name: string;
  abstract description: string;
  abstract version: string;
  abstract definition: ToolDefinition;
  abstract permissions: ToolPermission[];

  async initialize(config?: Record<string, unknown>): Promise<void> {
    // Override in subclasses if needed
  }

  abstract execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;

  validateArgs(args: Record<string, unknown>): ValidationResult {
    // Basic validation - override in subclasses for specific validation
    const schema = this.definition.function.parameters;
    return this.validateAgainstSchema(args, schema);
  }

  async shutdown(): Promise<void> {
    // Override in subclasses if needed
  }

  protected validateAgainstSchema(args: Record<string, unknown>, schema: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (schema.type !== 'object') {
      return { valid: false, errors: ['Schema must be an object'], warnings };
    }

    // Check required fields
    if (schema.required) {
      for (const required of schema.required) {
        if (!(required in args)) {
          errors.push(`Required parameter missing: ${required}`);
        }
      }
    }

    // Check properties
    if (schema.properties) {
      for (const [key, value] of Object.entries(args)) {
        const propSchema = schema.properties[key];
        if (!propSchema) {
          warnings.push(`Unknown parameter: ${key}`);
          continue;
        }
        const propErrors = this.validateProperty(key, value, propSchema);
        errors.push(...propErrors);
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private validateProperty(key: string, value: unknown, schema: any): string[] {
    const errors: string[] = [];

    if (schema.type === 'string' && typeof value !== 'string') {
      errors.push(`${key}: expected string, got ${typeof value}`);
    } else if (schema.type === 'number' && typeof value !== 'number') {
      errors.push(`${key}: expected number, got ${typeof value}`);
    } else if (schema.type === 'boolean' && typeof value !== 'boolean') {
      errors.push(`${key}: expected boolean, got ${typeof value}`);
    } else if (schema.type === 'array' && !Array.isArray(value)) {
      errors.push(`${key}: expected array, got ${typeof value}`);
    } else if (schema.type === 'object' && (typeof value !== 'object' || value === null || Array.isArray(value))) {
      errors.push(`${key}: expected object, got ${typeof value}`);
    }

    if (schema.enum && !schema.enum.includes(value)) {
      errors.push(`${key}: value must be one of ${schema.enum.join(', ')}`);
    }

    return errors;
  }

  protected createSuccessResult(output: unknown, artifacts?: ToolArtifact[]): ToolResult {
    return { success: true, output, artifacts };
  }

  protected createErrorResult(error: string, artifacts?: ToolArtifact[]): ToolResult {
    return { success: false, error, artifacts };
  }

  protected createFileArtifact(path: string, content: string, mimeType: string = 'text/plain'): ToolArtifact {
    return {
      type: 'file',
      path,
      content,
      mimeType,
      size: Buffer.byteLength(content, 'utf-8')
    };
  }

  protected createStdoutArtifact(content: string): ToolArtifact {
    return {
      type: 'stdout',
      content,
      size: Buffer.byteLength(content, 'utf-8')
    };
  }
}