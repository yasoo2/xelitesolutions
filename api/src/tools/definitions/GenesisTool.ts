import { ToolDefinition } from '../types';
import { GenesisAgent } from '../../agents/GenesisAgent';

/**
 * GenesisTool - Autonomous "God Mode" builder
 * Takes a high-level goal, plans it, and executes the full build loop
 * Note: Execute implementation is injected in registry.ts due to dependency on executeTool
 */

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
    rateLimitPerMinute: 5, // God mode is heavy but needs some leeway
    auditFields: ['goal'],
    mockSupported: true,
    // execute implementation will be injected in registry.ts due to dependency on 'executeTool'
};
