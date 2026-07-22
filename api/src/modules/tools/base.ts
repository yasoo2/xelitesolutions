import { ToolDefinition, ToolPermission, ToolExecutionResult } from './types';

export abstract class BaseTool implements ToolDefinition {
    abstract name: string;
    abstract description?: string;
    version = '2.0.0';
    abstract tags: string[];

    abstract inputSchema: Record<string, any>;
    // Sensible default so tools are not forced to declare an output schema.
    outputSchema: Record<string, any> = { type: 'object', properties: {} };

    permissions: ToolPermission[] = ['execute'];
    sideEffects: ToolPermission[] = [];
    rateLimitPerMinute = 60;
    auditFields: string[] = [];
    mockSupported = false;

    abstract execute(input: any, context?: any): Promise<ToolExecutionResult>;
}
