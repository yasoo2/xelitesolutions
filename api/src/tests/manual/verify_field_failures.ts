/**
 * WIRE PROOF — the three defects from the user's «لقد فشل» runtime log,
 * replayed against the REAL modules over REAL HTTP:
 *
 *   1. «حلل هذه الصوره» + injected blocks planned as «browse then write
 *      is.txt» → must now plan central_answer, before every fast-path.
 *   2. «[RESPONSE LANGUAGE …]: The user's language is English» over an
 *      Arabic goal (UI switcher = English) → the block and the tool
 *      context must both say Arabic.
 *   3. «[Vision] ollama:llava:latest failed: timeout» → with moondream
 *      installed alongside llava, moondream is asked FIRST and llava is
 *      never needed; a llava-only machine pulls moondream; the fast eyes
 *      are warmed at boot.
 *
 * A fake Ollama daemon (real HTTP server) stands in for the user's laptop.
 */
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.PERSISTENCE_MODE = 'JSON';
process.env.MOCK_DB = 'true';
process.env.OFFLINE_MODE = 'true';
delete process.env.GROQ_API_KEY;
delete process.env.JOE_VISION_BASE_URL;

const PNG_1x1 = Buffer.from(
    'iVBORw0KGgoAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = '') {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}

/** Fake Ollama: /api/tags, /v1/chat/completions, /api/generate, /api/pull. */
function fakeOllama(models: string[], seen: { chatModels: string[]; warmed: string[]; pulled: string[] }) {
    return http.createServer((req, res) => {
        let body = '';
        req.on('data', c => (body += c));
        req.on('end', () => {
            res.setHeader('Content-Type', 'application/json');
            if (req.url === '/api/tags') {
                res.end(JSON.stringify({ models: models.map(name => ({ name })) }));
            } else if (req.url === '/v1/chat/completions') {
                const model = String(JSON.parse(body || '{}')?.model || '');
                seen.chatModels.push(model);
                res.end(JSON.stringify({ choices: [{ message: { content: 'لقطة شاشة لصفحة هبوط داكنة تحمل شعار XELITE الذهبي وزرّين رئيسيين' } }] }));
            } else if (req.url === '/api/generate') {
                seen.warmed.push(String(JSON.parse(body || '{}')?.model || ''));
                res.end(JSON.stringify({ done: true }));
            } else if (req.url === '/api/pull') {
                seen.pulled.push(String(JSON.parse(body || '{}')?.name || ''));
                res.end(JSON.stringify({ status: 'success' }));
            } else { res.statusCode = 404; res.end('{}'); }
        });
    });
}

async function main() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-field-'));
    const imgPath = path.join(tmp, 'لقطة شاشة 2026-07-31 013631.png');
    fs.writeFileSync(imgPath, PNG_1x1);

    // ---------------------------------------------------------------- (1)
    console.log('\n[1] Planner: the field goal routes to central_answer, not browse-then-write');
    const { PlanningEngine } = await import('../../core/orchestrator/PlanningEngine');
    const FIELD_GOAL =
        'حلل هذه الصوره' +
        '\n\n[ATTACHED FILES — the user attached 1 file(s) to this message. Read them; the message refers to them.]' +
        '\n--- (1) لقطة شاشة 2026-07-31 013631.png — image/png, 1.1 MB' +
        '\n(binary image file — no text content, and NO vision analysis was available for this run: you have NOT seen this file. ' +
        'Do NOT invent or guess its contents, dimensions, dates or any metadata — the filename is a name, not data. ' +
        'Tell the user plainly that image analysis is unavailable right now. The raw file is on disk at: C:/Users/home/uploads/screen.png)' +
        '\n\n[RESPONSE LANGUAGE — NON-NEGOTIABLE]: The user\'s language is Arabic (العربية). Write EVERY word of your reply in it.';
    const plan = await PlanningEngine.generatePlan({ intent: { goal: FIELD_GOAL, complexity: 'low', riskLevel: 'low', rawIntent: {} } as any });
    check('field goal plans central_answer', plan.steps[0]?.tool === 'central_answer', `got ${plan.steps[0]?.tool}`);
    check('single direct step, no browser node', plan.steps.length === 1 && !plan.steps.some(s => /browser|write_file/.test(s.tool)));

    // ---------------------------------------------------------------- (2+3)
    console.log('\n[2] Vision order + [3] language: full AgentLoopService run over a fake Ollama with llava AND moondream');
    const seen = { chatModels: [] as string[], warmed: [] as string[], pulled: [] as string[] };
    const srv = fakeOllama(['llava:latest', 'qwen2.5-coder:7b', 'moondream:latest'], seen);
    await new Promise<void>(r => srv.listen(0, '127.0.0.1', r));
    const port = (srv.address() as any).port;
    process.env.LOCAL_LLM_BASE_URL = `http://127.0.0.1:${port}/v1`;

    const { AgentOrchestrator } = await import('../../orchestration/AgentOrchestrator');
    const captured: { goal?: string; language?: string } = {};
    (AgentOrchestrator.prototype as any).execute = async function (req: any) {
        captured.goal = String(req?.goal || '');
        captured.language = String(req?.context?.language || '');
        return { ok: true, results: [{ ok: true, output: 'تم' }] };
    };
    const { AgentLoopService } = await import('../../modules/services/AgentLoopService');
    const att = { name: 'لقطة شاشة 2026-07-31 013631.png', mimeType: 'image/png', size: PNG_1x1.length, content: '', path: imgPath };
    // UI switcher = English (the field condition), message = Arabic.
    await AgentLoopService.execute('حلل هذه الصوره', { sessionId: 's1', attachments: [att as any], language: 'en' });

    check('moondream asked FIRST (llava never needed)', seen.chatModels[0] === 'moondream:latest', `order: ${seen.chatModels.join(' → ')}`);
    check('image ANALYZED into the goal block', !!captured.goal?.includes('ANALYZED by a vision model') && !!captured.goal?.includes('XELITE'));
    check('RESPONSE LANGUAGE block says Arabic despite UI=English', !!captured.goal?.includes("The user's language is Arabic"), captured.goal?.match(/The user's language is [^.]+/)?.[0] || 'block missing');
    check('context.language handed to tools is ar', captured.language === 'ar', `got «${captured.language}»`);

    // ---------------------------------------------------------------- (3b)
    console.log('\n[3b] Boot: fast eyes warmed; a llava-only machine pulls moondream');
    const lb = await import('../../core/llm/local-brain');
    await lb.detectLocalModels();
    await lb.warmUpLocalBrain();
    check('warm-up includes moondream (eyes resident before the first question)', seen.warmed.includes('moondream:latest'), `warmed: ${seen.warmed.join(', ')}`);
    check('warm-up does NOT pin heavy llava', !seen.warmed.includes('llava:latest'));

    await new Promise<void>(r => srv.close(() => r()));
    const seen2 = { chatModels: [] as string[], warmed: [] as string[], pulled: [] as string[] };
    const srv2 = fakeOllama(['llava:latest', 'qwen2.5-coder:7b'], seen2);   // llava ONLY — the user's machine today
    await new Promise<void>(r => srv2.listen(0, '127.0.0.1', r));
    process.env.LOCAL_LLM_BASE_URL = `http://127.0.0.1:${(srv2.address() as any).port}/v1`;
    await lb.detectLocalModels();
    lb.ensureLocalVisionModel();
    await new Promise(r => setTimeout(r, 400));   // background pull settles
    check('llava-only machine pulls moondream anyway', seen2.pulled.includes('moondream'), `pulled: ${seen2.pulled.join(', ') || 'nothing'}`);
    await new Promise<void>(r => srv2.close(() => r()));

    // ---------------------------------------------------------------- (2b)
    console.log('\n[2b] messageLanguage edges');
    const { messageLanguage } = await import('../../shared/utils/language');
    check('Arabic message + English UI → ar', messageLanguage('حلل هذه الصوره', 'en') === 'ar');
    check('English message + Arabic UI → en', messageLanguage('Please analyze this screenshot', 'ar') === 'en');
    check('no-signal message keeps the switcher', messageLanguage('ok', 'ar') === 'ar');

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
