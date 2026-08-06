/**
 * NINE RESTARTS AND FIFTY WASTED STEPS.
 *
 * Two things in his terminal that nobody could act on:
 *
 *     [!] Joe stopped (exit code: -1). Restarting in 3 seconds...
 *     [3/3] Starting Joe (attempt #9)
 *
 * Eight deaths, not one line saying why — because nothing in the process
 * listened for the two events that kill a Node server, and the reason went
 * wherever the wrapper's stderr went.
 *
 *     Node init failed: … Error: `no_url`
 *     [PlanningEngine] Generating REAL-TIME DAG for: Fix and continue: …
 *     Step Iteration. Completed: 0/21
 *     Node read_config failed: File not found
 *     [PlanningEngine] Generating REAL-TIME DAG for: Fix and continue: …
 *     Step Iteration. Completed: 2/27
 *     Node read_config_file failed: File not found
 *     Max retries reached
 *
 * Fifty steps hunting a configuration file that was never there, invented by a
 * planner from the words «missing URL», then invented again from the identical
 * error text.
 *
 * This measures both, for real:
 *
 *   [1] a REAL node process with an unhandled rejection stays alive, and the
 *       reason is on disk
 *   [2] a REAL node process with an uncaught exception dies — deliberately —
 *       and leaves its stack behind
 *   [3] a deliberate SIGTERM is not recorded as a crash
 *   [4] the crash note is bounded, so a restart loop cannot fill the disk
 *   [5] the same failure twice is refused instead of re-planned
 *   [6] and a repair plan for one step is capped
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_crash_and_repair_loop.ts
 */
export {};
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const SOURCE = path.resolve(__dirname, '..', '..', 'shared', 'crash-log.ts');
/** The recorder as PLAIN JS, so the children are plain `node` — exactly what
 *  start-joe.ps1 launches, not a TypeScript runner that is not there in the
 *  field. Bundled once with the same esbuild that builds Joe. */
let RECORDER = '';
function buildRecorder(dir: string) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const esbuild = require('esbuild');
    RECORDER = path.join(dir, 'crash-log.cjs');
    esbuild.buildSync({ entryPoints: [SOURCE], bundle: true, platform: 'node', format: 'cjs', outfile: RECORDER });
}

/** Run a real node process with the recorder installed, in its own cwd. */
function runChild(body: string, cwd: string): Promise<{ code: number | null; out: string; ms: number }> {
    const file = path.join(cwd, 'child.js');
    fs.writeFileSync(file, `
const { installCrashRecorder, noteActivity } = require(${JSON.stringify(RECORDER)});
installCrashRecorder();
noteActivity('اختبار حيّ');
${body}
`, 'utf-8');
    const started = Date.now();
    return new Promise(resolve => {
        const p = spawn(process.execPath, [file], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '';
        p.stdout.on('data', d => { out += String(d); });
        p.stderr.on('data', d => { out += String(d); });
        p.on('close', code => resolve({ code, out, ms: Date.now() - started }));
        setTimeout(() => { try { p.kill('SIGKILL'); } catch { /* gone */ } }, 25_000).unref();
    });
}

async function main() {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-crash-'));
    fs.mkdirSync(path.join(work, 'api'), { recursive: true });
    const cwd = path.join(work, 'api');
    const log = path.join(cwd, 'data', 'crash.log');
    buildRecorder(work);

    console.log('\n[1] وعدٌ مرفوض لا يقتل الخادم بعد اليوم — ويُكتب سببه');
    const rejected = await runChild(`
Promise.reject(new Error('تعثّرت أداة ونسيت catch'));
setTimeout(() => { console.log('ALIVE_AFTER_REJECTION'); process.exit(0); }, 1200);
`, cwd);
    check('العملية بقيت حيّة بعد الوعد المرفوض', /ALIVE_AFTER_REJECTION/.test(rejected.out), `code=${rejected.code}`);
    check('وخرجت خروجاً نظيفاً', rejected.code === 0, String(rejected.code));
    check('وكُتب السبب في data/crash.log', fs.existsSync(log) && /تعثّرت أداة ونسيت catch/.test(fs.readFileSync(log, 'utf-8')));
    check('ومعه ما كان جو يفعله', /آخر ما كان يفعله جو: اختبار حيّ/.test(fs.readFileSync(log, 'utf-8')));

    console.log('\n[2] وخطأٌ غير مُلتقط يوقفه عمداً — مع أثره كاملاً');
    fs.rmSync(log, { force: true });
    const threw = await runChild(`
setTimeout(() => { throw new Error('حالة لا يُوثق بها بعدها'); }, 100);
setTimeout(() => { console.log('SHOULD_NOT_REACH'); }, 5000);
`, cwd);
    check('العملية توقّفت', threw.code === 1, String(threw.code));
    check('ولم تُكمل كأن شيئاً لم يكن', !/SHOULD_NOT_REACH/.test(threw.out));
    const note = fs.existsSync(log) ? fs.readFileSync(log, 'utf-8') : '';
    check('والسبب مكتوب', /حالة لا يُوثق بها بعدها/.test(note));
    check('ومعه الأثر لا الرسالة وحدها', /at .+/.test(note), note.split('\n').slice(0, 8).join(' | ').slice(0, 120));
    check('ومعه الوقت وإصدار node', /pid=\d+ +node=v/.test(note));

    console.log('\n[3] والإيقاف المقصود ليس انهياراً');
    fs.rmSync(log, { force: true });
    const file = path.join(cwd, 'sig.js');
    fs.writeFileSync(file, `
const { installCrashRecorder } = require(${JSON.stringify(RECORDER)});
installCrashRecorder();
console.log('READY');
setInterval(() => { }, 1000);
`, 'utf-8');
    const child = spawn(process.execPath, [file], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let closed: number | null | undefined;
    child.on('close', c => { closed = c; });
    let sigOut = '';
    child.stdout.on('data', d => { sigOut += String(d); });
    child.stderr.on('data', d => { sigOut += String(d); });
    await new Promise(r => setTimeout(r, 3000));
    child.kill('SIGTERM');
    const sigCode = closed !== undefined ? closed
        : await new Promise<number | null>(r => {
            child.on('close', c => r(c));
            setTimeout(() => r(closed === undefined ? -999 : closed), 8000).unref();
        });
    check('خرج بصفر عند SIGTERM', sigCode === 0, String(sigCode));
    check('وقال إنه إيقاف مقصود', /إيقاف مقصود/.test(sigOut), sigOut.slice(-120));
    check('ولم يُسجَّل انهيار', !fs.existsSync(log) || !/UNCAUGHT|UNHANDLED/.test(fs.readFileSync(log, 'utf-8')));

    console.log('\n[4] وسجلّ الانهيار محدود — حلقة إعادة تشغيل لا تملأ القرص');
    const { writeCrashNote, crashLogPath } = await import('../../shared/crash-log');
    const prevCwd = process.cwd();
    process.chdir(cwd);
    for (let i = 0; i < 600; i++) writeCrashNote('LOOP', new Error(`تكرار ${i} ${'x'.repeat(400)}`));
    const size = fs.statSync(crashLogPath()).size;
    process.chdir(prevCwd);
    check('حجم السجلّ بقي محدوداً', size < 400 * 1024, `${Math.round(size / 1024)}KB`);
    check('وآخر انهيار ما زال فيه', /تكرار 599/.test(fs.readFileSync(path.join(cwd, 'data', 'crash.log'), 'utf-8')));

    console.log('\n[5] ونفس العطل مرتين لا يُخطَّط له مرتين');
    const { AgentOrchestrator } = await import('../../orchestration/AgentOrchestrator');
    const orch: any = new (AgentOrchestrator as any)();
    const node = { id: 'read_config', task: 'Read the configuration file', agent: 'Dev', status: 'failed' };
    const memory: any = { sessionId: 'crash-proof', getHistory: () => [] };
    const first = await orch.attemptRecovery(node, new Error('File not found'), memory, { nodes: [] }, undefined);
    const second = await orch.attemptRecovery(node, new Error('File not found'), memory, { nodes: [] }, undefined);
    check('المحاولة الأولى مسموحة', first !== undefined);
    check('والثانية مرفوضة — لا خطّة جديدة لنفس النصّ', second.recovered === false && second.newNodes.length === 0,
        JSON.stringify({ recovered: second.recovered, n: second.newNodes.length }));

    console.log('\n[6] وخطة إصلاح لخطوة واحدة لا تعود بعشرين خطوة');
    const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'orchestration', 'AgentOrchestrator.ts'), 'utf-8');
    check('هناك سقف معلن لعدد خطوات الإصلاح', /const MAX_REPAIR_NODES = \d+;/.test(src),
        (src.match(/const MAX_REPAIR_NODES = \d+;/) || [''])[0]);
    check('ويُطبَّق على الخطة العائدة', /planned\.slice\(0, MAX_REPAIR_NODES\)/.test(src));
    check('ويُقال للمستخدم ما أُسقط', /أبقيتُ أول \$\{kept\.length\}/.test(src));

    console.log('\n[7] والمشغّل يعرض السبب بدل أن يبتلعه');
    const ps = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', '..', 'start-joe.ps1'), 'utf-8');
    check('start-joe يقرأ crash.log عند كل توقّف', /Get-Content \$crashLog -Tail/.test(ps));
    check('ولا يعرض سجلّاً قديماً كأنه سبب اليوم', /\$stamp -ge \$startedAt/.test(ps));

    try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* best effort */ }
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
