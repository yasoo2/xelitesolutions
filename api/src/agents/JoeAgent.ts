import { ProjectManagerAgent } from './ProjectManagerAgent';
import { AutonomousLoopEngine, LoopTask, LoopResult } from './AutonomousLoopEngine';
import { ArchitectAgent } from './ArchitectAgent';
import fs from 'fs';
import path from 'path';

/**
 * JoeAgent - The Advanced Autonomous Construction Engine
 * 
 * Evolution of the Joe system:
 * - High Autonomy: Zero human intervention.
 * - Tool Mastery: Expert use of the existing Joe toolset.
 * - Elite Standards: Built-in focus on Floor 6 (Premium UI/UX).
 * - Self-Healing: Proactive error recovery via Wolverine mode.
 */
export class JoeAgent {
    private architect: ArchitectAgent;
    private rootDir: string;

    constructor(rootDir: string) {
        this.architect = new ArchitectAgent();
        this.rootDir = rootDir;
    }

    /**
     * Joe Pro Ignite - Execute a project from a single spark of an idea
     */
    async ignite(goal: string): Promise<LoopResult> {
        console.log(`\n🪐 JOE PRO PROTOCOL ACTIVATED: "${goal}"\n`);
        console.log(`[Joe] Recalling core engineering blueprints...`);

        // 1. Intellectual Scoping & Grand Architecture (Evolution of current brain)
        const planMarkdown = await this.architect.planProject(goal, "Context: Joe Advanced Design, High Autonomy. Note: You have absolute control over the total codebase and its millions of files.");
        console.log(`[Joe] Grand Architecture defined via evolved brain.`);

        // 2. Initialize the Unstoppable Engine
        const engine = new AutonomousLoopEngine(
            this.rootDir,
            {
                maxIterations: 500, // Evolved for total project construction
                enableWolverine: true,
                enableCheckpointing: true,
                circuitBreakerThreshold: 20
            }
        );

        // 3. Define the Unstoppable Pipeline (Discovery + Construction)
        const tasks: LoopTask[] = [
            {
                name: 'Universal Codebase Discovery',
                phase: 'plan',
                required: true,
                customExecute: async () => {
                    console.log(`[Joe] Scanning project for real discovery...`);
                    const extCounts: Record<string, number> = {};
                    let totalFiles = 0;
                    let totalDirs = 0;
                    const topLevel: string[] = [];

                    const scan = (dir: string, depth: number) => {
                        if (depth > 3) return;
                        try {
                            const entries = fs.readdirSync(dir, { withFileTypes: true });
                            for (const e of entries) {
                                if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist' || e.name === '.git') continue;
                                const full = path.join(dir, e.name);
                                if (e.isDirectory()) {
                                    totalDirs++;
                                    if (depth === 0) topLevel.push(`📁 ${e.name}/`);
                                    scan(full, depth + 1);
                                } else {
                                    totalFiles++;
                                    const ext = path.extname(e.name).toLowerCase() || '(no ext)';
                                    extCounts[ext] = (extCounts[ext] || 0) + 1;
                                    if (depth === 0) topLevel.push(`📄 ${e.name}`);
                                }
                            }
                        } catch { /* permission denied, skip */ }
                    };

                    scan(this.rootDir, 0);

                    const langs = Object.entries(extCounts)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 10)
                        .map(([ext, count]) => `${ext}: ${count} files`)
                        .join(', ');

                    const summary = {
                        rootDir: this.rootDir,
                        totalFiles,
                        totalDirs,
                        topLevelEntries: topLevel.slice(0, 20),
                        languageBreakdown: langs,
                        scannedAt: new Date().toISOString()
                    };

                    console.log(`[Joe] Discovery complete: ${totalFiles} files, ${totalDirs} dirs`);
                    return { ok: true, output: JSON.stringify(summary, null, 2) };
                }
            },
            {
                name: 'Joe Elite Scaffolding',
                phase: 'build',
                tool: 'scaffold_project',
                args: { baseDir: this.rootDir, template: 'elite-fullstack' },
                required: true
            },
            {
                name: 'Brain Integration & Knowledge Sync',
                phase: 'plan',
                tool: 'grep_search',
                args: { query: 'boilerplate', searchPath: 'knowledge/blueprints' },
                required: false
            },
            {
                name: 'Core Module Construction',
                phase: 'build',
                required: true,
                customExecute: async () => {
                    const pm = new ProjectManagerAgent("Joe-Constructor", this.rootDir);
                    await pm.init();
                    const res = await pm.execute(`IMPLEMENT core modules. CONTEXT: You are the Master of Millions. Every file in this project is under your control. PLAN: ${planMarkdown}`);
                    return { ok: res.status === 'completed', output: res.reasoning };
                }
            },
            {
                name: 'Dependency & Infrastructure Alignment',
                phase: 'build',
                tool: 'npm_manager',
                args: { command: 'install' },
                required: true
            },
            {
                name: 'Joe Quality Run: UI/UX Masterclass',
                phase: 'build',
                required: true,
                customExecute: async () => {
                    const pm = new ProjectManagerAgent("Joe-Designer", this.rootDir);
                    await pm.init();
                    const res = await pm.execute(`Verify every UI component for Joe Elite standards: Gradients, Glassmorphism, Responsive design, and Micro-animations.`);
                    return { ok: res.status === 'completed', output: res.reasoning };
                }
            },
            {
                name: 'Visual Verification Loop (Joe Eye)',
                phase: 'test',
                tool: 'browser_subagent',
                args: { task: "Verify the rendered UI locally. Use your 'Joe Eye' to ensure visual perfection and elite design adherence." },
                required: false
            },
            {
                name: 'Integrity Shield: Global QA',
                phase: 'test',
                tool: 'auto_tester',
                args: { testType: 'full', projectPath: this.rootDir },
                required: true
            },
            {
                name: 'Final Architecture Integrity Audit',
                phase: 'test',
                tool: 'analyze_codebase',
                args: { path: this.rootDir },
                required: true
            }
        ];

        console.log(`[Joe] Starting autonomous construction loop...`);
        const result = await engine.executeLoop(tasks);

        if (result.success) {
            console.log(`\n🏆 JOE PRO VICTORY: Project completed with Elite honors.`);
        } else {
            console.log(`\n🥀 JOE PRO STALLED: Loop terminated. Reason: ${result.finalError}`);
        }

        return result;
    }
}

