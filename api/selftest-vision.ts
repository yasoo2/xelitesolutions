/* selftest-vision.ts — proves the VISION fallback: on a DOM-blind page (a canvas with
   no interactive elements/text), the loop captures a REAL screenshot and hands it to a
   vision function, whose click_at coordinates are executed on the real page. Uses a
   stand-in vision (the shape a local llava/moondream would fill) so the MECHANISM is
   verified end to end without a vision model in this sandbox. */
import http from 'http';
import { runReactBrowserTask, type Decider, type Vision } from './src/modules/browser/reactLoop';
import { getBrowserSession, stopSession } from './src/modules/browser/manager';

// A page with NO DOM text/elements — just a canvas. Clicking the marked spot flips a flag.
function site(): Promise<{ url: string; close: () => void }> {
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">
    <canvas id="c" width="400" height="300" style="display:block"></canvas>
    <script>
      const cv=document.getElementById('c'),x=cv.getContext('2d');
      x.fillStyle='#eee';x.fillRect(0,0,400,300);
      x.fillStyle='#2563eb';x.fillRect(150,120,100,60); // a blue "button" at ~center 200,150
      window.__clicked=false;
      cv.addEventListener('click',e=>{ const r=cv.getBoundingClientRect(); const px=e.clientX-r.left, py=e.clientY-r.top;
        if(px>150&&px<250&&py>120&&py<180){ window.__clicked=true; x.fillStyle='#16a34a'; x.fillRect(150,120,100,60);} });
    </script></body></html>`;
  const s = http.createServer((_q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(html); });
  return new Promise(res => s.listen(0, '127.0.0.1', () => { const a = s.address() as any; res({ url: `http://127.0.0.1:${a.port}/`, close: () => s.close() }); }));
}

// The DOM decider should NEVER be used here (page is DOM-blind) — assert that.
let domUsed = false;
const decide: Decider = async () => { domUsed = true; return { action: 'ask_user', message: 'dom used (should not happen)' }; };

// Stand-in vision: "sees" the blue button and clicks its center; then declares done.
let visionCalls = 0;
const vision: Vision = async ({ screenshotBase64, history }) => {
  visionCalls++;
  if (!screenshotBase64 || screenshotBase64.length < 100) return { action: 'ask_user', message: 'no screenshot' };
  const alreadyClicked = history.some(h => h.action.action === 'click_at');
  if (alreadyClicked) return { action: 'done', answer: 'نقرتُ الزر المرئي' };
  return { action: 'click_at', x: 200, y: 150 };
};

async function main() {
  process.env.BROWSER_HEADED = '0';
  let failures = 0;
  const check = (n: string, c: boolean, x = '') => { console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${x ? '  -> ' + x : ''}`); if (!c) failures++; };
  const srv = await site();
  const SID = 'vision-test';

  const res = await runReactBrowserTask({ sessionId: SID, userId: 'u1', task: 'انقر الزر الأزرق في الصفحة', startUrl: srv.url, maxSteps: 5, decide, vision });

  check('vision was used (DOM-blind page)', visionCalls > 0, `visionCalls=${visionCalls}`);
  check('DOM decider was NOT used', domUsed === false);
  check('loop finished', res.status === 'done', res.status);
  // Verify the click actually landed on the canvas button (real effect on the page).
  const s = await getBrowserSession(SID);
  const clicked = await s.page.evaluate(() => (window as any).__clicked === true).catch(() => false);
  check('real click registered on the canvas (screenshot->coords->click)', clicked === true);
  await stopSession(SID);

  srv.close();
  console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e => { console.error('crashed:', e); process.exit(2); });
