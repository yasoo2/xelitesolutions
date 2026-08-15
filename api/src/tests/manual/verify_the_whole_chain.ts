/**
 * THE WHOLE CHAIN, END TO END, ON A REAL BUILD.
 *
 * «اعمل اختبار تكاملي شامل»
 *
 * Every other harness in this folder proves one organ. This one runs the
 * animal: a real prompt goes in at the top of the pipeline and the checks
 * below read what came out the bottom — the declared tables in a real SQLite
 * file, a real Express server answering on a real port, a real Chromium
 * pressing the interface, a real terminal running real processes against the
 * API, the improvement loop deciding round by round, and a delivery report
 * that says what was built and what was not.
 *
 * Nothing here is stubbed. Where the environment cannot provide something —
 * no network for `npm install`, no Chromium — the check SKIPS and says so
 * rather than passing on a technicality, because a green tick that proves
 * nothing is the thing this whole project keeps deleting.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_the_whole_chain.ts
 */
export { };
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.ENABLE_AUTH_BYPASS = 'true';
process.env.AUTO_APPROVE_ALL = '1';
// A full loop with four rounds of vite builds is minutes; two is enough to
// prove the mechanism and keeps this harness runnable.
process.env.JOE_IMPROVE_ROUNDS = process.env.JOE_IMPROVE_ROUNDS || '2';

import fs from 'fs';
import path from 'path';

let pass = 0, fail = 0, skip = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const skipped = (name: string, why: string) => { skip++; console.log(`  ⏭️  ${name} — ${why}`); };

const REQUEST = [
    'Build a complete system for a veterinary clinic called "Dar Al-Rifq",',
    'with a React interface and a real database:',
    '',
    'Tables: animals, vaccinations, doctors, appointments, invoices',
    'With photos for the animals, sign-in and staff permissions, and an admin panel for every table.',
    '',
    'I also want: live streaming of surgeries, video calls with pet owners, AI that diagnoses',
    'illnesses from photos, and automatic vaccination recommendations.',
    '',
    'At the end, show me plainly what you actually built and what you did not.',
].join('\n');

async function main() {
    const t0 = Date.now();
    const { executeTool } = require('../../modules/services/ToolService');
    const { executionFirewall } = require('../../orchestration/AgentExecutionFirewall');
    const sessionId = `chain-${Date.now()}`;
    const workspaceId = `ws-${Date.now()}`;
    const trace: string[] = [];
    const ctx = {
        sessionId, workspaceId, userId: 'chain-proof', language: 'en',
        onProgress: (m: string) => { trace.push(String(m)); console.log(`      · ${String(m).slice(0, 160)}`); },
    };
    /**
     * The trace is BOTH channels.
     *
     * A tool speaks live through `onProgress` and keeps the same lines in
     * `logs`; the terminal audit and the «system stays UP» line reach the
     * user through the second one. A harness that watches only the first
     * reports a working system as broken — which is what the first run of
     * this file did, and is exactly the class of lie it exists to catch.
     */
    const run = async (tool: string, input: any) => {
        const res = await executionFirewall.runInContext('chain-proof', () => executeTool(tool, input, ctx));
        for (const l of (Array.isArray((res as any)?.logs) ? (res as any).logs : [])) trace.push(String(l));
        return res;
    };

    /* ─────────────── 1. the request becomes a data model ─────────────── */
    console.log('\n[1] The request declares its tables — and those are the tables\n');

    const { designDataModel } = require('../../core/design/schema-designer');
    const notes: string[] = [];
    const model = await designDataModel(REQUEST, { onNote: (n: string) => notes.push(n), timeoutMs: 1 });
    const keys = model.map((e: any) => e.key);
    console.log(`      ${notes[0] || '(no note)'}`);
    check('all five declared tables are the model',
        ['animals', 'vaccinations', 'doctors', 'appointments', 'invoices'].every(k => keys.includes(k)),
        keys.join(', '));
    check('and nothing was invented from the word «clinic»', !keys.includes('patients'));

    /* ─────────────── 2. a real backend on a real database ─────────────── */
    console.log('\n[2] A real Express server over a real SQLite file\n');

    const api = await run('api_project', { request: REQUEST });
    check('api_project succeeded', !!api?.ok, String(api?.error || '').slice(0, 200));
    const apiDir = String(api?.output?.path || api?.output?.dir || '');
    check('it wrote a project directory', !!apiDir && fs.existsSync(apiDir), apiDir);
    if (!apiDir || !fs.existsSync(apiDir)) {
        console.log('\n⛔ no server on disk — the rest of the chain cannot be measured\n');
        process.exit(1);
    }
    for (const f of ['server.js', 'db.js', 'entities.js', 'auth.js', 'seed.js', 'package.json']) {
        check(`  ${f} is on disk`, fs.existsSync(path.join(apiDir, f)));
    }
    /**
     * A DECLARED TABLE LIVES IN ONE OF TWO FILES, AND BOTH COUNT.
     *
     * `entities.js` carries the generated model; `db.js` carries the system's
     * OWN primary table, the one with the built-in CRUD, auth and ownership.
     * When the request describes its own system, its first table is promoted
     * to be that primary one — so it correctly leaves entities.js and appears
     * in db.js instead. Reading only entities.js reported a table that exists,
     * is served and is writable as missing.
     *
     * The promise is that every table he declared is BUILT. That is what is
     * measured, wherever the generator chose to put it.
     */
    const entities = fs.readFileSync(path.join(apiDir, 'entities.js'), 'utf-8');
    const dbjs = fs.readFileSync(path.join(apiDir, 'db.js'), 'utf-8');
    const built = (k: string) => entities.includes(`"${k}"`)
        || new RegExp(`CREATE TABLE IF NOT EXISTS ${k}\\b`).test(dbjs);
    const declaredTables = ['animals', 'vaccinations', 'doctors', 'appointments', 'invoices'];
    check('every declared table is in the generated model',
        declaredTables.every(built),
        declaredTables.filter(k => !built(k)).join(', '));
    const installed = fs.existsSync(path.join(apiDir, 'node_modules'));
    check('the write/read proof really ran', trace.some(l => /live proof → OK/.test(l)),
        trace.filter(l => /proof/.test(l)).join(' | ').slice(0, 200));
    check('…and so did the auth proof', trace.some(l => /auth proof → anonymous write 401/.test(l)));

    /* ─────────────── 3. the interface, built and packaged ─────────────── */
    console.log('\n[3] A real Vite build, packaged into the server\n');

    if (!installed) {
        skipped('react_project', 'the API never installed (no network) — a build would measure nothing');
    } else {
        const react = await run('react_project', { request: REQUEST });
        /**
         * `ok` NO LONGER MEANS «THE WORK HAPPENED».
         *
         * A delivery-quality gate now returns ok:false when a high-severity
         * finding survives the self-repair — on a build that really wrote its
         * files, compiled and packaged. That is a defensible thing for the tool
         * to say, and it means this harness must assert on the EVIDENCE it
         * cares about rather than on a flag whose meaning changed underneath
         * it. A blocked delivery is still checked: it has to be reported, not
         * silent.
         */
        const delivered = !!react?.output?.path;
        check('react_project produced a project', delivered, String(react?.error || '').slice(0, 300));
        check('…and a blocked delivery says so instead of passing quietly',
            react?.ok === true || /quality_gate|visual_audit/.test(String(react?.error || '')),
            String(react?.error || '(no error)'));
        const proj = String(react?.output?.path || '');
        check('it wrote a project directory', !!proj && fs.existsSync(proj), proj);
        const built = !!react?.output?.built;
        check('vite really built it', built, 'no dist/index.html');
        check('the interface was packaged into the server',
            fs.existsSync(path.join(apiDir, 'public', 'index.html')));

        /* ── 4. both instruments measured it ── */
        console.log('\n[4] Both instruments measured the running system\n');

        const audit = react?.output?.audit;
        if (!audit || audit.skipped) {
            skipped('the browser audit', `skipped (${audit?.skipped || 'no audit'}) — no Chromium here`);
        } else {
            check('the browser scored it', Number.isFinite(Number(audit.score)), String(audit?.score));
            check('…on the RUNNING system, not a folder',
                trace.some(l => /measuring the RUNNING system at http/.test(l))
                || trace.some(l => /self-QA: \d+\/100/.test(l)),
                trace.filter(l => /self-QA/.test(l)).join(' | ').slice(0, 200));
        }
        check('the terminal ran real processes in front of the user',
            trace.some(l => /^\$ npm ls --depth=0/.test(l)) || trace.some(l => /terminal-QA/.test(l)),
            trace.filter(l => /^\$ |terminal-QA/.test(l)).join(' | ').slice(0, 240));
        // The assertion is that the sentence was SAID in the terminal, not how
        // its first letter was cased — an `i` here so the check measures the
        // promise and not the typography of the line that keeps it.
        check('…and it votes on the round, not just reports',
            trace.some(l => /the terminal votes too|الطرفية تصوّت/i.test(l)),
            trace.filter(l => /votes/i.test(l)).join(' | ').slice(0, 200));

        /* ── 5. the improvement loop ── */
        console.log('\n[5] The loop: analyse → improve → measure again → stop honestly\n');

        const rounds = trace.filter(l => /^improve: round \d/.test(l));
        for (const l of rounds) console.log(`      ${l}`);
        if (!rounds.length) {
            skipped('the improvement loop', 'no round ran (the first measurement was already at the bar, or the audit was skipped)');
        } else {
            check('at least one round was decided', rounds.length > 0);
            check('every round announced what was still open',
                rounds.some(l => /still open:/.test(l)), rounds.join(' | ').slice(0, 200));
            const verdictLine = trace.find(l => /Improvement loop:/.test(l));
            check('the loop published a verdict with its reason', !!verdictLine, verdictLine || '(none)');
            // A loop that stops must say WHY, and the reason must be one of the
            // five honest ones — never silence.
            check('…and the reason is one of the honest five',
                /reached the bar|no measured gain|nothing left|rolled back|round ceiling|gained nothing/.test(verdictLine || ''),
                verdictLine || '');
        }

        /* ── 6. the delivery message ── */
        console.log('\n[6] The message says what was built AND what was not\n');

        const msg = String(react?.output?.message || '');
        check('the message exists', msg.length > 200, `${msg.length} chars`);
        const unmetAt = msg.search(/did NOT build|لم أبنِه/);
        if (unmetAt >= 0) console.log(`      ── unmet block ──\n${msg.slice(unmetAt, unmetAt + 700)}`);
        check('it names what it did NOT build',
            /did NOT build|لم أبنِه/.test(msg),
            msg.slice(0, 200));
        for (const want of ['live streaming', 'video call']) {
            check(`  «${want}» is named as not built`, new RegExp(want, 'i').test(msg));
        }
        check('it carries the browser score', /\d+\/100/.test(msg));
        check('it lists the admin screens it really made',
            /animals/.test(msg) && /invoices/.test(msg), msg.slice(0, 300));

        /* ── 7. the system is still up, and project_run adopts it ── */
        console.log('\n[7] The system stays up, and «run» adopts it instead of racing it\n');

        check('the build says the system stays up',
            trace.some(l => /the system stays UP at http/.test(l)),
            trace.filter(l => /stays UP/.test(l)).join(' | '));
        const runRes = await run('project_run', {});
        check('project_run answers with a live url', !!runRes?.output?.url, JSON.stringify(runRes?.output || runRes?.error).slice(0, 200));
        if (runRes?.output?.url) {
            const body = await fetch(String(runRes.output.url)).then(r => r.text()).catch(() => '');
            check('…and that url really serves the interface', /<div id="root"|<!doctype html/i.test(body), body.slice(0, 120));
            const health = await fetch(`${String(runRes.output.url).replace(/\/$/, '')}/api/health`)
                .then(r => r.json()).catch(() => null);
            check('…on the same origin as its API', !!health?.ok, JSON.stringify(health || {}).slice(0, 160));
            check('…and the API reports every declared table',
                !!health?.tables && ['animals', 'vaccinations', 'doctors', 'appointments', 'invoices']
                    .every(k => Object.prototype.hasOwnProperty.call(health.tables, k)),
                JSON.stringify(health?.tables || {}).slice(0, 200));
        }
        await run('project_stop', {}).catch(() => null);
    }

    /* ─────────────── 8. one language, one run ─────────────── */
    console.log('\n[8] One run, one language\n');

    const ARABIC = /[؀-ۿ]/;
    const arabicLines = trace.filter(l => ARABIC.test(l));
    check('an English run produced no Arabic line in the trace',
        arabicLines.length === 0, arabicLines.slice(0, 3).join(' | ').slice(0, 240));

    console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed, ${skip} skipped`
        + ` — ${Math.round((Date.now() - t0) / 1000)}s\n`);
    process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
