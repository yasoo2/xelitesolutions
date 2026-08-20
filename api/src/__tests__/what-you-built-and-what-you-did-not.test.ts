/**
 * «At the end, show me plainly what you actually built and what you did not.»
 *
 * The last sentence of his prompt, and he got three phase names:
 *
 *     ### Phases
 *     - ✅ Backend & database (tasks: 1/1)
 *     - ✅ Application (tasks: 1/1)
 *     - ✅ Quality (tasks: 1/1)
 *
 * The answer he asked for had been WRITTEN. `react_project` composes it on
 * every build: the abilities the application really has, both QA scores with
 * every finding named, the owner account — and an explicit «⚠️ You also asked
 * for things this step did NOT build» listing the live streaming, the video
 * calls, the AI diagnosis from photos.
 *
 * That message reached the phase executor, which kept `{task, tool, ok}` and
 * threw the rest away, so the pipeline's report had nothing to carry. A
 * report that summarises phases instead of relaying what was measured is a
 * table of contents for a book nobody printed.
 */
import fs from 'fs';
import path from 'path';

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf-8');
const PHASE = read('modules', 'tools', 'definitions', 'PhaseExecutorTool.ts');
const PIPE = read('modules', 'tools', 'definitions', 'ProjectPipelineTool.ts');
const REACT = read('modules', 'tools', 'definitions', 'ReactProjectTool.ts');

describe('the builder\'s own words survive the phase', () => {
    it('a completed task keeps its written message or a bounded shell transcript', () => {
        expect(PHASE).toContain("const output = (toolResult as any)?.output || {};");
        expect(PHASE).toContain("const terminalReport = toolName === 'shell_execute' && (stdout || stderr)");
        expect(PHASE).toContain('const said = String(output.message || terminalReport).trim();');
        expect(PHASE).toMatch(/\.\.\.\(said \? \{ message: said\.slice\(0, 8000\) \} : \{\}\),/);
    });

    it('and it is bounded — a report is read, not scrolled', () => {
        expect(PHASE).toContain('said.slice(0, 8000)');
    });

    it('a FAILED task still reports its error, not a message', () => {
        /**
         * The failure record may carry bounded command/cwd/message evidence, but
         * the honest primary payload is always `ok:false` plus an error.
         */
        const failures = [...PHASE.matchAll(/results\.push\(\{[\s\S]{0,900}?\}\);/g)]
            .map(m => m[0])
            .filter(block => /ok:\s*false/.test(block));
        expect(failures.length).toBeGreaterThanOrEqual(2);
        for (const block of failures) expect(block).toMatch(/error:\s*\w+/);
        for (const block of failures) {
            if (/message:/.test(block)) expect(block.indexOf('error:')).toBeLessThan(block.indexOf('message:'));
        }
        expect(PHASE).toMatch(/task:\s*taskDesc,\s*tool:\s*toolName,\s*ok:\s*false,\s*error:\s*(?:errMsg|currentRunError),/);
        expect(PHASE).toMatch(/runId:\s*runEvidenceId/);
        expect(PHASE).toMatch(/projectRoot:\s*runEvidenceRoot/);
        expect(PHASE).toMatch(/evidenceStatus:\s*['"]stale_run_dropped['"]/);
        expect(PHASE).toMatch(/evidenceStatus:\s*['"]current_run['"]/);
    });
});

describe('the delivery report relays what was measured', () => {
    it('it collects every message the phases carried', () => {
        expect(PIPE).toMatch(/const spoken: string\[\] = \[\];/);
        expect(PIPE).toMatch(/const msg = String\(t\?\.message \|\| ''\)\.trim\(\);/);
        expect(PIPE).toMatch(/if \(msg && !spoken\.includes\(msg\)\) spoken\.push\(msg\);/);
    });

    it('under a heading that says whose words they are, in both languages', () => {
        expect(PIPE).toMatch(/### ما بُني بالضبط — بكلام المحرّكات نفسها/);
        expect(PIPE).toMatch(/### Exactly what was built — in the engines/);
    });

    it('and it sits before the file list, where a reader looks first', () => {
        expect(PIPE.indexOf('const spoken: string[] = [];'))
            .toBeLessThan(PIPE.indexOf("lines.push(ar ? '### الملفات' : '### Files');"));
    });

    /**
     * The block only has value because the builder really writes it — this is
     * the other end of the wire, asserted so neither end can quietly go away.
     */
    it('the builder really writes the «did NOT build» block it now relays', () => {
        expect(REACT).toMatch(/⚠️ You also asked for things this step did NOT build/);
        expect(REACT).toMatch(/⚠️ وطلبتَ أيضاً ما لم أبنِه في هذه الخطوة/);
        expect(REACT).toMatch(/const unmetBlock = unmet\.length/);
        // …and that block is part of the message the tool returns.
        expect(REACT).toMatch(/output: \{ message,/);
    });
});
