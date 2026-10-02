// WIRING-153b: pin allowlist-vs-registration for visual names (Muse independent).
// Live-grounded, ZERO DISPATCH: imports registry + verification-ledger only,
// calls pure isVerificationTool + registry membership. No executeTool,
// no browser, no network. Deterministic stdout JSON; timings to stderr.
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const t0 = Date.now();
const reg = await import('../../api/src/modules/tools/registry.ts');
const led = await import('../../api/src/core/quality/verification-ledger.ts');
console.error(`importMs=${Date.now() - t0}`);

const tools: any[] = Array.isArray(reg.tools) ? reg.tools : [];
const names = new Set(tools.map((t: any) => t?.name).filter((n: any) => typeof n === 'string'));
const focus = ['visual_qa', 'visual_compare', 'browser_page_fix', 'screenshot', 'browser_run'];
const out: Record<string, any> = { registeredCount: names.size };
for (const n of focus) {
    let v: unknown;
    try { v = led.isVerificationTool(n, {}); } catch (e: any) { v = { error: String(e?.message || e) }; }
    out[n] = { registered: names.has(n), verificationUnconditional: v };
}
console.log(JSON.stringify(out, null, 1));
void path; void fileURLToPath;
