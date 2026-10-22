import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import { executeRuntimeDiagnostics } from '../../services/RuntimeDiagnosticsPolicy';

export class RuntimeDiagnosticsTool extends BaseTool {
    name = 'runtime_diagnostics';
    description = 'Report the running Joe API Node version and the authorized selected workspace path. Does not execute CLI commands or inspect another runtime.';
    tags = ['diagnostics', 'read-only', 'runtime'];
    permissions: ToolPermission[] = ['read'];
    sideEffects: ToolPermission[] = [];
    inputSchema = { type: 'object', additionalProperties: false, required: ['request', 'facts'], properties: {
        request: { type: 'string', maxLength: 8192 }, path: { type: 'string', description: 'Caller selects only the current workspace with dot; ToolService resolves its verified root.' },
        facts: { type: 'array', minItems: 1, maxItems: 2, uniqueItems: true, items: { enum: ['node_version', 'workspace_path'] } },
    } };
    outputSchema = { type: 'object', properties: { status: { const: 'completed' }, kind: { const: 'runtime_diagnostics' }, executedCommands: { const: false } } };
    auditFields = ['request', 'facts'];
    async execute(input: any, context?: any) { return executeRuntimeDiagnostics(input, context); }
}
