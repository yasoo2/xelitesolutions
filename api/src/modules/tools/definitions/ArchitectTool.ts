import { ToolDefinition } from '../types';
import { ArchitectAgent } from '../../../core/agents/ArchitectAgent';

// Lazy init to avoid crash on startup if ENV missing
let architect: ArchitectAgent | null = null;

export const ArchitectTool: ToolDefinition = {
    name: 'architect_plan',
    version: '1.0.0',
    tags: ['planning', 'architecture', 'design'],
    description: 'Generate a comprehensive architectural plan and file structure for a new feature or project.',
    inputSchema: {
        type: 'object',
        properties: {
            goal: { type: 'string', description: 'The high-level goal or feature description.' },
            context: { type: 'string', description: 'Existing project context or constraints.' }
        },
        required: ['goal']
    },
    outputSchema: {
        type: 'object',
        properties: {
            planMarkdown: { type: 'string' }
        }
    },
    permissions: ['internet'], // Needs LLM
    sideEffects: [],
    rateLimitPerMinute: 10,
    auditFields: ['goal'],
    mockSupported: true,
    execute: async (input) => {
        if (!architect) {
            architect = new ArchitectAgent();
        }
        const plan = await architect.planProject(input.goal, input.context);
        return { ok: true, output: { planMarkdown: plan }, logs: [`Generated plan for: ${input.goal}`] };
    }
};
