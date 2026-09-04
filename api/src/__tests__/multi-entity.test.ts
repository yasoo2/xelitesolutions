/**
 * ONE TABLE WAS THE CEILING.
 *
 * «هل تقوم بتطوير جو ليتمكن من بناء اي نظام؟» — not yet, and this is the first
 * stone. His platform request named fourteen capabilities and got two, because
 * a build could produce exactly one collection (`products`) plus `orders`.
 * Vendors, customers, coupons, shipments — doctors, patients, appointments —
 * had nowhere to live.
 *
 * The model is derived deterministically from the request and generated as
 * real tables with real CRUD and a foreign key that refuses to dangle.
 * Measured live (verify_multi_entity.ts): 22/22, and the scope report on the
 * generated project moved from 2/15 to 5/15.
 */
import fs from 'fs';
import path from 'path';
import { dataModelDomain, deriveDataModel, describeModel } from '../core/design/data-model';

const SRC = path.join(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(SRC, ...p), 'utf-8');

describe('the model comes from the request', () => {
    it('a marketplace has vendors, customers, coupons and shipments', () => {
        const m = deriveDataModel('Build a multi-vendor marketplace similar to Shopify');
        expect(m.map(e => e.key)).toEqual(['vendors', 'customers', 'coupons', 'shipments']);
        expect(dataModelDomain('multi-vendor marketplace')).toBe('marketplace');
    });

    it('a clinic has doctors and patients before it has appointments', () => {
        const m = deriveDataModel('ابنِ نظاماً لعيادة أسنان: أطباء ومرضى ومواعيد');
        expect(m.map(e => e.key)).toEqual(['doctors', 'patients', 'appointments']);
        const appts = m.find(e => e.key === 'appointments')!;
        expect(appts.belongsTo).toEqual({ entity: 'patients', key: 'patient_id' });
    });

    it('a school, a warehouse, a CRM and a booking system each have their own', () => {
        expect(deriveDataModel('an LMS with courses and students').map(e => e.key)).toEqual(['courses', 'students', 'enrollments']);
        expect(deriveDataModel('نظام إدارة المخزون والموردين').map(e => e.key)).toEqual(['suppliers', 'movements']);
        expect(deriveDataModel('a CRM with leads and deals').map(e => e.key)).toEqual(['contacts', 'deals']);
        expect(deriveDataModel('نظام حجوزات للخدمات').map(e => e.key)).toEqual(['services', 'bookings']);
    });

    it('and a request that names no domain invents nothing', () => {
        // A table nobody asked for is scaffolding to delete, not a feature.
        expect(deriveDataModel('ابن لي متجراً بسيطاً للقهوة')).toEqual([]);
        expect(deriveDataModel('build me a landing page')).toEqual([]);
        expect(deriveDataModel('')).toEqual([]);
    });

    it('every field and table name is a safe SQL identifier', () => {
        for (const req of ['marketplace', 'clinic', 'lms courses', 'inventory suppliers', 'crm deals', 'booking']) {
            for (const e of deriveDataModel(req)) {
                expect(e.key).toMatch(/^[a-z0-9_]+$/);
                for (const f of e.fields) expect(f.key).toMatch(/^[a-z0-9_]+$/);
                if (e.belongsTo) expect(e.fields.some(f => f.key === e.belongsTo!.key)).toBe(true);
            }
        }
    });

    it('and never more than four tables — a model nobody can hold is not a model', () => {
        for (const req of ['marketplace shopify', 'clinic', 'lms', 'inventory', 'crm', 'booking']) {
            expect(deriveDataModel(req).length).toBeLessThanOrEqual(4);
        }
    });

    it('the summary names them in the reader’s language', () => {
        const m = deriveDataModel('multi-vendor marketplace');
        expect(describeModel(m, true)).toMatch(/جداول النظام \(4\): البائعون · العملاء · الكوبونات · الشحنات/);
        expect(describeModel(m, false)).toMatch(/System tables \(4\): vendors · customers · coupons · shipments/);
        expect(describeModel([], true)).toBe('');
    });
});

describe('and the builder turns it into real tables', () => {
    const A = () => read('modules', 'tools', 'definitions', 'ApiProjectTool.ts');

    it('the model is derived at build time and logged', () => {
        // The derivation moved behind the designer: a known domain still wins,
        // and anything outside the six is designed by a constrained model.
        expect(A()).toMatch(/await designDataModel\(request, \{ onNote: \(n: string\) => term\(n\) \}\)/);
        const d = fs.readFileSync(path.join(SRC, 'core', 'design', 'schema-designer.ts'), 'utf-8');
        expect(d).toMatch(/const known = deriveDataModel\(request\);/);
        expect(d).toMatch(/data model: a known domain matched/);
    });

    it('entities.js is written only when there is a model', () => {
        expect(A()).toMatch(/\.\.\.\(model\.length \? \{ 'entities\.js': fileEntitiesJs\(model, requestForReading\) \} : \{\}\)/);
    });

    it('and the generated module enforces the foreign key before writing', () => {
        const gen = A().slice(A().indexOf('function fileEntitiesJs'), A().indexOf('function fileAuthJs'));
        expect(gen).toMatch(/if \(!parent\.get\(raw\)\) return \{ error: rel\.key \+ '_not_found' \};/);
        expect(gen).toMatch(/A link that can dangle is not a relation/);
        // Required fields are refused, not stored empty.
        expect(gen).toMatch(/return \{ error: f\.key \+ '_required' \};/);
        // Reading is public but SCOPED when there is a token, writing needs an
        // account that may write, and a row is only its author's to change.
        expect(gen).toMatch(/app\.get\('\/api\/' \+ key, optionalAuth, \(req, res\) => \{/);
        expect(gen).toMatch(/let rows = t\.list\(scopeOf\(req\)\)/);
        expect(gen).toMatch(/app\.post\('\/api\/' \+ key, requireAuth, requireWrite,/);
        expect(gen).toMatch(/app\.delete\('\/api\/' \+ key \+ '\/:id', requireAuth, requireWrite,/);
        expect(gen).toMatch(/if \(!mayTouch\(req, cur\)\) return res\.status\(403\)\.json\(\{ ok: false, error: 'not_your_row' \}\);/);
        // The owner of a new row comes from the ACCOUNT, never from the body.
        expect(gen).toMatch(/t\.create\(body, req\.user\.id\)/);
        // Both backends, exactly like db.js.
        expect(gen).toMatch(/backend: 'sqlite'/);
        expect(gen).toMatch(/backend: 'json'/);
    });

    it('the server mounts them and counts them in /api/health', () => {
        expect(A()).toMatch(/mountEntities\(app, \{ requireAuth, optionalAuth, requireWrite, scopeOf, mayTouch \}\);/);
        // /api/health reports the whole system: the model's tables AND the
        // system's own primary table, which lives in db.js and used to be
        // missing from this report entirely — a built, reachable, writable
        // table that read as absent.
        expect(A()).toMatch(/tables: Object\.assign\(\{ \$\{JSON\.stringify\(resource\)\}: db\.count\(\) \}, entityCounts\(\)\),/);
        // …and a build with no model imports nothing that does not exist.
        expect(A()).toMatch(/\$\{model\.length \? "import \{ mountEntities, entityCounts \} from '\.\/entities\.js';" : ''\}/);
    });

    it('and the scope report can see a generated table as evidence', () => {
        const sc = read('core', 'quality', 'scope-audit.ts');
        expect(sc).toMatch(/"key":"vendors"/);
        expect(sc).toMatch(/"key":"coupons"/);
        expect(sc).toMatch(/"key":"shipments"/);
    });
});
