
import { executionEngine } from './ExecutionEngine';

/**
 * ExecutionGuard
 * HARD ENFORCEMENT layer for all system execution.
 * Phase 1.7: No bypass allowed.
 */
export class ExecutionGuard {
    /**
     * Verify and route all execution calls.
     * Throws if illegal bypass is attempted.
     */
    static enforce(caller: string, action: () => any) {
        if (caller !== 'ExecutionEngine' && caller !== 'internal_system_bootstrap') {
            throw new Error(`[ExecutionGuard] ILLEGAL EXECUTION ATTEMPT BY ${caller}. All execution must route through ExecutionEngine.`);
        }
        return action();
    }

    /**
     * Apply global monkey-patch to child_process.
     * Phase 1.7: HARD LOCK.
     */
    static install() {
        const cp = require('child_process');
        const originalSpawn = cp.spawn;
        const originalExec = cp.exec;

        cp.spawn = function(command: string, args: any[], options: any) {
            const stack = new Error().stack || '';
            if (!stack.includes('ExecutionEngine') && !stack.includes('internal_system_bootstrap')) {
                console.error(`[ExecutionGuard] BLOCKED direct spawn: ${command}`);
                throw new Error(`[ExecutionGuard] Direct spawn blocked. Use ExecutionEngine.execute() instead.`);
            }
            return originalSpawn.apply(this, [command, args, options]);
        };

        cp.exec = function(command: string, options: any, callback: any) {
            const stack = new Error().stack || '';
            if (!stack.includes('ExecutionEngine')) {
                console.error(`[ExecutionGuard] BLOCKED direct exec: ${command}`);
                throw new Error(`[ExecutionGuard] Direct exec blocked. Use ExecutionEngine.execute() instead.`);
            }
            return originalExec.apply(this, [command, options, callback]);
        };

        console.log('[ExecutionGuard] Global Execution Guard INSTALLED.');
    }

    /**
     * Global interceptor (conceptually).
     * Phase 2.1: Routes through unified execute contract.
     */
    static async safeRun(command: string, options: any = {}) {
        return await executionEngine.execute({
            id: 'safe_run_' + Date.now(),
            type: 'shell',
            payload: { command, options },
            priority: 'normal'
        });
    }
}
