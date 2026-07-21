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
    public context = new AsyncLocalStorage<{ isOrchestrator: boolean; isSystem?: boolean; traceId?: string }>();

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
    public runInContext<T>(traceId: string | undefined, fn: () => T): T {
        const parent = this.context.getStore();
        return this.context.run({ isOrchestrator: true, isSystem: parent?.isSystem, traceId }, fn);
    }

    /**
     * Executes a function as a trusted system background task
     */
    public runAsSystem<T>(fn: () => T): T {
        return this.context.run({ isOrchestrator: true, isSystem: true }, fn);
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
