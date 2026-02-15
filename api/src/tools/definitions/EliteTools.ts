import { ToolDefinition, ToolPermission } from '../types';
import path from 'path';

// Helper to get LLM function lazily to avoid circular dependency
const getLLM = () => {
    try {
        // Assume callLLM is exported from llm.ts
        const mod = require('../../llm');
        return mod.callLLM || mod.default?.callLLM;
    } catch (e) {
        return async () => "Error: LLM not available in Elite Tools context";
    }
};

/**
 * ELITE TOOLS SUITE - FIXED TYPES & CIRCULAR DEPS
 */

// 1. Dependency Graph Builder
export class DependencyGraphTool implements ToolDefinition {
    name = 'dependency_graph';
    version = '1.0.0';
    tags = ['analysis', 'graph', 'architecture', 'elite'];
    description = 'Analyze source code to build a visualization of module dependencies.';

    inputSchema: any = {
        type: 'object',
        properties: {
            path: { type: 'string', description: 'Root path to analyze' },
            depth: { type: 'number', description: 'Max depth (default 3)' }
        },
        required: ['path']
    };

    outputSchema: any = {
        type: 'object',
        properties: {
            nodes: { type: 'array' },
            edges: { type: 'array' },
            summary: { type: 'string' }
        }
    };

    permissions: ToolPermission[] = ['read'];
    sideEffects: ToolPermission[] = [];
    rateLimitPerMinute = 10;
    auditFields = ['path'];
    mockSupported = false;

    async execute(input: { path: string; depth?: number }) {
        const rootPath = input.path || '.';
        const prompt = `Analyze dependency structure at ${rootPath}. Return JSON graph.`;
        try {
            const callLLM = getLLM();
            const response = await callLLM(prompt, [{ role: 'system', content: 'Return valid JSON.' }]);
            const json = JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] || '{}');
            return { ok: true, output: json, logs: ['Generated dependency graph'] };
        } catch (e: any) {
            return { ok: false, error: 'Failed', logs: [e.message] };
        }
    }
}

// 2. Business Logic Parser
export class BusinessLogicTool implements ToolDefinition {
    name = 'business_logic_parser';
    version = '1.0.0';
    tags = ['analysis', 'logic', 'requirements', 'elite'];
    description = 'Extract structured business rules.';

    inputSchema: any = {
        type: 'object',
        properties: { requirements: { type: 'string' } },
        required: ['requirements']
    };
    outputSchema: any = { type: 'object' };

    permissions: ToolPermission[] = [];
    sideEffects: ToolPermission[] = [];
    rateLimitPerMinute = 20;
    auditFields = ['requirements'];
    mockSupported = true;

    async execute(input: { requirements: string }) {
        const prompt = `Extract rules from: ${input.requirements}`;
        try {
            const callLLM = getLLM();
            const response = await callLLM(prompt, [{ role: 'system', content: 'Return JSON rules.' }]);
            return { ok: true, output: JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] || '{}'), logs: [] };
        } catch (e: any) { return { ok: false, error: e.message, logs: [] }; }
    }
}

// 3. Chaos Engineering
export class ChaosTestingTool implements ToolDefinition {
    name = 'chaos_test_plan';
    version = '1.0.0';
    tags = ['testing', 'chaos', 'elite'];
    description = 'Generate Chaos Engineering plan.';

    inputSchema: any = {
        type: 'object',
        properties: { architecture: { type: 'string' } },
        required: ['architecture']
    };
    outputSchema: any = { type: 'object' };

    permissions: ToolPermission[] = [];
    sideEffects: ToolPermission[] = [];
    rateLimitPerMinute = 5;
    auditFields = ['architecture'];
    mockSupported = true;

    async execute(input: { architecture: string }) {
        const prompt = `Generate Chaos Plan for: ${input.architecture}`;
        try {
            const callLLM = getLLM();
            const response = await callLLM(prompt, [{ role: 'system', content: 'Return JSON scenarios.' }]);
            return { ok: true, output: JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] || '{}'), logs: [] };
        } catch (e: any) { return { ok: false, error: e.message, logs: [] }; }
    }
}

// 4. Compliance Validator
export class ComplianceValidatorTool implements ToolDefinition {
    name = 'compliance_validator';
    version = '1.0.0';
    tags = ['audit', 'compliance', 'elite'];
    description = 'Check compliance.';

    inputSchema: any = {
        type: 'object',
        properties: { content: { type: 'string' }, standard: { type: 'string' } },
        required: ['content', 'standard']
    };
    outputSchema: any = { type: 'object' };

    permissions: ToolPermission[] = [];
    sideEffects: ToolPermission[] = [];
    rateLimitPerMinute = 10;
    auditFields = ['standard'];
    mockSupported = false;

    async execute(input: { content: string; standard: string }) {
        const prompt = `Check ${input.standard} compliance for: ${input.content.slice(0, 500)}`;
        try {
            const callLLM = getLLM();
            const response = await callLLM(prompt, [{ role: 'system', content: 'Return JSON report.' }]);
            return { ok: true, output: JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] || '{}'), logs: [] };
        } catch (e: any) { return { ok: false, error: e.message, logs: [] }; }
    }
}

// 5. Cost Estimator
export class CostEstimatorTool implements ToolDefinition {
    name = 'cloud_cost_estimator';
    version = '1.0.0';
    tags = ['cost', 'elite'];
    description = 'Estimate cloud costs.';

    inputSchema: any = {
        type: 'object',
        properties: { resources: { type: 'array' }, traffic: { type: 'string' } },
        required: ['resources']
    };
    outputSchema: any = { type: 'object' };

    permissions: ToolPermission[] = [];
    sideEffects: ToolPermission[] = [];
    rateLimitPerMinute = 20;
    auditFields = [];
    mockSupported = true;

    async execute(input: { resources: string[]; traffic?: string }) {
        const prompt = `Estimate costs for: ${input.resources.join(', ')}`;
        try {
            const callLLM = getLLM();
            const response = await callLLM(prompt, [{ role: 'system', content: 'Return JSON cost.' }]);
            return { ok: true, output: JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] || '{}'), logs: [] };
        } catch (e: any) { return { ok: false, error: e.message, logs: [] }; }
    }
}

// 6. Ambiguity Resolver
export class AmbiguityResolverTool implements ToolDefinition {
    name = 'ambiguity_resolver';
    version = '1.0.0';
    tags = ['analysis', 'elite'];
    description = 'Resolve ambiguity.';

    inputSchema: any = { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] };
    outputSchema: any = { type: 'object' };

    permissions: ToolPermission[] = [];
    sideEffects: ToolPermission[] = [];
    rateLimitPerMinute = 20;
    auditFields = [];
    mockSupported = true;

    async execute(input: { text: string }) {
        const prompt = `Check ambiguity: "${input.text}"`;
        try {
            const callLLM = getLLM();
            const response = await callLLM(prompt, [{ role: 'system', content: 'Return JSON.' }]);
            return { ok: true, output: JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] || '{}'), logs: [] };
        } catch (e: any) { return { ok: false, error: e.message, logs: [] }; }
    }
}

// 7. Multi-Agent Debate
export class MultiAgentDebateTool implements ToolDefinition {
    name = 'multi_agent_debate';
    version = '1.0.0';
    tags = ['decision', 'elite'];
    description = 'Simulate debate.';

    inputSchema: any = {
        type: 'object',
        properties: { topic: { type: 'string' }, personas: { type: 'array' } },
        required: ['topic']
    };
    outputSchema: any = { type: 'object' };

    permissions: ToolPermission[] = [];
    sideEffects: ToolPermission[] = [];
    rateLimitPerMinute = 5;
    auditFields = ['topic'];
    mockSupported = true;

    async execute(input: { topic: string; personas?: string[] }) {
        const prompt = `Debate: ${input.topic}`;
        try {
            const callLLM = getLLM();
            const response = await callLLM(prompt, [{ role: 'system', content: 'Return JSON transcript.' }]);
            return { ok: true, output: JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] || '{}'), logs: [] };
        } catch (e: any) { return { ok: false, error: e.message, logs: [] }; }
    }
}

// 8. Self-Confidence
export class SelfConfidenceTool implements ToolDefinition {
    name = 'self_confidence_evaluator';
    version = '1.0.0';
    tags = ['analysis', 'elite'];
    description = 'Evaluate confidence.';

    inputSchema: any = { type: 'object', properties: { content: { type: 'string' } }, required: ['content'] };
    outputSchema: any = { type: 'object' };

    permissions: ToolPermission[] = [];
    sideEffects: ToolPermission[] = [];
    rateLimitPerMinute = 20;
    auditFields = [];
    mockSupported = true;

    async execute(input: { content: string }) {
        const prompt = `Confidence in: ${input.content.slice(0, 100)}`;
        try {
            const callLLM = getLLM();
            const response = await callLLM(prompt, [{ role: 'system', content: 'Return JSON score.' }]);
            return { ok: true, output: JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] || '{}'), logs: [] };
        } catch (e: any) { return { ok: false, error: e.message, logs: [] }; }
    }
}

// 9. AI-Enhanced File Writer
export class AIWriteFileTool implements ToolDefinition {
    name = 'ai_write_file';
    version = '1.0.0';
    tags = ['write', 'generate', 'code', 'elite'];
    description = 'Generate full file content using AI based on a description.';

    inputSchema: any = {
        type: 'object',
        properties: {
            path: { type: 'string', description: 'Target file path' },
            description: { type: 'string', description: 'Detailed description of what the file should contain' },
            context: { type: 'string', description: 'Optional project context or requirements' }
        },
        required: ['path', 'description']
    };
    outputSchema: any = { type: 'object', properties: { path: { type: 'string' }, size: { type: 'number' } } };

    permissions: ToolPermission[] = ['write'];
    sideEffects: ToolPermission[] = ['write'];
    rateLimitPerMinute = 10;
    auditFields = ['path'];

    async execute(input: { path: string; description: string; context?: string }) {
        const filePath = input.path;
        const prompt = `Write the full content for the file at "${filePath}".
        Goal: ${input.description}
        Context: ${input.context || 'Create a production-ready, high-quality, and visually stunning implementation.'}
        
        Rules:
        - Return ONLY the file content.
        - No markdown wrapping (no \`\`\` code blocks).
        - Substantial code, no placeholders.
        - If it's a web file, use modern aesthetics (glassmorphism if appropriate).
        - Ensure all imports work or are standard.`;

        try {
            const callLLM = getLLM();
            const response = await callLLM(prompt, [{ role: 'system', content: 'You are an elite software architect. Output raw file content only. No markdown.' }]);

            // Clean markdown blocks if LLM ignored instructions
            let cleanContent = response.trim();
            if (cleanContent.startsWith('```')) {
                cleanContent = cleanContent.replace(/^```[a-z]*\n/i, '').replace(/\n```$/i, '');
            }

            const fs = require('fs');
            const { workspaceService } = require('../../services/WorkspaceService');
            const root = workspaceService.getActiveRoot();
            const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(root, filePath);

            fs.mkdirSync(path.dirname(absPath), { recursive: true });
            fs.writeFileSync(absPath, cleanContent);

            return { ok: true, output: { path: filePath, size: cleanContent.length }, logs: [`AI generated file: ${filePath}`] };
        } catch (e: any) {
            return { ok: false, error: e.message, logs: [] };
        }
    }
}
