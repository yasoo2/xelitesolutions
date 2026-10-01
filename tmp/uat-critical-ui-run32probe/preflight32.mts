// UI-001 run30 preflight: one short generation through the REAL router (Auto mesh,
// same free policy Joe uses for planning). Decides SEND vs BLOCKED before an
// expensive real-UI run. Bounded: single prompt, 150s abort, no secrets.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { routeToModel } from '../../api/src/core/llm/intelligent-router';

const DIR = path.dirname(fileURLToPath(import.meta.url));
async function main() {
    const started = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 150_000);
    const context: any = { signal: ctrl.signal, preflight: true };
    const out: any = { startedUtc: new Date().toISOString(), ok: false };
    try {
        const text = await routeToModel(
            [{ role: 'user', content: 'Reply with exactly this single word: READY. Nothing else.' }],
            undefined, undefined, undefined, undefined, undefined, undefined, context,
        );
        out.ok = true;
        out.replyHead = String(text || '').slice(0, 200);
    } catch (e: any) {
        out.ok = false;
        out.error = String(e?.message || e).slice(0, 500);
    } finally { clearTimeout(timer); }
    out.elapsedMs = Date.now() - started;
    out.providerAttempts = context.providerAttempts || null;
    fs.writeFileSync(path.join(DIR, 'preflight.json'), JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2));
    process.exit(out.ok ? 0 : 2);
}
main().catch((e) => { console.error('PREFLIGHT_CRASH', e); process.exit(1); });
