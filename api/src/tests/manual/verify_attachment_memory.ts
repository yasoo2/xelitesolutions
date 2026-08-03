/**
 * WIRE PROOF — the exact field sequence, replayed over the REAL app:
 *
 *   msg 1: image attached + «حلل»          → run carries the attachment
 *   msg 2: «قمم بتحليل هذه الصوره» (NO file) → attachment memory re-attaches
 *                                             the same image, vision (fake
 *                                             Ollama moondream) describes it,
 *                                             planner goes central_answer
 *   msg 3: «كم الساعة الآن؟» (NO file)       → nothing is dragged back in
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_attachment_memory.ts
 */
import http from 'http';
import fs from 'fs';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';
delete process.env.GROQ_API_KEY;
delete process.env.JOE_VISION_BASE_URL;

const PNG_1x1 = Buffer.from(
    'iVBORw0KGgoAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function main() {
    // Fake Ollama with moondream — the machine's state after the auto-pull.
    const chatModels: string[] = [];
    const ollama = http.createServer((req, res) => {
        let body = ''; req.on('data', c => (body += c));
        req.on('end', () => {
            res.setHeader('Content-Type', 'application/json');
            if (req.url === '/api/tags') res.end(JSON.stringify({ models: [{ name: 'qwen2.5-coder:7b' }, { name: 'llava:latest' }, { name: 'moondream:latest' }] }));
            else if (req.url === '/v1/chat/completions') {
                chatModels.push(String(JSON.parse(body || '{}')?.model || ''));
                res.end(JSON.stringify({ choices: [{ message: { content: 'لقطة شاشة لواجهة جو الداكنة وفيها زر زمردي دائري' } }] }));
            } else if (req.url === '/api/generate' || req.url === '/api/pull') res.end(JSON.stringify({ done: true, status: 'success' }));
            else { res.statusCode = 404; res.end('{}'); }
        });
    });
    await new Promise<void>(r => ollama.listen(0, '127.0.0.1', r));
    process.env.LOCAL_LLM_BASE_URL = `http://127.0.0.1:${(ollama.address() as any).port}/v1`;

    const jwt = require('jsonwebtoken');
    const { AgentLoopService } = await import('../../modules/services/AgentLoopService');
    const runs: Array<{ goal: string; attachments: any[] }> = [];
    const realExecute = AgentLoopService.execute.bind(AgentLoopService);
    (AgentLoopService as any).execute = async (goal: string, options: any) => {
        // Run the REAL vision pass by calling through to the real block build?
        // No — capture what the ROUTE hands over; the vision pass is proven by
        // running describeImageAttachments on the captured attachments below.
        runs.push({ goal, attachments: options.attachments || [] });
        return { ok: true };
    };
    void realExecute; // (kept for clarity: the stub replaces the heavy run only)

    const { createApp } = await import('../../api/app');
    const app = createApp();
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(r => server.once('listening', () => r()));
    const origin = `http://127.0.0.1:${(server.address() as any).port}`;
    const token = jwt.sign({ sub: 'mem-user', role: 'OWNER', email: 'y@example.com', exp: Math.floor(Date.now() / 1000) + 3600 }, 'x');
    const auth = { 'Authorization': `Bearer ${token}` };

    // ── upload the image once, like the composer does ──────────────────
    const form = new FormData();
    form.append('file', new File([new Uint8Array(PNG_1x1)], 'لقطة شاشة 2026-07-21 223601.png', { type: 'image/png' }));
    form.append('sessionId', 'mem-e2e');
    const up: any = await (await fetch(`${origin}/api/files/upload`, { method: 'POST', headers: auth, body: form })).json();
    const fileId = up?.file?.id || up?.file?._id || up?.id || up?.files?.[0]?.id;
    check('upload accepted, id issued', !!fileId, JSON.stringify(up).slice(0, 120));

    const post = (bodyObj: any) => fetch(`${origin}/api/runs/start`, {
        method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(bodyObj),
    });

    // ── msg 1: WITH fileIds ─────────────────────────────────────────────
    console.log('\n[1] «حلل» + الصورة');
    await post({ text: 'حلل', sessionId: 'mem-e2e', fileIds: [fileId], language: 'en' });
    await new Promise(r => setTimeout(r, 400));
    check('run 1 carries the attachment', runs[0]?.attachments.length === 1, `got ${runs[0]?.attachments.length}`);

    // ── msg 2: the field follow-up, NO fileIds ──────────────────────────
    console.log('\n[2] «قمم بتحليل هذه الصوره» بلا أي مرفق (تسلسل السجل حرفياً)');
    await post({ text: 'قمم بتحليل هذه الصوره', sessionId: 'mem-e2e', language: 'en' });
    await new Promise(r => setTimeout(r, 400));
    check('attachment memory re-attached the image', runs[1]?.attachments.length === 1, `got ${runs[1]?.attachments.length}`);
    check('same file rode again', runs[1]?.attachments[0]?.name === runs[0]?.attachments[0]?.name);

    // …and the REAL vision chain now describes it via moondream FIRST.
    const { describeImageAttachments } = await import('../../shared/vision');
    const att = runs[1].attachments[0];
    const r = await describeImageAttachments([att], { language: 'ar' });
    check('vision described the re-attached image', r.described === 1, `described=${r.described}`);
    check('moondream was asked first (llava never needed)', chatModels[0] === 'moondream:latest', chatModels.join(' → '));

    // …and the planner turns the full goal into a direct answer.
    const { formatAttachmentsBlock } = await import('../../shared/attachments');
    const { PlanningEngine } = await import('../../core/orchestrator/PlanningEngine');
    const goal2 = `قمم بتحليل هذه الصوره\n\n${formatAttachmentsBlock([att])}`;
    const plan = await PlanningEngine.generatePlan({ intent: { goal: goal2, complexity: 'low', riskLevel: 'low', rawIntent: {} } as any });
    check('planner: direct answer, no exiftool circus', plan.steps.length === 1 && plan.steps[0].tool === 'central_answer', plan.steps.map(s => s.tool).join(','));

    // ── msg 3: unrelated question — the old screenshot must stay away ───
    console.log('\n[3] «كم الساعة الآن؟» — سؤال لا علاقة له بالمرفق');
    await post({ text: 'كم الساعة الآن؟', sessionId: 'mem-e2e', language: 'en' });
    await new Promise(r => setTimeout(r, 400));
    check('no attachment dragged into an unrelated message', runs[2]?.attachments.length === 0, `got ${runs[2]?.attachments.length}`);

    // ── other session: memory never leaks across sessions ───────────────
    await post({ text: 'حلل هذه الصوره', sessionId: 'other-session', language: 'en' });
    await new Promise(r => setTimeout(r, 400));
    check('another session recalls nothing', runs[3]?.attachments.length === 0, `got ${runs[3]?.attachments.length}`);

    server.close(); ollama.close();
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
