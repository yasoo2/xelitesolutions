import fs from 'fs';
import path from 'path';
import { adoptionAllowed } from '../modules/tools/definitions/ProjectRunTool';
import { postRepairRunOutcome } from '../modules/tools/definitions/ProjectPipelineTool';
import { RepairTicketService } from '../modules/services/RepairTicketService';
import { SelfFixService } from '../modules/services/SelfFixService';
import { requestCoverageRepairTask, type RequestCoverageReport } from '../core/quality/request-coverage';

/**
 * Round 15 review: project_run adopts a recorded live server for the same
 * folder («✅ نظامك يعمل بالفعل»). After a repair the running process still
 * holds the pre-repair code, so every post-repair probe measured the OLD
 * server, and «restore when the new server does not start» could never fire.
 */
const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectPipelineTool.ts'), 'utf8');

describe('a repaired server is restarted before it is probed', () => {
    it('project_run never adopts the recorded server on a restart', () => {
        expect(adoptionAllowed({ cwd: '/w/api' })).toBe(true);
        expect(adoptionAllowed({ cwd: '/w/api', restart: true })).toBe(false);
        expect(adoptionAllowed({ cwd: '/w/api', command: 'node server.js' })).toBe(false);
    });

    it('an adopted, already-running answer is not proof after a repair', () => {
        const adopted = { ok: true, output: { url: 'http://127.0.0.1:4868/', adopted: true, kind: 'already-running', cwd: '/w/api' } };
        const out = postRepairRunOutcome(adopted);
        expect(out.ok).toBe(false);
        expect(String(out.error)).toMatch(/pre-repair server/);
        const fresh = { ok: true, output: { url: 'http://127.0.0.1:4901/', cwd: '/w/api' } };
        expect(postRepairRunOutcome(fresh)).toBe(fresh);
    });

    it('every post-repair project_run restarts and goes through postRepairRunOutcome', () => {
        expect(src).toMatch(/'project_run',\s*\{ cwd: apiSiblingOf\(artifactRoot\) \|\| artifactRoot, restart: true \}/);
        expect(src).toMatch(/const retryInput: Record<string, any> = \{ restart: true \};/);
        expect(src).toMatch(/await recordLiveAcceptance\(postRepairRunOutcome\(scopeRetryResult\)/);
        expect(src).toMatch(/await recordLiveAcceptance\(postRepairRunOutcome\(retryRunResult\)/);
        expect(src).toMatch(/await recordLiveAcceptance\(postRepairRunOutcome\(coverageRerun\)/);
    });
});

const report = (over: Partial<RequestCoverageReport> = {}): RequestCoverageReport => ({
    checked: 3,
    records: [],
    missing: [
        { key: 'patients', ar: 'المرضى', en: 'patients', item: 'المرضى', served: false, tested: false, present: null, evidence: [] },
        { key: 'permissions', ar: 'الصلاحيات', en: 'permissions', item: 'الصلاحيات', served: true, tested: false, present: null, evidence: [] },
    ],
    unread: [],
    testsRequested: 'واختبارات آلية لكل نقطة',
    servedApplies: true,
    serverFile: '/w/api/server.js',
    patternResources: ['bookings', 'orders'],
    prefixes: ['/api/'],
    testFiles: [],
    ...over,
});

describe('a coverage gap is repaired, not only failed', () => {
    it('serving comes first: the server file is the target, with the records and the pattern to follow', () => {
        const task = requestCoverageRepairTask(report(), { request: 'أنشئ واجهة برمجية…', serverRoot: '/w/api', testFiles: [] })!;
        expect(task.dimension).toBe('served');
        expect(task.repairFile).toBe('/w/api/server.js');
        expect(task.error).toMatch(/^requested_entities_not_served: patients/);
        const ctx = JSON.parse(task.artifactContext);
        expect(ctx.entities).toEqual([{ key: 'patients', ar: 'المرضى', en: 'patients' }]);
        expect(ctx.patternResources).toEqual(['bookings', 'orders']);
        expect(ctx.prefixes).toEqual(['/api/']);
        expect(ctx.deliverables).toEqual(['واختبارات آلية لكل نقطة']);
    });
    it('then tests: once every record is served, the untested ones get a test file', () => {
        const served = report({ missing: [{ key: 'patients', ar: 'المرضى', en: 'patients', item: 'المرضى', served: true, tested: false, present: null, evidence: [] }] });
        const task = requestCoverageRepairTask(served, { request: 'x', serverRoot: '/w/api', testFiles: ['/w/api/tests/api.test.js'] })!;
        expect(task.dimension).toBe('tested');
        expect(task.error).toMatch(/^requested_entity_tests_missing: patients/);
        expect(task.repairFile).toBe('/w/api/tests/api.test.js');
        const none = requestCoverageRepairTask(served, { request: 'x', serverRoot: '/w/api', testFiles: [] })!;
        expect(none.repairFile.replace(/\\/g, '/')).toBe('/w/api/tests/requested-records.test.js');
    });
    it('no server file means no evidence-bound target, so no repair is invented', () => {
        expect(requestCoverageRepairTask(report({ serverFile: '' }), { request: 'x', serverRoot: '/w/api', testFiles: [] })).toBeNull();
    });
    it('a record named «permissions» is not security evidence, and SelfFix targets the file', () => {
        const task = requestCoverageRepairTask(report({ missing: [{ key: 'permissions', ar: 'الصلاحيات', en: 'permissions', item: 'permissions', served: false, tested: null, present: null, evidence: [] }] }),
            { request: 'Create a REST API with endpoints for users, roles, permissions.', serverRoot: '/w/api', testFiles: [] })!;
        const ticket = RepairTicketService.build({
            phase: { phaseNumber: 3, name: 'Requested records' },
            phaseStatus: 'failed',
            phaseResult: { ok: false, output: { status: 'failed', results: [{ task: task.task, tool: 'request_coverage', ok: false, error: task.error, repairKind: 'code_fix', repairFile: task.repairFile, cwd: '/w/api', description: task.description, artifactContext: task.artifactContext }] } },
            projectName: 'clinic', sessionId: 's1', workspaceId: 'w1',
        } as any);
        expect(ticket.severity).not.toBe('critical');
        const plan: any = SelfFixService.plan(ticket);
        expect(plan.allowed).toBe(true);
        expect(plan.suggestedTool).toBe('ai_write_file');
        expect(plan.suggestedInput.path).toBe('/w/api/server.js');
        expect(String(plan.suggestedInput.description)).toMatch(/permissions/);
    });
    it('the pipeline repairs once per dimension and restores the file when the server no longer starts', () => {
        expect(src).toMatch(/const attemptRequestCoverageRepair = async/);
        expect(src).toMatch(/requestCoverageRepairAttempted: true/);
        expect(src).toMatch(/request_coverage_repair_restored/);
        expect(src).toMatch(/await attemptRequestCoverageRepair\(\);/);
    });
});
