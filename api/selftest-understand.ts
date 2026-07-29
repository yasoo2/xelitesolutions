/* selftest-understand.ts — proves the LANGUAGE-UNIVERSAL understanding layer:
   dialect Arabic, missing letters/typos, and other world languages now route
   through the REAL PlanningEngine to the right tool, and unmistakable web
   requests skip the slow LLM intent analysis (IntentParser.quickIntent).
   All asserted paths are deterministic — no network, no model. */
import { normalizeIntentText } from './src/core/orchestrator/promptNormalizer';
import { PlanningEngine } from './src/core/orchestrator/PlanningEngine';
import { IntentParser } from './src/core/intelligence/IntentParser';
import { isReadTask } from './src/orchestration/agents/BrowserAgent';

async function plan(goal: string) {
  return PlanningEngine.generatePlan({ intent: { goal, type: 'task' } as any });
}

async function main() {
  let failures = 0;
  const check = (n: string, c: boolean, x = '') => { console.log(`  [${c ? 'PASS' : 'FAIL'}] ${n}${x ? '  -> ' + x : ''}`); if (!c) failures++; };

  // ---- the normalizer itself ----
  const n1 = normalizeIntentText('فوت على جيت هاب وسجل دخولو بحسابي');
  check('dialect فوت -> ادخل', n1.includes('ادخل'), n1);
  check('typo دخولو -> دخول (fuzzy)', n1.includes('دخول'), n1);
  const n2 = normalizeIntentText('شوف الصفحة وقولي ايش فيها');
  check('dialect شوف -> انظر, ايش -> ماذا', n2.includes('انظر') && n2.includes('ماذا'), n2);
  check('french: ouvre/decris -> open/describe', (() => { const n = normalizeIntentText('ouvre la page et décris-la'); return n.includes('open') && n.includes('describe'); })());
  check('russian: открой/опиши -> open/describe', (() => { const n = normalizeIntentText('Открой сайт и опиши страницу'); return n.includes('open') && n.includes('describe') && n.includes('page'); })());
  check('chinese: 打开/网页 -> open/page (substring)', (() => { const n = normalizeIntentText('打开网页'); return n.includes('open') && n.includes('page'); })());
  check('accents folded: öffne -> open', normalizeIntentText('öffne die Seite').includes('open'));
  check('typo searh -> search (fuzzy)', normalizeIntentText('searh for hotels').includes('search'));

  // ---- real routing through PlanningEngine (deterministic fast-paths) ----
  const p1 = await plan('فوت على موقع جيت هاب وسجل دخولو بحسابي');
  check('dialect+typo login routes to ReAct agent', p1.steps[0]?.tool === 'browser_run', p1.steps[0]?.tool);

  const p2 = await plan('شوف صفحة https://example.com وقولي ايش فيها');
  check('dialect describe routes to ReAct agent', p2.steps[0]?.tool === 'browser_run', p2.steps[0]?.tool);

  const p3 = await plan('dime que hay en https://example.com');
  check('spanish describe routes to ReAct agent', p3.steps[0]?.tool === 'browser_run', p3.steps[0]?.tool);

  const p4 = await plan('Открой https://example.com и опиши страницу');
  check('russian describe routes to ReAct agent', p4.steps[0]?.tool === 'browser_run', p4.steps[0]?.tool);

  const p5 = await plan('دور لي على افضل مطاعم صنعاء');
  check('dialect دور routes to search', p5.steps[0]?.tool === 'browser_search', p5.steps[0]?.tool);
  check('search query kept in the USER\'S words', /مطاعم\s*صنعاء/.test(String(p5.steps[0]?.input?.query || '')), p5.steps[0]?.input?.query);

  // regressions: canonical MSA/English routing unchanged
  const p6 = await plan('سجل دخولي إلى موقع github.com');
  check('MSA login still ReAct', p6.steps[0]?.tool === 'browser_run', p6.steps[0]?.tool);
  const p7 = await plan('اقرأ بريدي');
  check('Gmail fast-path intact', p7.steps[0]?.tool === 'google_account', p7.steps[0]?.tool);

  // ---- read-mode detection across languages ----
  check('read task: dialect', isReadTask('شوف الصفحة وقولي ايش فيها') === true);
  check('read task: french', isReadTask('ouvre https://x.com et décris la page') === true);
  check('interactive stays interactive', isReadTask('سجل دخولي إلى الموقع') === false);

  // ---- the speed bypass: obvious web tasks skip the LLM intent pass ----
  const q1 = IntentParser.quickIntent('افتح https://example.com وصف لي ما تراه');
  check('quick intent fires on URL task (skips ~50s LLM pass)', !!q1 && q1.suggestedAgent === 'Browser');
  const q2 = IntentParser.quickIntent('فوت على موقع جيت هاب وسجل دخولو');
  check('quick intent fires on dialect web task', !!q2 && q2.suggestedAgent === 'Browser');
  const q3 = IntentParser.quickIntent('ما هي عاصمة فرنسا؟');
  check('ambiguous question still gets full analysis', q3 === null);
  const q4 = IntentParser.quickIntent('اشرح لي الفرق بين HTTP و HTTPS');
  check('general question not hijacked to browser', q4 === null);
  // The exact live-test prompt that WRONGLY hit the slow ~50s analysis:
  const q5 = IntentParser.quickIntent('ادخل على جيت هاب وسجل الدخول الى حسابي');
  check('login-to-named-site fires fast intent (no URL, no "موقع")', !!q5 && q5.suggestedAgent === 'Browser');
  const q6 = IntentParser.quickIntent('افتح يوتيوب');
  check('open a known site (يوتيوب) fires fast intent', !!q6);
  const q7 = IntentParser.quickIntent('سجل دخولي');
  check('bare login verb fires fast intent', !!q7);
  const q8 = IntentParser.quickIntent('صف لي الفرق بين المتغيرات الثابتة والمتغيرة');
  check('"صف الفرق بين..." is NOT hijacked to browser', q8 === null, JSON.stringify(q8));

  // ---- continue-on-live-page: the bug where «اضغط على الزر» got a TEXT answer ----
  const p9 = await plan('اضغط على زر تسجيل الدخول');
  check('bare "click the login button" -> browser_run (not a text answer)', p9.steps[0]?.tool === 'browser_run', p9.steps[0]?.tool);
  check('continuation runs in resume mode (no re-navigation)', p9.steps[0]?.input?.resume === true);
  const p10 = await plan('اكتب في حقل البريد الإلكتروني');
  check('"type in the email field" -> browser_run', p10.steps[0]?.tool === 'browser_run', p10.steps[0]?.tool);
  const p11 = await plan('انزل تحت واختر من القائمة');
  check('"scroll down and pick from the menu" -> browser_run', p11.steps[0]?.tool === 'browser_run', p11.steps[0]?.tool);
  // Guard: a general "write/click" with NO UI noun and no live page must NOT be hijacked.
  const p12 = await plan('اكتب لي قصيدة عن الوطن');
  check('"write me a poem" is NOT hijacked to the browser', p12.steps[0]?.tool !== 'browser_run', p12.steps[0]?.tool);
  const q9 = IntentParser.quickIntent('اضغط على الزر الأزرق');
  check('interaction+UI verb fires fast intent', !!q9 && q9.suggestedAgent === 'Browser');

  console.log(`\n${failures === 0 ? 'ALL GREEN' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch(e => { console.error('crashed:', e); process.exit(2); });
