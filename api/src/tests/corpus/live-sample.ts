/**
 * WHAT JOE ACTUALLY BUILDS — through the running server, not through a reader.
 *
 * The thousand-prompt corpus measures what Joe UNDERSTANDS: pages, columns,
 * criteria, rules. That is real production code and a real number, and it is
 * NOT the same question as «did he build the right thing». The owner asked
 * that question directly and was right to doubt the answer.
 *
 * So this takes a sample across every tier and pushes each one through
 * /api/run/start on the live server, waits for the reply Joe would show him,
 * and writes down what reached disk. One round is three to four minutes of a
 * real npm build and a real browser audit; the sample size is the honest limit
 * of what fits in an evening, and it is stated rather than hidden.
 *
 *     npx ts-node --transpile-only src/tests/corpus/live-sample.ts
 *
 * Environment:
 *   LIVE_N        how many prompts (default 8)
 *   LIVE_BASE     server (default http://127.0.0.1:5002)
 *   LIVE_OUT      where to write the report
 */

import * as fs from 'fs';
import * as path from 'path';
import { THOUSAND, type Prompt } from './thousand-prompts';

const BASE = process.env.LIVE_BASE || 'http://127.0.0.1:5002';
const N = Number(process.env.LIVE_N || 8);
const OUT = process.env.LIVE_OUT || path.join(process.cwd(), '..', 'docs', 'corpus');

/** One from each tier first, so a small sample still spans the difficulty. */
function sample(n: number): Prompt[] {
    const byTier = new Map<number, Prompt[]>();
    for (const p of THOUSAND) {
        if (!byTier.has(p.tier)) byTier.set(p.tier, []);
        byTier.get(p.tier)!.push(p);
    }
    const tiers = [...byTier.keys()].sort((a, b) => a - b);
    const out: Prompt[] = [];
    let round = 0;
    while (out.length < n) {
        for (const t of tiers) {
            const list = byTier.get(t)!;
            if (round < list.length && out.length < n) out.push(list[round * 37 % list.length]);
        }
        round++;
        if (round > 50) break;
    }
    return out.slice(0, n);
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function events(sessionId: string): Promise<any[]> {
    try {
        const r = await fetch(`${BASE}/api/sessions/${sessionId}/messages`);
        const d: any = await r.json();
        return d?.events || [];
    } catch { return []; }
}

async function runOne(p: Prompt, i: number): Promise<Record<string, any>> {
    const sessionId = `live-${Date.now()}-${i}`;
    const started = Date.now();
    let runId = '';
    try {
        const r = await fetch(`${BASE}/api/run/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({ text: p.text, sessionId, language: 'ar' }),
        });
        const d: any = await r.json();
        runId = d?.runId || '';
        if (!d?.ok) return { id: p.id, tier: p.tier, text: p.text, outcome: 'REFUSED_TO_START', detail: JSON.stringify(d).slice(0, 200) };
    } catch (e: any) {
        return { id: p.id, tier: p.tier, text: p.text, outcome: 'SERVER_UNREACHABLE', detail: e.message };
    }

    //  Wait for Joe's reply — the very text the owner would read on screen.
    let reply = '';
    for (let s = 0; s < 150; s++) {
        await sleep(4000);
        const ev = await events(sessionId);
        const text = ev.find((e: any) => e.type === 'text');
        if (text) { reply = String(text?.data?.text ?? text?.data ?? ''); break; }
    }
    const seconds = Math.round((Date.now() - started) / 1000);

    //  What reached disk, if anything.
    let builtDir = '';
    let files: string[] = [];
    try {
        const root = path.join(process.cwd(), '..', 'data', 'projects', 'my-workspace');
        const dirs = fs.readdirSync(root)
            .map(d => ({ d, t: fs.statSync(path.join(root, d)).mtimeMs }))
            .filter(x => x.t >= started)
            .sort((a, b) => b.t - a.t);
        if (dirs.length) {
            builtDir = dirs[0].d;
            const src = path.join(root, builtDir, 'src');
            if (fs.existsSync(src)) files = fs.readdirSync(src);
        }
    } catch { /* nothing built is itself a result */ }

    const blocked = /توقّفت عند الخطوة/.test(reply);
    const declared = /لا أعرف كيف أتحقّق|لم أستخرج معيار|ما زال قائم/.test(reply);
    return {
        id: p.id, tier: p.tier, kind: p.kind, text: p.text, runId, seconds,
        outcome: !reply ? 'NO_REPLY_IN_10_MIN' : blocked ? 'BLOCKED' : 'DELIVERED',
        declaredItsLimits: declared,
        builtDir, files: files.slice(0, 12),
        reply: reply.slice(0, 900),
    };
}

(async () => {
    const chosen = sample(N);
    console.log(`LIVE_BASE=${BASE}  LIVE_N=${chosen.length}`);
    const rows: any[] = [];
    for (let i = 0; i < chosen.length; i++) {
        const p = chosen[i];
        console.log(`\n[${i + 1}/${chosen.length}] tier ${p.tier} — ${p.text}`);
        const row = await runOne(p, i);
        rows.push(row);
        console.log(`   → ${row.outcome}  ${row.seconds}s  dir=${row.builtDir || '—'}  declared=${row.declaredItsLimits}`);
        if (row.reply) console.log('   ' + String(row.reply).split('\n')[0].slice(0, 140));
    }

    const delivered = rows.filter(r => r.outcome === 'DELIVERED').length;
    const blocked = rows.filter(r => r.outcome === 'BLOCKED').length;
    const nothing = rows.length - delivered - blocked;
    console.log(`\nDELIVERED=${delivered}  BLOCKED=${blocked}  NEITHER=${nothing}  OF=${rows.length}`);

    try {
        fs.mkdirSync(OUT, { recursive: true });
        fs.writeFileSync(path.join(OUT, 'live-sample.json'), JSON.stringify(rows, null, 1), 'utf8');
        console.log('WROTE=' + path.join(OUT, 'live-sample.json'));
    } catch (e: any) { console.log('WRITE_FAILED=' + e.message); }
})();
