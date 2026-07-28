// selftest-persist.ts — proves login state auto-persists across a full browser
// session stop/restart, using the REAL manager code + Playwright Chromium.
// Build with esbuild then run:  node dist-selftest-persist.js
import { getBrowserSession, stopSession, saveBrowserSession, hasSavedBrowserSession, clearBrowserSession } from './src/modules/browser/manager';

const SID = 'persist-selftest';

async function main() {
  let failures = 0;
  const check = (name: string, cond: boolean, extra = '') => {
    console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${name}${extra ? '  -> ' + extra : ''}`);
    if (!cond) failures++;
  };

  // clean slate
  await clearBrowserSession(SID);

  // 1) open a session and simulate a login by planting a cookie (no network needed)
  const s1 = await getBrowserSession(SID);
  await s1.context.addCookies([{
    name: 'joe_login', value: 'secret-abc-123',
    domain: '.example.com', path: '/', httpOnly: false, secure: true, sameSite: 'Lax',
    expires: Math.floor(Date.now() / 1000) + 3600,
  }]);
  const saved = await saveBrowserSession(SID);
  check('explicit save reports cookies', saved.ok && (saved.cookies || 0) >= 1, JSON.stringify(saved));
  check('saved state file exists on disk', hasSavedBrowserSession(SID));

  // 2) stop the session (auto-saves final state) and reopen it fresh
  await stopSession(SID);
  const s2 = await getBrowserSession(SID);
  const cookies = await s2.context.cookies('https://www.example.com/');
  const found = cookies.find(c => c.name === 'joe_login');
  check('login cookie RESTORED after restart', !!found && found.value === 'secret-abc-123',
    found ? `value=${found.value}` : `cookies=${JSON.stringify(cookies)}`);

  // 3) logout clears it
  await clearBrowserSession(SID);
  await stopSession(SID);
  check('clear removes saved state', !hasSavedBrowserSession(SID));

  await stopSession(SID).catch(() => {});
  console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e => { console.error('crashed:', e); process.exit(2); });
