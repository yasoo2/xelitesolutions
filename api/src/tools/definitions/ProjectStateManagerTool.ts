import { ToolDefinition } from '../types';

/**
 * ProjectStateManagerTool - Tracks project progress and enables resumption
 * Manages checkpoints and state persistence
 */
export class ProjectStateManagerTool implements ToolDefinition {
    name = 'project_state_manager';
    version = '1.0.0';
    description = 'Track project progress, save checkpoints, and enable resumption after interruptions';
    tags = ['state', 'progress', 'checkpoint'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            action: {
                type: 'string' as const,
                enum: ['init', 'update', 'checkpoint', 'resume', 'status'],
                description: 'Action to perform'
            },
            projectId: {
                type: 'string' as const,
                description: 'Unique project identifier'
            },
            state: {
                type: 'object' as const,
                description: 'State data to save or update',
                properties: {
                    projectName: { type: 'string' as const },
                    currentPhase: { type: 'number' as const },
                    totalPhases: { type: 'number' as const },
                    completedTasks: {
                        type: 'array' as const,
                        items: { type: 'string' as const }
                    },
                    createdFiles: {
                        type: 'array' as const,
                        items: { type: 'string' as const }
                    },
                    errors: {
                        type: 'array' as const,
                        items: { type: 'object' as const }
                    }
                }
            }
        },
        required: ['action', 'projectId']
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            projectId: { type: 'string' as const },
            state: { type: 'object' as const },
            checkpoint: { type: 'object' as const },
            progress: { type: 'number' as const }
        }
    };

    permissions = [];
    sideEffects = ['write'];
    rateLimitPerMinute = 30;
    auditFields = ['projectId', 'action'];
    mockSupported = false;

    // In-memory state storage (in production, use database)
    private static states = new Map<string, any>();
    private static checkpoints = new Map<string, any[]>();

    async execute(input: { action: string; projectId: string; state?: any }) {
        const { action, projectId, state } = input;
        const logs: string[] = [];

        try {
            logs.push(`State Manager: ${action} for project ${projectId}`);

            switch (action) {
                case 'init':
                    return this.initProject(projectId, state, logs);

                case 'update':
                    return this.updateState(projectId, state, logs);

                case 'checkpoint':
                    return this.saveCheckpoint(projectId, logs);

                case 'resume':
                    return this.resumeProject(projectId, logs);

                case 'status':
                    return this.getStatus(projectId, logs);

                default:
                    throw new Error(`Unknown action: ${action}`);
            }

        } catch (error: any) {
            logs.push(`Error: ${error.message}`);
            return {
                ok: false,
                error: error.message,
                logs
            };
        }
    }

    private initProject(projectId: string, initialState: any, logs: string[]) {
        const state = {
            projectId,
            projectName: initialState?.projectName || 'Unnamed Project',
            currentPhase: 1,
            totalPhases: initialState?.totalPhases || 3,
            completedTasks: [],
            pendingTasks: initialState?.pendingTasks || [],
            createdFiles: [],
            errors: [],
            startedAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
        };

        ProjectStateManagerTool.states.set(projectId, state);
        ProjectStateManagerTool.checkpoints.set(projectId, []);

        logs.push(`Project initialized: ${state.projectName}`);

        return {
            ok: true,
            output: {
                projectId,
                state,
                progress: 0,
                message: 'Project state initialized'
            },
            logs
        };
    }

    private updateState(projectId: string, updates: any, logs: string[]) {
        const currentState = ProjectStateManagerTool.states.get(projectId);

        if (!currentState) {
            throw new Error(`Project ${projectId} not found. Initialize first.`);
        }

        // Merge updates
        const newState = {
            ...currentState,
            ...updates,
            lastUpdated: new Date().toISOString()
        };

        // Auto-checkpoint every 10 files
        if (newState.createdFiles?.length % 10 === 0 && newState.createdFiles.length > 0) {
            this.saveCheckpoint(projectId, logs);
        }

        ProjectStateManagerTool.states.set(projectId, newState);

        const progress = this.calculateProgress(newState);
        logs.push(`State updated. Progress: ${progress}%`);

        return {
            ok: true,
            output: {
                projectId,
                state: newState,
                progress,
                message: 'State updated successfully'
            },
            logs
        };
    }

    private saveCheckpoint(projectId: string, logs: string[]) {
        const currentState = ProjectStateManagerTool.states.get(projectId);

        if (!currentState) {
            throw new Error(`Project ${projectId} not found`);
        }

        const checkpoints = ProjectStateManagerTool.checkpoints.get(projectId) || [];
        const checkpoint = {
            ...currentState,
            checkpointTime: new Date().toISOString(),
            checkpointNumber: checkpoints.length + 1
        };

        checkpoints.push(checkpoint);
        ProjectStateManagerTool.checkpoints.set(projectId, checkpoints);

        logs.push(`Checkpoint #${checkpoint.checkpointNumber} saved`);

        return {
            ok: true,
            output: {
                projectId,
                checkpoint,
                totalCheckpoints: checkpoints.length,
                message: `Checkpoint #${checkpoint.checkpointNumber} saved`
            },
            logs
        };
    }

    private resumeProject(projectId: string, logs: string[]) {
        const checkpoints = ProjectStateManagerTool.checkpoints.get(projectId);

        if (!checkpoints || checkpoints.length === 0) {
            throw new Error(`No checkpoints found for project ${projectId}`);
        }

        const lastCheckpoint = checkpoints[checkpoints.length - 1];
        ProjectStateManagerTool.states.set(projectId, lastCheckpoint);

        logs.push(`Resumed from checkpoint #${lastCheckpoint.checkpointNumber}`);

        return {
            ok: true,
            output: {
                projectId,
                state: lastCheckpoint,
                resumedFrom: lastCheckpoint.checkpointNumber,
                message: 'Project resumed from last checkpoint'
            },
            logs
        };
    }

    private getStatus(projectId: string, logs: string[]) {
        const state = ProjectStateManagerTool.states.get(projectId);

        if (!state) {
            throw new Error(`Project ${projectId} not found`);
        }

        const checkpoints = ProjectStateManagerTool.checkpoints.get(projectId) || [];
        const progress = this.calculateProgress(state);

        logs.push(`Status retrieved. Progress: ${progress}%`);

        return {
            ok: true,
            output: {
                projectId,
                state,
                progress,
                totalCheckpoints: checkpoints.length,
                summary: {
                    phase: `${state.currentPhase}/${state.totalPhases}`,
                    tasks: `${state.completedTasks?.length || 0} completed`,
                    files: `${state.createdFiles?.length || 0} created`,
                    errors: `${state.errors?.length || 0} errors`
                }
            },
            logs
        };
    }

    private calculateProgress(state: any): number {
        const phaseProgress = (state.currentPhase / state.totalPhases) * 100;
        const taskProgress = state.pendingTasks?.length > 0
            ? ((state.completedTasks?.length || 0) / (state.completedTasks?.length + state.pendingTasks.length)) * 100
            : 0;

        return Math.round((phaseProgress + taskProgress) / 2);
    }
}
