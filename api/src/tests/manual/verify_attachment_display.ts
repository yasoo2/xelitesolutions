/**
 * LIVE WIRE PROOF — the attachment is VISIBLE in the chat, and stays visible.
 *
 * The user's question: «المرفق المرفوع يظهر في واجهة دردشة جو بشكل صحيح؟».
 * The live bubble always showed chips (the composer sends {text, files} to
 * itself optimistically) — but the two OTHER ways a message reaches the chat
 * lost them: the server's WS echo carried text only, and a page RELOAD
 * rebuilt history from storage that never kept attachment meta. This proof
 * drives the repaired chain over real HTTP:
 *
 *   upload → /runs/start → GET /sessions/:id/history
 *
 * and asserts the history's user_input event carries the file chips in the
 * exact {text, files} shape the bubble renders.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_attachment_display.ts
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';

async function main() {
    const jwt = require('jsonwebtoken');
    const { AgentLoopService } = await import('../../modules/services/AgentLoopService');
    const realExecute = AgentLoopService.execute;
    (AgentLoopService as any).execute = async () => ({ ok: true });

    const { createApp } = await import('../../api/app');
    const app = createApp();
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(r => server.once('listening', () => r()));
    const port = (server.address() as any).port;
    const base = `http://127.0.0.1:${port}/api`;
    const token = jwt.sign({ sub: 'proof-user', role: 'OWNER' }, 'x');
    const auth = { Authorization: `Bearer ${token}` };
    const sid = `display-proof-${Date.now()}`;

    // Upload one real file.
    const fd = new FormData();
    fd.append('file', new Blob(['محضر الاجتماع الأول'], { type: 'text/plain' }), 'محضر.txt');
    fd.append('sessionId', sid);
    const up = await fetch(`${base}/files/upload`, { method: 'POST', headers: auth, body: fd as any });
    const f = await up.json();

    // Send the message the composer's way.
    const run = await fetch(`${base}/runs/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ text: 'لخص المحضر المرفق', sessionId: sid, fileIds: [f?.id], language: 'ar' }),
    });

    // Reload the page, effectively: rebuild the chat from stored history.
    const histRes = await fetch(`${base}/sessions/${encodeURIComponent(sid)}/history`, { headers: auth });
    const hist = await histRes.json().catch(() => null);
    const events: any[] = Array.isArray(hist) ? hist : (hist?.events || []);
    const userEv = events.find((e: any) => e?.type === 'user_input');
    const files = userEv?.data?.files || [];

    (AgentLoopService as any).execute = realExecute;
    server.close();

    const checks: Array<[string, boolean]> = [
        ['upload + run accepted', up.status === 200 && run.status === 200],
        [`history endpoint answers (${histRes.status}, ${events.length} events)`, histRes.status === 200 && events.length > 0],
        ['the reloaded user message still says what was said', String(userEv?.data?.text || userEv?.data || '').includes('لخص المحضر')],
        [`…and still CARRIES its attachment chip (${files.length} file)`, files.length === 1],
        [`the chip has the pieces the bubble renders: name «${files[0]?.name}», type, size`,
            files[0]?.name === 'محضر.txt' && !!files[0]?.mimeType && Number(files[0]?.size) > 0],
        ['the chip carries META only — the file content never bloats the history', !('content' in (files[0] || { content: 1 }))],
    ];

    let failed = 0;
    for (const [name, ok] of checks) { console.log(`${ok ? '✅' : '❌'} ${name}`); if (!ok) failed++; }
    if (failed) console.log('\nuser event was:', JSON.stringify(userEv, null, 1)?.slice(0, 800));
    console.log(failed === 0
        ? '\nPROOF COMPLETE: the attachment shows in the chat and SURVIVES a reload, name and all.'
        : `\n${failed} CHECK(S) FAILED`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('harness crashed:', e); process.exit(1); });
