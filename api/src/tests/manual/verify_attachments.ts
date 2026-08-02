/**
 * LIVE WIRE PROOF — the paperclip, end to end over real HTTP.
 *
 * What broke: the composer uploaded the file and sent fileIds with the
 * message; /runs/start never read them, so Joe answered «لخص هذا الملف»
 * blind. This proof drives the REAL express app:
 *
 *   1. POST /api/files/upload (real multer, real JWT) with a text file and
 *      an image — asserts the text was extracted at upload time;
 *   2. POST /api/runs/start with those fileIds — the agent entrypoint is
 *      captured (no model call is burned), and the proof asserts the run
 *      received BOTH attachments with the text file's actual content;
 *   3. formats the captured attachments with the same formatter the run
 *      uses and asserts the goal-block carries the file's words.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_attachments.ts
 */
import fs from 'fs';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.PERSISTENCE_MODE = process.env.PERSISTENCE_MODE || 'JSON';
process.env.OFFLINE_MODE = 'true';

const PNG_1x1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

async function main() {
    const jwt = require('jsonwebtoken');
    const { AgentLoopService } = await import('../../modules/services/AgentLoopService');
    const { formatAttachmentsBlock } = await import('../../shared/attachments');

    // Capture the run instead of running it: the proof is about what REACHES
    // the agent, and a full agent loop would spend the daily model quota.
    let captured: any = null;
    const realExecute = AgentLoopService.execute;
    (AgentLoopService as any).execute = async (goal: string, options: any) => {
        captured = { goal, options };
        return { ok: true, answer: 'captured' };
    };

    const { createApp } = await import('../../api/app');
    const app = createApp();
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(r => server.once('listening', () => r()));
    const port = (server.address() as any).port;
    const base = `http://127.0.0.1:${port}/api`;
    const token = jwt.sign({ sub: 'proof-user', role: 'OWNER', email: 'proof@local' }, 'x');
    const auth = { Authorization: `Bearer ${token}` };

    const ARABIC_MARKER = 'الميزانية التقديرية للمشروع ثلاثون ألف دولار';

    // ---- 1. upload a real text file and a real image ------------------------
    const fd1 = new FormData();
    fd1.append('file', new Blob([`# خطة العمل\n${ARABIC_MARKER}\nالبند الثاني: التسويق.`], { type: 'text/markdown' }), 'plan.md');
    fd1.append('sessionId', 'proof-session');
    const up1 = await fetch(`${base}/files/upload`, { method: 'POST', headers: auth, body: fd1 as any });
    const f1 = await up1.json();

    const fd2 = new FormData();
    fd2.append('file', new Blob([PNG_1x1], { type: 'image/png' }), 'shot.png');
    fd2.append('sessionId', 'proof-session');
    const up2 = await fetch(`${base}/files/upload`, { method: 'POST', headers: auth, body: fd2 as any });
    const f2 = await up2.json();

    // ---- 2. send the message the way the composer does ----------------------
    const runRes = await fetch(`${base}/runs/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({
            text: 'لخص لي الملف المرفق',
            sessionId: 'proof-session',
            fileIds: [f1?.id, f2?.id],
            language: 'ar',
        }),
    });
    const runBody = await runRes.json();
    // /runs/start replies immediately; the (patched) execute runs in the background.
    for (let i = 0; i < 50 && !captured; i++) await new Promise(r => setTimeout(r, 100));

    (AgentLoopService as any).execute = realExecute;
    server.close();

    // ---- 3. assert every link of the chain ----------------------------------
    const atts = captured?.options?.attachments || [];
    const md = atts.find((a: any) => a.name === 'plan.md');
    const png = atts.find((a: any) => a.name === 'shot.png');
    const block = formatAttachmentsBlock(atts);

    const checks: Array<[string, boolean]> = [
        [`upload accepted the text file and EXTRACTED its content (id=${String(f1?.id).slice(0, 8)}…)`,
            up1.status === 200 && !!f1?.id && String(f1?.content || '').includes(ARABIC_MARKER)],
        [`upload accepted the image (id=${String(f2?.id).slice(0, 8)}…)`, up2.status === 200 && !!f2?.id],
        ['/runs/start answered ok and fired the run', runRes.status === 200 && runBody?.ok === true],
        [`the run RECEIVED ${atts.length}/2 attachments (the dropped-fileIds bug)`, atts.length === 2],
        ['the text attachment reached the run WITH its extracted content', !!md && String(md.content).includes(ARABIC_MARKER)],
        ['the image reached the run with its on-disk path', !!png && !!String(png.path || '').length],
        ['the goal-block the model reads carries the file\'s actual words', block.includes(ARABIC_MARKER) && block.includes('plan.md')],
        ['…and declares the image instead of dropping it', block.includes('shot.png') && block.includes('binary image file')],
    ];

    let failed = 0;
    for (const [name, ok] of checks) { console.log(`${ok ? '✅' : '❌'} ${name}`); if (!ok) failed++; }
    if (failed && captured) console.log('\ncaptured options were:', JSON.stringify({ ...(captured as any).options, attachments: atts.map((a: any) => ({ ...a, content: String(a.content).slice(0, 60) })) }, null, 1).slice(0, 1500));
    console.log(failed === 0
        ? '\nPROOF COMPLETE: what the user attaches now reaches the run, content and all, over the real HTTP chain.'
        : `\n${failed} CHECK(S) FAILED`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('harness crashed:', e); process.exit(1); });
