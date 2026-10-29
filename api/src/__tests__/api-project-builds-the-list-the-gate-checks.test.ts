/**
 * END TO END, OFFLINE: WHAT api_project BUILDS IS WHAT THE DELIVERY GATE CHECKS
 * (round 22, R2 — with R1, R4 and R6 on the way).
 *
 * Measured on 3c8302e2: «ابن باك اند لمكتب: الموظفين، الإجازات، الحضور» built a
 * generic /api/items (no table he named) and the gate, handed nothing, never
 * ran; «Backend for my shop: products, product photos, customers, customer
 * testimonials» built products only while the gate required customers;
 * «Library system: books, members, loans» built /api/libraries; «… رواتب
 * الموظفين» built no salaries table and the gate passed it through
 * /api/employees; «… : المواعيد، إدارة المرضى، الفواتير» never built the
 * appointments. Each request is built here by the real tool, with no model,
 * and every record the gate requires must be among the tables it built.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ApiProjectTool } from '../modules/tools/definitions/ApiProjectTool';
import { requestedRecords } from '../core/quality/request-coverage';
import { RESERVED_TABLES } from '../core/design/schema-designer';

const CASES: Array<{ id: string; request: string; mustBuild?: string[]; never?: string[]; ownTable?: string }> = [
    { id: 'office-ar', request: 'ابن باك اند لمكتب: الموظفين، الإجازات، الحضور', never: ['items'] },
    { id: 'shop-en', request: 'Backend for my shop: products, product photos, customers, customer testimonials', mustBuild: ['customers'], never: ['photos', 'testimonials', 'shops'] },
    { id: 'salaries-ar', request: 'ابن باك اند لشركة: الأقسام، الموظفين، رواتب الموظفين', mustBuild: ['categories', 'employees'], ownTable: 'رواتب الموظفين' },
    { id: 'library-en', request: 'Build a library backend: books, members, loans, book photos', mustBuild: ['books', 'members', 'loans'], never: ['libraries', 'backends', 'photos'] },
    { id: 'clinic-ar', request: 'ابن باك اند لعيادة: المواعيد، إدارة المرضى، الفواتير', mustBuild: ['appointments', 'patients', 'invoices'] },
];

describe('api_project builds every record the delivery gate will require', () => {
    let tmp: string;
    const savedSchema = process.env.JOE_AI_SCHEMA;
    beforeAll(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-r22-reading-')); process.env.JOE_AI_SCHEMA = '0'; });
    afterAll(() => {
        if (savedSchema === undefined) delete process.env.JOE_AI_SCHEMA; else process.env.JOE_AI_SCHEMA = savedSchema;
        fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
        for (const c of CASES) delete (global as any).joeProjects?.[`r22-reading-${c.id}`];
    });

    for (const c of CASES) {
        it(`${c.id}: «${c.request}»`, async () => {
            const sessionId = `r22-reading-${c.id}`;
            const res: any = await new ApiProjectTool().execute({ request: c.request, skipInstall: true, root: tmp }, { sessionId });
            expect({ ok: res.ok, error: res.error }).toEqual({ ok: true, error: undefined });
            const state = (global as any).joeProjects[sessionId];
            const built = [String(state.resource), ...(state.model || []).map((e: any) => String(e.key))];
            const required = requestedRecords(c.request, { backendRequested: true }).entities
                .map(e => e.key).filter(key => !RESERVED_TABLES.has(key));
            expect(required.length).toBeGreaterThanOrEqual(1);
            expect(built).toEqual(expect.arrayContaining(required));
            if (c.mustBuild) expect(built).toEqual(expect.arrayContaining(c.mustBuild));
            for (const key of c.never || []) expect(built).not.toContain(key);
            // A record about another one is built as its own table, never merged into it (R1).
            if (c.ownTable) {
                const own = (state.model || []).find((e: any) => e.ar === c.ownTable);
                expect(own?.key).toBeDefined();
                expect(own.key).not.toBe('employees');
            }
        }, 120_000);
    }
});
