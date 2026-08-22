/**
 * WIRE PROOF — OCR reads the EXACT words inside a REAL screenshot.
 *
 * A real Chromium renders a page carrying known Arabic + English strings,
 * screenshots it, and the REAL vision pass runs over it: a fake-Ollama
 * moondream supplies the scene description, local tesseract reads the
 * text — and the attachment block must carry the strings VERBATIM.
 * A second pass with NO vision provider proves the OCR layer stands alone.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_ocr.ts
 */
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
delete process.env.GROQ_API_KEY;
delete process.env.JOE_VISION_BASE_URL;

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

const EN_LINE = 'XELITE SOLUTIONS DASHBOARD';
const AR_LINE = 'لوحة التحكم الرئيسية';
const AR_BTN = 'حفظ الإعدادات';

async function main() {
    // ── 1. render a REAL screenshot with known strings ─────────────────
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-ocr-'));
    const shot = path.join(tmp, 'settings-screen.png');
    const { chromium } = require('playwright-core');
    const exe = process.env.BROWSER_EXECUTABLE_PATH || '/opt/pw-browsers/chromium';
    const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
    const page = await (await browser.newContext({ viewport: { width: 900, height: 500 } })).newPage();
    await page.setContent(`
        <div style="background:#fff;color:#000;font-family:Arial;padding:40px">
            <h1 style="font-size:44px;margin:0 0 24px">${EN_LINE}</h1>
            <h2 dir="rtl" style="font-size:44px;margin:0 0 24px">${AR_LINE}</h2>
            <div dir="rtl" style="font-size:38px;border:3px solid #000;display:inline-block;padding:12px 28px">${AR_BTN}</div>
        </div>`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot });
    await browser.close();
    check('a real screenshot exists', fs.statSync(shot).size > 5_000);

    // ── 2. full pass: fake-Ollama description + REAL OCR ───────────────
    console.log('\n[2] وصف moondream (مزيّف) + قراءة OCR حقيقية معاً');
    const ollama = http.createServer((req, res) => {
        let b = ''; req.on('data', c => (b += c));
        req.on('end', () => {
            res.setHeader('Content-Type', 'application/json');
            if (req.url === '/api/tags') res.end(JSON.stringify({ models: [{ name: 'moondream:latest' }] }));
            else if (req.url?.includes('/chat/completions')) res.end(JSON.stringify({ choices: [{ message: { content: 'لقطة شاشة بيضاء لواجهة لوحة تحكم فيها عنوانان وزر' } }] }));
            else res.end('{}');
        });
    });
    await new Promise<void>(r => ollama.listen(0, '127.0.0.1', r));
    process.env.LOCAL_LLM_BASE_URL = `http://127.0.0.1:${(ollama.address() as any).port}/v1`;

    const { describeImageAttachments } = await import('../../shared/vision');
    const { formatAttachmentsBlock } = await import('../../shared/attachments');
    const att: any = { name: 'settings-screen.png', mimeType: 'image/png', size: fs.statSync(shot).size, content: '', path: shot };
    const t0 = Date.now();
    const r = await describeImageAttachments([att], { language: 'ar' });
    console.log(`  [dbg] pass took ${Math.round((Date.now() - t0) / 1000)}s; ocr=${(att.ocrText || '').length} chars`);
    check('the scene was described', r.described === 1 && att.visionDescribed === true);
    check('OCR read the ENGLISH line verbatim', (att.ocrText || '').includes('XELITE'), (att.ocrText || '').slice(0, 200));
    check('OCR read the ARABIC heading verbatim', (att.ocrText || '').includes('لوحة التحكم'), (att.ocrText || '').slice(0, 200));
    check('OCR read the ARABIC button verbatim', (att.ocrText || '').includes('الإعدادات'), (att.ocrText || '').slice(0, 200));
    const block = formatAttachmentsBlock([att]);
    check('the block carries BOTH layers with honest labels',
        block.includes('ANALYZED by a vision model') && block.includes('OCR — the EXACT text read inside the image') && block.includes('لوحة التحكم'));

    // ── 3. no eyes at all: the OCR layer stands alone, honestly ────────
    console.log('\n[3] بلا أي مزود رؤية إطلاقاً — طبقة OCR وحدها');
    await new Promise<void>(res => ollama.close(() => res()));
    delete process.env.LOCAL_LLM_BASE_URL;
    const att2: any = { name: 'settings-screen.png', mimeType: 'image/png', size: fs.statSync(shot).size, content: '', path: shot };
    const r2 = await describeImageAttachments([att2], { language: 'ar' });
    check('no description was invented', r2.described === 0 && !att2.visionDescribed);
    check('the OCR text still landed', (att2.ocrText || '').includes('XELITE'));
    const block2 = formatAttachmentsBlock([att2]);
    check('the block quotes the text and admits the unseen visuals',
        block2.includes('no vision description was available') && block2.includes('you have NOT seen the visuals') && block2.includes('لوحة التحكم'));

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
