# Issue 89 Verification Evidence

Date: 2026-09-22

## Change-aware offline records recovery

- A standalone, dependency-free records request may recover to the marked
  `static_records` artifact after its single bounded install attempt fails.
- That artifact remains a real local CRUD application and is not sent into a
  React source-repair loop that has no source tree to repair.
- Its search input has an accessible label, its form and export actions report
  visible status, and touch targets meet the 44px minimum.
- Browser behaviour QA treats a completed download as an effect in both the
  initial control pass and controls discovered after state changes.
- Screen-reader-only content is excluded from visual text-clipping findings.

## Focused verification

- `npm exec -- jest src/__tests__/react-project.test.ts --runInBand --testNamePattern="dependency-free local records recovery"`
- `npm exec -- jest src/__tests__/app-is-used.test.ts --runInBand`
- `npm exec -- jest src/__tests__/nine-of-eleven-and-the-two-a-visitor-sees.test.ts --runInBand`
- `npm exec -- tsc --noEmit`
- `npm run guard:architecture`
- `npm run guard:package-scripts`
- `npm run test:joe:engineer-flow`
- `npm run test:self-fix:build-context`
- `npm run test:self-fix:execution-safety`
- `npm run test:self-fix:typescript-repair`
- `npm run test:self-fix:typescript-missing-name`
- `npm run test:self-fix:typescript-number-to-string`
- `npm run test:self-healing:failure`
- `npm run test:self-healing:success`

All checks completed successfully in the local development worktree.

## Local acceptance run

The Arabic request below was replayed through the real local Joe UI while its
browser watcher was connected in the Codex in-app browser:

> عندي مزرعة إبل. بدي سجل أسجل فيه بيانات الناقة: اسم الناقة والعمر والوزن

The result was `Delivered: أسجل` with Browser QA `100/100`, one page, two
exploratory actions, five discovered states, and no critical findings. The
rendered preview was inspected in the Codex in-app browser, including the form
and CSV export behavior.

No production service, deployment, secret, or destructive operation was used.
