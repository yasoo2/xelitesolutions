import { hasRequestedAction } from 'D:/Joe/worktrees/codex-readonly-browser-20261004/api/src/core/intelligence/requested-action';

describe('muse wasf-only verification probe', () => {
  test.each([
    ['bare describe-only', 'وصف فقط'],
    ['describe-only + build', 'وصف فقط ثم ابني متجر'],
    ['reply-noexec + build', 'الرد بدون تنفيذ ثم ابني متجر'],
  ])('probe: %s', (_label, goal) => {
    const g = goal as string;
    const r = hasRequestedAction(g);
    const codes: number[] = [];
    for (let i = 0; i < Math.min(g.length, 12); i++) codes.push(g.charCodeAt(i));
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      label: _label, len: g.length, codes,
      aff: r.hasAffirmativeAction, denial: r.hasDenial,
      answerOnly: r.isAnswerOnly, noFile: r.isNoFileChanges, reason: r.reason,
    }));
  });
});
