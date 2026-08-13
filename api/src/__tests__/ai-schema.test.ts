/**
 * «لماذا يتم تطوير جو بكل خطوة… لماذا لا يملك الأدوات ويقوده الذكاء الاصطناعي؟»
 *
 * The objection was right, and the answer is not «give the model the keyboard».
 * On a 15-watt laptop a 7B cannot be trusted to WRITE a server; constrained by
 * a JSON Schema it can be trusted to DESCRIBE one. So the model designs, a
 * strict validator refuses anything unsafe or unserious, and the deterministic
 * generator — already proven to produce working tables, CRUD and foreign keys —
 * builds it. Every failure path lands on the six hand-written domains.
 *
 * Proven live (verify_ai_schema.ts, 23/23) against a real HTTP server speaking
 * Ollama's protocol: a freight system none of the six domains covers became
 * three real tables with a foreign key that refuses to dangle.
 */
import fs from 'fs';
import path from 'path';
import { ENTITY_SCHEMA, validateDesign } from '../core/design/schema-designer';

const SRC = path.join(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(SRC, ...p), 'utf-8');

const good = {
    entities: [
        { key: 'drivers', label_ar: 'السائقون', label_en: 'drivers', fields: [{ key: 'name', type: 'TEXT', required: true }] },
        { key: 'trucks', label_ar: 'الشاحنات', label_en: 'trucks', fields: [{ key: 'plate', type: 'TEXT', required: true }], belongs_to: 'drivers' },
    ],
};

describe('the decoder is constrained, not merely asked nicely', () => {
    it('the schema is sent in Ollama’s `format` field, at temperature zero', () => {
        const s = read('core', 'llm', 'structured.ts');
        expect(s).toMatch(/format: ask\.schema,/);
        expect(s).toMatch(/options: \{ temperature: 0 \}/);
        expect(s).toMatch(/stream: false/);
        // An older Ollama ignores `format` and answers prose — read tolerantly.
        expect(s).toMatch(/parseFirstJson\(text\)/);
    });

    it('local first, cloud second, null when neither validates', () => {
        const s = read('core', 'llm', 'structured.ts');
        expect(s).toMatch(/const local = await askLocalStructured\(ask\);/);
        expect(s).toMatch(/const cloud = await askCloudStructured\(ask\);/);
        expect(s).toMatch(/return null;/);
        // The caller's validator decides — a shape can be typed and still absurd.
        expect(s).toMatch(/validate: \(raw: any\) => T \| null,/);
    });

    it('and the schema itself stays small enough for a 7B to hold', () => {
        expect(JSON.stringify(ENTITY_SCHEMA).length).toBeLessThan(1400);
        expect(ENTITY_SCHEMA.required).toEqual(['entities']);
    });
});

describe('the validator is harsher than the schema', () => {
    it('a well-formed design passes and grows its foreign-key column', () => {
        const out = validateDesign(good)!;
        expect(out.map(e => e.key)).toEqual(['drivers', 'trucks']);
        const trucks = out.find(e => e.key === 'trucks')!;
        expect(trucks.belongsTo).toEqual({ entity: 'drivers', key: 'driver_id' });
        expect(trucks.fields.some(f => f.key === 'driver_id' && f.type === 'INT')).toBe(true);
    });

    it('an unsafe table name never reaches SQL', () => {
        expect(validateDesign({ entities: [{ key: 'DROP TABLE x', label_ar: 'x', label_en: 'x', fields: [{ key: 'a', type: 'TEXT' }] }] })).toBeNull();
        expect(validateDesign({ entities: [{ key: 'a b', label_ar: 'x', label_en: 'x', fields: [{ key: 'a', type: 'TEXT' }] }] })).toBeNull();
    });

    it('and neither does a name the generator already owns', () => {
        const clash = { entities: [good.entities[0], { ...good.entities[1], key: 'orders' }] };
        expect(validateDesign(clash)).toBeNull();   // one survivor is not a model
    });

    it('one table is not a design — that is what we already had', () => {
        expect(validateDesign({ entities: [good.entities[0]] })).toBeNull();
    });

    it('a table with no columns is a table with nothing in it', () => {
        expect(validateDesign({ entities: [good.entities[0], { key: 'empties', label_ar: 'x', label_en: 'x', fields: [] }] })).toBeNull();
    });

    it('a link to a table nobody declared is dropped, not obeyed', () => {
        const out = validateDesign({ entities: [good.entities[0], { ...good.entities[1], belongs_to: 'ghosts' }] })!;
        expect(out.every(e => !e.belongsTo)).toBe(true);
    });

    it('and the sizes are capped — a model nobody can hold is not a model', () => {
        const many = { entities: Array.from({ length: 9 }, (_, i) => ({
            key: `t${i}x`, label_ar: 'x', label_en: 'x',
            fields: Array.from({ length: 20 }, (__, j) => ({ key: `f${j}x`, type: 'TEXT' })),
        })) };
        const out = validateDesign(many)!;
        expect(out.length).toBeLessThanOrEqual(5);
        for (const e of out) expect(e.fields.length).toBeLessThanOrEqual(8);
    });

    it('and junk is refused outright', () => {
        for (const junk of [null, {}, { entities: [] }, { entities: 'no' }, { entities: [{}] }]) {
            expect(validateDesign(junk)).toBeNull();
        }
    });
});

describe('and the builder prefers what is already known', () => {
    it('a matching domain is never handed to a model', () => {
        const d = read('core', 'design', 'schema-designer.ts');
        expect(d).toMatch(/const known = deriveDataModel\(request\);/);
        expect(d).toMatch(/if \(known\.length\) \{ opts\?\.onNote\?\.\(`data model: a known domain matched/);
        // …and the whole path can be switched off on a machine that wants it off.
        expect(d).toMatch(/JOE_AI_SCHEMA \|\| '1'\) === '0'\) return \[\];/);
    });

    it('the api builder awaits the design and says who answered', () => {
        const a = read('modules', 'tools', 'definitions', 'ApiProjectTool.ts');
        expect(a).toMatch(/const designed = await designDataModel\(request, \{ onNote: \(n: string\) => term\(n\) \}\);/);
    });

    it('and the interface builds its screens from the SAME design, not a second guess', () => {
        const a = read('modules', 'tools', 'definitions', 'ApiProjectTool.ts');
        expect(a).toMatch(/\.\.\.\(model\.length \? \{ model \} : \{\}\),/);
        const r = read('modules', 'tools', 'definitions', 'ReactProjectTool.ts');
        expect(r).toMatch(/Array\.isArray\(prevEntry\?\.model\) && prevEntry\.model\.length/);
    });

    it('a build is never blocked on a model', () => {
        const d = read('core', 'design', 'schema-designer.ts');
        expect(d).toMatch(/catch \{ \/\* a build is never blocked on a model \*\/ \}/);
        expect(d).toMatch(/return \[\];/);
    });
});
