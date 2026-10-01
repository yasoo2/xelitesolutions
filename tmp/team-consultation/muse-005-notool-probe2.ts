import { hasRequestedAction } from 'D:/Joe/worktrees/codex-observation-output-20261001/api/src/core/intelligence/requested-action';

const cases: Array<[string, string]> = [
  ['ISO-AR-DENY-ADVERB-BUILD', 'أنشئ حاسبة. لا تستخدم الأدوات أبدا.'],
  ['CTRL-AR-WITHOUT-END', 'أنشئ حاسبة بدون استخدام أي أدوات.'],
  ['CTRL-AR-DENY-END', 'أنشئ حاسبة. لا تستخدم الأدوات.'],
  ['CTRL-EN-SCOPED-KEPT', 'Create a calculator. Do not use any browser tools.'],
  ['ISO-EN-WITHOUT-TOOL-KEPT', 'Create a calculator without tool execution.'],
];
for (const [id, req] of cases) {
  const r = hasRequestedAction(req);
  console.log(`${id} isBuild=${r.isBuild} requiresAnswerOnly=${r.requiresAnswerOnly} reason=${r.reason}`);
}
