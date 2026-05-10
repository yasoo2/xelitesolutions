
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
                throw new Error(`[ExecutionGuard] Direct spawn blocked. Use executionEngine.run() instead.`);
            }
            return originalSpawn.apply(this, [command, args, options]);
        };

        cp.exec = function(command: string, options: any, callback: any) {
            const stack = new Error().stack || '';
            // Allow RegEx exec (which is on String/RegExp prototype, not child_process.exec)
            // child_process.exec is what we are patching here.
            if (!stack.includes('ExecutionEngine')) {
                console.error(`[ExecutionGuard] BLOCKED direct exec: ${command}`);
                throw new Error(`[ExecutionGuard] Direct exec blocked. Use executionEngine.run() instead.`);
            }
            return originalExec.apply(this, [command, options, callback]);
        };

        console.log('[ExecutionGuard] Global Execution Guard INSTALLED.');
    }

    /**
     * Global interceptor (conceptually).
     * In this implementation, we use it as a mandatory wrapper in critical paths.
     */
    static async safeRun(command: string, options: any = {}) {
        // This is the ONLY allowed way to run commands if not calling ExecutionEngine directly.
        return await executionEngine.run(command, options);
    }
}
