import { hasRequestedAction } from 'D:/Joe/worktrees/codex-observation-output-20261001/api/src/core/intelligence/requested-action';

const cases: Array<[string, string]> = [
  // F1/F2 committed controls (expect: build blocked only where a global denial exists)
  ['F2a اليوم', 'صمم موقعا بدون استخدام أدوات اليوم.'],
  ['F2b أبدا', 'أنشئ حاسبة. لا تستخدم الأدوات أبدا.'],
  ['F2c الآن', 'أنشئ حاسبة. لا تستخدم الأدوات الآن.'],
  ['F2scoped اليوم', 'صمم موقعا بدون استخدام أدوات المتصفح اليوم.'],
  ['F1a delays', 'Build the app without execution delays.'],
  ['F1b errors', 'Create a CLI without execution errors.'],
  ['F1keep tool', 'Create a calculator without tool execution.'],
  // Adjacent edges claimed still-open
  ['OPEN ctx-qual', 'لا تستخدم الأدوات في هذه الصفحة فقط لبناء التقرير.'],
  ['OPEN bare-No-plan', 'No execution plan is needed, just build it.'],
  // New allowlist safety probes (must still BUILD: scoped + adverb)
  ['ADV scoped-Atlas?', 'أنشئ حاسبة. لا تستخدم أدوات المتصفح أبدا.'],
  ['ADV إطلاقا global', 'صمم موقعا بدون استخدام أدوات إطلاقا.'],
  ['ADV نهائيا global', 'أنشئ حاسبة. لا تستخدم الأدوات نهائيا.'],
  ['ADV فقط global', 'صمم موقعا بدون استخدام أدوات فقط.'],
  ['ADV الان unhamzated?', 'أنشئ حاسبة. لا تستخدم الأدوات الان.'],
  ['ADV ابدا unhamzated?', 'أنشئ حاسبة. لا تستخدم الأدوات ابدا.'],
];
for (const [id, req] of cases) {
  const r = hasRequestedAction(req);
  console.log(`${id} => isBuild=${r.isBuild} answerOnly=${r.requiresAnswerOnly} reason=${r.reason}`);
}
