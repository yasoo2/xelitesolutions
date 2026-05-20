/**
 * AutonomousLoopEngine - The "Unstoppable" Build-Test-Heal-Retry Engine
 * 
 * God Mode Upgrade: Makes Joe work autonomously until success, never stopping.
 * 
 * Features:
 * - Exponential Backoff with Jitter
 * - Circuit Breaker (stops after max failures)
 * - Checkpointing (resume from last success)
 * - Wolverine Integration (self-healing on errors)
 * 
 * @version 1.0.0
 */

import { executeTool } from '../../modules/services/ToolService';
import { routeToModel } from '../llm/intelligent-router';
import fs from 'fs';
import path from 'path';

export interface LoopConfig {
    maxIterations: number;        // Maximum retry attempts (default: 100)
    backoffInitialMs: number;     // Initial backoff delay (default: 1000ms)
    backoffMaxMs: number;         // Max backoff delay (default: 60000ms)
    backoffMultiplier: number;    // Backoff multiplier (default: 2)
    enableCheckpointing: boolean; // Save progress to file
    checkpointPath: string;       // Path to checkpoint file
    enableWolverine: boolean;     // Use Wolverine self-healing
    circuitBreakerThreshold: number; // Consecutive failures before circuit opens
}

export interface LoopTask {
    name: string;
    phase: 'plan' | 'build' | 'test' | 'deploy' | 'custom';
    tool?: string;
    args?: Record<string, any>;
    customExecute?: () => Promise<{ ok: boolean; output?: any; error?: string }>;
    required: boolean;  // If true, loop aborts on failure after max retries
}

export interface LoopState {
    currentTaskIndex: number;
    completedTasks: string[];
    iteration: number;
    lastError?: string;
    consecutiveFailures: number;
    circuitOpen: boolean;
    startTime: number;
    checkpoints: Array<{ taskName: string; timestamp: number; success: boolean }>;
}

export interface LoopResult {
    success: boolean;
    totalIterations: number;
    completedTasks: string[];
    failedTasks: string[];
    totalTimeMs: number;
    logs: string[];
    finalError?: string;
}

const DEFAULT_CONFIG: LoopConfig = {
    maxIterations: 100,
    backoffInitialMs: 1000,
    backoffMaxMs: 60000,
    backoffMultiplier: 2,
    enableCheckpointing: true,
    checkpointPath: '.joe/checkpoint.json',
    enableWolverine: true,
    circuitBreakerThreshold: 10
};

export class AutonomousLoopEngine {
    private config: LoopConfig;
    private state: LoopState;
    private logs: string[] = [];
    private workspaceRoot: string;
    private sessionId?: string;
    private workspaceId?: string;

    constructor(
        workspaceRoot: string,
        config: Partial<LoopConfig> = {},
        context?: { sessionId?: string; workspaceId?: string }
    ) {
        this.workspaceRoot = workspaceRoot;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.sessionId = context?.sessionId;
        this.workspaceId = context?.workspaceId;
        this.state = this.initState();
    }

    private initState(): LoopState {
        return {
            currentTaskIndex: 0,
            completedTasks: [],
            iteration: 0,
            consecutiveFailures: 0,
            circuitOpen: false,
            startTime: Date.now(),
            checkpoints: []
        };
    }

    /**
     * Main entry point: Execute tasks in a loop until all succeed
     */
    async executeLoop(tasks: LoopTask[]): Promise<LoopResult> {
        this.log(`🚀 AutonomousLoopEngine started with ${tasks.length} tasks`);
        this.log(`📋 Config: maxIterations=${this.config.maxIterations}, wolverine=${this.config.enableWolverine}`);

        // Try to restore from checkpoint
        if (this.config.enableCheckpointing) {
            await this.restoreCheckpoint();
        }

        const failedTasks: string[] = [];

        while (this.state.currentTaskIndex < tasks.length) {
            // Check circuit breaker
            if (this.state.circuitOpen) {
                this.log(`🔴 Circuit breaker OPEN after ${this.config.circuitBreakerThreshold} consecutive failures`);
                break;
            }

            // Check max iterations
            if (this.state.iteration >= this.config.maxIterations) {
                this.log(`⚠️ Max iterations (${this.config.maxIterations}) reached`);
                break;
            }

            const task = tasks[this.state.currentTaskIndex];
            this.log(`\n📌 Executing task ${this.state.currentTaskIndex + 1}/${tasks.length}: ${task.name}`);

            const result = await this.executeTask(task);

            if (result.ok) {
                this.log(`✅ Task "${task.name}" succeeded`);
                this.state.completedTasks.push(task.name);
                this.state.consecutiveFailures = 0;
                this.state.currentTaskIndex++;
                await this.saveCheckpoint(task.name, true);
            } else {
                this.log(`❌ Task "${task.name}" failed: ${result.error}`);
                this.state.lastError = result.error;
                this.state.consecutiveFailures++;
                this.state.iteration++;

                // Check circuit breaker threshold
                if (this.state.consecutiveFailures >= this.config.circuitBreakerThreshold) {
                    this.state.circuitOpen = true;
                    failedTasks.push(task.name);
                    break;
                }

                // Attempt self-healing with Wolverine
                if (this.config.enableWolverine && result.error) {
                    const healed = await this.attemptWolverineHeal(result.error);
                    if (healed) {
                        this.log(`🦸 Wolverine healed the error, retrying task...`);
                        continue; // Retry the same task
                    }
                }

                // Apply exponential backoff
                const delay = this.calculateBackoff();
                this.log(`⏳ Backoff: waiting ${delay}ms before retry...`);
                await this.sleep(delay);

                // If task is required and we can't heal, keep retrying
                if (!task.required) {
                    this.log(`⚠️ Skipping optional task "${task.name}" after failure`);
                    failedTasks.push(task.name);
                    this.state.currentTaskIndex++;
                    this.state.consecutiveFailures = 0;
                }
                // Otherwise, we loop again on the same task
            }
        }

        const totalTimeMs = Date.now() - this.state.startTime;
        const success = this.state.currentTaskIndex >= tasks.length && !this.state.circuitOpen;

        this.log(`\n${'='.repeat(50)}`);
        this.log(`🏁 AutonomousLoopEngine ${success ? 'COMPLETED SUCCESSFULLY' : 'FINISHED WITH ISSUES'}`);
        this.log(`📊 Total iterations: ${this.state.iteration}, Time: ${Math.round(totalTimeMs / 1000)}s`);
        this.log(`✅ Completed: ${this.state.completedTasks.length}/${tasks.length}`);
        if (failedTasks.length > 0) {
            this.log(`❌ Failed: ${failedTasks.join(', ')}`);
        }

        // Clean up checkpoint on success
        if (success && this.config.enableCheckpointing) {
            await this.clearCheckpoint();
        }

        return {
            success,
            totalIterations: this.state.iteration,
            completedTasks: this.state.completedTasks,
            failedTasks,
            totalTimeMs,
            logs: this.logs,
            finalError: this.state.lastError
        };
    }

    /**
     * Execute a single task
     */
    private async executeTask(task: LoopTask): Promise<{ ok: boolean; output?: any; error?: string }> {
        try {
            // Custom execute function takes priority
            if (task.customExecute) {
                return await task.customExecute();
            }

            // Execute via tool
            if (task.tool) {
                const result = await executeTool(
                    task.tool,
                    task.args || {},
                    { sessionId: this.sessionId, workspaceId: this.workspaceId }
                );
                return {
                    ok: result.ok,
                    output: result.output,
                    error: result.error
                };
            }

            // Phase-based execution
            switch (task.phase) {
                case 'plan':
                    return await this.executePlanPhase(task);
                case 'build':
                    return await this.executeBuildPhase(task);
                case 'test':
                    return await this.executeTestPhase(task);
                case 'deploy':
                    return await this.executeDeployPhase(task);
                default:
                    return { ok: false, error: `Unknown phase: ${task.phase}` };
            }
        } catch (e: any) {
            return { ok: false, error: e.message };
        }
    }

    /**
     * Plan phase: Use AI to generate a plan
     */
    private async executePlanPhase(task: LoopTask): Promise<{ ok: boolean; output?: any; error?: string }> {
        this.log(`📝 Planning: ${task.name}`);
        try {
            const content = await routeToModel([
                { role: 'system', content: `You are a system architect. Generate a detailed plan for: ${task.name}` }
            ]);
            return { ok: true, output: { plan: content } };
        } catch (e: any) {
            return { ok: false, error: e.message };
        }
    }

    /**
     * Build phase: Execute build tools
     */
    private async executeBuildPhase(task: LoopTask): Promise<{ ok: boolean; output?: any; error?: string }> {
        this.log(`🔨 Building: ${task.name}`);
        const result = await executeTool('shell_execute', {
            command: 'npm run build',
            cwd: this.workspaceRoot
        }, { sessionId: this.sessionId, workspaceId: this.workspaceId });
        return { ok: result.ok, output: result.output, error: result.error };
    }

    /**
     * Test phase: Run automated tests
     */
    private async executeTestPhase(task: LoopTask): Promise<{ ok: boolean; output?: any; error?: string }> {
        this.log(`🧪 Testing: ${task.name}`);
        const result = await executeTool('auto_tester', {
            testType: 'build',
            projectPath: this.workspaceRoot
        }, { sessionId: this.sessionId, workspaceId: this.workspaceId });
        const passed = result.ok && result.output?.passed;
        return { ok: passed, output: result.output, error: passed ? undefined : 'Tests failed' };
    }

    /**
     * Deploy phase: Execute deployment
     */
    private async executeDeployPhase(task: LoopTask): Promise<{ ok: boolean; output?: any; error?: string }> {
        this.log(`🚀 Deploying: ${task.name}`);
        // Placeholder - integrate with actual deployment tools
        return { ok: true, output: { message: 'Deployment phase placeholder' } };
    }

    /**
     * Attempt to heal an error using Wolverine (ErrorRecoveryTool)
     */
    private async attemptWolverineHeal(error: string): Promise<boolean> {
        this.log(`🦸 Wolverine attempting to heal: ${error.slice(0, 100)}...`);

        try {
            const result = await executeTool('error_recovery', {
                error,
                attemptFix: true
            }, { sessionId: this.sessionId, workspaceId: this.workspaceId });

            if (result.ok && result.output?.recovered) {
                this.log(`✅ Wolverine successfully healed the error`);
                return true;
            }
        } catch (e: any) {
            this.log(`⚠️ Wolverine heal failed: ${e.message}`);
        }

        return false;
    }

    /**
     * Calculate exponential backoff with jitter
     */
    private calculateBackoff(): number {
        const exponential = Math.min(
            this.config.backoffMaxMs,
            this.config.backoffInitialMs * Math.pow(this.config.backoffMultiplier, this.state.consecutiveFailures)
        );
        // Add ±25% jitter
        const jitter = exponential * (0.75 + Math.random() * 0.5);
        return Math.round(jitter);
    }

    /**
     * Save checkpoint to file
     */
    private async saveCheckpoint(taskName: string, success: boolean): Promise<void> {
        if (!this.config.enableCheckpointing) return;

        const checkpointFile = path.join(this.workspaceRoot, this.config.checkpointPath);
        const dir = path.dirname(checkpointFile);

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        this.state.checkpoints.push({
            taskName,
            timestamp: Date.now(),
            success
        });

        const checkpoint = {
            state: this.state,
            savedAt: new Date().toISOString()
        };

        fs.writeFileSync(checkpointFile, JSON.stringify(checkpoint, null, 2));
        this.log(`💾 Checkpoint saved: ${taskName}`);
    }

    /**
     * Restore from checkpoint if exists
     */
    private async restoreCheckpoint(): Promise<void> {
        const checkpointFile = path.join(this.workspaceRoot, this.config.checkpointPath);

        if (fs.existsSync(checkpointFile)) {
            try {
                const data = JSON.parse(fs.readFileSync(checkpointFile, 'utf-8'));
                this.state = data.state;
                this.log(`📂 Restored from checkpoint (saved at ${data.savedAt})`);
                this.log(`   Resuming from task index ${this.state.currentTaskIndex}`);
            } catch (e: any) {
                this.log(`⚠️ Failed to restore checkpoint: ${e.message}`);
            }
        }
    }

    /**
     * Clear checkpoint file on success
     */
    private async clearCheckpoint(): Promise<void> {
        const checkpointFile = path.join(this.workspaceRoot, this.config.checkpointPath);
        if (fs.existsSync(checkpointFile)) {
            fs.unlinkSync(checkpointFile);
            this.log(`🧹 Checkpoint cleared (success)`);
        }
    }

    /**
     * Helper: sleep for specified milliseconds
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Helper: log with timestamp
     */
    private log(message: string): void {
        const timestamp = new Date().toISOString().slice(11, 19);
        const logLine = `[${timestamp}] ${message}`;
        this.logs.push(logLine);
        console.log(logLine);
    }
}

/**
 * Convenience function: Create and run loop with common build pipeline
 */
export async function buildUntilSuccess(
    workspaceRoot: string,
    mission: string,
    options: {
        sessionId?: string;
        workspaceId?: string;
        maxIterations?: number;
    } = {}
): Promise<LoopResult> {
    const engine = new AutonomousLoopEngine(
        workspaceRoot,
        { maxIterations: options.maxIterations || 50 },
        { sessionId: options.sessionId, workspaceId: options.workspaceId }
    );

    const tasks: LoopTask[] = [
        { name: 'Install Dependencies', phase: 'build', tool: 'npm_manager', args: { command: 'install' }, required: true },
        { name: 'Build Project', phase: 'build', required: true },
        { name: 'Run Tests', phase: 'test', required: false },
    ];

    console.log(`\n🌩️ AUTONOMOUS LOOP: Building "${mission}" until success...\n`);
    return engine.executeLoop(tasks);
}
