/**
 * ARE THE BROWSER AND THE TERMINAL REALLY CONNECTED? — «تأكّد أنهما موصولان».
 *
 * Both subsystems are large and real: 5200 lines of Playwright behind 29 tools,
 * and a true PTY behind an xterm panel. Size is not connection, so nothing here
 * is read from a comment. A real HTTP server is started, a real WebSocket is
 * opened with a real token, a real shell runs, and the claims are whatever the
 * wire actually did.
 *
 *   [1] THE TERMINAL, END TO END: the panel's own HTTP call creates the shell,
 *       a keystroke travels over the socket, and the shell's answer comes back.
 *   [2] AND IT IS ONE USER'S SHELL: a second signed-in user must not read it,
 *       and must not be able to TAKE it. A terminal is a command line on the
 *       owner's machine — the worst thing in the product to get wrong when Joe
 *       goes online.
 *   [3] THE BROWSER'S DOORS: /ws/browser and /ws/extension exist and refuse a
 *       connection without a token.
 *   [4] ONE BROWSER, ONE LAUNCHER: every place that starts Chromium goes
 *       through the shared launch options, or a machine where the bundled
 *       build is missing gets a working browser panel and a screenshot tool
 *       that dies with «Executable doesn't exist».
 *   [5] THE TOOLS RESOLVE: all 29 browser tools and all 4 terminal tools pass
 *       through the real dispatcher.
 *   [6] THE PANELS LISTEN TO EVENTS THAT ARE ACTUALLY SENT: every event name
 *       the four UI components wait for is emitted somewhere in the API.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_browser_terminal_wiring.ts
 */
export {};
import fs from 'fs';
import http from 'http';
import path from 'path';
import jwt from 'jsonwebtoken';
import WebSocket from 'ws';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';
process.env.ENABLE_AUTH_BYPASS = 'false';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const WEB = path.resolve(process.cwd(), '..', 'web', 'src');
const API = path.resolve(process.cwd(), 'src');
const readIf = (p: string) => { try { return fs.readFileSync(p, 'utf-8'); } catch { return ''; } };
const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : [])) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (/\.tsx?$/.test(e.name) && !p.includes(`${path.sep}tests${path.sep}`)) out.push(p);
    }
    return out;
};

const TERM_A = `wire-term-a-${Date.now()}`;
const USER_A = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const USER_B = 'bbbbbbbbbbbbbbbbbbbbbbb2';

async function main() {
    const { createApp } = await import('../../api/app');
    const { attachWebSocket } = await import('../../api/ws');
    const server = http.createServer(createApp());
    attachWebSocket(server as any);
    server.listen(0, '127.0.0.1');
    await new Promise<void>(r => server.once('listening', () => r()));
    const port = (server.address() as any).port;
    const base = `http://127.0.0.1:${port}`;
    const tokenFor = (sub: string) => jwt.sign({ sub, role: 'USER', email: `${sub}@joe.local` }, process.env.JWT_SECRET!);
    const tokenA = tokenFor(USER_A), tokenB = tokenFor(USER_B);

    /** A live socket that remembers every frame it was given. */
    const openSocket = async (token: string) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`);
        const seen: any[] = [];
        ws.on('message', (d) => { try { seen.push(JSON.parse(d.toString())); } catch { /* binary */ } });
        await new Promise<void>((res, rej) => { ws.once('open', () => res()); ws.once('error', rej); });
        return { ws, seen, text: () => seen.filter(m => m?.type === 'terminal_output').map(m => m.data).join('') };
    };
    const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

    const a = await openSocket(tokenA);
    const b = await openSocket(tokenB);

    try {
        console.log('\n[1] الطرفية من طرفها إلى طرفها — بالنداء الذي تستعمله اللوحة نفسها');
        const created = await fetch(`${base}/api/tools/terminal_manager/execute`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create', id: TERM_A, shell: 'bash', cols: 80, rows: 24 }),
        }).then(r => r.json()).catch(e => ({ error: String(e) })) as any;
        check('اللوحة تُنشئ جلسة صدَفة حقيقية عبر مسارها الحقيقي', created?.ok === true, JSON.stringify(created).slice(0, 200));

        a.ws.send(JSON.stringify({ type: 'terminal_input', id: TERM_A, data: 'echo JOE_TERM_OK\n' }));
        for (let i = 0; i < 40 && !a.text().includes('JOE_TERM_OK'); i++) await wait(100);
        check('ضغطة مفتاح تعبر المقبس وتصل الصدَفة، وجوابها يعود', a.text().includes('JOE_TERM_OK'), a.text().slice(-120));

        a.ws.send(JSON.stringify({ type: 'terminal_resize', id: TERM_A, cols: 100, rows: 30 }));
        await wait(200);
        check('وتغيير المقاس لا يُسقط الجلسة', a.ws.readyState === WebSocket.OPEN);

        console.log('\n[2] وهي طرفية صاحبها وحده');
        check('مستخدم آخر متصل لا يرى شيئاً من مخرجاتها', !b.text().includes('JOE_TERM_OK'), b.text().slice(-120));

        // THE HIJACK. Measured properly, because the obvious test lies: when B
        // takes ownership, A stops receiving output, so «A never saw B's line»
        // is true precisely BECAUSE the theft succeeded. The two questions that
        // cannot be faked are asked instead —
        //   did B's command actually run inside A's shell (read the shell's own
        //   history, not a socket), and did ANY byte of that terminal ever
        //   reach B's socket.
        b.ws.send(JSON.stringify({ type: 'terminal_input', id: TERM_A, data: 'echo HIJACKED_BY_B\n' }));
        await wait(1500);
        a.ws.send(JSON.stringify({ type: 'terminal_input', id: TERM_A, data: 'echo SECOND_LINE\n' }));
        for (let i = 0; i < 40 && !a.text().includes('SECOND_LINE'); i++) await wait(100);

        const history = await fetch(`${base}/api/tools/terminal_manager/execute`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'read', id: TERM_A }),
        }).then(r => r.json()).catch(() => ({})) as any;
        const shellSaw = String(history?.output?.history ?? history?.output ?? '');
        check('أمرُ الآخر لا يُنفَّذ داخل صدَفة صاحبها — مقروءاً من سجلّ الصدَفة نفسها',
            shellSaw.includes('SECOND_LINE') && !shellSaw.includes('HIJACKED_BY_B'),
            shellSaw.slice(-200));
        const bGotAnyByte = b.seen.some((m: any) => m?.type === 'terminal_output' && m?.id === TERM_A);
        check('ولا بايت واحد من تلك الطرفية يصل مقبس الآخر', !bGotAnyByte,
            JSON.stringify(b.seen.filter((m: any) => m?.type === 'terminal_output').slice(0, 2)).slice(0, 200));

        // The other side of the same coin: closing the leak must not silence the
        // panel. The shared «panel-terminal» stream carries a build's logs, and
        // its owner is resolved through the session — so the OWNER must still
        // see it, or the fix would have traded a leak for a dead log window.
        const ownerSawPanel = a.seen.some((m: any) => m?.type === 'terminal_output' && m?.id === 'panel-terminal');
        check('وسجلّ الأدوات المشترك ما زال يصل صاحبه — لم نُسكِت اللوحة بحجّة الحماية', ownerSawPanel,
            JSON.stringify(a.seen.map((m: any) => m?.type).slice(0, 8)));

        console.log('\n[3] أبواب المتصفح');
        const upgrade = (pathname: string, token?: string) => new Promise<string>((resolve) => {
            const url = `ws://127.0.0.1:${port}${pathname}${token ? `?token=${token}` : ''}`;
            const s = new WebSocket(url);
            const done = (v: string) => { try { s.close(); } catch { } resolve(v); };
            s.once('open', () => done('open'));
            s.once('error', (e: any) => done(`error:${String(e?.message || e).slice(0, 60)}`));
            s.once('unexpected-response', (_r: any, res: any) => done(`http:${res.statusCode}`));
            setTimeout(() => done('timeout'), 3000);
        });
        const anonBrowser = await upgrade('/ws/browser');
        check('/ws/browser بلا توكن يُرفض', anonBrowser !== 'open', anonBrowser);
        const authedBrowser = await upgrade('/ws/browser', tokenA);
        check('/ws/browser بتوكن صحيح يُقبل', authedBrowser === 'open', authedBrowser);
        const anonExt = await upgrade('/ws/extension');
        check('/ws/extension بلا توكن يُرفض', anonExt !== 'open', anonExt);

        console.log('\n[4] متصفّح واحد ومشغّل واحد');
        const apiFiles = walk(API);
        const launchers = apiFiles.filter(f => /chromium\s*\.\s*launch/.test(readIf(f)));
        const stray = launchers.filter(f => {
            const src = readIf(f);
            return !/getChromiumLaunchOptions|launchPersistentContext/.test(src);
        }).map(f => path.relative(API, f));
        check('كل من يُشغّل Chromium يمرّ بخيارات الإطلاق المشتركة (وإلا سقط على جهاز لا يجد النسخة المدمجة)',
            stray.length === 0, stray.join(', '));

        console.log('\n[5] الأدوات تمرّ من الباب الحقيقي');
        const { tools } = require('../../modules/tools/registry');
        const { executeTool } = require('../../modules/services/ToolService');
        const { executionFirewall } = require('../../orchestration/AgentExecutionFirewall');
        const names: string[] = tools.map((t: any) => t.name);
        const browserNames = names.filter(n => /^browser_|^user_browser$/.test(n));
        const termNames = names.filter(n => /^shell_|^terminal_manager$|^repo_run_command$/.test(n));
        check(`${browserNames.length} أداة متصفح مسجّلة`, browserNames.length >= 29, String(browserNames.length));
        check(`${termNames.length} أدوات طرفية مسجّلة`, termNames.length >= 4, termNames.join(','));
        const unknown: string[] = [];
        for (const n of [...browserNames, ...termNames]) {
            const r: any = await executionFirewall.runAsSystem(() =>
                executeTool(n, { __probe: true }, { sessionId: 'wire-probe', workspaceId: 'wire-probe', userId: 'wire-probe' }))
                .catch((e: any) => ({ ok: false, error: String(e?.message || e) }));
            if (/tool.*not.*found|unknown tool/i.test(String(r?.error || ''))) unknown.push(n);
        }
        check('ولا واحدة منها مفقودة عند الإرسال الحقيقي', unknown.length === 0, unknown.join(','));

        console.log('\n[6] اللوحات تسمع أحداثاً تُبَثّ فعلاً');
        const panels = ['components/terminal/EnterpriseTerminalPanel.tsx', 'components/EmbeddedBrowser.tsx',
            'components/ModernBrowserStream.tsx', 'components/MyBrowserView.tsx'].map(p => path.join(WEB, p));
        const listened = new Set<string>();
        for (const p of panels) {
            for (const m of readIf(p).matchAll(/(?:msg|data|ev|e)?\.?type\s*===\s*'([a-z_]+)'/g)) listened.add(m[1]);
        }
        // `string`/`keydown` are typeof/DOM comparisons, not wire events.
        for (const noise of ['string', 'number', 'object', 'keydown']) listened.delete(noise);
        const apiSource = apiFiles.map(readIf).join('\n');
        const orphanEvents = [...listened].filter(ev => !new RegExp(`type:\\s*'${ev}'`).test(apiSource));
        check(`${listened.size} حدثاً تنتظرها اللوحات — كلها يبثّها الخادم`,
            orphanEvents.length === 0, orphanEvents.join(', '));
    } finally {
        try { a.ws.close(); b.ws.close(); } catch { }
        try {
            await fetch(`${base}/api/tools/terminal_manager/execute`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'kill', id: TERM_A }),
            });
        } catch { }
        server.close();
    }

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
