/**
 * A BUILD THAT MENDS ITSELF BEFORE IT IS HANDED OVER.
 *
 * The React path measured its output and delivered it exactly as measured —
 * «self-QA: 62/100 — dead_links, small_targets» — with the repair machinery
 * one function away, reachable only if the user knew to say «أصلح الواجهة».
 *
 * The properties held here are the ones that make an automatic repair safe
 * enough to run unattended on somebody's project:
 *   • nothing is written that does not parse
 *   • nothing survives a failed rebuild
 *   • nothing is rebuilt when there is nothing this code can fix
 *   • and the second score is MEASURED, never assumed
 */
import fs from 'fs';
import path from 'path';
import { worthRepairing, REPAIRABLE_FINDINGS, collectSources } from '../core/quality/self-repair';
import { RepairTicketService } from '../modules/services/RepairTicketService';
import { SelfFixService } from '../modules/services/SelfFixService';
import { SelfFixExecutionService } from '../modules/services/SelfFixExecutionService';
import { acceptanceFailureDisposition, acceptanceFidelityVerdict } from '../modules/services/AgentLoopService';

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf-8');

describe('the repair cycle is one piece of code', () => {
    it('the build path and the fix tool call the same function', () => {
        // The build path drives the LOOP now; the fix tool still calls the
        // single cycle. Both reach the same repairProjectFiles, which is what
        // «one piece of code» was ever about.
        expect(read('modules', 'tools', 'definitions', 'ReactProjectTool.ts')).toMatch(/await improveUntilItStops\(/);
        expect(read('core', 'quality', 'improve-loop.ts'))
            .toMatch(/repairProjectFiles\(sources, \{ isArabic: opts\.isArabic, round, findings: opts\.findings \}\)/);
        expect(read('modules', 'tools', 'definitions', 'UiFixTool.ts')).toMatch(/await repairAndRebuild\(dir/);
    });

    it('and the tool no longer carries its own copy of it', () => {
        const U = read('modules', 'tools', 'definitions', 'UiFixTool.ts');
        expect(U).not.toMatch(/function collectSources/);
        expect(U).not.toMatch(/const gate = syntaxOk\(rel, text\)/);
    });

    it('every write passes the syntax gate first, and a failed build reverts all', () => {
        const S = read('core', 'quality', 'self-repair.ts');
        expect(S).toMatch(/const gate = syntaxOk\(rel, text\)/);
        expect(S).toMatch(/if \(!gate\.ok\) \{ refused\.push/);
        expect(S).toMatch(/for \(const rel of changed\) \{[\s\S]*?fs\.writeFileSync\(path\.join\(dir, rel\), sources\[rel\]/);
        expect(S).toMatch(/reverted: true/);
    });
});

describe('a rebuild is only spent on something this code can actually fix', () => {
    it('repairable findings trigger it', () => {
        expect(worthRepairing([{ id: 'console_errors' }, { id: 'small_targets' }])).toBe(true);
        expect(worthRepairing([{ id: 'keyboard_unreachable' }])).toBe(true);
    });

    it('and findings no deterministic edit can answer do not', () => {
        expect(worthRepairing([{ id: 'console_errors' }, { id: 'dead_controls' }, { id: 'webfont_missing' }])).toBe(false);
        expect(worthRepairing([])).toBe(false);
    });

    it('the list does not promise repairs that do not exist', () => {
        const repairs = read('core', 'quality', 'ui-repair.ts');
        for (const id of ['dead_links', 'small_targets', 'h1_count', 'keyboard_unreachable', 'heavy_images']) {
            expect(REPAIRABLE_FINDINGS.has(id)).toBe(true);
            expect(repairs).toContain(`'${id}'`);
        }
        // Things a machine cannot decide must never be on this list.
        for (const id of ['dead_controls', 'console_errors', 'page_errors', 'webfont_missing', 'broken_routes']) {
            expect(REPAIRABLE_FINDINGS.has(id)).toBe(false);
        }
    });
});

describe('the build only claims an improvement it measured', () => {
    const R = () => read('modules', 'tools', 'definitions', 'ReactProjectTool.ts');

    it('re-audits after repairing instead of assuming', () => {
        // The re-measurement lives in the LOOP's own measure() now — same
        // browser, same folder, once per round instead of once per build.
        expect(R()).toMatch(/const measureNow = async \(\) => \{/);
        expect(R()).toMatch(/const a = await auditBuiltApp\(path\.join\(proj, 'dist'\)/);
        expect(read('core', 'quality', 'improve-loop.ts'))
            .toMatch(/if \(after\.skipped \|\| after\.score <= current\.score\)/);
    });

    it('and keeps the first verdict when the repair did not help', () => {
        // Stricter than the sentence it replaces: a round must BEAT the
        // previous score, and one that does not is rolled back, not merely
        // left unreported.
        const LOOP = read('core', 'quality', 'improve-loop.ts');
        expect(LOOP).toMatch(/if \(after\.skipped \|\| after\.score <= current\.score\)/);
        expect(LOOP).toMatch(/verdict: 'no_measured_gain', rolledBack: !!undone,/);
    });

    it('the delivery message prints both numbers, not a promise', () => {
        expect(R()).toMatch(/\$\{selfRepair\.before\}\/100 ← \$\{selfRepair\.after\}\/100/);
    });
});

describe('structured request-fidelity recovery', () => {
    it('labels fidelity at the active acceptance layer when a WeatherGo phase has only generic evidence', () => {
        const phaseResult = {
            error: 'acceptance_criteria_unmet: weather engine was not proven',
            output: {
                phaseName: 'Project Setup',
                verificationFailed: true,
                delivery: {
                    fidelityEvidenceUnavailable: true,
                    acceptanceUnmet: ['weather_engine'],
                },
                results: [{
                    task: 'Build the requested WeatherGo app',
                    tool: 'project_pipeline',
                    ok: false,
                    error: 'acceptance_criteria_unmet: weather_engine was not proven',
                }],
            },
        };
        expect(acceptanceFidelityVerdict(phaseResult)).toEqual({
            label: 'fidelity_unverifiable',
            diagnostic: '[AgentLoop] acceptance fidelity verdict: fidelity_unverifiable — الناتج ليس من فئة المطلوب لأن المؤلف القادر غائب',
        });
        expect(acceptanceFidelityVerdict({
            error: 'acceptance_criteria_unmet: weather engine was not delivered',
            output: { delivery: { fidelityMismatch: true }, results: [] },
        })).toEqual({
            label: 'request_fidelity_mismatch',
            diagnostic: '[AgentLoop] acceptance fidelity verdict: request_fidelity_mismatch — الناتج ليس من فئة المطلوب لأن المؤلف القادر غائب',
        });
        expect(acceptanceFidelityVerdict({
            error: 'acceptance_criteria_unmet: generic evidence only',
            output: { delivery: { acceptanceUnmet: ['weather_engine'] }, results: [] },
        })).toEqual({ label: null, diagnostic: null });
    });

    it('only treats canonical acceptance evidence as repairable', () => {
        expect(acceptanceFailureDisposition({
            output: {
                primaryError: 'acceptance_criteria_unmet: preview is not proven',
                delivery: { acceptanceUnmet: ['preview'] },
            },
        })).toBe('repairable');
        expect(acceptanceFailureDisposition({
            output: {
                verificationFailed: true,
                primaryError: 'acceptance_criteria_unmet: criteria were not proven',
            },
        })).toBe('honest_blocker');
        expect(acceptanceFailureDisposition({
            output: {
                delivery: { acceptanceUnmet: ['preview'] },
                primaryError: 'verification failed for an unknown reason',
            },
        })).toBe('honest_blocker');
    });

    function fidelityTicket() {
        return RepairTicketService.build({
            phase: { phaseNumber: 1, name: 'Application' },
            projectName: 'WeatherGo',
            workspaceId: 'workspace-test',
            phaseResult: {
                output: {
                    status: 'partial',
                    verificationFailed: true,
                    primaryError: 'request_fidelity_mismatch: requested weather engine was not delivered',
                    results: [{
                        task: 'Generate the requested weather engine',
                        tool: 'react_project',
                        ok: false,
                        error: 'request_fidelity_mismatch: requested weather engine was not delivered',
                        repairKind: 'regenerate_engine',
                    }],
                },
            },
        });
    }

    it('routes fidelity mismatch to regenerate_engine without a repairFile', () => {
        const ticket = fidelityTicket();
        expect(ticket.failedTasks[0]).toEqual(expect.objectContaining({ repairKind: 'regenerate_engine' }));
        expect(ticket.failedTasks[0]).not.toHaveProperty('repairFile');
        const plan = SelfFixService.plan(ticket);
        expect(plan.allowed).toBe(true);
        expect(plan.strategy).toBe('regenerate_engine');
        expect(plan.repairFile).toBeUndefined();
        expect(plan.suggestedTool).toBeUndefined();
    });

    it('stops regenerate_engine before trusted file-tool execution', async () => {
      const plan = SelfFixService.plan(fidelityTicket());
      const result = await SelfFixExecutionService.executeOnce({
        phase: { tasks: [] },
        projectContext: {},
        selfFixPlan: plan,
        executionContext: {},
      });
      expect(result.attempted).toBe(false);
      expect(result.stopped).toBe(true);
      expect(result.reason).toContain('regenerate');
    });

    it('routes structured acceptance gaps to one bounded phase rerun', () => {
      const ticket = RepairTicketService.build({
        phase: { phaseNumber: 1, name: 'Project Setup' },
        projectName: 'WeatherGo',
        workspaceId: 'workspace-test',
        phaseResult: {
          output: {
            status: 'partial',
            verificationFailed: true,
            results: [{
              task: 'Judge the generated WeatherGo against the request',
              tool: 'react_project',
              ok: false,
              error: 'acceptance_criteria_unmet: preview and browser_check are not proven',
              acceptanceUnmet: ['preview', 'browser_check'],
            }],
          },
        },
      });
      expect(ticket.failedTasks[0]).toEqual(expect.objectContaining({
        acceptanceUnmet: ['preview', 'browser_check'],
      }));
      const plan = SelfFixService.plan(ticket);
      expect(plan.allowed).toBe(true);
      expect(plan.strategy).toBe('acceptance_fix');
      expect(plan.maxAttempts).toBe(1);
      expect(plan.safety?.runOnlyOnce).toBe(true);
      expect(plan.suggestedTool).toBeUndefined();
    });

    it('keeps an unstructured acceptance stop honest and non-repairable', () => {
      const ticket = RepairTicketService.build({
        phase: { phaseNumber: 1, name: 'Project Setup' },
        projectName: 'WeatherGo',
        workspaceId: 'workspace-test',
        phaseResult: {
          output: {
            status: 'partial',
            verificationFailed: true,
            results: [{
              task: 'Judge the generated WeatherGo against the request',
              tool: 'react_project',
              ok: false,
              error: 'acceptance_criteria_unmet: criteria were not proven',
            }],
          },
        },
      });
      const plan = SelfFixService.plan(ticket);
      expect(plan.allowed).toBe(false);
      expect(plan.strategy).toBe('manual_review');
    });

    it('keeps an ordinary failed task without repairKind on the evidence-bound build path', () => {
        const file = '/workspace/WeatherGo/src/components/WeatherApp.jsx';
        const ticket = RepairTicketService.build({
            phase: { phaseNumber: 1, name: 'Application' },
            projectName: 'WeatherGo',
            workspaceId: 'workspace-test',
            phaseResult: {
                output: {
                    status: 'partial',
                    results: [{
                        task: 'Build the generated project',
                        tool: 'shell_execute',
                        ok: false,
                        error: `unresolved_local_import: ${file} imports "./styles/app.css" but no file resolves`,
                        file,
                        cwd: '/workspace/WeatherGo',
                    }],
                },
            },
        });
        const plan = SelfFixService.plan(ticket);
        expect(plan.strategy).toBe('code_fix');
        expect(plan.repairKind).toBeUndefined();
        expect(plan.suggestedInput?.path).toContain('WeatherApp.jsx');
    });
});

describe('source collection', () => {
    it('reads the files a UI repair can touch and skips the ones it must not', () => {
        const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'joe-collect-'));
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        fs.mkdirSync(path.join(dir, 'node_modules', 'x'), { recursive: true });
        fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'index.html'), '<html></html>');
        fs.writeFileSync(path.join(dir, 'src', 'App.jsx'), 'export default () => null;');
        fs.writeFileSync(path.join(dir, 'src', 'app.css'), 'body{}');
        fs.writeFileSync(path.join(dir, 'src', 'data.json'), '{}');
        fs.writeFileSync(path.join(dir, 'node_modules', 'x', 'a.jsx'), 'x');
        fs.writeFileSync(path.join(dir, 'dist', 'index.html'), '<html></html>');

        const out = collectSources(dir);
        expect(Object.keys(out).sort()).toEqual(['index.html', 'src/App.jsx', 'src/app.css']);
        fs.rmSync(dir, { recursive: true, force: true });
    });
});
