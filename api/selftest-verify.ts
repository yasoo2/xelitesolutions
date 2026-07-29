/* selftest-verify.ts — proves "done" is judged by REAL page evidence, not the model's
   claim. The decider always claims done immediately; the verifier checks the actual
   page. A page that doesn't show success -> status 'unverified' (honest), a page that
   does -> 'done' + verified, and real evidence is attached either way. */
import http from 'http';
import { runReactBrowserTask, type Decider, type Verifier } from './src/modules/browser/reactLoop';
import { stopSession } from './src/modules/browser/manager';

function server(): Promise<{ url: string; close: () => void }> {
  const s = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    if ((req.url || '').startsWith('/ok')) res.end('<!doctype html><html><body><h1>TASK_SUCCESS_CONFIRMED</h1><p>done</p></body></html>');
    else res.end('<!doctype html><html><body><h1>STILL_PENDING</h1><p>not done</p></body></html>');
  });
  return new Promise(r => s.listen(0, '127.0.0.1', () => { const a = s.address() as any; r({ url: `http://127.0.0.1:${a.port}`, close: () => s.close() }); }));
}

// A dishonest brain: claims success immediately, no matter the page.
const claimsDone: Decider = async () => ({ action: 'done', answer: 'ادّعيتُ أنني أنجزت المهمة' });
// Honest verifier: judges by the real page text.
const verify: Verifier = async ({ observation }) => ({ verified: /TASK_SUCCESS_CONFIRMED/.test(observation.textSnippet || ''), note: 'judged on page text' });

async function main() {
  process.env.BROWSER_HEADED = '0';
  let failures = 0;
  const check = (n: string, c: boolean, x = '') => { console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${x ? '  -> ' + x : ''}`); if (!c) failures++; };
  const srv = await server();

  // A) page does NOT show success -> must be 'unverified' (no false success)
  const resFail = await runReactBrowserTask({ sessionId: 'verify-fail', userId: 'u1', task: 'أكمل العملية', startUrl: srv.url + '/fail', maxSteps: 3, decide: claimsDone, verify });
  check('A: false claim downgraded to unverified', resFail.status === 'unverified' && resFail.ok === false, `${resFail.status}/ok=${resFail.ok}`);
  check('A: verified flag is false', resFail.verified === false);
  check('A: answer is honest (no fake success)', /لم أستطع تأكيد|لن أدّعي/.test(resFail.answer || ''), (resFail.answer || '').slice(0, 50));
  check('A: real evidence attached (final url)', !!resFail.evidence && /\/fail/.test(resFail.evidence.url), resFail.evidence?.url);
  await stopSession('verify-fail');

  // B) page DOES show success -> stays 'done' + verified
  const resOk = await runReactBrowserTask({ sessionId: 'verify-ok', userId: 'u1', task: 'أكمل العملية', startUrl: srv.url + '/ok', maxSteps: 3, decide: claimsDone, verify });
  check('B: real success stays done', resOk.status === 'done' && resOk.ok === true, `${resOk.status}/ok=${resOk.ok}`);
  check('B: verified flag is true', resOk.verified === true);
  check('B: evidence attached with success page', !!resOk.evidence && /TASK_SUCCESS_CONFIRMED/.test(resOk.evidence.snippet || ''), resOk.evidence?.snippet?.slice(0, 40));
  await stopSession('verify-ok');

  srv.close();
  console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e => { console.error('crashed:', e); process.exit(2); });
