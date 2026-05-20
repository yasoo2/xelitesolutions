type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';

interface OrchestratorTask {
    id: string;
    description: string;
    status: TaskStatus;
    dependsOn: string[];
    result?: string;
    error?: string;
    startedAt?: number;
    completedAt?: number;
}

interface OrchestratorPlan {
    projectType: string;
    tasks: OrchestratorTask[];
    createdAt: number;
}

interface BuildResult {
    plan: OrchestratorPlan;
    totalFiles: number;
    results: Array<{ taskId: string; status: TaskStatus; output?: string }>;
}

function generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function detectProjectType(message: string): string {
    const lower = message.toLowerCase();
    if (/\b(api|rest|graphql|backend|server)\b/.test(lower)) return 'api';
    if (/\b(web|frontend|react|vue|angular|ui)\b/.test(lower)) return 'web-app';
    if (/\b(mobile|ios|android|react.native|flutter)\b/.test(lower)) return 'mobile-app';
    if (/\b(cli|command.?line|terminal)\b/.test(lower)) return 'cli-tool';
    if (/\b(library|package|module|sdk)\b/.test(lower)) return 'library';
    if (/\b(full.?stack|مشروع|نظام|تطبيق)\b/.test(lower)) return 'full-stack';
    return 'application';
}

function createTaskPlan(projectType: string, message: string): OrchestratorTask[] {
    const baseAnalysis: OrchestratorTask = {
        id: generateTaskId(),
        description: 'Analyze requirements and extract specifications',
        status: 'pending',
        dependsOn: [],
    };

    const scaffolding: OrchestratorTask = {
        id: generateTaskId(),
        description: 'Scaffold project structure and initialize dependencies',
        status: 'pending',
        dependsOn: [baseAnalysis.id],
    };

    const typeTasks: Record<string, OrchestratorTask[]> = {
        'api': [
            { id: generateTaskId(), description: 'Design API schema and endpoints', status: 'pending', dependsOn: [scaffolding.id] },
            { id: generateTaskId(), description: 'Implement data models and database schema', status: 'pending', dependsOn: [scaffolding.id] },
            { id: generateTaskId(), description: 'Implement API routes and controllers', status: 'pending', dependsOn: [scaffolding.id] },
            { id: generateTaskId(), description: 'Add authentication and authorization middleware', status: 'pending', dependsOn: [scaffolding.id] },
        ],
        'web-app': [
            { id: generateTaskId(), description: 'Design component hierarchy and routing', status: 'pending', dependsOn: [scaffolding.id] },
            { id: generateTaskId(), description: 'Implement UI components and pages', status: 'pending', dependsOn: [scaffolding.id] },
            { id: generateTaskId(), description: 'Add state management and API integration', status: 'pending', dependsOn: [scaffolding.id] },
            { id: generateTaskId(), description: 'Apply styling and responsive design', status: 'pending', dependsOn: [scaffolding.id] },
        ],
        'full-stack': [
            { id: generateTaskId(), description: 'Design database schema and API contracts', status: 'pending', dependsOn: [scaffolding.id] },
            { id: generateTaskId(), description: 'Implement backend API and data models', status: 'pending', dependsOn: [scaffolding.id] },
            { id: generateTaskId(), description: 'Implement frontend UI components', status: 'pending', dependsOn: [scaffolding.id] },
            { id: generateTaskId(), description: 'Connect frontend to backend API', status: 'pending', dependsOn: [scaffolding.id] },
            { id: generateTaskId(), description: 'Add authentication flow end-to-end', status: 'pending', dependsOn: [scaffolding.id] },
        ],
    };

    const specific = typeTasks[projectType] || typeTasks['full-stack']!;

    const testing: OrchestratorTask = {
        id: generateTaskId(),
        description: 'Generate and run tests for all components',
        status: 'pending',
        dependsOn: specific.map(t => t.id),
    };

    const review: OrchestratorTask = {
        id: generateTaskId(),
        description: 'Review code quality, fix linting issues, and finalize',
        status: 'pending',
        dependsOn: [testing.id],
    };

    return [baseAnalysis, scaffolding, ...specific, testing, review];
}

export const orchestrator = {
    buildApplication: async (message: string): Promise<BuildResult> => {
        console.log(`[Orchestrator] Planning build for: ${message.slice(0, 100)}...`);

        const projectType = detectProjectType(message);
        const tasks = createTaskPlan(projectType, message);

        const plan: OrchestratorPlan = {
            projectType,
            tasks,
            createdAt: Date.now(),
        };

        console.log(`[Orchestrator] Created plan with ${tasks.length} tasks for ${projectType} project`);

        return {
            plan,
            totalFiles: 0,
            results: tasks.map(t => ({ taskId: t.id, status: t.status })),
        };
    },

    getReadyTasks: (plan: OrchestratorPlan): OrchestratorTask[] => {
        return plan.tasks.filter(task => {
            if (task.status !== 'pending') return false;
            return task.dependsOn.every(depId => {
                const dep = plan.tasks.find(t => t.id === depId);
                return dep && dep.status === 'completed';
            });
        });
    },

    updateTaskStatus: (plan: OrchestratorPlan, taskId: string, status: TaskStatus, result?: string): void => {
        const task = plan.tasks.find(t => t.id === taskId);
        if (!task) return;
        task.status = status;
        if (status === 'in_progress') task.startedAt = Date.now();
        if (status === 'completed' || status === 'failed') task.completedAt = Date.now();
        if (result) task.result = result;
    },

    isComplete: (plan: OrchestratorPlan): boolean => {
        return plan.tasks.every(t => t.status === 'completed' || t.status === 'skipped');
    },

    hasFailed: (plan: OrchestratorPlan): boolean => {
        return plan.tasks.some(t => t.status === 'failed');
    },
};
