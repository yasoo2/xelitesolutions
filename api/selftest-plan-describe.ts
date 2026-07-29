/* selftest-plan-describe.ts — proves the PLANNING fix from the user's first live test:
   «افتح <URL> وانظر إلى الصفحة وصِف لي ما تراه» must route to the ReAct browser AGENT
   (browser_run: observe -> decide -> answer, with vision fallback), NOT to the blind
   browser_launch fast-path that just opens the URL and stops. Also regression-checks
   that plain "open"/login/search/compound routings kept their behaviour. All the
   asserted paths are deterministic (they return BEFORE any LLM call) — no network. */
import { PlanningEngine } from './src/core/orchestrator/PlanningEngine';

async function plan(goal: string) {
  return PlanningEngine.generatePlan({ intent: { goal, type: 'task' } as any });
}

async function main() {
  let failures = 0;
  const check = (n: string, c: boolean, x = '') => { console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${x ? '  -> ' + x : ''}`); if (!c) failures++; };

  // THE BUG from the user's live test: describe-a-page went to browser_launch.
  const p1 = await plan('افتح https://www.google.com/recaptcha/api2/demo وانظر إلى الصفحة وصِف لي ما تراه فيها');
  check('describe-page routes to the ReAct agent (browser_run)', p1.steps[0]?.tool === 'browser_run', p1.steps[0]?.tool);

  const p2 = await plan('افتح https://example.com وأخبرني بما تراه');
  check('"tell me what you see" routes to browser_run', p2.steps[0]?.tool === 'browser_run', p2.steps[0]?.tool);

  const p3 = await plan('describe what you see on https://example.com');
  check('English describe routes to browser_run', p3.steps[0]?.tool === 'browser_run', p3.steps[0]?.tool);

  // REGRESSIONS: existing routings must not change.
  const p4 = await plan('افتح المتصفح');
  check('bare "open the browser" still browser_launch', p4.steps[0]?.tool === 'browser_launch', p4.steps[0]?.tool);

  const p5 = await plan('سجل دخولي إلى موقع github.com');
  check('login still routes to browser_run (ReAct)', p5.steps[0]?.tool === 'browser_run', p5.steps[0]?.tool);

  const p6 = await plan('ابحث عن أفضل مطاعم الرياض');
  check('search still routes to browser_search', p6.steps[0]?.tool === 'browser_search', p6.steps[0]?.tool);

  const p7 = await plan('افتح https://news.example.com واحفظ الملخص في ملف news.txt');
  check('browser+file compound intact (browse first)', p7.steps[0]?.tool === 'browser_run' && p7.steps[1]?.tool === 'write_file',
    `${p7.steps[0]?.tool},${p7.steps[1]?.tool}`);

  const p8 = await plan('اقرأ بريدي');
  check('Gmail fast-path intact', p8.steps[0]?.tool === 'google_account', p8.steps[0]?.tool);

  console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e => { console.error('crashed:', e); process.exit(2); });
