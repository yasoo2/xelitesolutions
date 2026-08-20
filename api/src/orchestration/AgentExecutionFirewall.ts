import { AsyncLocalStorage } from 'async_hooks';
import { logger } from '../shared/utils/logger';

/**
 * AgentExecutionFirewall
 * 
 * Enforces the "Single Brain" architecture by ensuring that all system execution
 * (Tools and Engine) is initiated through the AgentOrchestrator.
 */
class AgentExecutionFirewall {
    private static instance: AgentExecutionFirewall;
    /**
     * WHO THIS WORK IS FOR, carried with the work itself.
     *
     * Live events were addressed by each caller repeating the session in its
     * payload, and fourteen call sites simply did not — a file diff, a
     * screenshot, a shell line, a task update, a notification, and the question
     * «Joe needs your input» all resolved to «nobody», which the wire delivers
     * to EVERYBODY. Patching fourteen payloads would leave the fifteenth to be
     * written tomorrow. The owner rides in the ambient context instead, so
     * anything broadcast while a run is executing belongs to whoever started it.
     */
    public context = new AsyncLocalStorage<{
        isOrchestrator: boolean; isSystem?: boolean; traceId?: string;
        userId?: string; sessionId?: string; runId?: string;
    }>();

    private constructor() {}

    public static getInstance(): AgentExecutionFirewall {
        if (!AgentExecutionFirewall.instance) {
            AgentExecutionFirewall.instance = new AgentExecutionFirewall();
        }
        return AgentExecutionFirewall.instance;
    }

    /**
     * Executes a function within the authorized Orchestrator context
     */
    public runInContext<T>(traceId: string | undefined, fn: () => T, owner?: { userId?: string; sessionId?: string; runId?: string }): T {
        const parent = this.context.getStore();
        return this.context.run({
            isOrchestrator: true,
            isSystem: parent?.isSystem,
            traceId,
            userId: owner?.userId || parent?.userId,
            sessionId: owner?.sessionId || parent?.sessionId,
            runId: owner?.runId || parent?.runId,
        }, fn);
    }

    /** The user this execution belongs to, when it belongs to one. */
    public currentOwner(): { userId: string; sessionId: string } {
        const s = this.context.getStore();
        return { userId: String(s?.userId || ''), sessionId: String(s?.sessionId || '') };
    }

    /** The canonical run address carried by the current execution context. */
    public currentRunId(): string {
        return String(this.context.getStore()?.runId || '');
    }

    /**
     * Executes a function as a trusted system background task
     */
    public runAsSystem<T>(fn: () => T, owner?: { userId?: string; sessionId?: string; runId?: string }): T {
        const parent = this.context.getStore();
        return this.context.run({
            isOrchestrator: true,
            isSystem: true,
            userId: owner?.userId || parent?.userId,
            sessionId: owner?.sessionId || parent?.sessionId,
            runId: owner?.runId || parent?.runId,
        }, fn);
    }

    /**
     * Returns true when execution is running inside a trusted system context.
     */
    public isSystemContext(): boolean {
        return this.context.getStore()?.isSystem === true;
    }

    /**
     * Validates that the current execution context is authorized.
     * Throws an error if direct execution bypass is detected.
     */
    public validateExecution(component: string): void {
        const store = this.context.getStore();
        const isAuthorized = store?.isOrchestrator === true;

        if (isAuthorized) {
            const contextType = store?.isSystem ? 'SYSTEM' : 'AGENT';
            logger.debug(`[FIREWALL] [ALLOWED] ${component} - type=${contextType} traceId=${store?.traceId || 'none'}`);
        } else {
            logger.error(`[FIREWALL] [BLOCKED] ${component} - Direct execution bypass detected! Context: ${JSON.stringify(store || null)}`);
            throw new Error(`Execution bypass detected in ${component}. All execution must go through AgentOrchestrator.coordinate().`);
        }
    }
}

export const executionFirewall = AgentExecutionFirewall.getInstance();
