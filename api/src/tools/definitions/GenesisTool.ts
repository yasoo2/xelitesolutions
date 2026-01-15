import { ToolDefinition } from '../types';
import { GenesisAgent } from '../../agents/GenesisAgent';
// We need to import TaskLoop to execute it, or use the registry's method if available. 
// Since TaskLoop is in the registry, we can't import it easily without circular deps if we import 'tools'.
// Instead, we'll return the steps and let the caller (or TaskLoop itself) handle it?
// Standard pattern: Tools return outputs.
// BETTER: GenesisTool *CALLS* TaskLoop via the `input.executeTool` callback if we passed it?
// Actually, `execute` definition in usage usually doesn't have `executeTool` passed in `ToolDefinition` signature in this codebase (based on previous files).
// Wait, `BrowserRunTool` imports `executePlannedActions`.
// `TaskLoop` was defined IN registry.ts to access `executeTool`.
// `GenesisTool` also needs access to `executeTool` or `TaskLoop`.
// Solution: Define GenesisTool IN registry.ts like TaskLoop, or export a factory.
// For now, let's create the definition file, but we might need to inline it in registry.ts or inject executeTool.
// Let's stick to the inline pattern in registry.ts for Orchestrators to keep it simple and safe.
// So this file is just a placeholder/reference for the plan? 
// No, I'll write the logic here but note that it needs integration.
// Actually, I'll export a class or function and use it in registry.ts.

export const GenesisToolDef = {
    name: 'genesis_build',
    version: '1.0.0',
    tags: ['god_mode', 'genesis', 'orchestrator'],
    description: 'Autonomous "God Mode" builder. Takes a high-level goal, plans it, and executes the full build loop.',
    inputSchema: {
        type: 'object',
        properties: {
            goal: { type: 'string', description: 'The high-level goal (e.g., "Build a React Todo App")' }
        },
        required: ['goal']
    },
    outputSchema: {
        type: 'object',
        properties: {
            plan: { type: 'string' },
            executionResult: { type: 'object' }
        }
    },
    permissions: ['internet', 'execute', 'read', 'write'],
    sideEffects: ['execute', 'write'],
    rateLimitPerMinute: 1, // God mode is heavy
    auditFields: ['goal'],
    mockSupported: true,
    // execute implementation will be injected in registry.ts due to dependency on 'executeTool'
};
