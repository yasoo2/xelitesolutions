/**
 * REGISTRY AUDIT — are the 149 tools REAL, or is the number the product?
 *
 * Startup announces «[ToolRegistry] Registered 149 tools (71 revived)». A
 * count is not a capability: a tool that registers a name, advertises a
 * schema, and then throws or answers nothing is worse than an absent one —
 * the planner can pick it, and the run dies on a promise the catalogue made.
 *
 * So every registered tool is examined, and the ones that are safe to run
 * are actually RUN with empty input. Nothing here is asserted from a name:
 *   - it must be an object with a name, a description and an inputSchema
 *   - it must expose a callable execute()
 *   - required schema fields must exist in properties (a schema that demands
 *     a field it never declares can never be satisfied)
 *   - and a READ-ONLY tool, given nothing, must ANSWER — ok:false with a
 *     reason is a fine answer; an unhandled throw is not.
 *
 * Tools that write, execute, deploy or reach the network are catalogued but
 * never invoked: this audit must not touch the machine it audits.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_tool_registry_audit.ts
 */
export {};

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.OFFLINE_MODE = 'true';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function main() {
    const { tools } = require('../../modules/tools/registry');

    console.log('\n[1] الشكل: كل أداة مسجّلة تعلن اسماً ووصفاً ومخططاً وتنفيذاً');
    const shapeless = tools.filter((t: any) => !t || typeof t.name !== 'string' || !t.name.trim());
    const undescribed = tools.filter((t: any) => typeof t?.description !== 'string' || t.description.trim().length < 10);
    const unschemad = tools.filter((t: any) => !t?.inputSchema || typeof t.inputSchema !== 'object');
    const unexecutable = tools.filter((t: any) => typeof t?.execute !== 'function');
    check(`${tools.length} أداة مسجّلة — كلها بأسماء حقيقية`, shapeless.length === 0, shapeless.map((t: any) => JSON.stringify(t).slice(0, 40)).join(','));
    check('كل أداة تحمل وصفاً يفهمه المخطِّط', undescribed.length === 0, undescribed.map((t: any) => t.name).join(','));
    check('كل أداة تعلن مخطط إدخال', unschemad.length === 0, unschemad.map((t: any) => t.name).join(','));
    check('كل أداة تملك execute قابلاً للاستدعاء — لا اسم بلا جسد', unexecutable.length === 0, unexecutable.map((t: any) => t.name).join(','));

    console.log('\n[2] الأسماء فريدة، والمخططات مُشبَعة');
    const names = tools.map((t: any) => t.name);
    const dupes = names.filter((n: string, i: number) => names.indexOf(n) !== i);
    check('لا اسم مكرر', dupes.length === 0, dupes.join(','));
    const impossible = tools.filter((t: any) => {
        const req: string[] = Array.isArray(t?.inputSchema?.required) ? t.inputSchema.required : [];
        const props = t?.inputSchema?.properties || {};
        return req.some((r: string) => !(r in props));
    });
    check('لا مخطط يطلب حقلاً لا يعلنه (شرط مستحيل)', impossible.length === 0,
        impossible.map((t: any) => `${t.name}[${(t.inputSchema.required || []).filter((r: string) => !(r in (t.inputSchema.properties || {}))).join(',')}]`).join(' | '));

    console.log('\n[3] الأدوات القارئة تُستدعى فعلاً — والجواب الأمين مقبول، والانهيار لا');
    // Anything that writes, runs, deploys, installs or leaves the machine is
    // catalogued but NEVER invoked: an audit must not change what it audits.
    const UNSAFE = /(write|create|delete|remove|deploy|publish|push|commit|install|npm|exec|run|terminal|shell|browser|http|fetch|url|api_test|rss|search_api|clone|import|edit|generate|build|scaffold|project_pipeline|ask_user|screenshot|kill|move|rename|archive|extract|upload|mail|send)/i;
    const readOnly = tools.filter((t: any) => !UNSAFE.test(t.name)
        && !(t.permissions || []).some((p: string) => p === 'write' || p === 'execute'));
    console.log(`      (${readOnly.length} أداة قراءة من ${tools.length} — الباقي مكتوب/منفّذ ولا يُستدعى في تدقيق)`);
    const crashed: string[] = [];
    const answered: string[] = [];
    for (const t of readOnly) {
        try {
            const res: any = await Promise.race([
                t.execute({}, { sessionId: 'registry-audit' }),
                new Promise((_r, rej) => setTimeout(() => rej(new Error('TIMEOUT')), 8000)),
            ]);
            if (res && typeof res === 'object' && ('ok' in res || 'output' in res || 'error' in res)) answered.push(t.name);
            else crashed.push(`${t.name}: returned ${JSON.stringify(res).slice(0, 40)}`);
        } catch (e: any) {
            crashed.push(`${t.name}: threw ${String(e?.message || e).slice(0, 60)}`);
        }
    }
    check(`كل أداة قراءة أجابت بشكل نتيجة صحيح (${answered.length}/${readOnly.length})`, crashed.length === 0, crashed.join(' | '));

    console.log('\n[4] الأدوات المُحيَاة ليست أشباحاً');
    const REVIVED = ['analyze_project', 'analyze_codebase', 'project_detect', 'codebase_outline',
        'dead_code_detector', 'api_tester', 'http_fetch', 'html_extract', 'json_query'];
    const missing = REVIVED.filter(n => !names.includes(n));
    check('الأدوات المُحيَاة المعلنة موجودة فعلاً في السجل', missing.length === 0, missing.join(','));
    const revivedReal = REVIVED.filter(n => names.includes(n))
        .map(n => tools.find((t: any) => t.name === n))
        .filter((t: any) => typeof t.execute === 'function' && t.execute.length >= 1);
    check('…وكل واحدة منها تملك execute حقيقياً يستقبل إدخالاً', revivedReal.length === REVIVED.length - missing.length,
        `${revivedReal.length}/${REVIVED.length - missing.length}`);

    console.log('\n[5] ما يُستدعى فعلاً هو ما هو مسجّل — لا أسماء تمرّ من الباب الخلفي');
    // executeTool is the ONE door every caller uses. An unknown name must be
    // refused with a sentence, not with a stack trace — and the two memory
    // tools must now work through their OWN execute, not a special case.
    const { executeTool } = require('../../modules/services/ToolService');
    // The EXECUTION FIREWALL refuses tool calls that did not come through the
    // orchestrator — a real protection, and this audit respects it by running
    // inside the same trusted context the orchestrator uses.
    const { executionFirewall } = require('../../orchestration/AgentExecutionFirewall');
    const asSystem = <T>(fn: () => T): T => executionFirewall.runAsSystem(fn);
    check('جدار التنفيذ يرفض استدعاء أداة خارج المنسّق', await (async () => {
        try { await executeTool('read_file', { path: 'package.json' }, { sessionId: 'registry-audit' }); return false; }
        catch (e: any) { return /bypass/i.test(String(e?.message || '')); }
    })());
    const unknown: any = await asSystem(() => executeTool('a_tool_that_never_existed', {}, { sessionId: 'registry-audit' }));
    check('اسم غير مسجّل يُرفض بجملة واضحة لا بانهيار',
        unknown && unknown.ok === false && /not found|unknown|غير/i.test(String(unknown.error || unknown.output || '')),
        JSON.stringify(unknown).slice(0, 120));
    const recalled: any = await asSystem(() => executeTool('recall_memory', { query: 'anything' }, { sessionId: 'registry-audit' }));
    check('recall_memory يعمل عبر بابه الطبيعي — بعد أن كان بلا جسد',
        !!recalled && typeof recalled === 'object' && ('ok' in recalled), JSON.stringify(recalled).slice(0, 120));
    const needsQuery: any = await tools.find((t: any) => t.name === 'recall_memory').execute({}, { sessionId: 'registry-audit' });
    check('…وبلا استعلام يجيب بجملة صادقة بدلاً من الانهيار',
        needsQuery?.ok === false && /needs a query/.test(String(needsQuery.output || '')), JSON.stringify(needsQuery).slice(0, 120));

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
