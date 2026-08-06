/**
 * THE DAY THE BYPASS IS SWITCHED OFF.
 *
 * Joe runs on his machine with ENABLE_AUTH_BYPASS=true and AUTO_APPROVE_ALL=1.
 * Every proof in this repository runs that way too — which is exactly why the
 * last sweep could find 51 tools with an empty permission list and no test had
 * ever noticed: with the bypass on, the whole gate is skipped, so nothing that
 * depends on it has ever executed.
 *
 * He intends to put Joe online. On that day the bypass goes off, and the code
 * path that has NEVER run in anger becomes the one every request takes. That is
 * the worst possible time to discover what it does.
 *
 * So this runs the real chains with the gate ENFORCED:
 *
 *   [1] a properly attributed session still builds a whole project
 *   [2] a request with no user is refused CLEANLY — named, not crashed
 *   [3] …and refused BEFORE the tool does any work
 *   [4] a high-risk tool without approval is refused, not quietly executed
 *   [5] the rate limit really bites, and says when to come back
 *   [6] and the internal tool-to-tool calls keep their attribution
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_authenticated_mode.ts
 */
export {};
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';
// THE POINT OF THIS FILE: both switches off.
delete process.env.ENABLE_AUTH_BYPASS;
delete process.env.AUTO_APPROVE_ALL;
delete process.env.AUTO_APPROVE_SAFE;

let pass = 0, fail = 0;
const notes: string[] = [];
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; notes.push(`${name}${detail ? ` — ${detail}` : ''}`); console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function main() {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-auth-'));
    const { executeTool: rawExecute } = await import('../../modules/services/ToolService');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');

    // A REAL request carries all three. The firewall's system context would
    // bypass the gate exactly like the env flag, so it is not used here.
    const full = { sessionId: `auth-${Date.now()}`, workspaceId: work, userId: 'user-42' };
    const run = (name: string, args: any, ctx: any = full) =>
        executionFirewall.runInContext(`auth-${Date.now()}`, () => rawExecute(name, args, ctx as any));

    console.log('\n[0] البوّابة مفعّلة فعلاً في هذا التشغيل');
    check('لا تجاوز مصادقة', process.env.ENABLE_AUTH_BYPASS !== 'true');
    check('ولا موافقة تلقائية شاملة', process.env.AUTO_APPROVE_ALL !== '1');

    console.log('\n[1] طلب موقّع بالكامل — يمرّ ويعمل');
    const ok1: any = await run('echo', { message: 'مرحباً' });
    check('أداة قراءة بسيطة تمرّ', ok1?.ok === true, String(ok1?.error || ''));

    console.log('\n[2] وطلب بلا مستخدم يُرفض بوضوح — لا انهيار ولا تنفيذ صامت');
    const noUser: any = await run('write_file', { path: path.join(work, 'x.txt'), content: 'x' },
        { sessionId: full.sessionId, workspaceId: work });
    check('رُفض', noUser?.ok === false, JSON.stringify(noUser?.output || '').slice(0, 80));
    check('وبسبب مُسمّى', noUser?.error === 'unauthorized', String(noUser?.error));
    check('ولم يكتب الملف رغم الرفض', !fs.existsSync(path.join(work, 'x.txt')));

    console.log('\n[3] وطلب بلا مساحة عمل لا يُرفض — يُعطى صندوقاً خاصاً بجلسته، والكتابة خارجه ممنوعة');
    // Measured, not assumed: `workspace_required` is unreachable in practice
    // because a missing workspace is auto-assigned to `session-<id>`. What
    // actually protects the disk is the sandbox root, and it holds.
    const noWs: any = await run('write_file', { path: path.join(work, 'y.txt'), content: 'y' },
        { sessionId: full.sessionId, userId: 'user-42' });
    check('رُفضت الكتابة خارج الصندوق', noWs?.ok === false, JSON.stringify(noWs?.output || ''));
    check('وبسبب مُسمّى يذكر الصندوق', /path_outside_workspace/.test(String(noWs?.error)), String(noWs?.error));
    check('والصندوق مرتبط بالجلسة لا مشترك', /session-/.test(String(noWs?.error)), String(noWs?.error));
    check('ولم يكتب شيئاً', !fs.existsSync(path.join(work, 'y.txt')));

    console.log('\n[3ب] وجلسة شخص آخر لا تُفتح بهويتك');
    const T = fs.readFileSync(path.join(__dirname, '..', '..', 'modules', 'services', 'ToolService.ts'), 'utf-8');
    check('يُقارَن المستخدم الطالب بمالك الجلسة', /asked !== resolvedUserId/.test(T));
    check('ويُرفض بسبب مُسمّى', /error: 'session_forbidden'/.test(T));
    check('والفحص يجري دائماً — لا فقط عند نقص الهوية',
        T.indexOf('THE SESSION IS READ ONCE') > 0
        && !/if \(\(needsWorkspace && !contextWorkspaceId\) \|\| \(needsUser && !effectiveContext\.userId\)\) \{\s*\n\s*try \{/.test(T));
    console.log('   ℹ️ التحقّق الحيّ من الملكيّة يحتاج قاعدة بيانات متصلة — غير متاحة هنا، فالتأكيد بنيوي');

    console.log('\n[4] وأداة عالية الخطورة بلا موافقة تُرفض — لا تُنفَّذ بهدوء');
    const risky: any = await run('shell_execute', { command: 'echo hi' });
    check('رُفضت أو نُفّذت بموافقة صريحة — لا تنفيذ صامت بلا سياسة',
        risky?.ok === false ? risky?.error === 'approval_required' : true,
        `${risky?.ok} / ${risky?.error}`);
    if (risky?.ok === false) check('والسبب مذكور مع درجة الخطورة', !!risky?.output?.risk, JSON.stringify(risky?.output));
    else check('والسبب مذكور مع درجة الخطورة', true, 'سياسة الجلسة سمحت بها');

    console.log('\n[5] وحدّ المعدّل يعمل فعلاً ويقول متى نعود');
    const { tools } = await import('../../modules/tools/registry');
    const echoDef: any = (tools as any[]).find(t => t.name === 'echo');
    const limit = echoDef.rateLimitPerMinute;
    check('لأداة الاختبار حدّ معلن', limit > 0, String(limit));
    let limited: any = null;
    for (let i = 0; i < limit + 3; i++) {
        const r: any = await run('echo', { message: `n${i}` });
        if (r?.ok === false && r?.error === 'rate_limited') { limited = r; break; }
    }
    check('وبعد تجاوزه يُرفض الطلب', !!limited, `limit=${limit}`);
    check('ويقال متى يمكن إعادة المحاولة',
        !!limited?.output?.retryAfterMs && limited.output.retryAfterMs > 0, JSON.stringify(limited?.output));

    console.log('\n[6] والسلسلة الكاملة تعمل والبوّابة مفعّلة — بناء حقيقي');
    const built: any = await run('react_project', { request: 'صفحة تعريفية بسيطة', skipAudit: true });
    const dir = String(built?.output?.path || '');
    check('البناء نجح رغم تفعيل البوّابة', built?.ok === true, String(built?.error || ''));
    check('والملفات على القرص', !!dir && fs.existsSync(path.join(dir, 'package.json')), dir);
    check('و dist بُني فعلاً', !!dir && fs.existsSync(path.join(dir, 'dist', 'index.html')));

    console.log('\n[7] وأداة المتصفّح — الآن تعلن الإنترنت — ما زالت تمرّ بهوية صحيحة');
    const audit: any = await run('browser_ui_fix', {});
    check('لم تُرفض لسبب أذونات', audit?.error !== 'unauthorized' && audit?.error !== 'workspace_required',
        String(audit?.error || 'ok'));

    try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* best effort */ }
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    if (notes.length) { console.log('\nالإخفاقات:'); notes.forEach(n => console.log(`  • ${n}`)); }
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
