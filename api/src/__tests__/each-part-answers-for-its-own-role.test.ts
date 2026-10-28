import fs from 'fs';
import path from 'path';
import { requestedDeliveryRoles } from '../modules/tools/definitions/ProjectPipelineTool';
import { clearDeliveryParts, deliveryPartsForRun, recordDeliveryPart } from '../core/quality/delivery-parts';
import { deliveryVerdict } from '../core/quality/delivery-verdict';
import { hasFilterEvidence, hasSearchEvidence, hasSortingEvidence } from '../core/quality/scope-audit';

/**
 * Round 15 review (P101): the pipeline treated «the project» as one root —
 * the last phase's — so Browser QA scored an unrequested UI 100/100 while the
 * requested API was never proven, an API-only delivery was blocked by «no
 * index.html to audit», and a CLI could never pass at all (it has no URL).
 * Each delivered part is now known, the request's roles decide which
 * instruments must prove delivery, and a service's own code counts as scope
 * evidence.
 */
describe('which parts the request asked for', () => {
    const P101 = 'أنشئ واجهة برمجية REST باستخدام Node.js و Express لـعيادة أسنان فيها نقاط وصول لـالمرضى والمواعيد والعلاجات، مع التحقق من المدخلات ورموز أخطاء صحيحة واختبارات آلية لكل نقطة.';
    const P301 = 'اكتب أداة سطر أوامر بلغة Python تقرأ ملف CSV فيه المرضى لـعيادة أسنان، وتتحقق من كل سطر، وتطبع تقريراً بالأعداد والمجاميع، وتكتب الأسطر الخاطئة في ملف errors.csv.';
    const P302 = 'Write a Python command-line tool that reads a CSV file of students for a private school, validates every row, prints a summary report with counts and totals, and writes the invalid rows to errors.csv.';

    it('an API-only request asks for a service and no interface', () => {
        expect(requestedDeliveryRoles(P101)).toEqual({ service: true, interface: false, program: false });
    });
    it('an API plus a dashboard asks for both — in either language', () => {
        expect(requestedDeliveryRoles('Create a REST API with Node.js and Express for a library, plus a React dashboard to manage it.')).toMatchObject({ service: true, interface: true });
        expect(requestedDeliveryRoles('أنشئ واجهة برمجية REST لعيادة مع لوحة تحكم React لإدارتها')).toMatchObject({ service: true, interface: true });
        expect(requestedDeliveryRoles('Build an expense tracker web app with a Node/Express API and tests')).toMatchObject({ service: true, interface: true });
    });
    it('a command-line program asks for a program — in either language', () => {
        expect(requestedDeliveryRoles(P301)).toEqual({ service: false, interface: false, program: true });
        expect(requestedDeliveryRoles(P302)).toEqual({ service: false, interface: false, program: true });
    });
    it('a CLI word never un-requests an interface when a web word is there; an explicit negation does', () => {
        expect(requestedDeliveryRoles('Build a web tool to manage orders').interface).toBe(true);
        expect(requestedDeliveryRoles('Build a landing page for a bakery')).toMatchObject({ interface: true, service: false });
        expect(requestedDeliveryRoles('Create a REST API for a library without a UI').interface).toBe(false);
    });
});

describe('every part a phase bound in this run is known', () => {
    it('records, de-duplicates, and never reads another run', () => {
        recordDeliveryPart('s-parts', 'run-1', { root: '/w/api-clinic', tool: 'api_project' });
        recordDeliveryPart('s-parts', 'run-1', { root: '/w/react-clinic', tool: 'react_project' });
        recordDeliveryPart('s-parts', 'run-1', { root: '/w/api-clinic', tool: 'ai_write_file' });
        expect(deliveryPartsForRun('s-parts', 'run-1').map(p => path.basename(p.root))).toEqual(['api-clinic', 'react-clinic']);
        expect(deliveryPartsForRun('s-parts', 'run-2')).toEqual([]);
        recordDeliveryPart('s-parts', 'run-2', { root: '/w/cli', tool: 'ai_write_file' });
        expect(deliveryPartsForRun('s-parts', 'run-2').map(p => path.basename(p.root))).toEqual(['cli']);
        // A second run in the same session no longer wipes the first one's
        // parts mid-flight (round 15 review, finding 42); a run's parts end when
        // the run clears them.
        expect(deliveryPartsForRun('s-parts', 'run-1').map(p => path.basename(p.root))).toEqual(['api-clinic', 'react-clinic']);
        clearDeliveryParts('s-parts', 'run-1');
        clearDeliveryParts('s-parts', 'run-2');
        expect(deliveryPartsForRun('s-parts', 'run-1')).toEqual([]);
    });
});

describe('a program is proven by its own tests, not by a URL', () => {
    it('program-only: the program\'s passing test run is the primary instrument', () => {
        expect(deliveryVerdict({ phaseVerified: true, requestFidelityBlocked: false, primary: 'program', measurements: [{ instrument: 'program', ok: true }] }).verified).toBe(true);
        const failed = deliveryVerdict({ phaseVerified: true, requestFidelityBlocked: false, primary: 'program', measurements: [{ instrument: 'program', ok: false, error: 'tests failed' }] });
        expect(failed.verified).toBe(false);
        expect(failed.firstError).toBe('tests failed');
        expect(deliveryVerdict({ phaseVerified: true, requestFidelityBlocked: false, primary: 'program', measurements: [] }).unmeasured).toEqual(['program']);
        // A served delivery still needs its live URL.
        expect(deliveryVerdict({ phaseVerified: true, requestFidelityBlocked: false, measurements: [{ instrument: 'program', ok: true }] }).verified).toBe(false);
    });
});

describe('a service\'s own code is scope evidence (C4)', () => {
    it('search: a route that reads the query and narrows its rows', () => {
        expect(hasSearchEvidence("app.get('/api/items', (req, res) => { const q = req.query.q; res.json(rows.filter(r => r.name.includes(q))); });")).toBe(true);
        expect(hasSearchEvidence("app.get('/api/items', (req, res) => res.json(rows));")).toBe(false);
        expect(hasSearchEvidence("const { search } = req.query; db.prepare('SELECT * FROM books WHERE title LIKE ?').all(`%${search}%`);")).toBe(true);
    });
    it('filtering and sorting: field parameters that narrow, sort parameters that order', () => {
        expect(hasFilterEvidence("const status = req.query.status; db.prepare('SELECT * FROM t WHERE status = ?').all(status);")).toBe(true);
        expect(hasFilterEvidence("const page = req.query.page; res.json(rows.slice(0, 10));")).toBe(false);
        expect(hasSortingEvidence("const { sort } = req.query; db.prepare(`SELECT * FROM t ORDER BY ${col(sort)}`).all();")).toBe(true);
        expect(hasSortingEvidence("app.get('/api/t', (q, s) => s.json(rows));")).toBe(false);
    });
});

describe('the pipeline is wired to the parts and roles', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectPipelineTool.ts'), 'utf8');
    const executor = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'PhaseExecutorTool.ts'), 'utf8');
    it('Browser QA runs only for a delivered interface; a requested but absent one is a named failure', () => {
        expect(src).toMatch(/const browserQaTarget = interfaceDelivered && mayRunBrowserQa\(ledger\.all\(\)\)/);
        expect(src).toMatch(/if \(!interfaceDelivered && verifiedLiveUrl\(ledger\.all\(\)\) && deliveryRoles\.interface\)/);
        expect(src).toMatch(/no delivered part serves one \(no index\.html\)/);
    });
    it('a program-only request runs the program\'s own tests instead of project_run', () => {
        expect(src).toMatch(/if \(verified && programOnly\) \{\s*await recordProgramProof\(\);\s*\} else if \(verified\) \{/);
        expect(src).toMatch(/executeTool\('quality_run', \{ path: programRoot, tasks: \['test'\] \}/);
        expect(src).toMatch(/primary: programOnly \? 'program' : 'live',/);
    });
    it('every bound root is recorded as a delivered part, and quality and records read them all', () => {
        expect(executor).toMatch(/projectContext\.deliveryParts = recordDeliveryPart\(key, pipelineRunId, \{ root: candidate, tool: toolName \}\);/);
        expect(src).toMatch(/await measureRequestedRecords\(runRes, deliveredRoots\(auditRoots\)\);/);
        expect(src).toMatch(/const otherRoots = deliveredRoots\(/);
    });
});
