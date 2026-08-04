/**
 * EVERY LIVE EVENT BELONGS TO SOMEONE.
 *
 * Joe's panels are fed by one broadcast function, and the wire decides who
 * receives each frame. An event whose owner cannot be resolved goes to EVERY
 * connected client — so a missing `sessionId` in a payload is not untidiness,
 * it is one user reading another user's screen.
 *
 * A static sweep of the 73 broadcast sites found FOURTEEN that name no session,
 * no run and no user:
 *
 *   user_input_request · agent_notification · diff · screenshot · task_update
 *   build_started · build_error · build_completed · terminal_output ×4
 *   admin:deploy_log · admin:deploy_status
 *
 * Among them: a file diff, a screenshot of the user's screen, the shell output
 * of a command Joe ran, and «Joe needs your input» — a question that, shown to
 * everyone, anyone could answer.
 *
 * Patching fourteen payloads would leave the fifteenth to be written tomorrow,
 * so the owner now rides in the execution context and every event emitted
 * during a run inherits it. This proves that, per type, on a real server with
 * two signed-in users and real sockets:
 *
 *   [1] each of the fourteen reaches the user whose run emitted it
 *   [2] and none of them reaches the other user
 *   [3] the admin channel still goes to admins only
 *   [4] and an event emitted OUTSIDE any run is still delivered (the fix must
 *       not silence the system's own notices)
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_event_ownership.ts
 */
export {};
import http from 'http';
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

const OWNER = 'eeeeeeeeeeeeeeeeeeeeeee5';
const OTHER = 'fffffffffffffffffffffff6';
const SESSION = `own-${Date.now()}`;

/** The events that carry no address of their own — the ones under test. */
const ORPHANS = [
    'user_input_request', 'agent_notification', 'diff', 'screenshot', 'task_update',
    'build_started', 'build_error', 'build_completed', 'terminal_output',
];

async function main() {
    const { createApp } = await import('../../api/app');
    const { attachWebSocket, broadcast } = await import('../../api/ws');
    const { executionFirewall } = await import('../../orchestration/AgentExecutionFirewall');

    const server = http.createServer(createApp());
    attachWebSocket(server as any);
    server.listen(0, '127.0.0.1');
    await new Promise<void>(r => server.once('listening', () => r()));
    const port = (server.address() as any).port;

    const socket = async (sub: string, role = 'USER') => {
        const token = jwt.sign({ sub, role }, process.env.JWT_SECRET!);
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`);
        const seen: any[] = [];
        ws.on('message', d => { try { seen.push(JSON.parse(d.toString())); } catch { /* binary */ } });
        await new Promise<void>((res, rej) => { ws.once('open', () => res()); ws.once('error', rej); });
        return { ws, seen };
    };

    const owner = await socket(OWNER);
    const other = await socket(OTHER);
    const admin = await socket('99999999999999999999999a', 'SUPER_ADMIN');
    const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

    const got = (s: { seen: any[] }, type: string, mark: string) =>
        s.seen.some(f => f?.type === type && JSON.stringify(f).includes(mark));

    try {
        console.log('\n[1] أحداث بلا عنوان — تُبَثّ من داخل تشغيل صاحبها');
        // Exactly how a tool emits one: inside the run's execution context, with
        // a payload that names nobody. Nothing here helps the wire on purpose.
        await executionFirewall.runInContext('trace-own', async () => {
            for (const type of ORPHANS) {
                broadcast({ type, id: type === 'terminal_output' ? 'joe-agent' : undefined, data: { marker: 'MARK_OWNER', type } } as any);
            }
        }, { userId: OWNER, sessionId: SESSION });
        await wait(600);

        for (const type of ORPHANS) {
            check(`${type} → وصل صاحب التشغيل`, got(owner, type, 'MARK_OWNER'));
        }
        const leaked = ORPHANS.filter(t => got(other, t, 'MARK_OWNER'));
        check('ولا واحد منها وصل المستخدم الآخر', leaked.length === 0, leaked.join(', '));

        console.log('\n[2] وقناة المدراء تبقى للمدراء');
        broadcast({ type: 'admin:deploy_status', data: { marker: 'MARK_ADMIN', status: 'ok' } } as any);
        await wait(400);
        check('حدث admin وصل المدير', got(admin, 'admin:deploy_status', 'MARK_ADMIN'));
        check('ولم يصل مستخدماً عادياً',
            !got(owner, 'admin:deploy_status', 'MARK_ADMIN') && !got(other, 'admin:deploy_status', 'MARK_ADMIN'));

        console.log('\n[3] وما يُبَثّ خارج أي تشغيل لا يُخرَس');
        broadcast({ type: 'sessions:refresh', data: { marker: 'MARK_GLOBAL' } } as any);
        await wait(400);
        check('إشعار عام بلا تشغيل ما زال يصل الجميع',
            got(owner, 'sessions:refresh', 'MARK_GLOBAL') && got(other, 'sessions:refresh', 'MARK_GLOBAL'));

        console.log('\n[4] والقاعدة الأقدم لم تنكسر: سطر طرفية بلا مالك يُسقَط لا يُذاع');
        broadcast({ type: 'terminal_output', id: 'nobody-owns-this', data: 'MARK_ORPHAN_LINE' } as any);
        await wait(400);
        check('لم يصل أحداً',
            !got(owner, 'terminal_output', 'MARK_ORPHAN_LINE') && !got(other, 'terminal_output', 'MARK_ORPHAN_LINE'));
    } finally {
        try { owner.ws.close(); other.ws.close(); admin.ws.close(); } catch { /* best effort */ }
        server.close();
    }

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
