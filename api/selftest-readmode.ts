/* selftest-readmode.ts — reproduces the user's EXACT failed live test and proves all
   three fixes end to end:
     «افتح <URL> وانظر إلى الصفحة وصِف لي ما تراه فيها»
   1) The BrowserAgent now drives the SAME session the panel watches (panel-browser) —
      so a WS client on that session receives agent_step events (before the fix they
      went to an invisible session and the user saw nothing).
   2) Live thinking (agent_thinking) reaches the panel, streamed delta-by-delta from
      the local model (a stand-in OpenAI-compatible server playing Ollama's role).
   3) READ MODE: the describe-task finishes with a real page-grounded ANSWER in ONE
      model call — no 12-step wandering, no step-limit failure.
   Real Chromium + real WS server/client + real HTTP model server. Deterministic. */
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { attachBrowserWss } from './src/modules/browser/wsHub';
import { stopSession } from './src/modules/browser/manager';

// ---- a real page with readable content (what the agent should describe) ----
function site(): Promise<{ url: string; close: () => void }> {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>صفحة الاختبار</title></head>
    <body><h1>مرحباً بكم في متجر الكتب</h1>
    <p>هذه صفحة تجريبية تعرض ثلاثة كتب: كتاب التاريخ، كتاب العلوم، وكتاب الأدب. الأسعار تبدأ من عشرة ريالات.</p>
    <button id="buy">اشترِ الآن</button></body></html>`;
  const s = http.createServer((_q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); });
  return new Promise(res => s.listen(0, '127.0.0.1', () => { const a = s.address() as any; res({ url: `http://127.0.0.1:${a.port}/`, close: () => s.close() }); }));
}

// ---- stand-in local model (the role the user's Ollama plays): reads the page
// observation in the prompt and STREAMS a grounded describe-answer as JSON ----
function fakeOllama(): Promise<{ port: number; close: () => void; calls: () => number }> {
  let calls = 0;
  const s = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      calls++;
      const grounded = body.includes('متجر الكتب'); // proves the REAL page text reached the model
      const answer = grounded
        ? 'الصفحة بعنوان «مرحباً بكم في متجر الكتب» وتعرض ثلاثة كتب (التاريخ والعلوم والأدب) مع زر «اشترِ الآن».'
        : 'لم يصلني محتوى الصفحة';
      const payload = JSON.stringify({ action: 'done', answer });
      if (/"stream"\s*:\s*true/.test(body)) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        // stream in 3 chunks so the thinking ticker gets real deltas
        const third = Math.ceil(payload.length / 3);
        for (let i = 0; i < payload.length; i += third) {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: payload.slice(i, i + third) } }] })}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: payload } }] }));
      }
    });
  });
  return new Promise(r => s.listen(0, '127.0.0.1', () => {
    const a = s.address() as any;
    r({ port: a.port, close: () => s.close(), calls: () => calls });
  }));
}

async function main() {
  process.env.BROWSER_HEADED = '0';
  process.env.ENABLE_AUTH_BYPASS = 'true';
  const model = await fakeOllama();
  process.env.LOCAL_LLM_BASE_URL = `http://127.0.0.1:${model.port}`;
  process.env.LOCAL_LLM_MODEL = 'stand-in';
  process.env.LOCAL_LLM_STRICT = '1';

  // Import AFTER env is set (providers read env at module load).
  const { BrowserAgent, isReadTask } = await import('./src/orchestration/agents/BrowserAgent');

  let failures = 0;
  const check = (n: string, c: boolean, x = '') => { console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${x ? '  -> ' + x : ''}`); if (!c) failures++; };

  const srv = await site();
  const task = `افتح ${srv.url} وانظر إلى الصفحة وصِف لي ما تراه فيها`;
  check('the exact user prompt is detected as a READ task', isReadTask(task) === true);
  check('an interactive task is NOT a read task', isReadTask('سجل دخولي إلى موقع github.com') === false);

  // The panel's transport: WS server + a client subscribed to panel-browser —
  // exactly what the UI does.
  const httpServer = http.createServer();
  const wss = new WebSocketServer({ server: httpServer });
  attachBrowserWss(wss);
  await new Promise<void>(r => httpServer.listen(0, '127.0.0.1', () => r()));
  const wsPort = (httpServer.address() as any).port;
  const stepEvents: any[] = [];
  const thinkingEvents: any[] = [];
  const client = new WebSocket(`ws://127.0.0.1:${wsPort}/?sessionId=panel-browser`);
  client.on('message', buf => {
    try {
      const ev = JSON.parse(String(buf));
      if (ev.type === 'agent_step') stepEvents.push(ev);
      if (ev.type === 'agent_thinking') thinkingEvents.push(ev);
    } catch { /* ignore */ }
  });
  await new Promise<void>((res, rej) => { client.on('open', () => res()); client.on('error', rej); });

  // Run the agent EXACTLY as the orchestrator does: no sessionId in input, chat
  // session id in context (this used to send everything to an invisible session).
  const agent = new BrowserAgent();
  const t0 = Date.now();
  const r = await agent.execute(task, {}, { userId: 'u1', sessionId: '6a6a20d5967283cdfb06bd92' });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  await new Promise(res => setTimeout(res, 300)); // let WS flush

  const out = r.output || {};
  check('agent finished ok', r.ok === true, JSON.stringify({ ok: r.ok, status: out.status }));
  check('status is done (no step-limit failure)', out.status === 'done', out.status);
  check('answer is grounded in the REAL page', /متجر الكتب/.test(String(out.answer || '')), String(out.answer || '').slice(0, 80));
  check('real evidence attached (final page)', !!out.evidence && /متجر الكتب|صفحة الاختبار/.test(`${out.evidence.title} ${out.evidence.snippet}`));
  check('ONE model call only (read mode, no wandering)', model.calls() === 1, `calls=${model.calls()}`);
  check('panel session received agent steps (visible!)', stepEvents.length >= 2, `steps=${stepEvents.length}`);
  check('panel received LIVE thinking deltas', thinkingEvents.filter(e => e.delta).length >= 2, `deltas=${thinkingEvents.filter(e => e.delta).length}`);
  check('thinking stream closed with done marker', thinkingEvents.some(e => e.done === true));
  console.log(`  (i) total wall time: ${secs}s`);

  client.close();
  await new Promise<void>(res => wss.close(() => res()));
  httpServer.close();
  await stopSession('panel-browser');
  srv.close(); model.close();
  console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e => { console.error('crashed:', e); process.exit(2); });
