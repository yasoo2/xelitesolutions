/* selftest-local-stream.ts — proves LocalProvider token STREAMING (Wave 4): against a
   fake OpenAI-compatible server it (a) streams tokens via onDelta in order and returns
   the full accumulated text, and (b) still works as a single blocking call when no
   onDelta is given (back-compat). Fully deterministic — a local fake server, no real
   model / no network. */
import http from 'http';
import { LocalProvider } from './src/core/llm/providers/local';

// Fake OpenAI-compatible endpoint: streams 3 SSE chunks when stream:true, else returns
// a normal completion. This is the shape Ollama's /v1/chat/completions speaks.
function fakeServer(): Promise<{ port: number; close: () => void; sawStream: () => boolean }> {
  let streamed = false;
  const s = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      const wantsStream = /"stream"\s*:\s*true/.test(body);
      if (wantsStream) {
        streamed = true;
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        const pieces = ['{"act', 'ion":"do', 'ne","answer":"تم"}'];
        for (const p of pieces) {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: '{"action":"done","answer":"تم"}' } }] }));
      }
    });
  });
  return new Promise(r => s.listen(0, '127.0.0.1', () => {
    const a = s.address() as any;
    r({ port: a.port, close: () => s.close(), sawStream: () => streamed });
  }));
}

async function main() {
  let failures = 0;
  const check = (n: string, c: boolean, x = '') => { console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${x ? '  -> ' + x : ''}`); if (!c) failures++; };

  const srv = await fakeServer();
  process.env.LOCAL_LLM_BASE_URL = `http://127.0.0.1:${srv.port}`;
  process.env.LOCAL_LLM_MODEL = 'fake-model';
  const provider = new LocalProvider();

  // (a) Streaming path: onDelta receives ordered chunks; return value is the full text.
  const deltas: string[] = [];
  const full = await provider.chatComplete(
    [{ role: 'user', content: 'decide' }],
    'fake-model',
    d => deltas.push(d),
  );
  check('server received a streaming request', srv.sawStream() === true);
  check('onDelta was called per chunk', deltas.length === 3, `chunks=${deltas.length}`);
  check('deltas arrived in order', deltas.join('') === '{"action":"done","answer":"تم"}', deltas.join(''));
  check('full accumulated text returned', full === '{"action":"done","answer":"تم"}', full);
  check('the streamed JSON parses to the real action', (() => {
    try { return JSON.parse(full).action === 'done'; } catch { return false; }
  })());

  // (b) Back-compat: no onDelta -> single blocking call, same result, no stream flag.
  const srv2 = await fakeServer();
  process.env.LOCAL_LLM_BASE_URL = `http://127.0.0.1:${srv2.port}`;
  const provider2 = new LocalProvider();
  const blocking = await provider2.chatComplete([{ role: 'user', content: 'decide' }], 'fake-model');
  check('blocking call returns text', blocking === '{"action":"done","answer":"تم"}', blocking);
  check('no stream requested when onDelta omitted', srv2.sawStream() === false);

  srv.close(); srv2.close();
  console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e => { console.error('crashed:', e); process.exit(2); });
