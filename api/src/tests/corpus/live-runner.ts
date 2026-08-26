/**
 * EVERY PROMPT, THROUGH THE RUNNING SERVER, WRITTEN DOWN AS IT HAPPENS.
 *
 * The reading corpus measures what Joe UNDERSTANDS. This measures what he
 * BUILDS: the same POST the browser sends, the same pipeline, the same npm
 * build and browser audit, and the reply he would actually read on screen.
 *
 * Three things this does that the first version did not, each because of a
 * measured failure:
 *
 *   1. WRITES EACH RESULT THE MOMENT IT LANDS. The first run buffered its
 *      output and forty minutes of real builds were invisible while they ran.
 *      A measurement nobody can see while it runs cannot be steered.
 *   2. RUNS SEVERAL AT ONCE. One round is ~3.3 minutes measured, so a thousand
 *      serially is ~55 hours. Concurrency is the only honest way to finish;
 *      the level is a flag so the number is always stated, never assumed.
 *   3. RESUMES. It skips prompts already in the results file, so a stop costs
 *      nothing and the file is the single record.
 *
 * Nothing is trimmed to go faster. No skipInstall, no skipped audit — the
 * moment the run is cheapened it stops answering the question it was asked.
 *
 *     LIVE_N=1000 LIVE_CONC=3 npx ts-node --transpile-only src/tests/corpus/live-runner.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { THOUSAND, type Prompt } from './thousand-prompts';

const BASE = process.env.LIVE_BASE || 'http://127.0.0.1:5002';
const N = Number(process.env.LIVE_N || 1000);
const CONC = Math.max(1, Number(process.env.LIVE_CONC || 3));
const OUT = process.env.LIVE_OUT || path.join(process.cwd(), '..', 'docs', 'corpus');
const RESULTS = path.join(OUT, 'live-results.jsonl');
const WORKSPACE = path.join(process.cwd(), '..', 'data', 'projects', 'my-workspace');

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Already measured, by id — a stop costs nothing. */
function done(): Set<string> {
    const s = new Set<string>();
    try {
        for (const line of fs.readFileSync(RESULTS, 'utf8').split('\n')) {
            if (!line.trim()) continue;
            try { s.add(JSON.parse(line).id); } catch { /* a torn line is not a result */ }
        }
    } catch { /* first run */ }
    return s;
}

async function reply(sessionId: string, timeoutMs: number): Promise<string> {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
        await sleep(4000);
        try {
            const r = await fetch(`${BASE}/api/sessions/${sessionId}/messages`);
            const d: any = await r.json();
            const t = (d?.events || []).find((e: any) => e.type === 'text');
            if (t) return String(t?.data?.text ?? t?.data ?? '');
        } catch { /* the server may be mid-restart; keep waiting */ }
    }
    return '';
}

async function runOne(p: Prompt, i: number): Promise<any> {
    const sessionId = `live-${Date.now()}-${i}-${Math.floor(performance.now() % 100000)}`;
    const started = Date.now();
    try {
        const r = await fetch(`${BASE}/api/run/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({ text: p.text, sessionId, language: 'ar' }),
        });
        const d: any = await r.json();
        if (!d?.ok) return { id: p.id, tier: p.tier, kind: p.kind, text: p.text, outcome: 'REFUSED_TO_START', detail: JSON.stringify(d).slice(0, 200) };
    } catch (e: any) {
        return { id: p.id, tier: p.tier, kind: p.kind, text: p.text, outcome: 'SERVER_UNREACHABLE', detail: e.message };
    }

    const said = await reply(sessionId, 12 * 60 * 1000);
    const seconds = Math.round((Date.now() - started) / 1000);

    //  What reached disk during THIS run — matched by time, because a
    //  concurrent run is writing beside it and the newest directory is not
    //  necessarily this one's.
    let builtDir = '';
    let files: string[] = [];
    try {
        const dirs = fs.readdirSync(WORKSPACE)
            .map(d => ({ d, t: fs.statSync(path.join(WORKSPACE, d)).mtimeMs }))
            .filter(x => x.t >= started)
            .sort((a, b) => b.t - a.t);
        if (dirs.length) {
            builtDir = dirs[0].d;
            const src = path.join(WORKSPACE, builtDir, 'src');
            if (fs.existsSync(src)) files = fs.readdirSync(src);
        }
    } catch { /* nothing built is itself a result */ }

    return {
        id: p.id, tier: p.tier, kind: p.kind, text: p.text, seconds,
        outcome: !said ? 'NO_REPLY' : /توقّفت عند الخطوة/.test(said) ? 'BLOCKED' : 'DELIVERED',
        //  Did he tell the owner what he could not verify, instead of claiming?
        declared: /لا أعرف كيف أتحقّق|لم أستخرج معيار|ما زال قائم|لم أدّعِ/.test(said),
        builtDir,
        pages: files.filter(f => /^(App|router)\.jsx$/.test(f)).length,
        files: files.slice(0, 14),
        reply: said.slice(0, 1200),
    };
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const already = done();
    const queue = THOUSAND.filter(p => !already.has(p.id)).slice(0, N);
    console.log(`LIVE_BASE=${BASE}  CONCURRENCY=${CONC}  ALREADY_DONE=${already.size}  QUEUED=${queue.length}`);

    let next = 0;
    let finished = 0;
    const t0 = Date.now();

    const worker = async (w: number) => {
        while (true) {
            const i = next++;
            if (i >= queue.length) return;
            const p = queue[i];
            const row = await runOne(p, i);
            //  Appended the moment it lands: the file is the record, and a
            //  stop at any point loses nothing that was measured.
            fs.appendFileSync(RESULTS, JSON.stringify(row) + '\n', 'utf8');
            finished++;
            const mins = (Date.now() - t0) / 60000;
            const rate = finished / Math.max(mins, 0.01);
            console.log(
                `[${finished}/${queue.length}] w${w} tier ${row.tier} ${row.outcome}`
                + ` ${row.seconds}s  ${rate.toFixed(2)}/min  eta ${Math.round((queue.length - finished) / Math.max(rate, 0.001))}min`
                + `  ${String(row.text).slice(0, 46)}`,
            );
        }
    };

    await Promise.all(Array.from({ length: CONC }, (_, w) => worker(w + 1)));
    console.log(`\nFINISHED=${finished}  MINUTES=${Math.round((Date.now() - t0) / 60000)}`);
})();
