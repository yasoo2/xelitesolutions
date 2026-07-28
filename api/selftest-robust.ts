/* selftest-robust.ts — proves the robustness upgrades on a REAL Chromium against a
   real page that has (1) a cookie/consent overlay blocking everything, (2) a <select>
   dropdown, and (3) content that appears only after a delay. The brain reasons over
   the live observation; a pass shows the loop auto-dismisses consent, waits for
   dynamic content, and picks a dropdown option — end to end. */
import http from 'http';
import { runReactBrowserTask, observePage, dismissConsent, type Decider } from './src/modules/browser/reactLoop';
import { getBrowserSession, stopSession } from './src/modules/browser/manager';

function site(): Promise<{ url: string; close: () => void }> {
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"></head><body>
    <div id="consent" style="position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999">
      <div style="background:#fff;padding:24px;border-radius:12px">
        <p>نستخدم ملفّات تعريف الارتباط.</p>
        <button onclick="document.getElementById('consent').remove()">قبول الكل</button>
      </div>
    </div>
    <h1>الطلب</h1>
    <label>البلد:
      <select id="country"><option value="">اختر</option><option value="sa">السعودية</option><option value="eg">مصر</option><option value="ps">فلسطين</option></select>
    </label>
    <button id="go" onclick="setTimeout(function(){document.getElementById('r').textContent='تم الحجز إلى '+document.getElementById('country').value;},700)">تأكيد</button>
    <p id="r"></p>
  </body></html>`;
  const s = http.createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); });
  return new Promise(r => s.listen(0, '127.0.0.1', () => { const a = s.address() as any; r({ url: `http://127.0.0.1:${a.port}/`, close: () => s.close() }); }));
}

// Brain: pick فلسطين in the dropdown, confirm, finish when the (delayed) result shows.
const brain: Decider = async ({ observation, history }) => {
  const txt = observation.textSnippet || '';
  if (/تم الحجز إلى\s*ps/i.test(txt)) return { action: 'done', answer: 'تم الحجز' };
  const selectEl = observation.elements.find(e => e.tag === 'select');
  const goBtn = observation.elements.find(e => e.tag === 'button' && /تأكيد|go/i.test(e.text));
  const selected = history.some(h => h.action.action === 'select');
  if (selectEl && !selected) return { action: 'select', index: selectEl.index, value: 'ps' };
  if (goBtn) return { action: 'click', index: goBtn.index };
  return { action: 'ask_user', message: 'stuck' };
};

async function main() {
  process.env.BROWSER_HEADED = '0';
  let failures = 0;
  const check = (n: string, c: boolean, x = '') => { console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${x ? '  -> ' + x : ''}`); if (!c) failures++; };
  const srv = await site();
  const SID = 'robust';

  // Direct check: consent overlay is present, then dismissConsent removes it.
  const s = await getBrowserSession(SID);
  await s.page.goto(srv.url, { waitUntil: 'domcontentloaded' });
  const beforeHasConsent = await s.page.evaluate(() => !!document.getElementById('consent'));
  const clicked = await dismissConsent(s.page);
  const afterHasConsent = await s.page.evaluate(() => !!document.getElementById('consent'));
  check('consent overlay detected then dismissed', beforeHasConsent && clicked === 'قبول الكل' && !afterHasConsent, `clicked="${clicked}"`);

  // Observation exposes the dropdown WITH its options.
  const obs = await observePage(s.page);
  const sel = obs.elements.find(e => e.tag === 'select');
  check('dropdown surfaced with its options', !!sel && /options:.*فلسطين/.test(sel?.text || ''), sel?.text || 'no select');
  await stopSession(SID);

  // Full loop: dismiss consent (auto), select فلسطين, confirm, wait for delayed result.
  const res = await runReactBrowserTask({ sessionId: SID, userId: 'u1', task: 'احجز إلى فلسطين', startUrl: srv.url, maxSteps: 8, decide: brain });
  check('loop completed on the tricky page', res.status === 'done' && res.ok === true, res.summary);
  const s2 = await getBrowserSession(SID);
  const finalText = await s2.page.evaluate(() => document.body.innerText).catch(() => '');
  check('dropdown selection took effect (delayed result)', /تم الحجز إلى\s*ps/i.test(finalText), finalText.replace(/\n/g, ' ').slice(0, 60));
  check('consent never blocked the task (no overlay at end)', !(await s2.page.evaluate(() => !!document.getElementById('consent'))));
  await stopSession(SID);

  srv.close();
  console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e => { console.error('crashed:', e); process.exit(2); });
