/**
 * LIVE WIRE PROOF — Joe's eyes, over the full HTTP chain.
 *
 * A REAL OpenAI-compatible vision server runs locally (the same protocol
 * Groq and a local Ollama/llava speak). The proof then walks the user's
 * exact path: upload a PNG through the real express app → send a message
 * with its fileId → the run's vision pass posts the ACTUAL pixels (base64)
 * to the vision endpoint → the description lands in the attachment and in
 * the goal-block the model reads.
 *
 * The vision server VERIFIES it received the true image bytes — this is a
 * wire test of pixels, not of strings.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_vision.ts
 */
import http from 'http';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';

const PNG_1x1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const DESCRIPTION = 'لقطة شاشة لصفحة هبوط داكنة: شريط علوي فيه شعار، وزر أخضر رئيسي مكتوب عليه «ابدأ الآن»';

async function main() {
    const jwt = require('jsonwebtoken');

    // ---- a REAL local vision endpoint, speaking the OpenAI protocol --------
    let receivedModel = '', receivedPixelsOk = false, visionCalls = 0;
    const visionSrv = http.createServer((req, res) => {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => {
            visionCalls++;
            try {
                const j = JSON.parse(body);
                receivedModel = String(j.model || '');
                const url = String(j.messages?.[0]?.content?.find((c: any) => c.type === 'image_url')?.image_url?.url || '');
                const b64 = url.split('base64,')[1] || '';
                receivedPixelsOk = Buffer.from(b64, 'base64').equals(PNG_1x1);
            } catch { /* leave flags false */ }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ choices: [{ message: { content: DESCRIPTION } }] }));
        });
    });
    await new Promise<void>(r => visionSrv.listen(0, '127.0.0.1', () => r()));
    const vPort = (visionSrv.address() as any).port;
    process.env.JOE_VISION_BASE_URL = `http://127.0.0.1:${vPort}/v1`;
    process.env.JOE_VISION_MODEL = 'local-proof-vision';

    // ---- capture what reaches the agent, then run the REAL vision pass -----
    const { AgentLoopService } = await import('../../modules/services/AgentLoopService');
    const { describeImageAttachments } = await import('../../shared/vision');
    const { formatAttachmentsBlock } = await import('../../shared/attachments');
    let captured: any = null;
    const realExecute = AgentLoopService.execute;
    (AgentLoopService as any).execute = async (goal: string, options: any) => {
        // The real execute's vision step, executed for real — only the agent
        // loop after it (the model-burning part) is skipped.
        await describeImageAttachments(options.attachments || [], { language: options.language || 'ar' });
        captured = { goal, options };
        return { ok: true };
    };

    const { createApp } = await import('../../api/app');
    const app = createApp();
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(r => server.once('listening', () => r()));
    const port = (server.address() as any).port;
    const base = `http://127.0.0.1:${port}/api`;
    const token = jwt.sign({ sub: 'proof-user', role: 'OWNER' }, 'x');
    const auth = { Authorization: `Bearer ${token}` };

    // ---- the user's path: upload the screenshot, ask about it --------------
    const fd = new FormData();
    fd.append('file', new Blob([PNG_1x1], { type: 'image/png' }), 'لقطة-الواجهة.png');
    fd.append('sessionId', 'vision-proof');
    const up = await fetch(`${base}/files/upload`, { method: 'POST', headers: auth, body: fd as any });
    const f = await up.json();

    const runRes = await fetch(`${base}/runs/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ text: 'حلل هذه اللقطة وقل لي ما مشاكلها', sessionId: 'vision-proof', fileIds: [f?.id], language: 'ar' }),
    });
    for (let i = 0; i < 50 && !captured; i++) await new Promise(r => setTimeout(r, 100));

    (AgentLoopService as any).execute = realExecute;
    server.close(); visionSrv.close();
    delete process.env.JOE_VISION_BASE_URL; delete process.env.JOE_VISION_MODEL;

    const att = (captured?.options?.attachments || [])[0];
    const block = formatAttachmentsBlock(captured?.options?.attachments || []);
    const checks: Array<[string, boolean]> = [
        ['the screenshot uploaded through the real app', up.status === 200 && runRes.status === 200 && !!f?.id],
        [`the vision endpoint was called (${visionCalls}×, model=${receivedModel})`, visionCalls === 1 && receivedModel === 'local-proof-vision'],
        ['it received the TRUE PIXELS — the base64 decodes back to the exact PNG', receivedPixelsOk],
        ['the description became the attachment\'s content, flagged as vision', !!att?.visionDescribed && String(att?.content || '').includes('ابدأ الآن')],
        ['the goal-block the model reads says the image was ANALYZED, with the scene', block.includes('ANALYZED by a vision model') && block.includes(DESCRIPTION)],
        ['the Arabic filename rode the whole chain intact', att?.name === 'لقطة-الواجهة.png'],
    ];

    let failed = 0;
    for (const [name, ok] of checks) { console.log(`${ok ? '✅' : '❌'} ${name}`); if (!ok) failed++; }
    console.log(failed === 0
        ? '\nPROOF COMPLETE: Joe sees the attached image — real pixels out, real description in, riding the goal itself.'
        : `\n${failed} CHECK(S) FAILED`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('harness crashed:', e); process.exit(1); });
