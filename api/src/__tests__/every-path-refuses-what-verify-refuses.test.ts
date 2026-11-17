/**
 * ⛔ EVERY PATH REFUSES WHAT VERIFY REFUSES (design 2026-11-15 ui-inspection-revival-v3 §2.2–§2.3).
 *
 * `refuses()` (browser-mend.ts) is the one rule: the inspector's lines and a
 * minor finding of taste are told, everything else refuses. Five places judge a
 * browser audit. Before v3, verify.ts handed EVERY finding to the mender (so a
 * told line was «repaired» unmeasured whenever `small_targets` started a mend),
 * the pipeline blocked on every finding, project_repair refused on every
 * finding left, and the two builders opened a repair round on any of them.
 *
 * Anchored on code, comments stripped first (as deep-self-qa.test.ts does): a
 * guard that matches the prose explaining a fix goes red on the fixed file.
 */
import fs from 'fs';
import path from 'path';

const code = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8')
    .split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

describe('one rule for what refuses, on every path', () => {
    it('⛔ verify.ts hands the mender only what refuses', () => {
        const v = code('core', 'engine', 'verify.ts');
        expect(v).toContain('mender(mendRoot, audit.findings.filter(refuses), isAr, note, auditDir)');
        expect(v).not.toMatch(/mender\(mendRoot, audit\.findings,/);
    });

    it('⛔ the pipeline blocks on, and repairs, only what refuses', () => {
        const p = code('modules', 'tools', 'definitions', 'ProjectPipelineTool.ts');
        expect(p).toContain("import { refuses } from '../../../core/engine/browser-mend';");
        expect(p).toContain('let blocking = browserQa.findings.filter(refuses);');
        expect(p).toContain('const projectRepairFindings = blocking.filter(');
        //  every later reading of the gate too: the recheck and the final verdict
        expect((p.match(/blocking = browserQa\.findings\.filter\(refuses\);/g) || []).length).toBe(3);
        expect(p).not.toContain('browserQa.findings.slice()');
    });

    it('⛔ project_repair is accepted when nothing that refuses is left', () => {
        const r = code('modules', 'tools', 'definitions', 'ProjectRepairTool.ts');
        expect(r).toContain('const refusing = remaining.filter(refuses);');
        expect(r).toContain('ok: refusing.length === 0,');
        expect(r).not.toContain('ok: remaining.length === 0');
        expect(r).toContain('const told = remaining.filter((f: any) => !refuses(f));');
    });

    it('⛔ the edit path opens a repair round, and feeds it, only on what refuses', () => {
        const e = code('modules', 'tools', 'definitions', 'ProjectEditTool.ts');
        expect(e).toContain('worthRepairing((audit?.findings || []).filter(refuses))');
        //  Review r40-2 (A2): ids, findings and score of every reading from refusingMeasurement (browser-mend.ts).
        expect(e).toContain('const firstMeasurement = refusingMeasurement(audit);');
        expect(e).toContain('const reading = refusingMeasurement(measured);');
    });

    it('⛔ the build path opens a repair round, and feeds it, only on what refuses', () => {
        const b = code('modules', 'tools', 'definitions', 'ReactProjectTool.ts');
        expect(b).toContain("import { refuses, refusingMeasurement } from '../../../core/engine/browser-mend';");
        expect(b).toContain('worthRepairing(audit.findings.filter(refuses))');
        //  Review r40-2 (A2): every reading the loop is handed is reactLoopMeasurement's (refusing only).
        expect(b).toContain('const reading = reactLoopMeasurement(a, termFails, ');
        expect(b).toContain('const firstReading = reactLoopMeasurement(audit, firstTermFails, ');
        expect(b).not.toMatch(/findings: \((?:a|audit)\.findings \|\| \[\]\)\.map\(/);
    });
});
