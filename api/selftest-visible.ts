/* selftest-visible.ts — proves the two fixes for "I saw nothing":
   A) SESSION RACE: two concurrent getBrowserSession() calls for the same id used to
      launch TWO browsers (agent drives one, panel streams the other — blank screen).
      Now they must return the SAME session object.
   B) CHAT MIRROR: the agent's activity must reach JOE'S CHAT channel (the real
      /api/ws socket): tidy thinking_detail step lines + thinking_phase (the green
      indicator), keyed to the CHAT session id — while the browser panel keeps
      getting its own agent_step events. Real HTTP server + real attachWebSocket +
      real Chromium + stand-in local model. Deterministic. */
import http from 'http';
import { WebSocket } from 'ws';

function site(): Promise<{ url: string; close: () => void }> {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>صفحة الاختبار</title></head>
    <body><h1>مرحباً بكم في متجر الكتب</h1>
    <p>هذه صفحة تجريبية تعرض ثلاثة كتب: كتاب التاريخ، كتاب العلوم، وكتاب الأدب. الأسعار تبدأ من عشرة ريالات.</p></body></html>`;
  const s = http.createServer((_q, r) => { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); });
  return new Promise(res => s.listen(0, '127.0.0.1', () => { const a = s.address() as any; res({ url: `http://127.0.0.1:${a.port}/`, close: () => s.close() }); }));
}

function fakeOllama(): Promise<{ port: number; close: () => void }> {
  const s = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      const grounded = body.includes('متجر الكتب');
      const payload = JSON.stringify({ action: 'done', answer: grounded ? 'الصفحة تعرض متجر كتب فيه ثلاثة كتب.' : 'بلا محتوى' });
      if (/"stream"\s*:\s*true/.test(body)) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        for (const ch of [payload.slice(0, 20), payload.slice(20)]) {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: ch } }] })}\n\n`);
        }
        res.write('data: [DONE]\n\n'); res.end();
      } else {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: payload } }] }));
      }
    });
  });
  return new Promise(r => s.listen(0, '127.0.0.1', () => r({ port: (s.address() as any).port, close: () => s.close() })));
}

async function main() {
  process.env.BROWSER_HEADED = '0';
  process.env.ENABLE_AUTH_BYPASS = 'true';
  const model = await fakeOllama();
  process.env.LOCAL_LLM_BASE_URL = `http://127.0.0.1:${model.port}`;
  process.env.LOCAL_LLM_MODEL = 'stand-in';
  process.env.LOCAL_LLM_STRICT = '1';

  const { getBrowserSession, stopSession } = await import('./src/modules/browser/manager');
  const { attachWebSocket } = await import('./src/api/ws');
  const { BrowserAgent } = await import('./src/orchestration/agents/BrowserAgent');

  let failures = 0;
  const check = (n: string, c: boolean, x = '') => { console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${x ? '  -> ' + x : ''}`); if (!c) failures++; };

  // ---- A) the session race: concurrent gets must share ONE browser ----
  const [s1, s2, s3] = await Promise.all([
    getBrowserSession('race-test'), getBrowserSession('race-test'), getBrowserSession('race-test'),
  ]);
  check('concurrent getBrowserSession returns the SAME session (no split browser)', s1 === s2 && s2 === s3);
  await stopSession('race-test');

  // ---- B) chat mirror through the REAL WS stack ----
  const server = http.createServer();
  attachWebSocket(server);
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as any).port;

  const chatEvents: any[] = [];
  const panelEvents: any[] = [];
  const chatWs = new WebSocket(`ws://127.0.0.1:${port}/api/ws`);
  chatWs.on('message', b => { try { chatEvents.push(JSON.parse(String(b))); } catch { } });
  await new Promise<void>((res, rej) => { chatWs.on('open', () => res()); chatWs.on('error', rej); });
  const panelWs = new WebSocket(`ws://127.0.0.1:${port}/ws/browser?sessionId=panel-browser`);
  panelWs.on('message', b => { try { panelEvents.push(JSON.parse(String(b))); } catch { } });
  await new Promise<void>((res, rej) => { panelWs.on('open', () => res()); panelWs.on('error', rej); });

  const srv = await site();
  const agent = new BrowserAgent();
  const CHAT_SID = 'chat-session-123';
  const r = await agent.execute(`افتح ${srv.url} وصِف لي ما تراه فيها`, {}, { userId: 'u1', sessionId: CHAT_SID });
  await new Promise(res => setTimeout(res, 400));

  check('agent finished done', r.ok === true && r.output?.status === 'done', r.output?.status);

  const details = chatEvents.filter(e => e.type === 'thinking_detail' && e?.data?.sessionId === CHAT_SID).map(e => String(e.data.detail));
  const phases = chatEvents.filter(e => e.type === 'thinking_phase' && e?.data?.sessionId === CHAT_SID).map(e => String(e.data.phase));
  check('CHAT got tidy step lines (thinking_detail)', details.length >= 2, `lines=${details.length}`);
  check('chat lines include observe + decide/done', details.some(d => d.includes('يراقب')) && details.some(d => d.includes('قرّر') || d.includes('أنهى')),
    details.slice(0, 3).join(' | '));
  check('CHAT got the green indicator (thinking_phase)', phases.length >= 2, `phases=${[...new Set(phases)].join(',')}`);
  check('phases include executing (green cooking)', phases.includes('executing'));

  const panelSteps = panelEvents.filter(e => e.type === 'agent_step');
  const panelFrames = panelEvents.filter(e => e.type === 'stream_frame');
  check('panel still gets agent steps', panelSteps.length >= 2, `steps=${panelSteps.length}`);
  check('panel receives LIVE page frames (the site is visible)', panelFrames.length >= 1, `frames=${panelFrames.length}`);

  chatWs.close(); panelWs.close();
  await stopSession('panel-browser');
  await new Promise<void>(res => server.close(() => res()));
  srv.close(); model.close();
  console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e => { console.error('crashed:', e); process.exit(2); });
