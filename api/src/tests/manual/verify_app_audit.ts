/**
 * WIRE PROOF — the self-QA auditor MEASURES, it does not decorate:
 *
 *   [1] A real build passes through the scaffolder and comes back with the
 *       audit already run — high score, zero findings, verdict in the
 *       message and lastAudit on the project entry.
 *   [2] The dist is then SABOTAGED (a script that throws, a dead image, a
 *       20px button, a bare-# link) and the same auditor catches every
 *       plant BY NAME with a properly lower score.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_app_audit.ts
 */
export {};
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.OFFLINE_MODE = 'true';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function main() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-audit-wire-'));
    process.env.JOE_CHAT_STORE_DIR = path.join(root, 'store');
    fs.mkdirSync(process.env.JOE_CHAT_STORE_DIR, { recursive: true });

    console.log('\n[1] البناء النظيف يخرج ومعه شهادة فحص حقيقية');
    const { ReactProjectTool } = require('../../modules/tools/definitions/ReactProjectTool');
    const res: any = await new ReactProjectTool().execute(
        { request: 'ابنِ موقع react لمقهى الفحص', root, skipImages: true }, { sessionId: 'qa-wire' });
    check('built AND audited in one pass', res.output?.built === true && !!res.output?.audit && !res.output.audit.skipped, JSON.stringify(res.output?.audit));
    /**
     * The built site asks Joe's form inbox on localhost:5002 whether it is
     * there. In a real build it IS — that is the process running the build. In
     * this proof nothing is listening, so the browser logs one refused
     * connection. That is an artefact of the harness, not of the build, and it
     * is named here rather than hidden by loosening the check.
     */
    const HARNESS_ONLY = /api\/public\/forms/;
    const real = res.output.audit.findings.filter((f: any) => !HARNESS_ONLY.test(String(f.detailEn || f.detail)));
    check('the clean build has no findings of its own', real.length === 0, JSON.stringify(real));
    check('…including at phone and tablet width, with its forms filled in',
        !real.some((f: any) => /mobile_|low_contrast|a11y_|form_/.test(f.id)), JSON.stringify(real.map((f: any) => f.id)));
    check('the verdict is IN the delivery message', String(res.output.message).includes('فحص الجودة الذاتي'));
    check('and the audit really walked the app, it did not just look at it',
        (res.output.audit.pressed || 0) >= 2 && (res.output.audit.viewports || []).length >= 3,
        `pressed=${res.output.audit.pressed} viewports=${(res.output.audit.viewports || []).join(',')}`);
    check('lastAudit landed on the project entry', typeof (global as any).joeProjects['qa-wire']?.lastAudit?.score === 'number');

    console.log('\n[2] تخريب مقصود — والفاحص يمسك كل زرع بالاسم');
    const dist = path.join(res.output.path, 'dist');
    const idx = path.join(dist, 'index.html');
    let html = fs.readFileSync(idx, 'utf-8');
    html = html.replace('</body>', `
<img src="./images/does-not-exist.png" alt="dead">
<a href="#">رابط ميت</a>
<button style="width:20px;height:20px;padding:0;min-width:0;min-height:0" class="btn">x</button>
<script>throw new Error('planted-crash');</script>
</body>`);
    fs.writeFileSync(idx, html);
    const { auditBuiltApp } = require('../../core/quality/app-audit');
    const a2 = await auditBuiltApp(dist);
    const ids = a2.findings.map((f: any) => f.id);
    check('the planted crash is caught (page_errors)', ids.includes('page_errors'), ids.join(','));
    check('the dead image is caught (dead_images + failed_requests)', ids.includes('dead_images') && ids.includes('failed_requests'), ids.join(','));
    check('the dead link is caught', ids.includes('dead_links'), ids.join(','));
    check('the 20px button is caught', ids.includes('small_targets'), ids.join(','));
    check('…and the score dropped accordingly', a2.score <= 100 - 15 - 15 - 15 - 8 - 8, `score=${a2.score}`);

    fs.rmSync(root, { recursive: true, force: true });
    delete (global as any).joeProjects?.['qa-wire'];
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
