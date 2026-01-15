import { ToolDefinition, ToolPermission, ToolExecutionResult } from './types';

export abstract class BaseTool implements ToolDefinition {
    abstract name: string;
    abstract description?: string;
    version = '2.0.0';
    abstract tags: string[];

    abstract inputSchema: Record<string, any>;
    abstract outputSchema: Record<string, any>;

    permissions: ToolPermission[] = ['execute'];
    sideEffects: ToolPermission[] = [];
    rateLimitPerMinute = 60;
    auditFields: string[] = [];
    mockSupported = false;

    abstract execute(input: any): Promise<ToolExecutionResult>;
}
