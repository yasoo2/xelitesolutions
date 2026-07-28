/* selftest-routing.ts — verifies the planner routes the RIGHT requests to the ReAct
   BrowserAgent (browser_run + agent "Browser") without touching the LLM or a browser.
   It also confirms search / Gmail / my-browser requests are NOT hijacked. */
import { PlanningEngine } from './src/core/orchestrator/PlanningEngine';

async function planFor(goal: string) {
  const plan: any = await PlanningEngine.generatePlan({ intent: { goal } as any });
  const step = plan?.steps?.[0] || {};
  return { tool: step.tool, agent: step.agent, task: step.description };
}

function isReactRoute(r: { tool?: string; agent?: string }) {
  return r.tool === 'browser_run' && r.agent === 'Browser';
}

async function main() {
  let failures = 0;
  const check = (name: string, cond: boolean, extra = '') => {
    console.log(`  [${cond ? 'PASS' : 'FAIL'}] ${name}${extra ? '  -> ' + extra : ''}`);
    if (!cond) failures++;
  };

  // --- SHOULD route to the ReAct agent ---
  const yes = [
    'سجّل دخولي إلى https://mail.example.com',
    'سجل دخول إلى موقع الجامعة',
    'ادخلني إلى حسابي في https://portal.example.com',
    'log in to https://github.com',
    'sign in to my account on the dashboard',
    'افتح https://shop.example.com واطلب المنتج',
    'go to https://forum.example.com and post a comment',
    'احجز موعداً على https://clinic.example.com',
  ];
  for (const g of yes) {
    const r = await planFor(g);
    check(`ROUTES: "${g.slice(0, 42)}"`, isReactRoute(r), `${r.tool}/${r.agent}`);
    if (isReactRoute(r)) check(`   carries task text`, r.task === g, r.task);
  }

  // --- should NOT be hijacked (kept on their proper paths) ---
  const no: Array<[string, string]> = [
    ['ابحث عن أفضل مطعم في نابلس', 'browser_search'],
    ['اقرأ بريدي الإلكتروني', 'google_account'],
    ['افتح https://example.com ولخّص المحتوى', 'browser_search|browser_smart'], // summarize -> smart/search, not agent
    ['اقرأ صفحتي في متصفحي الشخصي', 'user_browser'],
  ];
  for (const [g, expectTool] of no) {
    const r = await planFor(g);
    const notReact = !isReactRoute(r);
    check(`NOT hijacked: "${g.slice(0, 42)}"`, notReact, `${r.tool}/${r.agent}`);
  }

  console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e => { console.error('crashed:', e); process.exit(2); });
