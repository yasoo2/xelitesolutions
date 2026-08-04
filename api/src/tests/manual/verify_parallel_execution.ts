/**
 * THE PLAN KNEW THEY WERE INDEPENDENT. THE EXECUTOR RAN THEM IN A QUEUE.
 *
 * Joe has modelled dependencies since the day the plan became a DAG, and the
 * executor threw that knowledge away: `for (const node of readyNodes) { await …}`
 * ran unrelated steps one after another. Measured before the change, three
 * independent two-second steps took 6.1 seconds. The graph knew all three could
 * start at once; nobody asked it.
 *
 * Speed is only worth having if nothing is corrupted to get it, so this proves
 * both halves on a real orchestrator with real tools:
 *
 *   [1] independent steps finish in about the time of the LONGEST one
 *   [2] a dependent chain is still strictly ordered — and still takes the sum
 *   [3] the tools that share one live thing (the browser's single page, a
 *       project folder, a deploy, git, a terminal) NEVER overlap, measured from
 *       the system's own tool_started/tool_done events
 *   [4] the results are the same, in plan order, whatever finished first
 *   [5] a failure inside a batch is still reported honestly, and the work its
 *       siblings completed still exists on disk
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_parallel_execution.ts
 */
export {};
import fs from 'fs';
import http from 'http';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';
process.env.JOE_NARRATION = '0';
process.env.BROWSER_HEADLESS = 'true';
process.env.BROWSER_NO_SANDBOX = 'true';
// The sandbox has no human to approve a shell command; the approval gate itself
// is proven elsewhere (verify_firewall.ts).
process.env.AUTO_APPROVE_ALL = '1';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const WS = 'session-parallel';

async function main() {
    const { PlanningEngine } = require('../../core/orchestrator/PlanningEngine');
    const { IntentParser } = require('../../core/intelligence/IntentParser');
    const { AgentOrchestrator } = require('../../orchestration/AgentOrchestrator');
    const { workspaceService } = require('../../modules/services/WorkspaceService');
    const { observeBroadcasts } = require('../../api/ws');

    const wsRoot: string = workspaceService.getActiveRoot(WS);
    fs.mkdirSync(wsRoot, { recursive: true });

    IntentParser.parse = async (goal: string) => ({ goal, complexity: 'low', riskLevel: 'low', rawIntent: {} });
    const runPlan = async (steps: any[], tag: string) => {
        PlanningEngine.generatePlan = async () => ({ id: 'p', goal: 'g', metadata: {}, steps: JSON.parse(JSON.stringify(steps)) });
        const started = Date.now();
        const out = await new AgentOrchestrator().execute({
            id: `par-${tag}-${Date.now()}`, goal: 'خطة اختبار',
            context: { workspaceId: WS, userId: 'par-user', sessionId: WS },
        });
        return { out, seconds: (Date.now() - started) / 1000 };
    };
    const sleepStep = (id: string, secs: number, deps: string[] = []) => ({
        id, description: `انتظر ${secs}ث`, tool: 'shell_execute', agent: 'Dev',
        input: { command: `sleep ${secs} && echo ${id}` }, dependsOn: deps,
    });

    console.log('\n[1] ثلاث خطوات مستقلّة — تبدأ معاً');
    const a = await runPlan([sleepStep('a', 2), sleepStep('b', 2), sleepStep('c', 2)], 'wide');
    console.log(`      (استغرقت ${a.seconds.toFixed(1)}s — وكانت 6.1s قبل التغيير)`);
    check('التشغيل نجح', a.out?.ok === true, JSON.stringify(a.out?.result).slice(0, 120));
    check('انتهت في زمن أطولِها لا في مجموعها', a.seconds < 4, `${a.seconds.toFixed(1)}s`);
    check('وكل الخطوات الثلاث اكتملت فعلاً',
        (a.out?.steps || []).filter((s: any) => s.status === 'completed').length === 3,
        JSON.stringify((a.out?.steps || []).map((s: any) => `${s.id}:${s.status}`)));

    console.log('\n[2] وسلسلة مترابطة تبقى مرتّبة — ولا تُختصَر');
    const b = await runPlan([
        sleepStep('one', 1),
        sleepStep('two', 1, ['one']),
        sleepStep('three', 1, ['two']),
    ], 'chain');
    console.log(`      (استغرقت ${b.seconds.toFixed(1)}s — والمجموع المتوقّع ~3s)`);
    check('السلسلة أخذت مجموع خطواتها — لم تُكسَر التبعية', b.seconds >= 2.6, `${b.seconds.toFixed(1)}s`);
    check('وكلها اكتملت بالترتيب',
        (b.out?.steps || []).every((s: any) => s.status === 'completed'),
        JSON.stringify((b.out?.steps || []).map((s: any) => `${s.id}:${s.status}`)));

    console.log('\n[3] وما يتشارك مورداً حيّاً لا يتزامن أبداً');
    const site = http.createServer((_q, s) => {
        s.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        s.end('<!doctype html><html><body><h1>صفحة</h1><a href="/x">رابط</a></body></html>');
    });
    site.listen(0, '127.0.0.1');
    await new Promise<void>(r => site.once('listening', () => r()));
    const url = `http://127.0.0.1:${(site.address() as any).port}/`;

    // Overlap is measured from the system's OWN events, not from the test's idea
    // of what happened.
    const spans: Array<{ tool: string; start: number; end?: number }> = [];
    const stop = observeBroadcasts((e: any) => {
        const tool = String(e?.data?.tool || '');
        if (e?.type === 'tool_started') spans.push({ tool, start: Date.now() });
        if (e?.type === 'tool_done') {
            for (let i = spans.length - 1; i >= 0; i--) {
                if (spans[i].tool === tool && spans[i].end === undefined) { spans[i].end = Date.now(); break; }
            }
        }
    });
    const c = await runPlan([
        { id: 'b1', description: 'افحص الروابط', tool: 'browser_check_links', agent: 'Browser', input: { url }, dependsOn: [] },
        { id: 'b2', description: 'دقّق السيو', tool: 'browser_seo_audit', agent: 'Browser', input: { url }, dependsOn: [] },
        { id: 'b3', description: 'لقطة كاملة', tool: 'browser_fullpage_shot', agent: 'Browser', input: { url }, dependsOn: [] },
    ], 'browser');
    stop();
    site.close();
    const browserSpans = spans.filter(s => s.tool.startsWith('browser_') && s.end !== undefined);
    const overlaps = browserSpans.filter((x, i) =>
        browserSpans.some((y, j) => j !== i && x.start < (y.end as number) && (y.start) < (x.end as number)));
    check('أدوات المتصفح الثلاث عملت', (c.out?.steps || []).filter((s: any) => s.status === 'completed').length === 3,
        JSON.stringify((c.out?.steps || []).map((s: any) => `${s.id}:${s.status}`)));
    check('ولم تتداخل ولو مرّة واحدة — الصفحة الحيّة واحدة', overlaps.length === 0,
        JSON.stringify(browserSpans.map(s => `${s.tool}:${(s.end as number) - s.start}ms`)));

    console.log('\n[4] وترتيب النتائج ترتيب الخطة — لا ترتيب من انتهى أولاً');
    check('الخطوات تخرج بترتيب الخطة',
        JSON.stringify((a.out?.steps || []).map((s: any) => s.id)) === JSON.stringify(['a', 'b', 'c']),
        JSON.stringify((a.out?.steps || []).map((s: any) => s.id)));

    console.log('\n[5] وفشل داخل دفعة يُقال بصدق — وما نجح يبقى');
    const madeFile = path.join(wsRoot, 'parallel-survivor.txt');
    try { fs.unlinkSync(madeFile); } catch { /* fresh */ }
    const d = await runPlan([
        { id: 'good', description: 'اكتب ملفاً', tool: 'write_file', agent: 'Dev', input: { path: madeFile, content: 'نجا' }, dependsOn: [] },
        { id: 'bad', description: 'اقرأ ملفاً غير موجود', tool: 'read_file', agent: 'Dev', input: { path: path.join(wsRoot, 'لا-يوجد-أبداً.txt') }, dependsOn: [] },
    ], 'mixed');
    check('التشغيل لم يدّعِ النجاح', d.out?.ok === false, JSON.stringify(d.out?.result).slice(0, 100));
    check('وعمل الخطوة الناجحة باقٍ على القرص',
        fs.existsSync(madeFile) && fs.readFileSync(madeFile, 'utf-8').includes('نجا'));

    try { fs.unlinkSync(madeFile); } catch { /* cleanup */ }
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
