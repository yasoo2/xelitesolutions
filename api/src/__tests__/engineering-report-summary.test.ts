import { summarizeEngineeringReport } from '../../../web/src/lib/engineeringReportSummary';

describe('the chat respects the final delivery verdict', () => {
    const contradictoryReport = `
A full React project, scaffolded AND verified to compile — "Ledger".
Self-QA in the Browser panel (1 page(s), 10 control(s)): 100/100 — clean.
Visible Browser QA: **not run** — browser failed (page.goto: net::ERR_ABORTED).
- finalVerified: \`false\`; browserQaFailed: \`true\`; scopeCoverageFailed: \`false\`
Build stopped honestly: Ledger
`;

    it('never turns an older 100 score into a successful English delivery', () => {
        const summary = summarizeEngineeringReport(contradictoryReport, 'en');
        expect(summary).toContain('verification is incomplete');
        expect(summary).toContain('Final live verification did not complete');
        expect(summary).not.toContain('fully verified');
    });

    it('never turns an older 100 score into a successful Arabic delivery', () => {
        const summary = summarizeEngineeringReport(contradictoryReport, 'ar');
        expect(summary).toContain('التحقق لم يكتمل');
        expect(summary).toContain('لم يكتمل التحقق النهائي من التشغيل الحي');
        expect(summary).not.toContain('اكتمل البناء والتحقق من المشروع');
    });
});
