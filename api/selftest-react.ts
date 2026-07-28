/* selftest-react.ts — proves the ReAct browser loop REALLY works, end to end, on a
   real Chromium and a real login page served locally. The "brain" here is a scripted
   decider that reasons over the LIVE observation (it picks fields by their visible
   text/type, NOT by hardcoded indices) — exactly what a real LLM would receive — so a
   pass proves: observation is rich enough, coordinate actions hit the real DOM, the
   {{SECRET}} credentials are typed into the real form, multi-step login completes, and
   the missing-credential path asks the user. */
import http from 'http';
import { runReactBrowserTask, observePage, type Decider } from './src/modules/browser/reactLoop';
import { setSessionSecret } from './src/modules/services/secrets';
import { getBrowserSession, stopSession } from './src/modules/browser/manager';
import { parseAction } from './src/orchestration/agents/BrowserAgent';

const EMAIL = 'user@test.com';
const PASSWORD = 'S3cr3t-Pass!';
let received: { email?: string; password?: string } = {};

function startServer(): Promise<{ url: string; close: () => void }> {
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/login') {
      let body = '';
      req.on('data', c => (body += c));
      req.on('end', () => {
        const p = new URLSearchParams(body);
        received = { email: p.get('email') || '', password: p.get('password') || '' };
        const ok = received.email === EMAIL && received.password === PASSWORD;
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(ok
          ? `<html><body><h1>Welcome ${received.email}</h1><p>You are logged in.</p></body></html>`
          : `<html><body><h1>invalid login</h1></body></html>`);
      });
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<html><body><h2>Sign in</h2>
      <form method="POST" action="/login">
        <input type="email" name="email" placeholder="Email address">
        <input type="password" name="password" placeholder="Password">
        <button type="submit">Log in</button>
      </form></body></html>`);
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      resolve({ url: `http://127.0.0.1:${addr.port}/`, close: () => server.close() });
    });
  });
}

/** A brain that reasons over the REAL live observation (semantic, not hardcoded). */
const smartDecider: Decider = async ({ observation, history }) => {
  const txt = (observation.textSnippet || '').toLowerCase();
  const url = observation.url || '';
  if (url.includes('/login') && /welcome|logged in/.test(txt)) return { action: 'done', answer: 'logged in' };
  if (/welcome|logged in/.test(txt)) return { action: 'done', answer: 'logged in' };

  const emailEl = observation.elements.find(e =>
    e.tag === 'input' && !e.isPassword && (e.type === 'email' || /email|user|بريد|login/i.test(e.text)));
  const pwEl = observation.elements.find(e => e.isPassword);
  const submitEl =
    observation.elements.find(e => (e.tag === 'button' || e.type === 'submit') && /log\s*in|sign\s*in|submit|دخول/i.test(e.text)) ||
    observation.elements.find(e => e.tag === 'button' || e.type === 'submit');

  const typedEmail = history.some(h => h.action.action === 'type' && /EMAIL/.test((h.action as any).text || ''));
  const typedPw = history.some(h => h.action.action === 'type' && /PASSWORD/.test((h.action as any).text || ''));

  if (emailEl && !typedEmail) return { action: 'type', index: emailEl.index, text: '{{SECRET:JOE_LOGIN_EMAIL}}' };
  if (pwEl && !typedPw) return { action: 'type', index: pwEl.index, text: '{{SECRET:JOE_LOGIN_PASSWORD}}' };
  if (submitEl) return { action: 'click', index: submitEl.index };
  return { action: 'ask_user', message: 'no actionable element found' };
};

async function main() {
  process.env.BROWSER_HEADED = '0';
  let failures = 0;
  const check = (name: string, cond: boolean, extra = '') => {
    console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${name}${extra ? '  -> ' + extra : ''}`);
    if (!cond) failures++;
  };

  // --- unit: parseAction robustly extracts JSON, else asks the user ---
  const p1 = parseAction('sure, here: {"action":"click","index":3} done');
  check('parseAction extracts JSON action', p1.action === 'click' && (p1 as any).index === 3, JSON.stringify(p1));
  const p2 = parseAction('total nonsense with no json');
  check('parseAction falls back to ask_user', p2.action === 'ask_user');

  const srv = await startServer();

  // --- test A: full autonomous login on a real page with credentials present ---
  const sidA = 'react-login-ok';
  setSessionSecret(sidA, 'JOE_LOGIN_EMAIL', EMAIL);
  setSessionSecret(sidA, 'JOE_LOGIN_PASSWORD', PASSWORD);
  const resA = await runReactBrowserTask({
    sessionId: sidA, userId: 'u1', task: 'Log into the site', startUrl: srv.url, maxSteps: 8, decide: smartDecider,
  });
  console.log('  · A result:', JSON.stringify({ status: resA.status, ok: resA.ok, steps: resA.steps.length }));
  check('A: loop reports done', resA.status === 'done' && resA.ok === true, resA.summary);
  check('A: real form received the EMAIL secret', received.email === EMAIL, `got=${received.email}`);
  check('A: real form received the PASSWORD secret', received.password === PASSWORD, received.password ? 'got password' : 'no password');
  // verify the browser actually landed on the welcome page
  const sA = await getBrowserSession(sidA);
  const finalText = await sA.page.evaluate(() => document.body.innerText).catch(() => '');
  check('A: browser reached the welcome page', /Welcome/i.test(finalText), finalText.slice(0, 60));
  await stopSession(sidA);

  // --- test B: missing credential is surfaced as needs_user (not a silent fail) ---
  received = {};
  const sidB = 'react-login-missing';
  // no secrets set for this session
  const resB = await runReactBrowserTask({
    sessionId: sidB, userId: 'u2', task: 'Log into the site', startUrl: srv.url, maxSteps: 6, decide: smartDecider,
  });
  console.log('  · B result:', JSON.stringify({ status: resB.status, missing: resB.missingSecret }));
  check('B: missing credential -> needs_user', resB.status === 'needs_user');
  check('B: names the missing secret', resB.missingSecret === 'JOE_LOGIN_EMAIL', String(resB.missingSecret));
  await stopSession(sidB);

  // --- test C: observePage never leaks a password field value ---
  const sidC = 'react-observe';
  const sC = await getBrowserSession(sidC);
  await sC.page.goto(srv.url);
  await sC.page.evaluate(() => {
    const pw = document.querySelector('input[type=password]') as any; if (pw) pw.value = 'LEAKME123';
  });
  const obs = await observePage(sC.page);
  const leaked = JSON.stringify(obs.elements).includes('LEAKME123') || obs.textSnippet.includes('LEAKME123');
  check('C: password value is never exposed in observation', !leaked);
  const hasEmailField = obs.elements.some(e => e.type === 'email' || /email/i.test(e.text));
  const hasSubmit = obs.elements.some(e => e.tag === 'button' || e.type === 'submit');
  check('C: observation surfaces the email field + submit button', hasEmailField && hasSubmit);
  await stopSession(sidC);

  srv.close();
  console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e => { console.error('crashed:', e); process.exit(2); });
