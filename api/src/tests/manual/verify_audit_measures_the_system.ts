/**
 * «⛔ Delivered, but it does NOT work properly — 2 blocking finding(s) remain»
 *
 * Both of them were ONE request:
 *
 *     • 3 خطأ كونسول: 404 ← http://127.0.0.1:57701/api/health
 *     • 1 ملف لم يصل: 404 http://127.0.0.1:57701/api/health
 *
 * Nothing was broken. The generated app asks its own origin exactly one
 * question at startup — «do you serve my API?» — and the audit was serving a
 * FOLDER on a throwaway port, which cannot answer it. The same build had, two
 * steps earlier, packaged that interface INSIDE its API server, where the
 * question answers itself and the catalogue comes from the real database. The
 * audit simply never went there, so a working full-stack system was handed over
 * branded broken, at 67/100.
 *
 * This runs the real thing — api_project then react_project in one session —
 * and reads what the audit actually measured:
 *
 *   [1] the build is audited on the RUNNING server, not on a folder
 *   [2] /api/health answers there, so it is not a finding
 *   [3] the delivery message no longer declares a false blocker
 *   [4] and the packaged copy is the REPAIRED build, not the one before it
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_audit_measures_the_system.ts
 */
export {};
import fs from 'fs';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.ENABLE_AUTH_BYPASS = 'true';
process.env.AUTO_APPROVE_ALL = '1';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function main() {
    const { executeTool } = await import('../../modules/services/ToolService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');
    const sessionId = `system-audit-${Date.now()}`;
    const ctx = { sessionId, userId: 'u1', workspaceId: `session-${sessionId}`, language: 'en' };

    console.log('\n[1] خادم حقيقي أولاً — كما في بنائه بالضبط');
    const api: any = await executionFirewall.runInContext(undefined, () =>
        executeTool('api_project', { request: 'Build a real backend for an online store' }, ctx));
    check('الخادم بُني', api?.ok === true, String(api?.error || '').slice(0, 140));
    // `output.dir` is a display name; the session's memory carries real paths.
    const apiDir = String((global as any).joeProjects?.[sessionId]?.dir || '');
    console.log(`   ℹ️ ${apiDir}`);

    console.log('\n[2] ثم الواجهة — تُحزم داخله وتُفحص وهي تعمل');
    const web: any = await executionFirewall.runInContext(undefined, () =>
        executeTool('react_project', { request: 'Build a simple online store for coffee' }, ctx));
    check('الواجهة بُنيت', web?.ok === true, String(web?.error || '').slice(0, 140));

    const logs: string[] = (web?.logs || []) as string[];
    const message = String(web?.output?.message || '');
    const audit = web?.output?.audit;

    const measuring = logs.find(l => /measuring the RUNNING system at/.test(l)) || '';
    console.log(`   ℹ️ ${measuring || 'لم يُقس على النظام الحيّ'}`);
    check('حُزمت الواجهة داخل الخادم', logs.some(l => /packaged: the built interface/.test(l)),
        logs.filter(l => /packag/i.test(l)).join(' | ').slice(0, 160));
    check('والفحص جرى على الخادم العامل لا على مجلد', /http:\/\/127\.0\.0\.1:46\d\d\//.test(measuring), measuring);
    check('وأُوقف بعد القياس', logs.some(l => /stopped the server that was started for the measurement/.test(l)));

    console.log('\n[3] و/api/health يُجاب هناك — فلا يُحسب عيباً');
    const findings = ((audit?.findings || []) as any[]).map(f => String(f.detail || ''));
    console.log(`   ℹ️ ${audit?.score}/100 — ${findings.length ? findings.join(' | ').slice(0, 200) : 'نظيف'}`);
    check('لا ملاحظة عن /api/health', !findings.some(d => /api\/health/.test(d)), findings.join(' | ').slice(0, 200));
    check('ولا في الرسالة المُسلَّمة', !/api\/health/.test(message),
        (message.split('\n').find(l => /api\/health/.test(l)) || '').slice(0, 140));

    console.log('\n[4] والعنوان لا يعلن عطلاً غير موجود');
    const blockers = ((audit?.findings || []) as any[]).filter(f => f.severity === 'high');
    console.log(`   ℹ️ أعطال جوهرية: ${blockers.length ? blockers.map(f => f.id).join(', ') : 'لا شيء'}`);
    check('لا عطل جوهري سببه فحص المجلد', !blockers.some(f => /api\/health/.test(String(f.detail))),
        blockers.map(f => f.detail).join(' | ').slice(0, 160));

    console.log('\n[5] والنسخة المحزومة هي البناء بعد الإصلاح لا قبله');
    const entry: any = (global as any).joeProjects?.[sessionId] || {};
    const reactDir = String(entry.dir || '');
    const linkedApi = String(entry.linkedApiDir || apiDir || '');
    if (linkedApi && fs.existsSync(linkedApi)) {
        const apiDir2 = linkedApi;
        const distIdx = path.join(reactDir, 'dist', 'index.html');
        const pubIdx = path.join(apiDir2, 'public', 'index.html');
        check('public/index.html موجود', fs.existsSync(pubIdx), pubIdx);
        if (fs.existsSync(pubIdx) && fs.existsSync(distIdx)) {
            check('ومطابق لآخر بناء بالحرف',
                fs.readFileSync(pubIdx, 'utf-8') === fs.readFileSync(distIdx, 'utf-8'));
            // The repair edits CSS/JSX, so the hashed asset names change; the
            // packaged copy must carry the new ones, not the pre-repair ones.
            const assets = fs.readdirSync(path.join(apiDir2, 'public', 'assets')).sort().join(',');
            const distAssets = fs.readdirSync(path.join(path.dirname(distIdx), 'assets')).sort().join(',');
            check('وأصوله نفس أصول البناء الأخير', assets === distAssets, `${assets.slice(0, 80)} ≠ ${distAssets.slice(0, 80)}`);
        }
    } else check('مجلد الخادم معروف', false, linkedApi || 'لا مجلد');

    console.log('\n--- رأس الرسالة كما ستصل إليه ---');
    console.log(message.split('\n').slice(0, 10).join('\n'));

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
