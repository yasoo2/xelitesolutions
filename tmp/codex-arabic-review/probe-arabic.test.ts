import { hasRequestedAction } from 'D:/Joe/worktrees/codex-readonly-browser-20261004/api/src/core/intelligence/requested-action';

describe('muse arabic-authority probe (observation only)', () => {
  test.each([
    ['EN quoted denial + build', 'Explain what "do not create files" means, then build a demo page'],
    ['EN explanation context', 'Specification: build a REST API. Answer only, do not execute.'],
    ['EN negative-constraints build (must stay affirmative)', 'Build a calculator. Do not create a database'],
    ['EN no-file-after-build (new deny expected)', 'Build a demo page but do not create files'],
    ['AR quoted denial + build', 'اشرح معنى "بدون تنفيذ" ثم ابني صفحة تجريبية'],
    ['AR diacritized denial + build', 'اشرح النهج بدون تَنْفِيذ ثم ابني محول وحدات'],
    ['EN inherited record case', 'Record expenses with amount, category, date'],
    ['empty input', ''],
    ['AR describe-only + build (وصف فقط edge)', 'وصف فقط التطبيق ثم ابني متجر'],
    ['AR reply-only + build (الرد فقط)', 'الرد فقط ثم ابني متجر'],
    ['AR explain-only + build (اشرح فقط)', 'اشرح فقط النهج ثم ابني متجر'],
  ])('probe: %s', (_label, goal) => {
    const r = hasRequestedAction(goal as string);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      label: _label,
      aff: r.hasAffirmativeAction,
      denial: r.hasDenial,
      answerOnly: r.isAnswerOnly,
      noFile: r.isNoFileChanges,
      reason: r.reason,
    }));
  });
});
