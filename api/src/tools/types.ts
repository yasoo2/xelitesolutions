export type ToolPermission = 'read' | 'write' | 'deploy' | 'delete' | 'execute';

export interface ToolDefinition {
  name: string;
  version: string;
  tags: string[];
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
  permissions: ToolPermission[];
  sideEffects: ToolPermission[];
  rateLimitPerMinute: number;
  auditFields: string[];
  mockSupported: boolean;
}

export interface ToolExecutionInput {
  name: string;
  input: any;
}

export interface ToolExecutionResult {
  ok: boolean;
  error?: string;
  output?: any;
  logs: string[];
  artifacts?: { name: string; href: string }[];
}
