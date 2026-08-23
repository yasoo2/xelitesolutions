/**
 * «ابنِ تطبيق مصاريف بفئات: طعام، مواصلات، فواتير» — the categories are the
 * request's OWN, and the engine used to answer with its five stock ones
 * regardless. The fishing law, applied to the data shape: declared options
 * replace the stock ones; silence keeps the stock blueprint byte-for-byte.
 *
 * And what the rows say is now DRAWN: a dependency-free donut of the real
 * rows, grouped by the app's own grouping field, plus the topGroup metric —
 * both fed by the same groupTotals, so the chart and the number cannot
 * disagree.
 */
import fs from 'fs';
import path from 'path';
import { readDeclaredOptions, blueprintFor, detectAppKind, violatesFieldConstraint, derivedColumns, recordedSubject } from '../core/design/app-blueprints';

const SRC = path.join(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(SRC, ...p), 'utf-8');

describe('classification follows request shape, not a domain-noun catalogue', () => {
    it('an unseen nonsense domain keeps the same management shape on the generic records engine', () => {
        const knownShape = 'ابنِ تطبيقاً لإدارة العملاء مع بحث وتصفية وإجمالي';
        const unseenShape = 'ابنِ تطبيقاً لإدارة Zanbqa مع بحث وتصفية وإجمالي';
        expect(detectAppKind(knownShape)).toBe('crm');
        expect(detectAppKind(unseenShape)).toBe('generic');
        const bp = blueprintFor('generic', unseenShape, false);
        expect(bp.engine).toBe('records');
        expect(bp.fields.length).toBeGreaterThan(0);
    });
});

describe('the request describes a records shape without a domain catalogue', () => {
    it('reads unseen-domain columns in the user order and infers only value shapes', () => {
        const request = 'عندي مزرعة إبل. بدي سجل أسجل فيه بيانات الناقة: اسم الناقة والعمر والوزن';
        expect(detectAppKind(request)).toBe('generic');
        expect(recordedSubject(request)).toBe('بيانات الناقة');
        expect(derivedColumns(request)?.map(column => column.label)).toEqual(['اسم الناقة', 'العمر', 'الوزن']);
        const bp = blueprintFor('generic', request, true);
        expect(bp.engine).toBe('records');
        expect(bp.fields.map(field => field.label)).toEqual(['اسم الناقة', 'العمر', 'الوزن']);
        expect(bp.fields.find(field => field.label === 'العمر')).toMatchObject({ type: 'number' });
        expect(bp.fields.find(field => field.label === 'الوزن')).toMatchObject({ type: 'number' });
    });

    it('does not treat a colon after a field as a column list', () => {
        expect(derivedColumns('متجر بفئات: قهوة، أدوات، حلويات')).toBeNull();
    });

    it('keeps the deliberate three-field floor explicit', () => {
        expect(derivedColumns('بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه')).toBeNull();
        expect(derivedColumns('I want to track my clients: name and phone')).toBeNull();
    });
});

describe('the declared categories are read from the request', () => {
    it('Arabic, colon-separated', () => {
        expect(readDeclaredOptions('ابنِ تطبيق مصاريف بفئات: طعام، مواصلات، فواتير، ترفيه'))
            .toEqual(['طعام', 'مواصلات', 'فواتير', 'ترفيه']);
    });
    it('Arabic with «و» as the separator', () => {
        expect(readDeclaredOptions('تطبيق مخزون بتصنيفات: مواد بناء وأدوات كهربائية وسباكة'))
            .toEqual(['مواد بناء', 'أدوات كهربائية', 'سباكة']);
    });
    it('English', () => {
        expect(readDeclaredOptions('an expense app with categories: food, transport, bills'))
            .toEqual(['food', 'transport', 'bills']);
    });
    it('«إلخ» is not a category, and duplicates collapse', () => {
        expect(readDeclaredOptions('بفئات: طعام، طعام، سفر، إلخ')).toEqual(['طعام', 'سفر']);
    });
    it('THE FISHING TEST: silence and junk return null', () => {
        expect(readDeclaredOptions('ابنِ تطبيق مصاريف يومية')).toBeNull();
        expect(readDeclaredOptions('بفئات:')).toBeNull();
        expect(readDeclaredOptions('')).toBeNull();
        // One item is a word, not a list.
        expect(readDeclaredOptions('بفئات: طعام')).toBeNull();
    });
});

describe('the declaration reaches ONLY the field it belongs to', () => {
    const { stripDeclaredOptions } = require('../core/design/app-blueprints');
    it('stripDeclaredOptions removes the clause and keeps the sentence', () => {
        const out = stripDeclaredOptions('ابنِ تطبيق مصاريف يومية بفئات: طعام، مواصلات، فواتير، ترفيه');
        expect(out).toContain('تطبيق مصاريف يومية');
        for (const w of ['طعام', 'مواصلات', 'فواتير', 'ترفيه', 'بفئات']) expect(out).not.toContain(w);
    });
    it('the scope classifier no longer reads a category word as a SYSTEM', () => {
        // Measured live: «فواتير» inside the category list hit dataSignals and
        // the expense app became a billing system — tables mwaslats/invoices/
        // trfyhs were generated from the list, and the project shipped named
        // «مشروع الات،».
        const { PlanningEngine } = require('../core/orchestrator/PlanningEngine');
        expect(PlanningEngine.classifyBuildScope('ابنِ تطبيق مصاريف يومية بفئات: طعام، مواصلات، فواتير، ترفيه')).toBe('app');
        // …and a REAL billing system still classifies as one.
        expect(PlanningEngine.classifyBuildScope('نظام فواتير للمحل مع تقارير')).toBe('system');
    });
    it('the brand reader never ships a mangled tail of the declaration', () => {
        const { brandFrom } = require('../core/design/page-head');
        const b = brandFrom(stripDeclaredOptions('ابنِ تطبيق مصاريف يومية بفئات: طعام، مواصلات، فواتير، ترفيه'), true) || '';
        expect(b).not.toMatch(/الات|فئات/);
    });
    it('the model readers see the sentence without the list', () => {
        const { inferModel } = require('../core/design/entity-inference');
        const stripped = stripDeclaredOptions('ابنِ تطبيق مصاريف يومية بفئات: طعام، مواصلات، فواتير، ترفيه');
        const keys = (inferModel(stripped).entities || []).map((e: any) => e.key);
        for (const bad of ['invoices', 'trfyhs', 'mwaslats']) expect(keys).not.toContain(bad);
    });
});

describe('the blueprint obeys the declaration', () => {
    it('declared categories replace the stock ones on the expenses select', () => {
        const bp = blueprintFor('expenses', 'تطبيق مصاريف بفئات: طعام، مواصلات، فواتير، ترفيه', true);
        const cat = bp.fields.find(f => f.key === 'category')!;
        expect(cat.options).toEqual(['طعام', 'مواصلات', 'فواتير', 'ترفيه']);
        expect(bp.statusField).toBe('category');
    });
    it('silence keeps the stock five exactly', () => {
        const bp = blueprintFor('expenses', 'تطبيق مصاريف يومية', true);
        expect(bp.fields.find(f => f.key === 'category')!.options)
            .toEqual(['طعام', 'مواصلات', 'فواتير', 'تسوّق', 'أخرى']);
    });
    it('a text category field becomes a real select when options are declared', () => {
        const bp = blueprintFor('store', 'متجر بفئات: قهوة، أدوات، هدايا', true);
        const cat = bp.fields.find(f => f.key === 'category')!;
        expect(cat.type).toBe('select');
        expect(cat.options).toEqual(['قهوة', 'أدوات', 'هدايا']);
    });
    it('expenses carries the topGroup metric', () => {
        const bp = blueprintFor('expenses', 'تطبيق مصاريف', true);
        expect(bp.metrics.some(m => m.kind === 'topGroup' && m.field === 'category' && m.field2 === 'amount')).toBe(true);
    });
});

describe('request-stated numeric validation is part of the field contract', () => {
    const PROMPT_01 = fs.readFileSync(path.join(__dirname, 'fixtures', 'prompt-01.md'), 'utf-8').trim();

    it('exact Prompt 01 carries a strict positive bound on its amount field', () => {
        const bp = blueprintFor('expenses', PROMPT_01, false);
        const amount = bp.fields.find(f => f.key === 'amount');
        expect(amount).toMatchObject({ type: 'number', min: 0, minExclusive: true });
    });

    it('exact Prompt 01 rejects -5 through the field contract before mutation', () => {
        const bp = blueprintFor('expenses', PROMPT_01, false);
        const amount = bp.fields.find(f => f.key === 'amount')!;
        expect(violatesFieldConstraint(amount, '-5')).toBe(true);
        expect(violatesFieldConstraint(amount, '0')).toBe(true);
        expect(violatesFieldConstraint(amount, '0.01')).toBe(false);
    });

    it('the silent numeric request invents no bound, so -5 remains accepted', () => {
        const bp = blueprintFor('expenses', 'Build a quiet expense ledger', false);
        const amount = bp.fields.find(f => f.key === 'amount')!;
        expect(amount).toMatchObject({ type: 'number' });
        expect(amount).not.toHaveProperty('min');
        expect(amount).not.toHaveProperty('minExclusive');
        expect(violatesFieldConstraint(amount, '-5')).toBe(false);
    });
});

describe('the records output enforces only declared numeric bounds', () => {
    const T = () => read('modules', 'tools', 'definitions', 'react-app-templates.ts');

    it('rejects a declared bound before the row and API mutations', () => {
        const t = T();
        const guard = t.indexOf('const invalid = invalidNumericField(fields, draft);');
        const rowMutation = t.indexOf('setRows(rows.map', guard);
        const apiMutation = t.indexOf('apiCreate(content.api, local)', guard);
        expect(guard).toBeGreaterThan(-1);
        expect(rowMutation).toBeGreaterThan(guard);
        expect(apiMutation).toBeGreaterThan(guard);
        expect(t).toMatch(/field\.minExclusive \? value <= field\.min : value < field\.min/);
        expect(t).toMatch(/min=\{f\.min !== undefined \? f\.min : undefined\}/);
    });

    it('keeps the silent numeric path free of a fabricated positive guard', () => {
        const t = T();
        expect(t).toMatch(/if \(field\.type !== 'number' \|\| field\.min === undefined\) return false/);
        expect(t).toMatch(/const invalid = invalidNumericField\(fields, draft\);/);
    });

    it('executes and serialises a request-derived margin metric', () => {
        const t = T();
        expect(t).toMatch(/case 'sumMargin': return round\(/);
        expect(t).toMatch(/m\.field3/);
        const bp = blueprintFor('generic', 'بدي سجل أسجل فيه مبيعات: الكمية وسعر الشراء وسعر البيع وأريد إجمالي الربح', true);
        const margin = bp.metrics.find(m => m.kind === 'sumMargin');
        expect(margin).toMatchObject({ field: 'count1', field2: 'money2', field3: 'money1' });
    });
});

describe('the chart is real and shares its numbers with the metric', () => {
    const T = () => read('modules', 'tools', 'definitions', 'react-app-templates.ts');
    it('groupTotals lives in the generated store and topGroup computes from it', () => {
        const t = T();
        expect(t).toMatch(/export function groupTotals\(rows, groupField, valueField\)/);
        expect(t).toMatch(/case 'topGroup':/);
    });
    it('the records app draws a donut from its own rows, gated on the grouping field', () => {
        const t = T();
        expect(t).toMatch(/if \(!content\.statusField\) return null;/);
        expect(t).toMatch(/groupTotals\(rows, content\.statusField, money\)/);
        expect(t).toMatch(/conic-gradient/);
        expect(t).toMatch(/chart-legend/);
        // Fewer than two groups is a number, not a chart.
        expect(t).toMatch(/groups\.length < 2\) return null/);
    });
    it('the chart styles ride in the app css', () => {
        expect(T()).toMatch(/\.donut\{position:relative/);
        expect(T()).toMatch(/\.chart-legend li\{display:flex/);
    });
});


describe('a bare UI noun does not open a request-shaped column list', () => {
    it('rejects an invented Arabic UI name without a declaration marker', () => {
        const request = 'بدي صفحة فيها الحقول زغرودة والزر إرسال';
        expect(derivedColumns(request)).toBeNull();
    });

    it('proves the old bare-noun opener would collide on that unseen name', () => {
        const request = 'بدي صفحة فيها الحقول زغرودة والزر إرسال';
        const deliberatelyUnsafe = /(?:الحقول|الأعمدة|\bcolumns?\b|\bfields?\b)/iu;
        expect(deliberatelyUnsafe.test(request)).toBe(true);
        // If bare nouns are allowed back into production, this exact UI prose
        // becomes a false schema; the production assertion must stay null.
        expect(derivedColumns(request)).toBeNull();
    });
});
