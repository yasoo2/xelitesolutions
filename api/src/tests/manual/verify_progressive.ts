/**
 * PROOF: the preview grows WHILE the build runs.
 *
 * A stub provider writes sections with a small real delay. While
 * tool.execute() is still in flight we sample the partial file on disk every
 * 120ms and record how many <section> elements it holds. The proof is an
 * increasing sequence observed BEFORE the build finishes — the page visibly
 * grew section by section, not in one final drop.
 *
 *   JWT_SECRET=x npx tsx src/tests/manual/verify_progressive.ts
 */
import http from 'http';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = process.env.ARTIFACT_DIR || '/tmp/joe-artifacts';
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

function sectionFor(id: string): string {
    return `<section class="section" id="${id}"><h2>قسم ${id}</h2>
  <p>محتوى عربي حقيقي كافٍ لهذا القسم مع جملة ثانية ليكون النص طبيعياً ومقبول الحجم للفحص.</p>
  <p>وفقرة أخيرة عن الجودة والتفاصيل الدقيقة التي يهتم بها العملاء دائماً.</p></section>`;
}

const stub = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
        let messages: any[] = []; let wantsStream = false;
        try { const p = JSON.parse(body); messages = p.messages || []; wantsStream = !!p.stream; } catch { /* */ }
        const system = String(messages.find(m => m.role === 'system')?.content || '');
        const id = (system.match(/must be a single <section class="section" id="([a-z0-9_-]+)"/i)
            || system.match(/<section class="section" id="([a-z0-9_-]+)"/i) || [])[1] || 'part';
        const content = /^Write section \d+/.test(String([...messages].reverse().find(m => m.role === 'user')?.content || ''))
            ? sectionFor(id)
            : '<!DOCTYPE html><html lang="ar" dir="rtl"><head><title>ص</title></head><body><h1>ص</h1></body></html>';
        // A real, small delay per call — long enough for the sampler to catch
        // the page mid-growth, short enough to keep the proof quick.
        setTimeout(() => {
            if (wantsStream) {
                res.writeHead(200, { 'content-type': 'text/event-stream' });
                for (let i = 0; i < content.length; i += 200) {
                    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: content.slice(i, i + 200) } }] })}\n\n`);
                }
                res.write('data: [DONE]\n\n');
                res.end();
            } else {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }] }));
            }
        }, 350);
    });
});

(async () => {
    await new Promise<void>(r => stub.listen(0, '127.0.0.1', r));
    const port = (stub.address() as any).port;
    const modelConfig = { provider: 'openai', model: 'stub', apiKey: 'sk-stub', baseUrl: `http://127.0.0.1:${port}/v1` };
    const { WebPageBuilderTool } = require('../../modules/tools/definitions/WebPageBuilderTool');
    const tool = new WebPageBuilderTool();
    const sessionId = 'progressive-proof';
    const partial = path.join(ARTIFACT_DIR, `joe-${sessionId}.html`);
    try { fs.unlinkSync(partial); } catch { /* fresh */ }

    const samples: number[] = [];
    const sampler = setInterval(() => {
        try {
            const n = (fs.readFileSync(partial, 'utf-8').match(/<section class="section"/g) || []).length;
            if (n !== samples[samples.length - 1]) samples.push(n);
        } catch { /* not written yet */ }
    }, 120);

    const res: any = await tool.execute(
        { request: 'ابني موقعاً لمقهى اسمه «البنّ الذهبي» فيه قائمة المشروبات وقصة المكان وطرق التواصل' },
        { sessionId, userId: 'proof', modelConfig },
    ).catch((e: any) => ({ ok: false, error: String(e) }));
    clearInterval(sampler);

    const finalCount = (() => {
        try { return (fs.readFileSync(partial, 'utf-8').match(/<section class="section"/g) || []).length; } catch { return -1; }
    })();
    console.log(`BUILD ok=${!!res?.ok}`);
    console.log(`GROWTH SAMPLES (sections on disk over time): [${samples.join(' → ')}]`);
    console.log(`FINAL sections in the file: ${finalCount}`);
    const grewLive = samples.length >= 3 && samples.every((v, i) => i === 0 || v > samples[i - 1]);
    console.log(grewLive && res?.ok
        ? '✅ PROGRESSIVE PREVIEW PROVEN: the page grew on disk section by section WHILE the build ran'
        : '❌ NOT PROVEN');
    stub.close();
    process.exit(grewLive && res?.ok ? 0 : 1);
})();
