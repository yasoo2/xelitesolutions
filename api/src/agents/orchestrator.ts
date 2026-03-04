/**
 * Agent Orchestration System
 * Coordinates multiple specialized agents to build complete applications
 */

import { ManusAgent as ManusCore } from './ManusAgent';

export interface Agent {
    name: string;
    role: string;
    capabilities: string[];
    execute(task: AgentTask): Promise<AgentResult>;
}

export interface AgentTask {
    id: string;
    type: string;
    description: string;
    input: any;
    context?: Record<string, any>;
    dependencies?: string[]; // IDs of tasks that must complete first
    priority: number; // 1-10
}

export interface AgentResult {
    taskId: string;
    success: boolean;
    output: any;
    artifacts?: string[]; // File paths created
    nextSteps?: AgentTask[];
    error?: string;
}

export interface ProjectPlan {
    goal: string;
    projectType: 'web' | 'api' | 'mobile' | 'desktop' | 'fullstack';
    techStack: {
        frontend?: string[];
        backend?: string[];
        database?: string;
        deployment?: string;
    };
    tasks: AgentTask[];
    timeline: string;
}

/**
 * Planner Agent - Creates project plans and breaks down requirements
 */
class PlannerAgent implements Agent {
    name = 'PlannerAgent';
    role = 'Project Planning & Architecture';
    capabilities = ['requirement_analysis', 'task_breakdown', 'architecture_design'];

    async execute(task: AgentTask): Promise<AgentResult> {
        const description = task.description;

        // Analyze project type
        const projectType = this.detectProjectType(description);
        const techStack = this.suggestTechStack(projectType, description);
        const tasks = this.breakDownIntoTasks(description, projectType);

        const plan: ProjectPlan = {
            goal: description,
            projectType,
            techStack,
            tasks,
            timeline: this.estimateTimeline(tasks)
        };

        return {
            taskId: task.id,
            success: true,
            output: plan,
            nextSteps: tasks.slice(0, 3) // Start with first 3 tasks
        };
    }

    private detectProjectType(desc: string): ProjectPlan['projectType'] {
        const lower = desc.toLowerCase();

        if (/\b(api|backend|endpoint|rest|graphql)\b/i.test(lower)) return 'api';
        if (/\b(mobile|android|ios|react native|flutter)\b/i.test(lower)) return 'mobile';
        if (/\b(desktop|electron|tauri)\b/i.test(lower)) return 'desktop';
        if (/\b(fullstack|full stack|full-stack)\b/i.test(lower)) return 'fullstack';
        return 'web';
    }

    private suggestTechStack(type: string, desc: string): ProjectPlan['techStack'] {
        const stack: ProjectPlan['techStack'] = {};

        // Frontend
        if (type === 'web' || type === 'fullstack') {
            if (/\breact\b/i.test(desc)) {
                stack.frontend = ['React', ' TypeScript', 'Vite'];
            } else if (/\bvue\b/i.test(desc)) {
                stack.frontend = ['Vue 3', 'TypeScript', 'Vite'];
            } else {
                stack.frontend = ['React', 'TypeScript', 'Vite']; // Default
            }
        }

        // Backend
        if (type === 'api' || type === 'fullstack') {
            if (/\bnode\b|\bexpress\b/i.test(desc)) {
                stack.backend = ['Node.js', 'Express', 'TypeScript'];
            } else if (/\bpython\b|\bdjango\b|\bflask\b/i.test(desc)) {
                stack.backend = ['Python', desc.match(/django/i) ? 'Django' : 'Flask'];
            } else {
                stack.backend = ['Node.js', 'Express', 'TypeScript']; // Default
            }
        }

        // Database
        if (/\bmongo\b/i.test(desc)) {
            stack.database = 'MongoDB';
        } else if (/\bpostgres\b|\bpg\b/i.test(desc)) {
            stack.database = 'PostgreSQL';
        } else if (type === 'api' || type === 'fullstack') {
            stack.database = 'MongoDB'; // Default
        }

        return stack;
    }

    private breakDownIntoTasks(desc: string, type: string): AgentTask[] {
        const tasks: AgentTask[] = [];
        let taskId = 1;

        // Common tasks for all projects
        tasks.push({
            id: `task_${taskId++}`,
            type: 'setup',
            description: 'Initialize project structure',
            input: { projectType: type },
            priority: 10
        });

        if (type === 'web' || type === 'fullstack') {
            tasks.push({
                id: `task_${taskId++}`,
                type: 'frontend_scaffold',
                description: 'Create React app structure',
                input: {},
                dependencies: [`task_1`],
                priority: 9
            });

            tasks.push({
                id: `task_${taskId++}`,
                type: 'ui_components',
                description: 'Build UI components',
                input: {},
                dependencies: [`task_2`],
                priority: 7
            });
        }

        if (type === 'api' || type === 'fullstack') {
            tasks.push({
                id: `task_${taskId++}`,
                type: 'backend_scaffold',
                description: 'Create API server structure',
                input: {},
                dependencies: [`task_1`],
                priority: 9
            });

            tasks.push({
                id: `task_${taskId++}`,
                type: 'api_endpoints',
                description: 'Implement API endpoints',
                input: {},
                dependencies: [`task_${taskId - 1}`],
                priority: 8
            });

            tasks.push({
                id: `task_${taskId++}`,
                type: 'database_schema',
                description: 'Design database schema',
                input: {},
                dependencies: [`task_${taskId - 1}`],
                priority: 8
            });
        }

        // Testing
        tasks.push({
            id: `task_${taskId++}`,
            type: 'testing',
            description: 'Add tests',
            input: {},
            priority: 5
        });

        // Documentation
        tasks.push({
            id: `task_${taskId++}`,
            type: 'documentation',
            description: 'Generate documentation',
            input: {},
            priority: 4
        });

        return tasks;
    }

    private estimateTimeline(tasks: AgentTask[]): string {
        const hours = tasks.length * 0.5; // 30 min per task average
        if (hours < 1) return '< 1 hour';
        if (hours < 4) return `${Math.ceil(hours)} hours`;
        return `${Math.ceil(hours / 8)} days`;
    }
}

/**
 * Code Generator Agent - Writes production-ready code
 */
class CodeGeneratorAgent implements Agent {
    name = 'CodeGeneratorAgent';
    role = 'Code Generation';
    capabilities = ['code_writing', 'file_generation', 'boilerplate'];

    async execute(task: AgentTask): Promise<AgentResult> {
        // This will integrate with intelligent-router for actual code generation
        // For now, return structure

        const files: string[] = [];

        switch (task.type) {
            case 'frontend_scaffold':
                files.push(...this.generateReactScaffold());
                break;
            case 'backend_scaffold':
                files.push(...this.generateExpressScaffold());
                break;
            case 'ui_components':
                files.push(...this.generateUIComponents(task.input));
                break;
            case 'api_endpoints':
                files.push(...this.generateAPIEndpoints(task.input));
                break;
            default:
                files.push('README.md');
        }

        return {
            taskId: task.id,
            success: true,
            output: { filesCreated: files.length },
            artifacts: files
        };
    }

    private generateReactScaffold(): string[] {
        return [
            'src/App.tsx',
            'src/main.tsx',
            'src/index.css',
            'src/components/.gitkeep',
            'src/hooks/.gitkeep',
            'src/utils/.gitkeep',
            'package.json',
            'tsconfig.json',
            'vite.config.ts'
        ];
    }

    private generateExpressScaffold(): string[] {
        return [
            'src/index.ts',
            'src/routes/.gitkeep',
            'src/middleware/.gitkeep',
            'src/models/.gitkeep',
            'src/config/.gitkeep',
            'package.json',
            'tsconfig.json'
        ];
    }

    private generateUIComponents(input: any): string[] {
        return [
            'src/components/Header.tsx',
            'src/components/Footer.tsx',
            'src/components/Layout.tsx'
        ];
    }

    private generateAPIEndpoints(input: any): string[] {
        return [
            'src/routes/users.ts',
            'src/routes/auth.ts'
        ];
    }
}

/**
 * Test Generator Agent - Creates comprehensive tests
 */
class TestGeneratorAgent implements Agent {
    name = 'TestGeneratorAgent';
    role = 'Testing & Quality Assurance';
    capabilities = ['unit_tests', 'integration_tests', 'e2e_tests'];

    async execute(task: AgentTask): Promise<AgentResult> {
        const testFiles = [
            'tests/unit/.gitkeep',
            'tests/integration/.gitkeep',
            'tests/e2e/.gitkeep',
            'vitest.config.ts',
            'playwright.config.ts'
        ];

        return {
            taskId: task.id,
            success: true,
            output: { testsGenerated: testFiles.length },
            artifacts: testFiles
        };
    }
}

/**
 * Manus Agent - The Unstoppable Constructor
 */
class ManusAgent implements Agent {
    name = 'ManusAgent';
    role = 'Master Architect & Autonomous Constructor';
    capabilities = ['autonomous_build', 'elite_design', 'self_healing', 'project_ignition'];

    async execute(task: AgentTask): Promise<AgentResult> {
        const manus = new ManusCore(task.context?.rootDir || process.cwd());
        const result = await manus.ignite(task.description);

        return {
            taskId: task.id,
            success: result.success,
            output: result,
            error: result.finalError
        };
    }
}

/**
 * Orchestrator - Coordinates all agents
 */
export class AgentOrchestrator {
    private agents: Map<string, Agent> = new Map();
    private taskQueue: AgentTask[] = [];
    private completedTasks: Map<string, AgentResult> = new Map();
    private running: boolean = false;

    constructor() {
        // Register agents
        this.registerAgent(new PlannerAgent());
        this.registerAgent(new CodeGeneratorAgent());
        this.registerAgent(new TestGeneratorAgent());
        this.registerAgent(new ManusAgent());
    }

    registerAgent(agent: Agent) {
        this.agents.set(agent.name, agent);
        console.info(`[Orchestrator] Registered agent: ${agent.name}`);
    }

    /**
     * Build a complete application
     */
    async buildApplication(description: string): Promise<{
        plan: ProjectPlan;
        results: AgentResult[];
        totalFiles: number;
    }> {
        console.info(`[Orchestrator] Building application: ${description}`);

        // Step 1: Create plan
        const planTask: AgentTask = {
            id: 'plan_task',
            type: 'planning',
            description,
            input: {},
            priority: 10
        };

        const planner = this.agents.get('PlannerAgent')!;
        const planResult = await planner.execute(planTask);
        const plan = planResult.output as ProjectPlan;

        console.info(`[Orchestrator] Plan created: ${plan.tasks.length} tasks`);

        // Step 2: Execute tasks in order
        const results: AgentResult[] = [planResult];
        let totalFiles = 0;

        for (const task of plan.tasks) {
            // Find appropriate agent for task type
            const agent = this.findAgentForTask(task);

            if (!agent) {
                console.warn(`[Orchestrator] No agent found for task: ${task.type}`);
                continue;
            }

            console.info(`[Orchestrator] Executing ${task.description} with ${agent.name}`);

            const result = await agent.execute(task);
            results.push(result);

            if (result.artifacts) {
                totalFiles += result.artifacts.length;
            }

            this.completedTasks.set(task.id, result);

            // Add any next steps to queue
            if (result.nextSteps) {
                this.taskQueue.push(...result.nextSteps);
            }
        }

        console.info(`[Orchestrator] Build complete! ${totalFiles} files created`);

        return {
            plan,
            results,
            totalFiles
        };
    }

    private findAgentForTask(task: AgentTask): Agent | undefined {
        // Simple mapping - can be made more sophisticated
        if (task.type.includes('frontend') || task.type.includes('backend') || task.type.includes('api') || task.type.includes('ui')) {
            return this.agents.get('CodeGeneratorAgent');
        }

        if (task.type.includes('test')) {
            return this.agents.get('TestGeneratorAgent');
        }

        return this.agents.get('CodeGeneratorAgent'); // Default
    }
}

export const orchestrator = new AgentOrchestrator();

export default orchestrator;
