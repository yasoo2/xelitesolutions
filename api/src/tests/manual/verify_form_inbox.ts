/**
 * WIRE PROOF — Stage 4 end to end, nothing faked:
 *
 *   The REAL app serves the public endpoint → a built page (wired by the
 *   REAL wireFormsToInbox + the REAL form runtime) is opened in the REAL
 *   browser → a visitor FILLS AND SUBMITS the form → the page announces
 *   delivery → the submission is on DISK → the FormInboxTool reads it back
 *   in Arabic. Then the fallback: a page pointing at a DEAD inbox keeps the
 *   old honest no-endpoint behaviour.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_form_inbox.ts
 */
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

async function main() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-inbox-wire-'));
    process.env.JOE_CHAT_STORE_DIR = tmp;

    // The REAL app (public endpoint included).
    const { createApp } = await import('../../api/app');
    const app = createApp();
    const api = app.listen(0, '127.0.0.1');
    await new Promise<void>(r => api.once('listening', () => r()));
    const apiPort = (api.address() as any).port;

    // A built page, wired the way the builder wires it.
    const { formRuntime, formCss, wireFormsToInbox } = await import('../../core/design/forms');
    const SITE = 'wire-site';
    let page = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>مقهى بُن</title>
<style>body{font-family:sans-serif}${formCss()}</style></head><body>
<form data-joe-form>
  <label for="n">الاسم</label><input id="n" name="name" required>
  <label for="m">رسالتك</label><textarea id="m" name="message" required></textarea>
  <button type="submit">أرسل</button>
</form>
${formRuntime(true)}
</body></html>`;
    page = wireFormsToInbox(page, SITE, apiPort).replace('http://localhost:', 'http://127.0.0.1:');
    const site = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(page); });
    site.listen(0, '127.0.0.1');
    await new Promise<void>(r => site.once('listening', () => r()));
    const pageUrl = `http://127.0.0.1:${(site.address() as any).port}/`;

    console.log('\n[1] زائر حقيقي يملأ النموذج ويرسل — الرسالة تصل صندوق جو');
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    const p = await browser.newPage();
    await p.goto(pageUrl, { waitUntil: 'load' });
    await p.fill('#n', 'خالد التجريبي');
    await p.fill('#m', 'أريد حجز طاولة مساء الخميس');
    await p.click('button[type=submit]');
    await p.waitForTimeout(800);
    const statusText = await p.evaluate(() => document.querySelector('[data-form-status]')?.textContent || '');
    check('the page announced REAL delivery', statusText.includes('وصلت رسالتك'), statusText || '(none)');
    const inboxRaw = fs.readFileSync(path.join(tmp, 'form-inbox.json'), 'utf-8');
    check('the submission is on DISK with its fields', inboxRaw.includes('خالد التجريبي') && inboxRaw.includes('حجز طاولة'));

    console.log('\n[2] المالك يقرأ الرسائل في المحادثة');
    const { FormInboxTool } = await import('../../modules/tools/definitions/FormInboxTool');
    const read: any = await new FormInboxTool().execute({ request: 'اعرض رسائل النموذج' }, { sessionId: SITE });
    check('the chat listing carries the message', read.ok && read.output.message.includes('خالد التجريبي'), String(read.output?.message).slice(0, 120));

    console.log('\n[3] صندوق ميت (موقع منشور) → الصدق القديم كما هو');
    let deadPage = page.replace(/data-joe-inbox="[^"]*"/, `data-joe-inbox="http://127.0.0.1:9/api/public/forms/${SITE}"`);
    const dead = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(deadPage); });
    dead.listen(0, '127.0.0.1');
    await new Promise<void>(r => dead.once('listening', () => r()));
    const p2 = await browser.newPage();
    await p2.goto(`http://127.0.0.1:${(dead.address() as any).port}/`, { waitUntil: 'load' });
    await p2.fill('#n', 'زائر');
    await p2.fill('#m', 'رسالة لن تصل');
    await p2.click('button[type=submit]');
    await p2.waitForTimeout(1500);
    const fallbackText = await p2.evaluate(() => document.querySelector('[data-form-status]')?.textContent || '');
    check('the dead endpoint fell back to the honest message', fallbackText.includes('لم يُوصَل هذا النموذج'), fallbackText.slice(0, 80) || '(none)');
    check('…and the visitor\'s text was KEPT on screen', await p2.evaluate(() => (document.querySelector('.joe-form-copy')?.textContent || '').includes('رسالة لن تصل')));

    await browser.close();
    site.close(); dead.close(); api.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
