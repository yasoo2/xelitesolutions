import { boundedReadNavigationUnderFileConstraint as permits } from 'D:/Joe/worktrees/codex-readonly-browser-20261004/api/src/core/intelligence/bounded-read-navigation';

describe('muse adversarial probe (observation only, no verdict change)', () => {
  test.each([
    ['Open https://example.com as shown in "the deployment docs". No file changes.'],
    ['Open https://example.com. Do not modify any files.'],
    ['OPEN HTTPS://EXAMPLE.COM. NO FILE CHANGES.'],
    ['Open https://example.com and report. Without file changes.'],
    ['Please open https://example.com now. Do not create files.'],
    ['Open example.com for status. No file changes.'],
    ['Open https://example.com; DROP TABLE users. No file changes.'],
    ['Open https://example.com. Do not use any paid provider. No file changes.'],
    ['Open https://example.com https://example.com. No file changes.'],
    ['Go to https://example.com, then summarize. Do not edit or remove any files.'],
  ])('probe: %s', (goal) => {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ goal: (goal as string).slice(0, 70), got: permits(goal as string) }));
  });
});
