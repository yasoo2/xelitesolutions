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

    it('explains when browser mechanics pass but request acceptance still has gaps', () => {
        const report = `
A full React project, scaffolded AND verified to compile — "Consulting".
Self-QA in the Browser panel (1 page(s), 3 control(s)): 100/100 — clean.
Accepted with gaps: 1/3 criteria were proven.
- modern interface design — I did not inspect it — the model could not be reached
- clear title — I did not inspect it — the model could not be reached
`;
        const summary = summarizeEngineeringReport(report, 'en');
        expect(summary).toContain('verification is incomplete');
        expect(summary).toContain('Some requested parts were not proven');
        expect(summary).not.toContain('No critical findings were reported');
    });
});
