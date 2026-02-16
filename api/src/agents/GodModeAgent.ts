import path from 'path';
import { ProjectManagerAgent } from './ProjectManagerAgent';
import { routeToModel } from '../llm/intelligent-router';
import { AutonomousLoopEngine, LoopTask, LoopResult } from './AutonomousLoopEngine';
import { executeTool } from '../services/ToolService';

/**
 * Helper: Validate a tool exists before adding it to the pipeline.
 * If the tool doesn't exist, mark it as non-required so the engine skips it.
 */
async function safeTask(task: LoopTask): Promise<LoopTask> {
    if (!task.tool) return task;
    try {
        // Dry-run with empty input to check if tool is registered
        await executeTool(task.tool, {}, {});
        return task;
    } catch (e: any) {
        const msg = String(e?.message || '');
        if (msg.includes('not found') || msg.includes('not registered') || msg.includes('Unknown tool')) {
            console.warn(`[GodMode] Tool "${task.tool}" not found. Marking as optional.`);
            return { ...task, required: false };
        }
        // Tool exists but failed with input validation — that's fine
        return task;
    }
}

interface SubSystem {
    name: string;
    description: string;
    dir: string;
}

export class GodModeAgent {
    constructor() { }

    async buildSystem(userRequest: string, outputDir: string) {
        console.log(`\n🌩️  GOD MODE ACTIVATED: "${userRequest}"\n`);
        console.log(`[GodMode] Deploying agents under: ${outputDir}`);

        // 1. High Level Architecture Breakdown
        const breakdown = await this.createSystemBreakdown(userRequest);
        console.log(`[GodMode] Breakdown:`, breakdown);

        const activeAgents: ProjectManagerAgent[] = [];
        const promises: Promise<any>[] = [];

        // 2. Spawn Project Managers in PARALLEL
        for (const sys of breakdown) {
            const sysPath = path.join(outputDir, sys.dir);

            // Create Agent
            const pm = new ProjectManagerAgent(sys.name, sysPath); // TaskID auto-generated
            await pm.init();
            activeAgents.push(pm);

            console.log(`[GodMode] 🚀 Launching Agent for: ${sys.name}...`);

            // Fire and collect promise
            const p = pm.execute(sys.description).then(res => ({
                system: sys.name,
                status: res.status,
                reasoning: res.reasoning,
                steps: res.history?.length
            })).catch(err => ({
                system: sys.name,
                status: 'failed',
                error: err.message
            }));

            promises.push(p);
        }

        // 3. Wait for the Swarm
        console.log(`[GodMode] ⏳ Accessing Cortex. Waiting for ${promises.length} agents to complete...`);
        const results = await Promise.all(promises);

        console.log('[GodMode] All Agents reported back.');
        return {
            status: 'success',
            breakdown,
            results
        };
    }

    /**
     * BUILD UNTIL SUCCESS - Autonomous Loop Mode
     * 
     * Uses AutonomousLoopEngine to build, test, heal, and retry
     * until the project is complete with ZERO human intervention.
     */
    async buildUntilSuccess(
        userRequest: string,
        outputDir: string,
        options: {
            maxIterations?: number;
            sessionId?: string;
            workspaceId?: string;
        } = {}
    ): Promise<LoopResult> {
        console.log(`\n🌩️⚡ GOD MODE AUTONOMOUS: "${userRequest}"\n`);
        console.log(`[GodMode] Unstoppable build activated. Will NOT stop until success!`);

        const engine = new AutonomousLoopEngine(
            outputDir,
            {
                maxIterations: options.maxIterations || 100,
                enableWolverine: true,
                enableCheckpointing: true
            },
            { sessionId: options.sessionId, workspaceId: options.workspaceId }
        );

        // Create the autonomous pipeline
        const tasks: LoopTask[] = [
            {
                name: 'Architecture Planning',
                phase: 'plan',
                required: true,
                customExecute: async () => {
                    const breakdown = await this.createSystemBreakdown(userRequest);
                    return { ok: breakdown.length > 0, output: { breakdown } };
                }
            },
            {
                name: 'Ambiguity Check',
                phase: 'plan',
                tool: 'ambiguity_resolver',
                args: { text: userRequest },
                required: false
            },
            {
                name: 'Cost Estimation',
                phase: 'plan',
                tool: 'cloud_cost_estimator',
                args: { resources: ['Frontend', 'Backend', 'Database'], traffic: 'High' },
                required: false
            },
            {
                name: 'Compliance Audit',
                phase: 'plan',
                tool: 'compliance_validator',
                args: { content: userRequest, standard: 'GDPR' },
                required: false
            },
            {
                name: 'Project Scaffolding',
                phase: 'build',
                tool: 'scaffold_project',
                args: { baseDir: outputDir },
                required: true
            },
            {
                name: 'Install Dependencies',
                phase: 'build',
                tool: 'npm_manager',
                args: { command: 'install' },
                required: true
            },
            {
                name: 'Build Project',
                phase: 'build',
                required: true
            },
            {
                name: 'Run Tests',
                phase: 'test',
                required: false  // Tests are optional, continue on failure
            },
            {
                name: 'Final Verification',
                phase: 'test',
                tool: 'auto_tester',
                args: { testType: 'syntax', projectPath: outputDir },
                required: true
            },
            {
                name: 'Chaos Engineering Plan',
                phase: 'test',
                tool: 'chaos_test_plan',
                args: { architecture: userRequest },
                required: false
            }
        ];

        // Validate all tool-based tasks exist before starting the loop
        console.log(`[GodMode] Validating ${tasks.length} pipeline tasks...`);
        const validatedTasks = await Promise.all(tasks.map(t => safeTask(t)));
        const skippedCount = validatedTasks.filter(t => !t.required && tasks.find(orig => orig.name === t.name)?.required).length;
        if (skippedCount > 0) {
            console.warn(`[GodMode] ${skippedCount} tools not found — downgraded to optional`);
        }

        console.log(`[GodMode] Starting autonomous loop with ${validatedTasks.length} phases...`);
        const result = await engine.executeLoop(validatedTasks);

        if (result.success) {
            console.log(`\n🎉 GOD MODE COMPLETE: Project built successfully after ${result.totalIterations} iterations`);
        } else {
            console.log(`\n⚠️ GOD MODE: Stopped after ${result.totalIterations} iterations. Error: ${result.finalError}`);
        }

        return result;
    }

    private async createSystemBreakdown(request: string): Promise<SubSystem[]> {
        const extractJsonLike = (text: string) => {
            const raw = String(text || '').trim();
            if (!raw) return '';
            if (raw.startsWith('{') && raw.endsWith('}')) return raw;
            const m = raw.match(/\{[\s\S]*\}/);
            return String(m?.[0] || '').trim();
        };

        const prompt = `You are the System Orchestrator.
User Request: "${request}"

Break this system down into distinct subsystem components (e.g. Frontend, Backend, Mobile, Infrastructure).
Output ONLY valid JSON:
{
  "systems": [
    { "name": "Backend", "dir": "backend", "description": "Node.js API with Express and LanceDB" },
    { "name": "Frontend", "dir": "frontend", "description": "React Dashboard" }
  ]
}`;

        const content = await routeToModel([
            { role: 'system', content: prompt }
        ]);

        try {
            const jsonStr = extractJsonLike(content);
            const raw = JSON.parse(jsonStr || '{"systems": []}');
            return Array.isArray(raw.systems) ? raw.systems : [];
        } catch {
            return [];
        }
    }
}

