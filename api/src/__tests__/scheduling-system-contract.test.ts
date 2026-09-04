import fs from 'fs';
import os from 'os';
import path from 'path';
import { hasWorkflowApplicationContract, detectAppKind, blueprintFor } from '../core/design/app-blueprints';
import { inferModel } from '../core/design/entity-inference';
import { designDataModel } from '../core/design/schema-designer';
import { rolesForRequest } from '../core/design/roles';
import { ApiProjectTool } from '../modules/tools/definitions/ApiProjectTool';
import { buildAppFiles } from '../modules/tools/definitions/react-app-templates';
import { verifyNamed } from '../core/quality/named-requirements';

const REQUEST = 'Build a clinic appointment management system with secure sign-in, admin and receptionist roles, patients and doctors as separate records, appointment scheduling linked to both, status transitions, search and filtering, double-booking prevention, and audit history.';

describe('multi-entity scheduling systems', () => {
    it('does not mistake scheduling capabilities for an issue workflow or database tables', async () => {
        expect(hasWorkflowApplicationContract(REQUEST)).toBe(false);
        expect(detectAppKind(REQUEST)).not.toBe('custom');
        const reading = inferModel(REQUEST);
        expect(reading.entities.map(entity => entity.key)).toEqual(['patients', 'doctors', 'appointments']);
        expect(reading.capabilities.join(' ')).toMatch(/roles|transitions|double-booking|audit/i);
        const appointment = (await designDataModel(REQUEST, { timeoutMs: 1 })).find(entity => entity.key === 'appointments')!;
        expect(appointment.relations).toEqual([
            { entity: 'patients', key: 'patient_id' },
            { entity: 'doctors', key: 'doctor_id' },
        ]);
        expect(appointment.fields.filter(field => ['patient_id', 'doctor_id', 'date', 'time', 'status'].includes(field.key)).every(field => field.required)).toBe(true);
    });

    it('preserves the requested role names on the stable permission lattice', () => {
        const roles = rolesForRequest(REQUEST);
        expect(roles.find(role => role.key === 'owner')?.en).toBe('Admin');
        expect(roles.find(role => role.key === 'staff')?.en).toBe('Receptionist');
        expect(roles.find(role => role.key === 'owner')?.manageUsers).toBe(true);
        expect(roles.find(role => role.key === 'staff')?.write).toBe(true);
    });

    it('generates verified links, conflict prevention, transitions, audit, and query filtering', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-scheduling-api-'));
        try {
            const result: any = await new ApiProjectTool().execute(
                { request: REQUEST, skipInstall: true, root },
                { sessionId: 'scheduling-contract' },
            );
            expect(result.ok).toBe(true);
            const entities = fs.readFileSync(path.join(result.output.path, 'entities.js'), 'utf8');
            const auth = fs.readFileSync(path.join(result.output.path, 'auth.js'), 'utf8');
            expect(entities).toContain('"key":"appointments"');
            expect(entities).toContain('"entity":"patients","key":"patient_id"');
            expect(entities).toContain('"entity":"doctors","key":"doctor_id"');
            expect(entities).toContain("error: 'double_booking'");
            expect(entities).toContain("error: 'invalid_status_transition'");
            expect(entities).toContain('audit_history: JSON.stringify');
            expect(entities).toContain("field === 'q'");
            expect(auth).toContain('"en":"Admin"');
            expect(auth).toContain('"en":"Receptionist"');
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
            delete (global as any).joeProjects?.['scheduling-contract'];
        }
    });

    it('renders both relationship pickers and user-facing search', async () => {
        const model = await designDataModel(REQUEST, { timeoutMs: 1 });
        const bp = blueprintFor('generic', REQUEST, false);
        const files = buildAppFiles(bp, {
            isArabic: false,
            brand: 'Clinic Desk',
            storeKey: 'clinic-test',
            api: 'http://localhost:4100/api/items',
            model,
            sourceRequest: REQUEST,
            unifiedTables: true,
        } as any, 'clinic-desk');
        const tables = files['src/components/TablesAdmin.jsx'];
        expect(tables).toContain('"relations":[{"entity":"patients","key":"patient_id"},{"entity":"doctors","key":"doctor_id"}]');
        expect(tables).toContain('Search and filter');
        expect(tables).toContain("f.key === 'status'");
        expect(tables).toContain('parents[((table.relations || []).find');
        expect(tables).toContain("e === 'double_booking'");
        expect(tables).toContain("e === 'invalid_status_transition'");
        expect(tables).toContain('Filter by status');
        expect(tables).toContain('Audit history');
        expect(tables).toContain('audit_history');
        expect(tables).toContain("return { type: 'email', inputMode: 'email' }");
        expect(tables).toContain("return { type: 'tel', inputMode: 'tel', pattern: '[0-9]{7,15}' }");
        expect(tables).toContain("return { type: 'date' }");
        expect(tables).toContain('type={inputContract(f).type}');
        expect(tables).toContain('pattern={inputContract(f).pattern}');
        expect(tables).toContain('"label":"Appointments"');
        expect(files['src/app/store.js']).toContain("const TOKEN_KEY = 'joe:auth';");
        expect(files['src/App.jsx']).toContain('displayName(content.brand)');
        expect(files['src/App.jsx']).toContain("replace(/\\b[a-z]/g");
        expect(files['src/App.jsx']).not.toContain('<RecordsApp content={content} />');
        expect(files['src/App.jsx']).toContain("owner: 'Admin'");
        expect(files['src/components/Accounts.jsx']).toContain("label: 'Receptionist'");
    });

    it('proves workflow requirements from a multi-table interface without requiring a CustomApp name', async () => {
        const model = await designDataModel(REQUEST, { timeoutMs: 1 });
        const files = buildAppFiles(blueprintFor('generic', REQUEST, false), {
            isArabic: false,
            brand: 'Clinic Desk',
            storeKey: 'clinic-test',
            api: 'http://localhost:4100/api/items',
            model,
            sourceRequest: REQUEST,
            unifiedTables: true,
        } as any, 'clinic-desk');
        const source = Object.values(files).join('\n');
        const requirements = [
            'secure sign-in',
            'admin and receptionist roles',
            'patients and doctors as separate records',
            'appointment scheduling linked to both',
            'status transitions',
            'double-booking prevention',
            'audit history',
        ].map((text, index) => ({ id: `req-${index}`, text, quote: text }));
        const verdicts = await verifyNamed(requirements, source, false, async () => {
            throw new Error('the deterministic checks must not ask a provider');
        });
        expect(verdicts.map(verdict => verdict.verdict)).toEqual(['met', 'met', 'met', 'met', 'met', 'met', 'met']);
    });

    it('does not spend a provider call authoring the dormant single-table component', () => {
        const source = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf8');
        const apiSource = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ApiProjectTool.ts'), 'utf8');
        expect(source).toContain('!workflowSemanticContractPassed && !unifiedTables');
        expect(source).toContain('!modelUnavailableDuringBuild && !unifiedTables');
        expect(source).toContain('!modelUnavailableDuringBuild && !inheritedUnifiedTables');
        expect(apiSource).toContain("tokenStorageKey: workflowApplication ? 'joe:auth'");
        expect(source).toContain('const evidenceReconciledUnmet = rawUnmet.filter');
        expect(source).toContain('delivery reconciliation is deterministic');
    });
});
