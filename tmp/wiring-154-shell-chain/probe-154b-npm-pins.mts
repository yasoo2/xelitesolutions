// WIRING-154b: npm gate-shape pins + npm_* name-resolution pins (Muse independent).
// ZERO DISPATCH: pure isVerificationTool/resolvePlannedTool/TOOL_ALIASES reads only.
import { isVerificationTool } from '../../api/src/core/quality/verification-ledger.ts';
import { resolvePlannedTool } from '../../api/src/core/orchestrator/plan-tools.ts';
import { TOOL_ALIASES } from '../../api/src/modules/services/ToolService.ts';

const gate: Record<string, unknown> = {};
const shapes: Array<[string, any]> = [
    ['npm-test-plain', { command: 'npm test', cwd: 'taglines' }],
    ['npm-run-test', { command: 'npm run test', cwd: 'taglines' }],
    ['npm-test-watch-flag', { command: 'npm test -- --watchAll=false', cwd: 'taglines' }],
    ['npx-jest', { command: 'npx jest', cwd: 'taglines' }],
];
for (const [label, args] of shapes) {
    try { gate[label] = isVerificationTool('shell_execute', args); }
    catch (e: any) { gate[label] = { error: String(e?.message || e) }; }
}
const names = ['npm_run', 'npm_test', 'npm_build', 'npm_install', 'run_command', 'bash', 'shell'];
const alias: Record<string, unknown> = {};
for (const n of names) alias[n] = (n in TOOL_ALIASES) ? TOOL_ALIASES[n] : null;
const resolve: Record<string, unknown> = {};
for (const n of names) {
    try { resolve[n] = resolvePlannedTool(n); }
    catch (e: any) { resolve[n] = { error: String(e?.message || e) }; }
}
console.log(JSON.stringify({ gate, alias, resolve }, null, 1));
