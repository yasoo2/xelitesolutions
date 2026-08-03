/**
 * WIRE PROOF — hygiene + durability on the REAL app:
 *
 *   1. A real authenticated request produces NO console line containing
 *      the bearer token (the old [RAW-HTTP] leak), while morgan's concise
 *      line still flows.
 *   2. A session + a run's user message land on DISK; the globals are
 *      wiped (the "restart") and the REAL routes serve the history back.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_field_hygiene.ts
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-hyg-'));
process.env.JOE_CHAT_STORE_DIR = tmp;

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function main() {
    const jwt = require('jsonwebtoken');
    const { AgentLoopService } = await import('../../modules/services/AgentLoopService');
    (AgentLoopService as any).execute = async () => ({ ok: true });
    const { createApp } = await import('../../api/app');
    const app = createApp();
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(r => server.once('listening', () => r()));
    const origin = `http://127.0.0.1:${(server.address() as any).port}`;
    const token = jwt.sign({ sub: 'hyg', role: 'OWNER', email: 'y@example.com', exp: Math.floor(Date.now() / 1000) + 3600 }, 'x');
    const auth = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

    // ── 1. the log carries no credentials ───────────────────────────────
    console.log('\n[1] طلب حقيقي بتوكن حقيقي — السجل يجب ألا يحمل التوكن');
    const captured: string[] = [];
    const realLog = console.log;
    console.log = (...a: any[]) => { captured.push(a.map(String).join(' ')); realLog(...a); };
    await fetch(`${origin}/api/sessions?kind=chat`, { headers: auth });
    await new Promise(r => setTimeout(r, 150));
    console.log = realLog;
    const tokenTail = token.slice(-24);
    check('no console line contains the bearer token', !captured.some(l => l.includes(tokenTail)), captured.filter(l => l.includes(tokenTail)).join(' | ').slice(0, 120));
    check('no [RAW-HTTP] header dump exists anymore', !captured.some(l => l.includes('[RAW-HTTP]')));

    // ── 2. the conversation survives the "restart" ─────────────────────
    console.log('\n[2] جلسة + رسالة ← قرص ← "إعادة تشغيل" ← التاريخ يعود من المسارات الحقيقية');
    const s: any = await (await fetch(`${origin}/api/sessions`, { method: 'POST', headers: auth, body: JSON.stringify({ kind: 'chat' }) })).json();
    const sid = s?._id || s?.id;
    check('session created', !!sid, JSON.stringify(s).slice(0, 100));
    await fetch(`${origin}/api/runs/start`, { method: 'POST', headers: auth, body: JSON.stringify({ text: 'حلل هذه الصوره من فضلك', sessionId: sid, language: 'ar' }) });
    await new Promise(r => setTimeout(r, 300));
    const { flushChatStores, loadChatStores } = await import('../../api/chat-store');
    flushChatStores();
    check('both store files exist on disk', fs.existsSync(path.join(tmp, 'chat-sessions.json')) && fs.existsSync(path.join(tmp, 'chat-messages.json')));

    (global as any).mockSessions = [];       // ← the restart
    (global as any).mockMessages = [];
    loadChatStores();

    const list: any[] = await (await fetch(`${origin}/api/sessions?kind=chat`, { headers: auth })).json();
    check('the session came back after the restart', Array.isArray(list) && list.some((x: any) => String(x._id || x.id) === String(sid)), JSON.stringify(list).slice(0, 120));
    const hist: any = await (await fetch(`${origin}/api/sessions/${sid}/history`, { headers: auth })).json();
    const flat = JSON.stringify(hist);
    check('the user message came back too', flat.includes('حلل هذه الصوره من فضلك'), flat.slice(0, 160));

    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
