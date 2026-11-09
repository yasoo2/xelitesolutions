/**
 * ⛔ A DOOR WALKED THROUGH IS AN INTERFACE (app-audit.ts, empty_page).
 *
 * The hard sample, 2026-11-09 (L282, «a secure sign-in system for a cinema's
 * staff»): the audit signed in through the product's own form with the
 * builder's account, landed on the staff page whose one control is «sign out»
 * (never pressed: it would end the walk's session), and refused a correct
 * product four times: «Not one button, link or form on the page». Pinned on a
 * real browser: signed in through the page's form, the page behind it is not
 * «empty»; a page with nothing on it, and no door, still is.
 */
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { auditBuiltApp } from '../core/quality/app-audit';

jest.setTimeout(180_000);

const ACCOUNT = { identity: 'employee', password: 'door-test-1' };
const LOGIN = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>دخول الموظفين</title>
<style>body{font-family:sans-serif;margin:24px} input,button{display:block;min-height:44px;min-width:200px;margin:8px 0;font-size:16px}</style></head><body>
<main><h1>تسجيل دخول الموظفين</h1>
<form id="f"><label for="u">اسم المستخدم</label><input id="u" name="username" autocomplete="username" required>
<label for="p">كلمة المرور</label><input id="p" name="password" type="password" autocomplete="current-password" required>
<button type="submit">دخول</button></form><p id="msg" role="alert"></p></main>
<script>
document.getElementById('f').addEventListener('submit', async function (e) {
  e.preventDefault();
  var r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: this.username.value, password: this.password.value }) });
  if (r.ok) location.href = '/home.html'; else document.getElementById('msg').textContent = 'بيانات الدخول غير صحيحة';
});
</script></body></html>`;
const HOME = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>لوحة الموظف</title>
<style>body{font-family:sans-serif;margin:24px} button{min-height:44px;min-width:120px}</style></head><body>
<main><h1>مرحباً employee</h1><p>أنت مسجل دخول إلى نظام موظفي السينما.</p>
<button id="out" type="button">تسجيل الخروج</button></main>
<script>document.getElementById('out').onclick = async function () { await fetch('/api/logout', { method: 'POST' }); location.href = '/'; };</script></body></html>`;
const NOTHING = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>صفحة</title></head><body><main><h1>مرحباً</h1><p>لا شيء هنا.</p></main></body></html>`;

const roots: string[] = [];
const servers: http.Server[] = [];
afterAll(async () => {
    for (const s of servers) await new Promise<void>(r => s.close(() => r()));
    for (const d of roots) fs.rmSync(d, { recursive: true, force: true });
});

async function serve(pages: Record<string, string>): Promise<{ dir: string; url: string }> {
    const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-door-'));
    roots.push(dir);
    fs.writeFileSync(path.join(dir, 'index.html'), pages['/']);
    const signedIn = new Set<string>();
    const server = http.createServer((req, res) => {
        const url = String(req.url || '/').split('?')[0];
        const cookie = /sid=(\w+)/.exec(String(req.headers.cookie || ''))?.[1] || '';
        if (url === '/api/login' && req.method === 'POST') {
            let raw = '';
            req.on('data', c => { raw += c; });
            req.on('end', () => {
                let body: any = {};
                try { body = JSON.parse(raw); } catch { /* refused below */ }
                if (body.username === ACCOUNT.identity && body.password === ACCOUNT.password) {
                    const sid = Math.random().toString(36).slice(2);
                    signedIn.add(sid);
                    res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': `sid=${sid}; Path=/; HttpOnly` });
                    res.end('{"ok":true}');
                } else { res.writeHead(401, { 'content-type': 'application/json' }); res.end('{"error":"bad"}'); }
            });
            return;
        }
        if (url === '/api/logout') { signedIn.delete(cookie); res.writeHead(200); res.end('{}'); return; }
        if (url === '/home.html' && pages['/home.html']) {
            if (!signedIn.has(cookie)) { res.writeHead(302, { location: '/' }); res.end(); return; }
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(pages['/home.html']); return;
        }
        if (url === '/' || url === '/index.html') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(pages['/']); return; }
        res.writeHead(404); res.end();
    });
    servers.push(server);
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    return { dir, url: `http://127.0.0.1:${(server.address() as any).port}/` };
}

test('signed in through the product\'s own form, the staff page behind it is not «an empty page»', async () => {
    const { dir, url } = await serve({ '/': LOGIN, '/home.html': HOME });
    const audit: any = await auditBuiltApp(dir, { serveUrl: url, timeoutMs: 60_000, credentials: ACCOUNT, requireAuthenticatedCoverage: true });
    expect(audit.authenticated).toBe(true);
    expect(audit.findings.map((f: any) => f.id)).not.toContain('empty_page');
});

test('a page with nothing on it, and no door, is still an empty page', async () => {
    const { dir, url } = await serve({ '/': NOTHING });
    const audit: any = await auditBuiltApp(dir, { serveUrl: url, timeoutMs: 45_000 });
    expect(audit.findings.map((f: any) => f.id)).toContain('empty_page');
});
