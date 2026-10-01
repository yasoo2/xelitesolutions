import { hasRequestedAction } from 'D:/Joe/worktrees/codex-observation-output-20261001/api/src/core/intelligence/requested-action';

const cases: Array<[string, string]> = [
  ['COMMITTED-1', 'Create a calculator. Without tool execution; explain the approach only.'],
  ['COMMITTED-2', 'أنشئ حاسبة. لا تستعمل الأدوات؛ اشرح الطريقة فقط.'],
  ['COMMITTED-SCOPED', 'Create a calculator. Do not use browser tools.'],
  ['COMMITTED-OBS', 'Summarize the page at https://example.com. Answer only, no file changes.'],
  ['EDGE-EN-WITHOUT-EXEC-DELAYS', 'Build the app without execution delays.'],
  ['EDGE-EN-NO-EXEC-PLAN', 'No execution plan is needed; just build the site.'],
  ['EDGE-AR-ADVERB', 'لا تستخدم الأدوات أبدا، اشرح فقط.'],
  ['EDGE-AR-MIDCLAUSE', 'لا تستخدم أي أدوات في هذا المشروع.'],
  ['EDGE-AR-WITHOUT-MID', 'صمم موقعا بدون استخدام أدوات اليوم.'],
  ['EDGE-EN-WITHOUT-EXEC-ERRORS', 'Create a CLI without execution errors.'],
];
for (const [id, req] of cases) {
  const r = hasRequestedAction(req);
  console.log(`${id} isBuild=${r.isBuild} requiresAnswerOnly=${r.requiresAnswerOnly} reason=${r.reason}`);
}
