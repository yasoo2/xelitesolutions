/* selftest-thinking.ts — proves the LIVE THINKING STREAM (Wave 4) end to end: the ReAct
   loop passes an onThinking callback into the decider, and every chunk the decider emits
   is broadcast to the panel as an `agent_thinking` WS event (in order), followed by a
   done:true marker for that step. Uses a REAL Chromium page, a REAL WebSocket server +
   client (the same wsHub the panel uses), and a scripted streaming decider — no model /
   no network, fully deterministic. */
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { runReactBrowserTask, type Decider } from './src/modules/browser/reactLoop';
import { attachBrowserWss } from './src/modules/browser/wsHub';
import { stopSession } from './src/modules/browser/manager';

function site(): Promise<{ url: string; close: () => void }> {
  const html = `<!doctype html><html><head><meta charset="utf-8"></head>
    <body><h1>Ready</h1><button id="b">Click</button></body></html>`;
  const s = http.createServer((_q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); });
  return new Promise(res => s.listen(0, '127.0.0.1', () => { const a = s.address() as any; res({ url: `http://127.0.0.1:${a.port}/`, close: () => s.close() }); }));
}

// A decider that STREAMS its "thinking" token by token, then returns done.
const CHUNKS = ['أفكّر', ' في', ' الصفحة', '... ', 'القرار: done'];
const decide: Decider = async ({ onThinking }) => {
  for (const c of CHUNKS) { onThinking?.(c); }
  return { action: 'done', answer: 'انتهيت' };
};

async function main() {
  process.env.BROWSER_HEADED = '0';
  process.env.ENABLE_AUTH_BYPASS = 'true'; // let the test WS client connect without a token
  let failures = 0;
  const check = (n: string, c: boolean, x = '') => { console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${x ? '  -> ' + x : ''}`); if (!c) failures++; };

  const srv = await site();
  const SID = 'thinking-test';

  // Real WS server (the panel's transport) + a real client subscribed to this session.
  const httpServer = http.createServer();
  const wss = new WebSocketServer({ server: httpServer });
  attachBrowserWss(wss);
  await new Promise<void>(r => httpServer.listen(0, '127.0.0.1', () => r()));
  const wsPort = (httpServer.address() as any).port;

  const received: Array<{ delta: string; done?: boolean; step: number }> = [];
  const client = new WebSocket(`ws://127.0.0.1:${wsPort}/?sessionId=${SID}`);
  client.on('message', (buf) => {
    try { const ev = JSON.parse(String(buf)); if (ev.type === 'agent_thinking') received.push(ev); } catch { /* ignore */ }
  });
  await new Promise<void>((res, rej) => { client.on('open', () => res()); client.on('error', rej); });

  await runReactBrowserTask({ sessionId: SID, userId: 'u1', task: 'مهمة تجريبية', startUrl: srv.url, maxSteps: 3, decide });

  // Give the socket a moment to flush the last frames.
  await new Promise(r => setTimeout(r, 300));

  const deltas = received.filter(e => e.delta).map(e => e.delta);
  check('panel received live thinking events', received.length > 0, `events=${received.length}`);
  check('all expected chunks arrived', CHUNKS.every(c => deltas.includes(c)), deltas.join('|'));
  check('chunks arrived in the order emitted', deltas.join('') === CHUNKS.join(''), deltas.join(''));
  check('a done:true marker closed the step', received.some(e => e.done === true));
  check('events are tagged with the step number', received.every(e => typeof e.step === 'number' && e.step >= 1));

  client.close();
  await new Promise<void>(r => wss.close(() => r()));
  httpServer.close();
  await stopSession(SID);
  srv.close();
  console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e => { console.error('crashed:', e); process.exit(2); });
