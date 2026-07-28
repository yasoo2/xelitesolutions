/* selftest-visual.ts — VISUAL proof. Runs the real ReAct loop on a real login page,
   (1) screenshots the live Chromium at each step, and (2) captures the real agent_step
   events and renders the live panel (same markup/styles as ModernBrowserStream) to a
   PNG. Outputs go to the scratchpad dir passed as argv[2]. */
import http from 'http';
import path from 'path';
import { chromium } from 'playwright';
import { WebSocketServer, WebSocket } from 'ws';
import { runReactBrowserTask, type Decider } from './src/modules/browser/reactLoop';
import { attachBrowserWss } from './src/modules/browser/wsHub';
import { setSessionSecret } from './src/modules/services/secrets';
import { getBrowserSession, stopSession } from './src/modules/browser/manager';

const OUT = process.argv[2] || '/tmp';
const EMAIL = 'younes@example.com';
const PASSWORD = 'S3cr3t-Pass!';

function loginServer(): Promise<{ url: string; close: () => void }> {
  const page = (extra = '') => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
    <style>body{font-family:system-ui,Segoe UI,Arial;background:#eef2f8;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center}
    .card{background:#fff;padding:34px 40px;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.12);width:340px}
    h2{margin:0 0 6px;color:#1e293b} p.sub{margin:0 0 20px;color:#64748b;font-size:14px}
    input{width:100%;box-sizing:border-box;padding:12px 14px;margin:7px 0;border:1px solid #cbd5e1;border-radius:10px;font-size:15px}
    button{width:100%;padding:12px;margin-top:12px;border:0;border-radius:10px;background:#2563eb;color:#fff;font-size:16px;cursor:pointer}
    .ok{color:#16a34a}</style></head><body><div class="card">${extra}</div></body></html>`;
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/login') {
      let b = ''; req.on('data', c => (b += c));
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(page(`<h2 class="ok">✅ مرحباً ${EMAIL}</h2><p class="sub">تم تسجيل دخولك بنجاح إلى حسابك.</p>`));
      });
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(page(`<h2>تسجيل الدخول</h2><p class="sub">أدخل بياناتك للمتابعة</p>
      <form method="POST" action="/login">
        <input type="email" name="email" placeholder="البريد الإلكتروني">
        <input type="password" name="password" placeholder="كلمة المرور">
        <button type="submit">دخول</button>
      </form>`));
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => {
    const a = server.address() as any; r({ url: `http://127.0.0.1:${a.port}/`, close: () => server.close() });
  }));
}

const SID = 'visual-demo';
let shot = 0;
async function snap(label: string) {
  try {
    const s = await getBrowserSession(SID);
    shot++;
    const file = path.join(OUT, `browser-${String(shot).padStart(2, '0')}-${label}.png`);
    await s.page.screenshot({ path: file });
    console.log('  · shot', file);
  } catch (e) { console.log('  snap failed', String(e)); }
}

const decide: Decider = async ({ observation, history }) => {
  const txt = (observation.textSnippet || '').toLowerCase();
  if (/مرحبا|تم تسجيل|welcome|logged in/.test(observation.textSnippet || '') || /welcome|logged in/.test(txt)) {
    await snap('welcome'); return { action: 'done', answer: 'تم تسجيل الدخول' };
  }
  const email = observation.elements.find(e => e.tag === 'input' && !e.isPassword && (e.type === 'email' || /email|بريد/i.test(e.text)));
  const pw = observation.elements.find(e => e.isPassword);
  const submit = observation.elements.find(e => e.tag === 'button' || e.type === 'submit');
  const typedE = history.some(h => h.action.action === 'type' && /EMAIL/.test((h.action as any).text || ''));
  const typedP = history.some(h => h.action.action === 'type' && /PASSWORD/.test((h.action as any).text || ''));
  if (email && !typedE) { await snap('form'); return { action: 'type', index: email.index, text: '{{SECRET:JOE_LOGIN_EMAIL}}' }; }
  if (pw && !typedP) { await snap('email-typed'); return { action: 'type', index: pw.index, text: '{{SECRET:JOE_LOGIN_PASSWORD}}' }; }
  if (submit) { await snap('password-typed'); return { action: 'click', index: submit.index }; }
  return { action: 'ask_user', message: 'stuck' };
};

// Render the live panel (same markup/styles as ModernBrowserStream) with real events.
function panelHtml(events: any[]): string {
  const rows = events.map(m => {
    const text = (() => {
      switch (m.phase) {
        case 'observe': return `يراقب الصفحة${m.title ? ` — ${String(m.title).slice(0, 40)}` : ''} (${m.elementCount ?? 0} عنصر)`;
        case 'decide': return `يقرّر: ${m.action || ''}`;
        case 'act': return `ينفّذ: ${m.action || ''}`;
        case 'result': return m.ok === false ? `فشلت الخطوة` : 'تمّت الخطوة';
        case 'done': return `✅ أنهى المهمة${m.message ? ` — ${m.message}` : ''}`;
        case 'needs_user': return `🙋 يحتاج تدخّلك${m.message ? ` — ${m.message}` : ''}`;
        default: return '';
      }
    })();
    const icon = m.phase === 'observe' ? '👁' : m.phase === 'decide' ? '🧠' : m.phase === 'act' ? '✋'
      : m.phase === 'result' ? (m.ok === false ? '⚠️' : '✓') : m.phase === 'done' ? '✅' : '🙋';
    const dim = m.phase === 'observe' || m.phase === 'result';
    return `<div class="row" style="opacity:${dim ? 0.72 : 1}"><span>${icon}</span><span class="n">#${m.step}</span><span class="t">${text}</span></div>`;
  }).join('');
  return `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><style>
    body{margin:0;background:#0b0b0b;padding:20px;font-family:system-ui,Segoe UI,Arial}
    .panel{width:300px;background:rgba(12,14,20,.92);color:#e8eef7;border-radius:12px;border:1px solid rgba(120,150,255,.28);box-shadow:0 8px 30px rgba(0,0,0,.4);font-size:12.5px;overflow:hidden}
    .hd{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,.08)}
    .dot{width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 8px #22c55e}
    .hd strong{flex:1;font-size:13px}.hd button{background:transparent;border:0;color:#9fb2cc;font-size:12}
    .body{padding:6px 8px;display:flex;flex-direction:column;gap:4px}
    .row{display:flex;gap:7px;align-items:flex-start;line-height:1.5}
    .row .n{color:#7f9bd6;flex-shrink:0}.row span:first-child{flex-shrink:0}.row .t{word-break:break-word}
  </style></head><body><div class="panel">
    <div class="hd"><span class="dot"></span><strong>🤖 خطوات الوكيل</strong><button>مسح</button></div>
    <div class="body">${rows}</div></div></body></html>`;
}

async function main() {
  process.env.BROWSER_HEADED = '0';
  process.env.ENABLE_AUTH_BYPASS = 'true';

  const wss = new WebSocketServer({ port: 0 });
  attachBrowserWss(wss);
  const port = (wss.address() as any).port;
  const events: any[] = [];
  const client = new WebSocket(`ws://127.0.0.1:${port}/?sessionId=${SID}`);
  client.on('message', d => { try { const m = JSON.parse(String(d)); if (m.type === 'agent_step') events.push(m); } catch { } });
  await new Promise((res, rej) => { client.on('open', res); client.on('error', rej); setTimeout(() => rej(new Error('ws')), 4000); });
  await new Promise(r => setTimeout(r, 200));

  const srv = await loginServer();
  setSessionSecret(SID, 'JOE_LOGIN_EMAIL', EMAIL);
  setSessionSecret(SID, 'JOE_LOGIN_PASSWORD', PASSWORD);

  const res = await runReactBrowserTask({ sessionId: SID, userId: 'u1', task: 'سجّل دخولي', startUrl: srv.url, maxSteps: 8, decide });
  await new Promise(r => setTimeout(r, 200));
  console.log('  loop status:', res.status, 'events:', events.length);

  // Render the panel with the REAL captured events, reusing the manager's working
  // browser (a fresh chromium.launch hits a headless-shell version mismatch here).
  const ps = await getBrowserSession('visual-panel');
  await ps.page.setViewportSize({ width: 340, height: 560 });
  await ps.page.setContent(panelHtml(events), { waitUntil: 'load' });
  await ps.page.screenshot({ path: path.join(OUT, 'panel-live.png') });
  await stopSession('visual-panel');
  console.log('  · shot', path.join(OUT, 'panel-live.png'));

  client.close(); wss.close(); srv.close(); await stopSession(SID);
  console.log(res.status === 'done' ? 'DEMO OK' : 'DEMO status=' + res.status);
  process.exit(0);
}
main().catch(e => { console.error('crashed:', e); process.exit(2); });
