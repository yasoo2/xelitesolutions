import { ProjectManagerAgent } from './ProjectManagerAgent';
import { AutonomousLoopEngine, LoopTask, LoopResult } from './AutonomousLoopEngine';
import { ArchitectAgent } from './ArchitectAgent';
import fs from 'fs';
import path from 'path';

/**
 * Goal Classification Types
 * Determines which pipeline steps to execute
 */
type GoalType = 'new_project' | 'add_feature' | 'fix_bug' | 'refactor' | 'ui_change' | 'deploy' | 'general';

/**
 * Classify the user's goal using regex patterns
 * Fast, reliable, no LLM call needed
 */
function classifyGoal(goal: string): GoalType {
    const g = goal.toLowerCase();

    // New Project: build from scratch
    if (/(ابن[يى]?|أنش[ئأ]|build|create|scaffold|new\s*project|from\s*scratch|مشروع\s*جديد|تطبيق\s*جديد|نظام\s*جديد|موقع\s*جديد)/i.test(g) &&
        /(تطبيق|موقع|نظام|منصة|لوحة|app|website|system|platform|dashboard|landing|متجر|application)/i.test(g)) {
        return 'new_project';
    }

    // Deploy
    if (/(deploy|نشر|uploat|server|host|استضاف|رفع|سيرفر|production)/i.test(g)) {
        return 'deploy';
    }

    // Fix Bug
    if (/(fix|إصل[ا]ح|bug|خطأ|error|مشكل|broken|عطل|لا يعمل|doesn.*work|not\s*working|crash|توقف|تعطل)/i.test(g)) {
        return 'fix_bug';
    }

    // UI Change
    if (/(تصميم|design|ui|ux|css|style|لون|color|خط|font|تخطيط|layout|responsive|واجه[ةه]|شكل|مظهر|زر|button|صفح[ةه]|page)/i.test(g) &&
        !(/(ابن[يى]|build|create|مشروع|project|أضف|إضاف|add|implement)/i.test(g))) {
        return 'ui_change';
    }

    // Refactor
    if (/(refactor|إعادة\s*هيكل|optimize|تحسين|clean|تنظيف|restructure|reorganize|performance|أداء)/i.test(g)) {
        return 'refactor';
    }

    // Add Feature (anything with "add", "implement", "create" but not full project)
    if (/(أضف|إضاف[ةه]|add|implement|نفذ|ميز[ةه]|feature|endpoint|api|دال[ةه]|function|component|مكون)/i.test(g)) {
        return 'add_feature';
    }

    // General / Unknown — use moderate pipeline
    return 'general';
}

/**
 * JoeAgent - The Advanced Autonomous Construction Engine
 * 
 * Dynamic Pipeline Selection:
 * - Classifies goal type (new_project, add_feature, fix_bug, etc.)
 * - Selects only relevant pipeline steps (3-9 instead of always 9)
 * - Saves time, tokens, and resources
 */
export class JoeAgent {
    private architect: ArchitectAgent;
    private rootDir: string;

    constructor(rootDir: string) {
        this.architect = new ArchitectAgent();
        this.rootDir = rootDir;
    }

    /**
     * Create the Discovery task (used in all pipelines)
     */
    private createDiscoveryTask(): LoopTask {
        return {
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
        };
    }

    /**
     * Build a dynamic pipeline based on goal type
     */
    private buildPipeline(goalType: GoalType, goal: string, planMarkdown: string): LoopTask[] {
        const discovery = this.createDiscoveryTask();

        const scaffold: LoopTask = {
            name: 'Joe Elite Scaffolding',
            phase: 'build',
            tool: 'scaffold_project',
            args: { baseDir: this.rootDir, template: 'elite-fullstack' },
            required: true
        };

        const knowledgeSync: LoopTask = {
            name: 'Brain Integration & Knowledge Sync',
            phase: 'plan',
            tool: 'grep_search',
            args: { query: 'boilerplate', searchPath: 'knowledge/blueprints' },
            required: false
        };

        const coreBuild: LoopTask = {
            name: 'Core Module Construction',
            phase: 'build',
            required: true,
            customExecute: async () => {
                const pm = new ProjectManagerAgent("Joe-Constructor", this.rootDir);
                await pm.init();
                const res = await pm.execute(`IMPLEMENT the following. CONTEXT: You have full control over the codebase. PLAN: ${planMarkdown}\n\nORIGINAL GOAL: ${goal}`);
                return { ok: res.status === 'completed', output: res.reasoning };
            }
        };

        const npmInstall: LoopTask = {
            name: 'Dependency & Infrastructure Alignment',
            phase: 'build',
            tool: 'npm_manager',
            args: { command: 'install' },
            required: true
        };

        const uiQuality: LoopTask = {
            name: 'Joe Quality Run: UI/UX Masterclass',
            phase: 'build',
            required: true,
            customExecute: async () => {
                const pm = new ProjectManagerAgent("Joe-Designer", this.rootDir);
                await pm.init();
                const res = await pm.execute(`Verify every UI component for Joe Elite standards: Gradients, Glassmorphism, Responsive design, and Micro-animations.`);
                return { ok: res.status === 'completed', output: res.reasoning };
            }
        };

        const browserTest: LoopTask = {
            name: 'Visual Verification Loop (Joe Eye)',
            phase: 'test',
            tool: 'browser_subagent',
            args: { task: "Verify the rendered UI locally. Use your 'Joe Eye' to ensure visual perfection and elite design adherence." },
            required: false
        };

        const globalQA: LoopTask = {
            name: 'Integrity Shield: Global QA',
            phase: 'test',
            tool: 'auto_tester',
            args: { testType: 'full', projectPath: this.rootDir },
            required: true
        };

        const codeAudit: LoopTask = {
            name: 'Final Architecture Integrity Audit',
            phase: 'test',
            tool: 'analyze_codebase',
            args: { path: this.rootDir },
            required: true
        };

        // Select pipeline based on goal type
        switch (goalType) {
            case 'new_project':
                // Full pipeline: 9 steps
                return [discovery, scaffold, knowledgeSync, coreBuild, npmInstall, uiQuality, browserTest, globalQA, codeAudit];

            case 'add_feature':
                // Feature: discover → build → test (3 steps)
                return [discovery, coreBuild, globalQA];

            case 'fix_bug':
                // Fix: discover → build with fix context → test (3 steps)
                return [discovery, coreBuild, globalQA];

            case 'ui_change':
                // UI: discover → build → UI check → browser verify (4 steps)
                return [discovery, coreBuild, uiQuality, browserTest];

            case 'refactor':
                // Refactor: discover → build → audit (3 steps)
                return [discovery, coreBuild, codeAudit];

            case 'deploy':
                // Deploy: discover → build → test (3 steps)
                return [discovery, coreBuild, globalQA];

            case 'general':
            default:
                // General: discover → build → test → audit (4 steps)
                return [discovery, coreBuild, globalQA, codeAudit];
        }
    }

    /**
     * Joe Pro Ignite - Execute a project from a single spark of an idea
     * Now with Dynamic Pipeline Selection!
     */
    async ignite(goal: string): Promise<LoopResult> {
        // 0. Classify the goal
        const goalType = classifyGoal(goal);
        console.log(`\n🪐 JOE PRO PROTOCOL ACTIVATED: "${goal}"`);
        console.log(`[Joe] 🎯 Goal classified as: ${goalType.toUpperCase()}`);

        // 1. Intellectual Scoping & Grand Architecture
        console.log(`[Joe] Recalling core engineering blueprints...`);
        const planMarkdown = await this.architect.planProject(goal, `Context: Joe Advanced Design, High Autonomy. Goal Type: ${goalType}.`);
        console.log(`[Joe] Grand Architecture defined via evolved brain.`);

        // 2. Initialize the Unstoppable Engine (adjust iterations by goal type)
        const maxIterations = goalType === 'new_project' ? 500 :
            goalType === 'add_feature' || goalType === 'fix_bug' ? 100 : 200;
        const engine = new AutonomousLoopEngine(
            this.rootDir,
            {
                maxIterations,
                enableWolverine: true,
                enableCheckpointing: true,
                circuitBreakerThreshold: goalType === 'new_project' ? 20 : 10
            }
        );

        // 3. Build Dynamic Pipeline
        const tasks = this.buildPipeline(goalType, goal, planMarkdown);
        console.log(`[Joe] 📋 Pipeline: ${tasks.length} steps for ${goalType} → [${tasks.map(t => t.name).join(' → ')}]`);

        // 4. Execute
        console.log(`[Joe] Starting autonomous construction loop...`);
        const result = await engine.executeLoop(tasks);

        if (result.success) {
            console.log(`\n🏆 JOE PRO VICTORY: ${goalType} completed with Elite honors.`);
        } else {
            console.log(`\n🥀 JOE PRO STALLED: Loop terminated. Reason: ${result.finalError}`);
        }

        return result;
    }
}

// Export classifyGoal for testing
export { classifyGoal };
// auto-deploy test 1773256522
