import { ToolDefinition } from '../types';

/**
 * PhaseExecutorTool - Executes a single phase from a project plan
 * Manages phase completion and progression
 */
export class PhaseExecutorTool implements ToolDefinition {
    name = 'phase_executor';
    version = '1.0.0';
    description = 'Execute a single phase of a project plan systematically';
    tags = ['execution', 'project', 'phase'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            phase: {
                type: 'object' as const,
                description: 'The phase to execute',
                properties: {
                    phaseNumber: { type: 'number' as const },
                    name: { type: 'string' as const },
                    description: { type: 'string' as const },
                    tasks: {
                        type: 'array' as const,
                        items: { type: 'object' as const },
                        description: 'List of tasks in this phase'
                    }
                },
                required: ['phaseNumber', 'name', 'tasks']
            },
            projectContext: {
                type: 'object' as const,
                description: 'Context about the overall project',
                properties: {
                    projectName: { type: 'string' as const },
                    totalPhases: { type: 'number' as const }
                }
            }
        },
        required: ['phase']
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            phaseNumber: { type: 'number' as const },
            status: { type: 'string' as const },
            completedTasks: { type: 'number' as const },
            totalTasks: { type: 'number' as const },
            nextPhase: { type: 'number' as const }
        }
    };

    permissions = [];
    sideEffects = [];
    rateLimitPerMinute = 10;
    auditFields = [];
    mockSupported = false;

    async execute(input: { phase: any; projectContext?: any }) {
        const { phase, projectContext } = input;
        const logs: string[] = [];

        try {
            logs.push(`Executing Phase ${phase.phaseNumber}: ${phase.name}`);

            const tasks = Array.isArray(phase.tasks) ? phase.tasks : [];
            const totalTasks = tasks.length;

            logs.push(`Total tasks in phase: ${totalTasks}`);

            // In a real implementation, this would execute each task
            // For now, we'll return a summary to guide the main agent

            const taskSummary = tasks.map((task: any, idx: number) => {
                return `${idx + 1}. ${task.task} (${task.tool || 'manual'}) - Priority: ${task.priority || 'medium'}`;
            }).join('\n');

            logs.push(`Phase tasks:\n${taskSummary}`);

            return {
                ok: true,
                output: {
                    phaseNumber: phase.phaseNumber,
                    phaseName: phase.name,
                    status: 'ready_to_execute',
                    completedTasks: 0,
                    totalTasks,
                    tasks: tasks,
                    nextPhase: phase.phaseNumber + 1,
                    instructions: `Execute the following tasks in order:\n${taskSummary}`,
                    deliverables: phase.deliverables || [],
                    estimatedTime: phase.estimatedTime || 'unknown'
                },
                logs
            };

        } catch (error: any) {
            logs.push(`Error: ${error.message}`);
            return {
                ok: false,
                error: error.message,
                logs
            };
        }
    }
}
