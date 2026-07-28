/* selftest-agentic.ts — one continuous session proving the agent behaves like a
   computer: enters a site, logs in, then RECEIVES SEPARATE follow-up commands and
   continues ON THE SAME live session (still logged in via the session cookie = memory),
   navigates, analyzes a page, and returns concrete RESULTS/OPTIONS. Screenshots +
   extracted data are written to argv[2]. */
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { runReactBrowserTask, type Decider } from './src/modules/browser/reactLoop';
import { attachBrowserWss } from './src/modules/browser/wsHub';
import { setSessionSecret } from './src/modules/services/secrets';
import { getBrowserSession, stopSession } from './src/modules/browser/manager';

const OUT = process.argv[2] || '/tmp';
const EMAIL = 'younes@example.com';
const PASSWORD = 'S3cr3t-Pass!';
const SID = 'agentic-demo';

const shell = (body: string) => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
  body{font-family:system-ui,Segoe UI,Arial;background:#eef2f8;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center}
  .card{background:#fff;padding:30px 40px;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.12);width:420px}
  h1,h2{color:#1e293b;margin:0 0 14px} p.sub{color:#64748b;margin:0 0 18px}
  input{width:100%;box-sizing:border-box;padding:12px 14px;margin:7px 0;border:1px solid #cbd5e1;border-radius:10px;font-size:15px}
  button{width:100%;padding:12px;margin-top:10px;border:0;border-radius:10px;background:#2563eb;color:#fff;font-size:16px;cursor:pointer}
  a.nav{display:block;padding:12px 16px;margin:8px 0;background:#f1f5f9;border-radius:10px;color:#1d4ed8;text-decoration:none;font-size:16px}
  ul{font-size:16px;color:#0f172a;line-height:2} .ok{color:#16a34a}
</style></head><body><div class="card">${body}</div></body></html>`;

function loggedIn(req: http.IncomingMessage) { return String(req.headers.cookie || '').includes('sess=ok'); }
const gate = '<h2>🔒 الرجاء تسجيل الدخول أولاً</h2>';

function server(): Promise<{ url: string; close: () => void }> {
  const s = http.createServer((req, res) => {
    const url = req.url || '/';
    if (req.method === 'POST' && url === '/login') {
      let b = ''; req.on('data', c => (b += c));
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': 'sess=ok; Path=/' });
        res.end(shell(`<h1 class="ok">✅ لوحة التحكم</h1><p class="sub">مرحباً ${EMAIL} — أنت مسجّل الدخول</p>
          <a class="nav" href="/products">📦 المنتجات</a>
          <a class="nav" href="/settings">⚙️ الإعدادات</a>`));
      });
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    if (url.startsWith('/products')) {
      res.end(shell(loggedIn(req)
        ? `<h1>📦 المنتجات</h1><ul><li>لابتوب برو 15</li><li>هاتف ماكس برو</li><li>سماعة إير باد</li></ul>
           <a class="nav" href="/dashboard">↩ رجوع للوحة</a>`
        : gate));
      return;
    }
    if (url.startsWith('/settings')) {
      res.end(shell(loggedIn(req)
        ? `<h1>⚙️ الإعدادات</h1><p class="sub">اللغة: العربية · الوضع: داكن · الإشعارات: مفعّلة</p><a class="nav" href="/dashboard">↩ رجوع للوحة</a>`
        : gate));
      return;
    }
    if (url.startsWith('/dashboard')) {
      res.end(shell(loggedIn(req)
        ? `<h1 class="ok">✅ لوحة التحكم</h1><p class="sub">مرحباً ${EMAIL}</p>
           <a class="nav" href="/products">📦 المنتجات</a><a class="nav" href="/settings">⚙️ الإعدادات</a>`
        : gate));
      return;
    }
    res.end(shell(`<h2>تسجيل الدخول</h2><p class="sub">أدخل بياناتك</p>
      <form method="POST" action="/login">
        <input type="email" name="email" placeholder="البريد الإلكتروني">
        <input type="password" name="password" placeholder="كلمة المرور">
        <button type="submit">دخول</button></form>`));
  });
  return new Promise(r => s.listen(0, '127.0.0.1', () => { const a = s.address() as any; r({ url: `http://127.0.0.1:${a.port}/`, close: () => s.close() }); }));
}

// One task-aware brain that reasons over the live observation for every command.
const brain: Decider = async ({ task, observation, history }) => {
  const t = task; const els = observation.elements; const txt = observation.textSnippet || '';
  const pw = els.find(e => e.isPassword);
  const emailEl = els.find(e => e.tag === 'input' && !e.isPassword);
  const submit = els.find(e => e.tag === 'button' || e.type === 'submit');
  const typedE = history.some(h => h.action.action === 'type' && /EMAIL/.test((h.action as any).text || ''));
  const typedP = history.some(h => h.action.action === 'type' && /PASSWORD/.test((h.action as any).text || ''));

  if (/دخول|login/i.test(t)) {
    if (/لوحة التحكم/.test(txt)) return { action: 'done', answer: 'تم تسجيل الدخول والوصول للوحة التحكم' };
    if (emailEl && !typedE) return { action: 'type', index: emailEl.index, text: '{{SECRET:JOE_LOGIN_EMAIL}}' };
    if (pw && !typedP) return { action: 'type', index: pw.index, text: '{{SECRET:JOE_LOGIN_PASSWORD}}' };
    if (submit) return { action: 'click', index: submit.index };
  }
  if (/منتجات|products/i.test(t)) {
    if (/الرجاء تسجيل الدخول/.test(txt)) return { action: 'ask_user', message: 'انتهت الجلسة، يلزم تسجيل دخول' };
    if (/المنتجات/.test(txt) && /لابتوب|هاتف|سماعة/.test(txt)) {
      const names = await (await getBrowserSession(SID)).page.$$eval('li', ns => ns.map(n => (n.textContent || '').trim())).catch(() => [] as string[]);
      return { action: 'done', answer: `وجدت ${names.length} منتجات: ${names.join('، ')}` };
    }
    const link = els.find(e => /منتجات|products/i.test(e.text));
    if (link) return { action: 'click', index: link.index };
    const back = els.find(e => /رجوع|لوحة|dashboard/i.test(e.text));
    if (back) return { action: 'click', index: back.index };
  }
  if (/إعدادات|settings/i.test(t)) {
    // Recognize the settings PAGE by its distinctive content, not the word
    // "الإعدادات" (which also appears as a nav LINK on the dashboard).
    if (/اللغة:\s*العربية|الوضع:\s*داكن|الإشعارات/.test(txt)) {
      return { action: 'done', answer: 'فُتحت صفحة الإعدادات (اللغة: العربية، الوضع: داكن، الإشعارات: مفعّلة)' };
    }
    const link = els.find(e => /إعدادات|settings/i.test(e.text));
    if (link) return { action: 'click', index: link.index };
    // No settings link on this page -> navigate back to the dashboard first, then retry.
    const back = els.find(e => /رجوع|لوحة|dashboard/i.test(e.text));
    if (back) return { action: 'click', index: back.index };
  }
  return { action: 'ask_user', message: 'لم أجد عنصراً مناسباً' };
};

async function snap(label: string) {
  try { const s = await getBrowserSession(SID); await s.page.screenshot({ path: path.join(OUT, `agentic-${label}.png`) }); console.log('  · shot', label); } catch (e) { console.log('snap fail', String(e)); }
}

async function main() {
  process.env.BROWSER_HEADED = '0';
  process.env.ENABLE_AUTH_BYPASS = 'true';
  let failures = 0;
  const check = (n: string, c: boolean, x = '') => { console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${x ? '  -> ' + x : ''}`); if (!c) failures++; };

  const wss = new WebSocketServer({ port: 0 }); attachBrowserWss(wss);
  const port = (wss.address() as any).port;
  const client = new WebSocket(`ws://127.0.0.1:${port}/?sessionId=${SID}`);
  await new Promise((res, rej) => { client.on('open', res); client.on('error', rej); setTimeout(() => rej(new Error('ws')), 4000); });
  const srv = await server();
  setSessionSecret(SID, 'JOE_LOGIN_EMAIL', EMAIL);
  setSessionSecret(SID, 'JOE_LOGIN_PASSWORD', PASSWORD);

  // COMMAND 1 — log in.
  const r1 = await runReactBrowserTask({ sessionId: SID, userId: 'u1', task: 'سجّل دخولي إلى الموقع', startUrl: srv.url, maxSteps: 8, decide: brain });
  await snap('1-dashboard');
  check('أمر ١: دخل الموقع وسجّل الدخول', r1.status === 'done', r1.summary);

  // COMMAND 2 — a NEW command, SAME session (no reset): open products & analyze.
  const r2 = await runReactBrowserTask({ sessionId: SID, userId: 'u1', task: 'افتح صفحة المنتجات واستخرج أسماءها', maxSteps: 8, decide: brain });
  await snap('2-products');
  check('أمر ٢: استمرّ على نفس الجلسة وحلّل وأعطى نتيجة', r2.status === 'done', r2.answer);
  // MEMORY proof: products are visible ONLY because the login cookie persisted.
  const sp = await getBrowserSession(SID);
  const productsText = await sp.page.evaluate(() => document.body.innerText).catch(() => '');
  check('الذاكرة: مازال مسجّل الدخول (ظهرت المنتجات لا صفحة الدخول)', /لابتوب|هاتف|سماعة/.test(productsText) && !/الرجاء تسجيل الدخول/.test(productsText));
  const names = await sp.page.$$eval('li', ns => ns.map(n => (n.textContent || '').trim())).catch(() => []);
  check('النتائج/الخيارات: استخرج قائمة المنتجات', names.length === 3, names.join(' | '));

  // COMMAND 3 — another follow-up on the SAME session: open settings.
  const r3 = await runReactBrowserTask({ sessionId: SID, userId: 'u1', task: 'الآن افتح الإعدادات', maxSteps: 8, decide: brain });
  await snap('3-settings');
  check('أمر ٣: تلقّى أمراً جديداً وأكمل على نفس المهمة/الجلسة', r3.status === 'done', r3.answer);
  const settingsText = await (await getBrowserSession(SID)).page.evaluate(() => document.body.innerText).catch(() => '');
  const settingsUrl = (await getBrowserSession(SID)).page.url();
  // Assert we REALLY reached /settings with its distinctive content (not the dashboard).
  check('الإعدادات ظهرت فعلاً (محتوى مميّز + رابط /settings)',
    /اللغة:\s*العربية/.test(settingsText) && /الإشعارات/.test(settingsText) && /\/settings/.test(settingsUrl) && !/الرجاء تسجيل الدخول/.test(settingsText),
    settingsUrl);

  console.log('\n  RESULTS the agent returned:');
  console.log('   • أمر٢ →', r2.answer);
  console.log('   • أمر٣ →', r3.answer);

  client.close(); wss.close(); srv.close(); await stopSession(SID);
  console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e => { console.error('crashed:', e); process.exit(2); });
