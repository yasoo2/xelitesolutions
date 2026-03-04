import { ProjectManagerAgent } from './ProjectManagerAgent';
import { AutonomousLoopEngine, LoopTask, LoopResult } from './AutonomousLoopEngine';
import { ArchitectAgent } from './ArchitectAgent';

/**
 * ManusAgent - The Master Architect & Unstoppable Sweeper
 * 
 * Inspired by the "Manus" persona:
 * - High Autonomy: Zero human intervention.
 * - Tool Mastery: Expert use of the entire toolset.
 * - Elite Standards: Built-in focus on Floor 6 (Premium UI/UX).
 * - Self-Healing: Proactive error recovery via Wolverine mode.
 */
export class ManusAgent {
    private architect: ArchitectAgent;
    private rootDir: string;

    constructor(rootDir: string) {
        this.architect = new ArchitectAgent();
        this.rootDir = rootDir;
    }

    /**
     * The Manus Pulse - Execute a project from a single spark of an idea
     */
    async ignite(goal: string): Promise<LoopResult> {
        console.log(`\n🪐 MANUS PROTOCOL ACTIVATED: "${goal}"\n`);
        console.log(`[Manus] Initialization of the Master Architect...`);

        // 1. Intellectual Scoping & Grand Architecture
        const planMarkdown = await this.architect.planProject(goal, "Context: Elite Design, High Autonomy, Manus Mindset.");
        console.log(`[Manus] Grand Architecture defined.`);

        // 2. Initialize the Unstoppable Engine
        const engine = new AutonomousLoopEngine(
            this.rootDir,
            {
                maxIterations: 200, // Sufficient for massive systems
                enableWolverine: true,
                enableCheckpointing: true,
                circuitBreakerThreshold: 15
            }
        );

        // 3. Define the Unstoppable Pipeline
        const tasks: LoopTask[] = [
            {
                name: 'System Analysis & Blueprinting',
                phase: 'plan',
                required: true,
                customExecute: async () => ({ ok: !!planMarkdown, output: { plan: planMarkdown } })
            },
            {
                name: 'Elite Project Scaffolding',
                phase: 'build',
                tool: 'scaffold_project',
                args: { baseDir: this.rootDir, template: 'elite-fullstack' },
                required: true
            },
            {
                name: 'Knowledge Injection',
                phase: 'plan',
                tool: 'grep_search',
                args: { query: 'boilerplate', searchPath: 'knowledge/blueprints' },
                required: false
            },
            {
                name: 'Primary Module Construction',
                phase: 'build',
                required: true,
                customExecute: async () => {
                    const pm = new ProjectManagerAgent("Manus-Constructor", this.rootDir);
                    await pm.init();
                    const res = await pm.execute(`Implement the core modules as per the plan: ${planMarkdown}`);
                    return { ok: res.status === 'completed', output: res.reasoning };
                }
            },
            {
                name: 'Infrastructure & Dependency Lockdown',
                phase: 'build',
                tool: 'npm_manager',
                args: { command: 'install' },
                required: true
            },
            {
                name: 'Quality Run: Elite UI Refinement',
                phase: 'build',
                required: true,
                customExecute: async () => {
                    const pm = new ProjectManagerAgent("Manus-Designer", this.rootDir);
                    await pm.init();
                    const res = await pm.execute(`Verify every UI component for Elite standards: 
                        Gradients, Glassmorphism, Responsive design, and Micro-animations.`);
                    return { ok: res.status === 'completed', output: res.reasoning };
                }
            },
            {
                name: 'Visual Verification Loop',
                phase: 'test',
                tool: 'browser_subagent',
                args: { task: "Verify the rendered UI locally. Fix any misalignments or color mismatches." },
                required: false
            },
            {
                name: 'Integrity Shield: Testing & QA',
                phase: 'test',
                tool: 'auto_tester',
                args: { testType: 'full', projectPath: this.rootDir },
                required: true
            },
            {
                name: 'Final Architecture Audit',
                phase: 'test',
                tool: 'analyze_codebase',
                args: { path: this.rootDir },
                required: true
            }
        ];

        console.log(`[Manus] Starting autonomous construction loop...`);
        const result = await engine.executeLoop(tasks);

        if (result.success) {
            console.log(`\n🏆 MANUS VICTORY: Project completed with Elite honors.`);
        } else {
            console.log(`\n🥀 MANUS STALLED: Loop terminated. Reason: ${result.finalError}`);
        }

        return result;
    }
}
