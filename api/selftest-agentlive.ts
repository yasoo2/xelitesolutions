/* selftest-agentlive.ts — proves the live agent-step events REALLY reach a subscribed
   panel: it attaches a real WebSocket client to the browser WSS (the same channel
   ModernBrowserStream uses), runs the ReAct loop, and asserts the observe→decide→act
   narration arrives — and that credentials NEVER appear in any event. */
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { runReactBrowserTask, type Decider } from './src/modules/browser/reactLoop';
import { attachBrowserWss } from './src/modules/browser/wsHub';
import { setSessionSecret } from './src/modules/services/secrets';
import { stopSession } from './src/modules/browser/manager';

const EMAIL = 'user@test.com';
const PASSWORD = 'S3cr3t-Pass!';

function loginServer(): Promise<{ url: string; close: () => void }> {
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/login') {
      let b = ''; req.on('data', c => (b += c));
      req.on('end', () => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<h1>Welcome</h1><p>logged in</p>'); });
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<form method="POST" action="/login">
      <input type="email" name="email" placeholder="Email address">
      <input type="password" name="password" placeholder="Password">
      <button type="submit">Log in</button></form>`);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => {
    const a = server.address() as any; r({ url: `http://127.0.0.1:${a.port}/`, close: () => server.close() });
  }));
}

const decide: Decider = async ({ observation, history }) => {
  const txt = (observation.textSnippet || '').toLowerCase();
  if (/welcome|logged in/.test(txt)) return { action: 'done', answer: 'logged in' };
  const email = observation.elements.find(e => e.tag === 'input' && !e.isPassword && (e.type === 'email' || /email|user/i.test(e.text)));
  const pw = observation.elements.find(e => e.isPassword);
  const submit = observation.elements.find(e => e.tag === 'button' || e.type === 'submit');
  const typedE = history.some(h => h.action.action === 'type' && /EMAIL/.test((h.action as any).text || ''));
  const typedP = history.some(h => h.action.action === 'type' && /PASSWORD/.test((h.action as any).text || ''));
  if (email && !typedE) return { action: 'type', index: email.index, text: '{{SECRET:JOE_LOGIN_EMAIL}}' };
  if (pw && !typedP) return { action: 'type', index: pw.index, text: '{{SECRET:JOE_LOGIN_PASSWORD}}' };
  if (submit) return { action: 'click', index: submit.index };
  return { action: 'ask_user', message: 'stuck' };
};

async function main() {
  process.env.BROWSER_HEADED = '0';
  process.env.ENABLE_AUTH_BYPASS = 'true'; // let the WSS accept our test client
  let failures = 0;
  const check = (n: string, c: boolean, extra = '') => { console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${extra ? '  -> ' + extra : ''}`); if (!c) failures++; };

  const SID = 'agent-live-test';
  const wss = new WebSocketServer({ port: 0 });
  attachBrowserWss(wss);
  const port = (wss.address() as any).port;

  const events: any[] = [];
  const raw: string[] = [];
  const client = new WebSocket(`ws://127.0.0.1:${port}/?sessionId=${SID}`);
  client.on('message', d => { raw.push(String(d)); try { const m = JSON.parse(String(d)); if (m.type === 'agent_step') events.push(m); } catch { } });
  await new Promise((res, rej) => { client.on('open', res); client.on('error', rej); setTimeout(() => rej(new Error('ws timeout')), 4000); });
  await new Promise(r => setTimeout(r, 200)); // let the server register the client

  const srv = await loginServer();
  setSessionSecret(SID, 'JOE_LOGIN_EMAIL', EMAIL);
  setSessionSecret(SID, 'JOE_LOGIN_PASSWORD', PASSWORD);

  const res = await runReactBrowserTask({ sessionId: SID, userId: 'u1', task: 'Log in', startUrl: srv.url, maxSteps: 8, decide });
  await new Promise(r => setTimeout(r, 200)); // flush

  const phases = new Set(events.map(e => e.phase));
  check('loop finished (done)', res.status === 'done');
  check('received agent_step events', events.length > 0, `count=${events.length}`);
  check('has OBSERVE phase', phases.has('observe'));
  check('has DECIDE phase', phases.has('decide'));
  check('has ACT phase', phases.has('act'));
  check('has DONE phase', phases.has('done'));
  check('observe carries url + elementCount', events.some(e => e.phase === 'observe' && e.url && typeof e.elementCount === 'number'));
  check('decide carries a readable action', events.some(e => e.phase === 'decide' && typeof e.action === 'string' && e.action.length > 0));
  // CREDENTIAL SAFETY: the real password/email must never appear in any event.
  const allJson = JSON.stringify(events);
  check('password NEVER leaks into any event', !allJson.includes(PASSWORD));
  check('email NEVER leaks into any event', !allJson.includes(EMAIL));
  check('credential typing shown as a masked label', events.some(e => e.phase === 'act' && /كلمة المرور|بيانات الدخول/.test(e.action || '')));

  client.close(); wss.close(); srv.close(); await stopSession(SID);
  console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e => { console.error('crashed:', e); process.exit(2); });
