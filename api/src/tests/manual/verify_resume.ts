/**
 * PROOF: an interrupted build resumes from its checkpoint.
 *
 * Act 1 — a stub provider answers 4 section requests, then starts returning
 *         429 (exactly what Groq's exhausted free tier does). The build fails,
 *         but the 4 accepted sections must survive in the checkpoint.
 * Act 2 — the same request again, provider healthy. The build must REUSE the
 *         4 checkpointed sections (log lines say so), ask the model only for
 *         the missing ones, finish, and delete the checkpoint.
 *
 *   npx tsx src/tests/manual/verify_resume.ts
 */
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = process.env.ARTIFACT_DIR || '/tmp/joe-artifacts';
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

let sectionCalls = 0;
let failAfter = Infinity;

function sectionFor(id: string): string {
    return `<section class="section" id="${id}">
  <h2>عنوان قسم ${id}</h2>
  <p>محتوى عربي حقيقي لهذا القسم يشرح الخدمة بتفصيل كافٍ ليتجاوز حدود الحجم الدنيا،
     مع جملة ثانية تجعل الفقرة طبيعية ومقروءة، وجملة ثالثة للاكتمال.</p>
  <p>فقرة إضافية عن الجودة والالتزام والتفاصيل الصغيرة التي تصنع الفرق للعملاء.</p>
</section>`;
}

const stub = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
        let messages: any[] = [];
        let wantsStream = false;
        try { const parsed = JSON.parse(body); messages = parsed.messages || []; wantsStream = !!parsed.stream; } catch { /* not json */ }
        const user = String([...messages].reverse().find(m => m.role === 'user')?.content || '');
        const system = String(messages.find(m => m.role === 'system')?.content || '');
        const isSection = /^Write section \d+/.test(user);
        if (isSection) sectionCalls++;

        if (sectionCalls > failAfter) {
            res.writeHead(429, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'Rate limit reached. Please try again in 24m40s.' } }));
            return;
        }
        // The prompt names the REQUIRED wrapper verbatim:
        //   <section class="section" id="<plan.id>"> — match that exact phrase,
        // not the first id= in the prompt (the design brief contains many).
        // The MANDATE line names the required wrapper; earlier example snippets
        // in the spec may carry other ids, so anchor on the mandate itself.
        const id = (system.match(/must be a single <section class="section" id="([a-z0-9_-]+)"/i)
            || system.match(/<section class="section" id="([a-z0-9_-]+)"/i) || [])[1] || 'part';
        if (isSection && process.env.RESUME_DEBUG) {
            console.error(`STUB| call#${sectionCalls} user="${user.slice(0, 40)}" -> id="${id}" mandate=${/must be a single <section/.test(system)}`);
        }
        const content = isSection ? sectionFor(id) : '<!DOCTYPE html><html lang="ar" dir="rtl"><head><title>ص</title></head><body><h1>ص</h1></body></html>';
        // A stream:true request must get real SSE — answering it with JSON makes
        // the router fall back to a SECOND buffered call, doubling the count.
        if (wantsStream) {
            res.writeHead(200, { 'content-type': 'text/event-stream' });
            for (let i = 0; i < content.length; i += 200) {
                res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: content.slice(i, i + 200) } }] })}\n\n`);
            }
            res.write('data: [DONE]\n\n');
            res.end();
            return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }] }));
    });
});

(async () => {
    await new Promise<void>(r => stub.listen(0, '127.0.0.1', r));
    const port = (stub.address() as any).port;
    const modelConfig = { provider: 'openai', model: 'stub', apiKey: 'sk-stub', baseUrl: `http://127.0.0.1:${port}/v1` };
    const { WebPageBuilderTool } = require('../../modules/tools/definitions/WebPageBuilderTool');
    const tool = new WebPageBuilderTool();
    const request = 'ابني موقعاً لمطعم شامي اسمه «الأصالة» فيه قائمة الطعام وقسم الحجز وآراء الزبائن';
    const ctx = { sessionId: 'resume-proof', userId: 'proof', modelConfig };

    // ── Act 1: the provider dies after 4 sections ────────────────────────
    sectionCalls = 0; failAfter = 4;
    const r1: any = await tool.execute({ request }, ctx).catch((e: any) => ({ ok: false, error: String(e) }));
    const cpDir = path.join(ARTIFACT_DIR, '.checkpoints');
    const cpFiles = fs.existsSync(cpDir) ? fs.readdirSync(cpDir).filter(f => f.endsWith('.json')) : [];
    const cp = cpFiles.length ? JSON.parse(fs.readFileSync(path.join(cpDir, cpFiles[0]), 'utf-8')) : null;
    console.log(`ACT1: build ok=${!!r1?.ok} | section calls made=${sectionCalls} | checkpointed sections=${cp ? Object.keys(cp.sections).length : 0}`);
    (r1?.logs || []).filter((l: string) => /^section /.test(l)).forEach((l: string) => console.log('  A1| ' + l));
    if (!cp || Object.keys(cp.sections).length !== 4) { console.log('❌ expected exactly 4 checkpointed sections'); process.exit(1); }

    // ── Act 2: provider healthy — the build must resume, not restart ────
    sectionCalls = 0; failAfter = Infinity;
    const r2: any = await tool.execute({ request }, ctx).catch((e: any) => ({ ok: false, error: String(e) }));
    // Per-SECTION lines only — the build summary also mentions the checkpoint.
    const resumedLines = (r2?.logs || []).filter((l: string) => /^section \d+ .*resumed from checkpoint/.test(l));
    const summary = (r2?.logs || []).find((l: string) => l.includes('section-wise build:')) || '';
    console.log(`ACT2: build ok=${!!r2?.ok} | NEW section calls=${sectionCalls} | resumed=${resumedLines.length}`);
    console.log('      ' + summary.trim());
    resumedLines.slice(0, 4).forEach((l: string) => console.log('      ' + l.trim()));
    const cpAfter = fs.existsSync(cpDir) ? fs.readdirSync(cpDir).filter(f => f.endsWith('.json')) : [];
    console.log(`      checkpoint cleared after success: ${cpAfter.length === 0}`);

    const pass = !!r2?.ok && resumedLines.length === 4 && sectionCalls > 0 && cpAfter.length === 0;
    console.log(pass ? '✅ RESUME PROVEN: 4 sections reused, model asked only for the rest, checkpoint cleaned up'
        : '❌ RESUME NOT PROVEN');
    stub.close();
    process.exit(pass ? 0 : 1);
})();
