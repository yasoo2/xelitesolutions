
import { executionEngine } from './ExecutionEngine';
import * as fs from 'fs';
import * as path from 'path';

/**
 * ExecutionEnforcer
 * FINAL HARDENING LAYER - Phase 1.8
 * Enforces Single Execution Authority at runtime and startup.
 */
export class ExecutionEnforcer {
    private static isInitialized = false;

    /**
     * Boot-time integrity check.
     * Scans the codebase for illegal spawn/exec calls.
     * If found, the system MUST fail to start.
     */
    static validateIntegrity() {
        console.log('[ExecutionEnforcer] Running Boot-Time Integrity Check...');
        
        const srcDir = path.resolve(__dirname, '..');
        const violations: string[] = [];
        
        const scan = (dir: string) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
                    scan(fullPath);
                } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) {
                    // Skip ExecutionEngine and ExecutionGuard as they are the authorized owners
                    if (entry.name === 'ExecutionEngine.ts' || entry.name === 'ExecutionGuard.ts' || entry.name === 'ExecutionEnforcer.ts' || entry.name === 'ExecutionGateway.ts') continue;
                    
                    const content = fs.readFileSync(fullPath, 'utf8');
                    
                    // Regex to find direct spawn/exec calls or imports from child_process
                    const spawnRegex = /spawn\(/g;
                    const execRegex = /exec\(/g;
                    const ptyRegex = /pty\.spawn\(/g;
                    const importRegex = /from ['"]child_process['"]|require\(['"]child_process['"]\)/g;

                    // Filter out comments and string literals for more accuracy if possible, 
                    // but for Phase 1.8 we want to be VERY strict.
                    
                    if (importRegex.test(content)) violations.push(`${fullPath}: Illegal child_process import`);
                    if (spawnRegex.test(content)) violations.push(`${fullPath}: Illegal spawn() call`);
                    // Note: We need to be careful with .exec() as it's common in RegEx.
                    // We look for exec( that doesn't look like regex.exec(
                    const execMatches = content.match(execRegex);
                    if (execMatches) {
                        // More refined check for exec
                        const lines = content.split('\n');
                        lines.forEach((line, index) => {
                            if (line.includes('exec(') && !line.includes('.exec(') && !line.includes('//') && !line.includes('/*')) {
                                violations.push(`${fullPath}:${index + 1}: Potential illegal exec() call`);
                            }
                        });
                    }
                    if (ptyRegex.test(content)) violations.push(`${fullPath}: Illegal pty.spawn() call`);
                }
            }
        };

        scan(srcDir);

        if (violations.length > 0) {
            console.error('\x1b[1;31m[ExecutionEnforcer] FATAL: EXECUTION ARCHITECTURE VIOLATIONS DETECTED!\x1b[0m');
            violations.forEach(v => console.error(`  ❌ ${v}`));
            console.error('\x1b[1;31m[ExecutionEnforcer] SYSTEM STARTUP BLOCKED. Please migrate all execution to ExecutionEngine.\x1b[0m');
            process.exit(1);
        }

        console.log('[ExecutionEnforcer] Integrity Check PASSED.');
        this.isInitialized = true;
    }

    /**
     * Runtime gate for execution routing.
     */
    static enforce(caller: string, action: () => any) {
        if (!this.isInitialized) {
            this.validateIntegrity();
        }
        
        // This is a secondary runtime check
        const stack = new Error().stack || '';
        if (!stack.includes('ExecutionEngine') && !stack.includes('internal_system_bootstrap')) {
            throw new Error(`[ExecutionEnforcer] ILLEGAL EXECUTION ROUTE BY ${caller}. All execution must flow through ExecutionEngine.`);
        }
        
        return action();
    }
}
