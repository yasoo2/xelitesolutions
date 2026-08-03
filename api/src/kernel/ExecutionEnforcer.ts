
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
        const violations = this.scanViolations();
        if (violations === null) {
            console.warn('[ExecutionEnforcer] src directory not found for scan, skipping integrity check.');
            return;
        }

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
     * The scan itself, exit-free — so the TEST SUITE can run the exact same
     * check the boot does. The 2026-08-03 field failure was four build tools
     * carrying their own spawn calls: every wire proof was green because
     * proofs import app.ts, and only the boot entry runs this check — on the
     * user's machine, where it blocked startup three times in a row.
     * Returns null when src/ is not found (packaged build), else the list.
     */
    static scanViolations(): string[] | null {
        // Target specifically the src directory to avoid scanning scripts or
        // other root folders. From the BUNDLE, __dirname/.. is api/ and src
        // sits beside it; from SOURCE (tests, tsx), __dirname/.. IS src —
        // the old resolution looked for src/src, found nothing, and silently
        // skipped the scan in every dev environment. That silence is how
        // four violating tools reached the user's machine.
        const apiDir = path.resolve(__dirname, '..');
        let srcDir = path.join(apiDir, 'src');
        if (!fs.existsSync(srcDir) && path.basename(apiDir) === 'src') srcDir = apiDir;

        if (!fs.existsSync(srcDir)) return null;

        const violations: string[] = [];
        
        const scan = (dir: string) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
                    // Test directories are NOT runtime execution paths — they are
                    // never imported by the running server, only invoked manually
                    // (tsx) or by jest. Proof harnesses legitimately drive real git
                    // via child_process to build fixtures. The Single Execution
                    // Authority governs the RUNTIME; policing test setup here only
                    // blocked startup over files that never run in production.
                    if (entry.name === '__tests__' || entry.name === 'tests' || entry.name === '__mocks__') continue;
                    scan(fullPath);
                } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.js')) {
                    // Skip ExecutionEngine and ExecutionGuard as they are the authorized owners
                    if (entry.name === 'ExecutionEngine.ts' || entry.name === 'ExecutionGuard.ts' || entry.name === 'ExecutionEnforcer.ts' || entry.name === 'ExecutionGateway.ts') continue;
                    
                    const content = fs.readFileSync(fullPath, 'utf8');
                    
                    // Regex to find direct spawn/exec calls or imports from child_process
                    const spawnRegex = /(?<!\.)spawn(Sync)?\(/g;
                    const execRegex = /(?<!\.)exec(Sync|File|FileSync)?\(/g;
                    const ptyRegex = /pty\.spawn\(/g;
                    const importRegex = /from ['"]child_process['"]|require\(['"]child_process['"]\)/g;

                    if (importRegex.test(content)) violations.push(`${fullPath}: Illegal child_process import`);
                    
                    if (spawnRegex.test(content)) {
                        violations.push(`${fullPath}: Illegal spawn/spawnSync() call`);
                    }

                    if (execRegex.test(content)) {
                        // Filter out common false positives like regex.exec or pty.exec if any
                        const lines = content.split('\n');
                        lines.forEach((line, index) => {
                            if (execRegex.test(line) && !line.includes('.exec(') && !line.includes('//') && !line.includes('/*')) {
                                violations.push(`${fullPath}:${index + 1}: Potential illegal exec/execSync call`);
                            }
                        });
                    }
                    
                    if (ptyRegex.test(content)) violations.push(`${fullPath}: Illegal pty.spawn() call`);
                }
            }
        };

        scan(srcDir);
        return violations;
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
