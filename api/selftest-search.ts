/* selftest-search.ts — proves the NEW "search instead of giving up" behaviour end
   to end on REAL Chromium. The landing page does NOT contain the subject; it only
   has a search box. The read agent must: detect the real <input type=search>,
   move the cursor to it, type the subject, press Enter, land on the results page
   that DOES contain the subject, then read + answer from it. Real browser, real
   coordinate clicks/typing, real navigation — no mocking of the browser itself.
   The only stand-in is the local "model" (the role Ollama plays), which returns a
   grounded answer once the real results-page text reaches it. */
import http from 'http';
import { runReactBrowserTask } from './src/modules/browser/reactLoop';
import { makeReadDecider, extractSearchSubject, isReadTask } from './src/orchestration/agents/BrowserAgent';
import { stopSession } from './src/modules/browser/manager';

const SUBJECT = 'صدام حسين';

// A tiny 2-page site: "/" has ONLY a search box (no subject text); submitting it
// GETs "/?q=..." which, when the query mentions the subject, serves a page whose
// body actually contains the subject — the content the agent must read back.
function site(): Promise<{ url: string; close: () => void }> {
  const home = `<!doctype html><html><head><meta charset="utf-8"><title>الموسوعة</title></head>
    <body><h1>الصفحة الرئيسية للموسوعة</h1>
    <form action="/" method="GET">
      <input type="search" name="q" placeholder="ابحث في الموسوعة" aria-label="بحث">
      <button type="submit">بحث</button>
    </form>
    <p>مرحباً بك في الموسوعة الحرة. استخدم صندوق البحث بالأعلى.</p></body></html>`;
  const article = `<!doctype html><html><head><meta charset="utf-8"><title>${SUBJECT}</title></head>
    <body><h1>${SUBJECT}</h1>
    <p>${SUBJECT} (1937–2006) كان رئيس جمهورية العراق من عام 1979 حتى 2003. قاد البلاد خلال الحرب العراقية الإيرانية وحرب الخليج.</p>
    </body></html>`;
  const s = http.createServer((req, res) => {
    const u = new URL(req.url || '/', 'http://x');
    const q = u.searchParams.get('q') || '';
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    // Results page only when the search actually carried the subject.
    res.end(q.includes('صدام') ? article : home);
  });
  return new Promise(r => s.listen(0, '127.0.0.1', () => {
    const a = s.address() as any;
    r({ url: `http://127.0.0.1:${a.port}/`, close: () => s.close() });
  }));
}

// Stand-in local model: answers ONLY from the page text it is given. It returns a
// grounded answer when the real results-page text (containing the subject) reaches
// it — proving the agent navigated to the article before reading.
function fakeOllama(): Promise<{ port: number; close: () => void; calls: () => number }> {
  let calls = 0;
  const s = http.createServer((req, res) => {
    let body = ''; req.on('data', c => (body += c));
    req.on('end', () => {
      calls++;
      const grounded = body.includes('رئيس جمهورية العراق');
      const answer = grounded
        ? `${SUBJECT} كان رئيس العراق (1979–2003)، وقاد البلاد في الحرب العراقية الإيرانية وحرب الخليج.`
        : 'لا أرى معلومات عن هذا الموضوع في هذه الصفحة.';
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ action: 'done', answer }) } }] }));
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
  delete process.env.GROQ_API_KEY; // force the local stand-in model

  let failures = 0;
  const check = (n: string, c: boolean, x = '') => { console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${x ? '  -> ' + x : ''}`); if (!c) failures++; };

  const srv = await site();

  const task = `افتح ${srv.url} ولخّص لي عن ${SUBJECT}`;
  check('subject extracted from the request', extractSearchSubject(task) === SUBJECT, extractSearchSubject(task));
  check('classified as a READ task', isReadTask(task) === true);

  const r = await runReactBrowserTask({
    sessionId: 'panel-browser',
    userId: 'u1',
    task,
    startUrl: srv.url,           // land on the home page (search box, NO subject)
    maxSteps: 6,
    decide: makeReadDecider(),
  });

  const answer = String(r.answer || '');
  const acts = r.steps.map(s => s.action.action);
  check('agent did NOT give up — it searched (typed into the box)', acts.includes('type'), acts.join(','));
  check('agent submitted the search (Enter)', acts.includes('key'));
  check('finished with a real answer (status done)', r.status === 'done', r.status);
  check('answer is grounded in the ARTICLE it navigated to', /رئيس العراق|1979/.test(answer), answer.slice(0, 90));
  check('final page is the subject article (real navigation)', /q=/.test(String(r.finalUrl || '')) || /صدام/.test(String(r.evidence?.title || '')), String(r.finalUrl || ''));
  check('model answered only after the real page text reached it', model.calls() >= 1, `calls=${model.calls()}`);

  await stopSession('panel-browser');
  srv.close(); model.close();
  console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e => { console.error('crashed:', e); process.exit(2); });
