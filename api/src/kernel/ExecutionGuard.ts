
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
        const originals = {
            spawn: cp.spawn,
            exec: cp.exec,
            execSync: cp.execSync,
            spawnSync: cp.spawnSync,
            execFile: cp.execFile,
            execFileSync: cp.execFileSync
        };

        const checkBypass = (method: string, command: string) => {
            const stack = new Error().stack || '';
            // Allow ExecutionEngine and internal bootstrap only
            if (!stack.includes('ExecutionEngine') && !stack.includes('internal_system_bootstrap')) {
                console.error(`[ExecutionGuard] BLOCKED direct ${method}: ${command}`);
                throw new Error(`[ExecutionGuard] Direct ${method} blocked. All execution must route through ExecutionEngine.`);
            }
        };

        cp.spawn = function(command: string, args: any[], options: any) {
            checkBypass('spawn', command);
            return originals.spawn.apply(this, [command, args, options]);
        };

        cp.exec = function(command: string, options: any, callback: any) {
            checkBypass('exec', command);
            return originals.exec.apply(this, [command, options, callback]);
        };

        cp.execSync = function(command: string, options: any) {
            checkBypass('execSync', command);
            return originals.execSync.apply(this, [command, options]);
        };

        cp.spawnSync = function(command: string, args: any[], options: any) {
            checkBypass('spawnSync', command);
            return originals.spawnSync.apply(this, [command, args, options]);
        };

        cp.execFile = function(file: string, args: any[], options: any, callback: any) {
            checkBypass('execFile', file);
            return originals.execFile.apply(this, [file, args, options, callback]);
        };

        cp.execFileSync = function(file: string, args: any[], options: any) {
            checkBypass('execFileSync', file);
            return originals.execFileSync.apply(this, [file, args, options]);
        };

        console.log('[ExecutionGuard] Global Execution Guard INSTALLED (Full Coverage).');
    }
}
