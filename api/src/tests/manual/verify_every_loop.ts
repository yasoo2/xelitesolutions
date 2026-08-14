/**
 * EVERY LOOP IN THE SYSTEM, RUN — NOT READ.
 *
 * «اختبر جميع الحلقات وتأكد أنها متصلة بشكل صحيح وأن جميع الوظائف تعمل
 *  بالشكل الصحيح»
 *
 * `verify_the_whole_chain.ts` runs ONE circuit end to end: a prompt goes in
 * and a delivered system comes out. That proves the main road. It says nothing
 * about the roads that branch off it — the edit, the undo, the run, the repair,
 * the data the visitors write, the memory, the panels the user watches it
 * through. Each of those is a LOOP: something leaves Joe, something happens in
 * the world, and something comes back.
 *
 * A loop can be broken at either end and look perfectly healthy from the
 * inside. The tool exists, its unit tests pass, the planner has a route to it —
 * and the wire between them was cut months ago. That is the exact failure this
 * file exists to catch, so every check here EXECUTES: real tools through the
 * real firewall, a real server on a real port, real HTTP, real files changed on
 * disk and read back.
 *
 * Where the environment genuinely cannot provide something — no network, no
 * Chromium, no GitHub token — the loop SKIPS and says which end was missing.
 * A green tick that proves nothing is the thing this project keeps deleting.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_every_loop.ts
 */
export { };
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.ENABLE_AUTH_BYPASS = 'true';
process.env.AUTO_APPROVE_ALL = '1';
// One round is enough here: the loop's own behaviour is proven in
// verify_it_keeps_improving.ts. This file asks whether it is CONNECTED.
process.env.JOE_IMPROVE_ROUNDS = process.env.JOE_IMPROVE_ROUNDS || '1';

import fs from 'fs';
import path from 'path';

let pass = 0, fail = 0, skip = 0;
const broken: string[] = [];
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; broken.push(name); console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const skipped = (name: string, why: string) => { skip++; console.log(`  ⏭️  ${name} — ${why}`); };
const loop = (n: number, title: string) => console.log(`\n${'─'.repeat(72)}\n[الحلقة ${n}] ${title}\n`);

const REQUEST = [
    'Build a complete system for a veterinary clinic called "Dar Al-Rifq",',
    'with a React interface and a real database:',
    '',
    'Tables: animals, vaccinations, doctors, appointments, invoices',
    'With photos for the animals, sign-in and staff permissions, and an admin panel for every table.',
].join('\n');

async function main() {
    const t0 = Date.now();
    const { executeTool } = require('../../modules/services/ToolService');
    const { executionFirewall } = require('../../orchestration/AgentExecutionFirewall');
    const { observeBroadcasts } = require('../../api/ws');

    const sessionId = `loops-${Date.now()}`;
    const trace: string[] = [];
    const events: any[] = [];
    /**
     * The panels are a loop too, and this is the only honest way to watch it
     * from here: subscribe where the WebSocket server would, and see what the
     * builder really emits. A source grep would prove the call was written;
     * this proves it FIRED.
     */
    const unobserve = observeBroadcasts((e: any) => events.push(e));

    const ctx = {
        sessionId, workspaceId: `ws-${Date.now()}`, userId: 'loop-proof', language: 'en',
        onProgress: (m: string) => trace.push(String(m)),
    };
    const run = async (tool: string, input: any) => {
        const res = await executionFirewall.runInContext('loop-proof', () => executeTool(tool, input, ctx));
        for (const l of (Array.isArray((res as any)?.logs) ? (res as any).logs : [])) trace.push(String(l));
        return res;
    };

    /* ═══ 1. الطلب → الأداة ═══════════════════════════════════════════════ */
    loop(1, 'ROUTING — a sentence he would really type reaches the right hand');

    const { PlanningEngine } = require('../../core/orchestrator/PlanningEngine');
    /**
     * A PLAN IS A LIST, NOT A TOOL.
     *
     * «اعمل لي تطبيق حجز مواعيد» is classified as a SYSTEM — appointments are
     * data — so the plan is api_project → react_project, in that order. Reading
     * only step one calls that a misroute when it is the request being answered
     * in full. What «reaches the right hand» means is that the tool is IN the
     * plan; where the order carries meaning, the order is asserted too.
     */
    const planOf = async (goal: string, withSession = false): Promise<string[]> => {
        const plan = await PlanningEngine.generatePlan(
            { intent: { goal } as any }, undefined, withSession ? { sessionId } : undefined);
        return (plan?.steps || []).map((s: any) => String(s?.tool || ''));
    };
    const routeOf = async (goal: string, withSession = false): Promise<string> =>
        (await planOf(goal, withSession))[0] || '(none)';
    const routes = async (goal: string, want: string, withSession = false) => {
        let got: string[] = [];
        try { got = await planOf(goal, withSession); } catch (e: any) { got = [`(threw: ${String(e?.message).slice(0, 60)})`]; }
        check(`«${goal.slice(0, 36)}…» → ${want}`, got.includes(want), `plan was ${got.join(' → ') || '(empty)'}`);
        return got;
    };

    /**
     * These need no project to exist yet — they are the doors into the system.
     * The session-gated routes (edit, undo, the site's inbox) are checked in
     * their own loops below, WITH a real project active, because refusing to
     * edit a project that does not exist is the correct answer, not a break.
     */
    for (const [goal, want] of [
        // A «نظام» is the whole pipeline — backend and interface. Asking for
        // react_project here would be asking for half the request.
        ['ابنِ لي نظام عيادة بيطرية بقاعدة بيانات حقيقية', 'project_pipeline'],
        // Repointed with the row above it: a build request now reaches the
        // shared pipeline, which selects the builders from the evidence.
        ['اعمل لي تطبيق حجز مواعيد', 'project_pipeline'],
        ['شغّل المشروع', 'project_run'],
        ['أوقف الخادم', 'project_stop'],
        ['انشر المشروع على الإنترنت', 'deploy_pages'],
        ['اقرأ الطلبات التي وصلت من الزبائن', 'orders_read'],
        ['استورد المستودع من github.com/yasoo2/xelitesolutions', 'import_project'],
        ['احفظ بيانات عملي: مطعم اسمه الرفق ورقمه 0501234567', 'business_profile'],
    ] as Array<[string, string]>) await routes(goal, want);

    // «تطبيق حجز مواعيد» has data behind it, so the plan is a SYSTEM: the
    // server first, then the interface wired to it. An app that reaches the
    // builder without its backend is a screen with nothing behind it.
    // REPOINTED: the top-level plan now hands the request to the shared
    // pipeline, which resolves the builders from the evidence. The ordering
    // promise is unchanged and is asserted where it is now decided.
    const appPlan = await planOf('اعمل لي تطبيق حجز مواعيد');
    const { deterministicPhasesFor } = await import('../../modules/tools/definitions/ProjectPipelineTool');
    const appPhases = (deterministicPhasesFor('اعمل لي تطبيق حجز مواعيد')?.phases || []).map(ph => String(ph.tasks?.[0]?.tool));
    check('…and an app with data gets its backend BEFORE its interface',
        appPlan.includes('project_pipeline') && appPhases.indexOf('api_project') === 0 && appPhases.includes('react_project'),
        `${appPlan.join(' → ')} :: ${appPhases.join(' → ')}` || '(empty)');

    /**
     * The word «رسائل» belongs to two worlds, and the Gmail path claimed it
     * outright: a question about the messages left in HIS site's contact form
     * came back asking him to connect a Google account he never mentioned.
     * With no project yet the honest answer is «you have no site» — anything,
     * as long as it is not Google.
     */
    for (const g of ['اقرأ رسائل نموذج التواصل', 'اعرض رسائل الموقع']) {
        const got = await routeOf(g);
        check(`«${g}» is his SITE's inbox, never Gmail`, got !== 'google_account', `landed on ${got}`);
    }
    check('…and his real Gmail still reaches Google', await routeOf('اقرأ بريدي') === 'google_account');

    /* ═══ 2. البناء ═══════════════════════════════════════════════════════ */
    loop(2, 'BUILD — a backend and an interface become ONE system');

    const api = await run('api_project', { request: REQUEST });
    const apiDir = String(api?.output?.path || '');
    check('api_project built a real server', !!api?.ok && !!apiDir && fs.existsSync(apiDir), String(api?.error || '').slice(0, 160));
    if (!apiDir || !fs.existsSync(apiDir)) {
        console.log('\n⛔ no server on disk — every loop below hangs off this one\n');
        unobserve(); process.exit(1);
    }
    const installed = fs.existsSync(path.join(apiDir, 'node_modules'));
    // The owner account is printed once, in the message. A visitor loop needs it.
    const creds = String(api?.output?.message || '').match(/Owner account \(shown once\): (\S+) \/ (\S+)/);

    let react: any = null, proj = '';
    if (!installed) {
        skipped('react_project', 'the API never installed (no network) — a build would measure nothing');
    } else {
        react = await run('react_project', { request: REQUEST });
        proj = String(react?.output?.path || '');
        // `ok` now also carries the delivery-quality gate: it goes false when a
        // high-severity finding survives, on a build that really happened. The
        // loop being tested here is «did the interface get built», so it asks
        // the disk — and checks separately that a blocked delivery is named.
        check('react_project built an interface', !!proj && fs.existsSync(proj), String(react?.error || '').slice(0, 200));
        check('…and if delivery was blocked, it said why',
            react?.ok === true || /quality_gate|visual_audit/.test(String(react?.error || '')),
            String(react?.error || '(no error)'));
        check('vite really produced a bundle', !!react?.output?.built);
        check('and it was packaged into the server, one origin',
            fs.existsSync(path.join(apiDir, 'public', 'index.html')));
    }

    /* ═══ 3+4. القياس والتحسين ════════════════════════════════════════════ */
    loop(3, 'MEASURE + IMPROVE — both instruments vote, and the loop pays for its rounds');

    const audit = react?.output?.audit;
    if (!react) skipped('both instruments', 'no build happened');
    else if (!audit || audit.skipped) skipped('the browser', `skipped (${audit?.skipped || 'no audit'}) — no Chromium here`);
    else {
        check('the browser scored the RUNNING system', Number.isFinite(Number(audit.score)),
            trace.filter(l => /self-QA/.test(l)).join(' | ').slice(0, 160));
        check('the terminal ran real processes', trace.some(l => /^\$ /.test(l) || /terminal-QA/.test(l)));
        const rounds = trace.filter(l => /^improve: round \d+ —/.test(l));
        for (const l of rounds) console.log(`      ${l}`);
        check('the improvement loop is CONNECTED to the build',
            rounds.length > 0 || trace.some(l => /Improvement loop:/.test(l)),
            trace.filter(l => /improve/.test(l)).join(' | ').slice(0, 200));
    }

    /* ═══ 5. البثّ ════════════════════════════════════════════════════════ */
    loop(5, 'THE PANELS — what left the builder is what the screen listens for');

    const types = [...new Set(events.map(e => String(e?.type || '')))];
    console.log(`      ${events.length} event(s): ${types.join(', ').slice(0, 220)}`);
    if (!react) skipped('the panel events', 'no build happened');
    else {
        // Each of these drives a real surface in web/src. A build that emits
        // none of them runs perfectly and shows the user a still screen.
        for (const want of ['build_started', 'terminal_output', 'panel_focus', 'preview_ready']) {
            check(`«${want}» really fired`, types.includes(want),
                `only: ${types.join(', ').slice(0, 160)}`);
        }
        const focus = events.filter(e => e?.type === 'panel_focus').map(e => String(e?.data?.panel || ''));
        check('…and BOTH panels were asked for — browser and terminal',
            focus.includes('terminal') && (focus.includes('browser') || focus.includes('preview')),
            focus.join(', ') || '(none)');
        const preview = events.find(e => e?.type === 'preview_ready');
        check('the preview event carries a url the user can open',
            /^https?:\/\//.test(String(preview?.data?.url || '')), String(preview?.data?.url || '(none)'));
    }

    /* ═══ 6. التشغيل ══════════════════════════════════════════════════════ */
    loop(6, 'RUN — «شغّل المشروع» adopts the live system instead of racing it');

    const runRes = await run('project_run', {});
    const url = String(runRes?.output?.url || '');
    check('project_run answers with a live url', !!url, JSON.stringify(runRes?.output || runRes?.error).slice(0, 180));
    let health: any = null;
    if (url) {
        const body = await fetch(url).then(r => r.text()).catch(() => '');
        check('…and that url serves the interface', /<div id="root"|<!doctype html/i.test(body), body.slice(0, 100));
        health = await fetch(`${url.replace(/\/$/, '')}/api/health`).then(r => r.json()).catch(() => null);
        check('…on the same origin as its API', !!health?.ok, JSON.stringify(health || {}).slice(0, 140));
        check('…and the API knows every declared table',
            !!health?.tables && ['animals', 'vaccinations', 'doctors', 'appointments', 'invoices']
                .every(k => Object.prototype.hasOwnProperty.call(health.tables, k)),
            Object.keys(health?.tables || {}).join(', '));
    }

    /* ═══ 7. البيانات الحيّة ══════════════════════════════════════════════ */
    loop(7, 'LIVE DATA — a real write over real HTTP, read back, with the lock holding');

    if (!url) skipped('the data loop', 'nothing is running to write to');
    else if (!creds) skipped('the data loop', 'no owner account was printed (feed-shaped project)');
    else {
        const base = url.replace(/\/$/, '');
        const anon = await fetch(`${base}/api/animals`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'must-be-refused' }),
        }).then(r => r.status).catch(() => 0);
        check('an anonymous write is refused (401)', anon === 401, `got ${anon}`);

        const login = await fetch(`${base}/api/auth/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: creds[1], password: creds[2] }),
        }).then(r => r.json()).catch(() => null);
        const token = String(login?.token || '');
        check('the owner account Joe printed really logs in', token.split('.').length === 3, JSON.stringify(login || {}).slice(0, 140));

        if (token) {
            const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
            const made = await fetch(`${base}/api/animals`, {
                method: 'POST', headers: auth,
                body: JSON.stringify({ name: 'Loop-proof cat' }),
            }).then(r => r.json()).catch(() => null);
            // The server's real contract, read from its own source: a write
            // answers `{ok, row}` and a list answers `{ok, <table>: [...]}`.
            const id = Number(made?.row?.id || made?.id || 0);
            check('a signed-in write creates a real row', id > 0, JSON.stringify(made || {}).slice(0, 160));
            const back = await fetch(`${base}/api/animals`, { headers: auth as any }).then(r => r.json()).catch(() => null);
            const rows = Array.isArray(back) ? back : (back?.animals || back?.data || back?.items || []);
            check('…and the row is read back out of the database',
                rows.some((r: any) => String(r?.name || '') === 'Loop-proof cat'),
                JSON.stringify(rows).slice(0, 160));
        }
    }

    /* ═══ 8. صندوق الوارد ═════════════════════════════════════════════════ */
    loop(8, 'THE INBOX — orders_read and form_inbox answer, honestly, even when empty');

    // NOW the site exists, so the site's inbox is a real question with a real
    // answer — and this is the condition under which the route is gated.
    if (proj) await routes('اقرأ رسائل نموذج التواصل', 'form_inbox', true);
    else skipped('routing «اقرأ رسائل نموذج التواصل» → form_inbox', 'no project is active');

    for (const tool of ['orders_read', 'form_inbox']) {
        const res = await run(tool, { request: tool === 'orders_read' ? 'اقرأ الطلبات' : 'اقرأ الرسائل' });
        const said = String(res?.output?.message || res?.error || '');
        check(`${tool} answers instead of throwing`, !!res && said.length > 5, JSON.stringify(res).slice(0, 160));
        // An empty inbox must SAY it is empty. «No answer» and «no orders» are
        // different facts, and only one of them is true here.
        check(`…and its answer is a sentence, not an empty shell`, said.trim().length > 15, said.slice(0, 120));
    }

    /* ═══ 9. التعديل ══════════════════════════════════════════════════════ */
    loop(9, 'EDIT — «عدّل …» changes a real file in the real project and rebuilds');

    if (!proj) skipped('the edit loop', 'no React project was built');
    else {
        await routes('غيّر اسم الموقع إلى «دار الرفق البيطرية»', 'project_edit', true);
        const contentFile = path.join(proj, 'src', 'content.js');
        const brandOf = () => (fs.existsSync(contentFile)
            ? (fs.readFileSync(contentFile, 'utf-8').match(/\n\s*brand:\s*'([^']*)'/) || [])[1] || '' : '');
        const before = brandOf();
        const edit = await run('project_edit', { request: 'غيّر اسم الموقع إلى «دار الرفق البيطرية»' });
        check('project_edit ran and reported', !!edit, JSON.stringify(edit?.error || '').slice(0, 160));
        /**
         * The commonest edit in the product — renaming the site — used to need
         * a language model, so on a machine with no key it answered «لم أجد ما
         * يطابق الطلب» about a name sitting in one line of one file.
         */
        check('…and the site really carries its new name now',
            brandOf() === 'دار الرفق البيطرية', `brand: «${before}» → «${brandOf()}»`);
        const html = fs.existsSync(path.join(proj, 'index.html'))
            ? fs.readFileSync(path.join(proj, 'index.html'), 'utf-8') : '';
        check('…in the tab title too, not half-renamed', html.includes('دار الرفق البيطرية'),
            (html.match(/<title>[^<]*<\/title>/) || [])[0] || '(no title)');
        check('…and the build was re-verified after the edit',
            /vite build|أعدت البناء|نجح بعد التعديل|rebuilt/i.test(String(edit?.output?.message || '')),
            String(edit?.output?.message || '').slice(0, 200));
    }

    /* ═══ 10. التراجع ═════════════════════════════════════════════════════ */
    loop(10, 'UNDO — the snapshots exist, are listed, and really restore');

    if (!proj) skipped('the undo loop', 'no project to roll back');
    else {
        await routes('ارجع للنسخة السابقة', 'project_undo', true);
        const list = await run('project_undo', { projectDir: proj, list: true });
        const listed = String(list?.output?.message || '');
        check('project_undo lists the snapshots it took', !!list?.ok && listed.length > 10, listed.slice(0, 200));
        const hasVersions = /\d{4}|نسخة|version|snapshot/i.test(listed);
        check('…and there IS at least one snapshot to go back to', hasVersions, listed.slice(0, 200));
        if (hasVersions) {
            const back = await run('project_undo', { projectDir: proj });
            check('…and a rollback really runs', !!back?.ok, String(back?.error || '').slice(0, 200));
        } else skipped('the restore', 'nothing was snapshotted, so nothing could be restored');
    }

    /* ═══ 11. الإصلاح الذاتي ══════════════════════════════════════════════ */
    loop(11, 'SELF-REPAIR — a project broken on purpose is diagnosed, not ignored');

    if (!proj) skipped('the repair loop', 'no project to break');
    else {
        const victim = path.join(proj, 'src', 'main.jsx');
        const original = fs.existsSync(victim) ? fs.readFileSync(victim, 'utf-8') : '';
        if (!original) skipped('the repair loop', 'no src/main.jsx in this project');
        else {
            fs.writeFileSync(victim, `${original}\nconst broken = (;\n`);
            const rep = await run('project_repair', { projectDir: proj });
            const said = String(rep?.output?.message || rep?.error || '');
            check('project_repair notices the project is broken', /main\.jsx|error|خطأ|fail|فشل|أصلح|fixed/i.test(said), said.slice(0, 200));
            fs.writeFileSync(victim, original);   // the harness leaves nothing broken behind
            check('…and the file is restorable — the harness left it clean',
                fs.readFileSync(victim, 'utf-8') === original);
        }
    }

    /* ═══ 12. الذاكرة ═════════════════════════════════════════════════════ */
    loop(12, 'MEMORY — what he tells Joe once, Joe still knows the next time');

    const wrote = await run('business_profile', { request: 'احفظ: اسم العمل «دار الرفق» والهاتف 0501234567 والعنوان الرياض' });
    check('business_profile accepts what he told it', !!wrote, String(wrote?.error || '').slice(0, 160));
    const readBack = await run('business_profile', { request: 'ما هي بيانات عملي المحفوظة؟' });
    const remembered = String(readBack?.output?.message || '');
    check('…and reads it back in a later call', /الرفق|0501234567|الرياض/.test(remembered), remembered.slice(0, 200));

    /* ═══ 13. الذكاء ══════════════════════════════════════════════════════ */
    loop(13, 'THE MESH — a model is asked, and a failure is a failure, not a silence');

    const { routeToModel } = require('../../core/llm/intelligent-router');
    let answered = '', threw = '';
    try {
        answered = String(await routeToModel('Reply with exactly: OK', { internalCall: true, timeoutMs: 20000 }) || '');
    } catch (e: any) { threw = String(e?.message || e); }
    if (!answered && threw) {
        // No key, no network — the honest outcome here is a NAMED failure.
        check('with no provider reachable, it fails by name instead of pretending',
            threw.length > 5 && !/undefined|\[object/.test(threw), threw.slice(0, 160));
    } else {
        check('a provider answered', answered.trim().length > 0, JSON.stringify(answered).slice(0, 120));
        const { isUsableAnswer } = require('../../core/llm/intelligent-router');
        check('…and a SHORT correct answer counts as usable', isUsableAnswer('OK') === true);
        check('…while an empty one never does', isUsableAnswer('   ') === false);
    }

    /* ═══ 14. النشر والاستيراد ════════════════════════════════════════════ */
    loop(14, 'PUBLISH + IMPORT — the two loops that end outside this machine');

    const dep = await run('deploy_pages', {});
    const depSaid = String(dep?.output?.message || dep?.error || '');
    check('deploy_pages says exactly what it is missing, never a blank failure',
        depSaid.length > 15 && /token|github|رمز|اربط|connect|صلاحية|repo/i.test(depSaid), depSaid.slice(0, 200));

    const imp = await run('import_project', { request: 'استورد https://github.com/this-owner-does-not-exist/nor-this-repo' });
    const impSaid = String(imp?.output?.message || imp?.error || '');
    check('import_project fails a bad repo by name, never silently',
        impSaid.length > 10, JSON.stringify(imp).slice(0, 200));

    /* ═══ close ═══════════════════════════════════════════════════════════ */
    await run('project_stop', {}).catch(() => null);
    unobserve();

    console.log(`\n${'═'.repeat(72)}`);
    if (broken.length) {
        console.log('\nBROKEN LINKS:');
        for (const b of broken) console.log(`   ✗ ${b}`);
    }
    console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed, ${skip} skipped`
        + ` — ${Math.round((Date.now() - t0) / 1000)}s\n`);
    process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
