import { hasRequestedAction } from 'D:/Joe/worktrees/codex-readonly-browser-20261004/api/src/core/intelligence/requested-action';

describe('muse F1 follow-up probe (exact amended bytes, read-only)', () => {
  test.each([
    // [label, goal, expectAff, expectDenial]
    ['F1: wasf-only + build denies', 'وصف فقط ثم ابني متجر', false, true],
    ['bare wasf-only denies', 'وصف فقط', false, true],
    ['positive: explain-then-build stays affirmative', 'اشرح النهج باختصار ثم ابني محول وحدات', true, false],
    ['positive: wadeh-then-build stays affirmative', 'وضح التصميم ثم صمم تطبيق مهام', true, false],
    ['prior denial: ishrah-only + build', 'اشرح فقط النهج ثم ابني محول وحدات', false, true],
    ['prior denial: without-any-execution + build', 'اشرح النهج بدون أي تنفيذ ثم ابني محول وحدات', false, true],
    ['EN negative-constraints build stays affirmative', 'Build a calculator. Do not create a database', true, false],
    ['EN quoted denial + build stays affirmative', 'Explain what "do not create files" means, then build a demo page', true, false],
    ['AR quoted denial + build stays affirmative', 'اشرح معنى "بدون تنفيذ" ثم ابني صفحة تجريبية', true, false],
  ])('assert: %s', (_label, goal, expectAff, expectDenial) => {
    const r = hasRequestedAction(goal as string);
    expect(r.hasAffirmativeAction).toBe(expectAff);
    expect(r.hasDenial).toBe(expectDenial);
  });

  test('inherited EN record case shape preserved (no affirmative)', () => {
    const r = hasRequestedAction('Record expenses with amount, category, date');
    expect(r.hasAffirmativeAction).toBe(false);
  });

  test.each([
    ['punctuation: وصف فقط، ثم ابني متجر', 'وصف فقط، ثم ابني متجر'],
    ['definite article: الوصف فقط ثم ابني متجر', 'الوصف فقط ثم ابني متجر'],
    ['scoped object: وصف فقط التطبيق ثم ابني متجر', 'وصف فقط التطبيق ثم ابني متجر'],
    ['R1 diacritized: بدون تَنْفِيذ', 'اشرح النهج بدون تَنْفِيذ ثم ابني محول وحدات'],
    ['imperative variant: صف فقط ثم ابني متجر', 'صف فقط ثم ابني متجر'],
  ])('observe: %s', (_label, goal) => {
    const r = hasRequestedAction(goal as string);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      label: _label, aff: r.hasAffirmativeAction, denial: r.hasDenial,
      answerOnly: r.isAnswerOnly, reason: r.reason,
    }));
  });
});
