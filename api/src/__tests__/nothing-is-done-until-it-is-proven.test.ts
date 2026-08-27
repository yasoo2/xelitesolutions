/**
 * «نجاح البناء لا يساوي نجاح الوكيل».
 *
 * A wide brief asked for a booking board with a dashboard, six rows, search, a
 * status filter, an add form, empty states, a local export, a README, a
 * production build and a preview. What came back was a working project, a
 * message listing files, and `success: true` — with no build, no README, and
 * no mention that seven of the nine things asked for had never been shown.
 *
 * Nothing in that run was a lie. Every individual claim was true. The failure
 * was that nobody asked the question the user actually cares about: of the
 * things I was TOLD to deliver, which can I show?
 *
 * The judge asks it. It reads his own brief into criteria, hunts evidence for
 * each in what really exists — files on disk, the build flag, a live server,
 * the browser audit, the generated source — and publishes the ledger. Measured
 * on a real build while writing this: 8 of 11, with README, preview and
 * browser check named as unmet; then 9 of 9 once the README was written where
 * both build paths could reach it.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    acceptanceFor,
    judgeAcceptance,
    acceptanceBlock,
    GATE062_ACCEPTANCE_PROMPT,
    GATE062_LIVE_PROMPT,
    titleTextFrom,
} from '../core/quality/acceptance';
import {
    measuredAppAbilities,
    deliveryVoiceOverlap,
    reconcileDeliveryVoices,
    previewUrlFromStatus,
    verifiedPreviewUrl,
} from '../modules/tools/definitions/ReactProjectTool';

const REACT = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');

const BRIEF = 'أنشئ لوحة حجوزات عربية RTL لورشة تصوير. المطلوب: لوحة مؤشرات، ستة حجوزات، بحث،'
    + ' مرشح حالة، إضافة حجز، حالات فراغ، تصدير محلي، README عربي، بناء إنتاج، ومعاينة عبر المتصفح.';
const SHAPE_BRIEF = 'Build an app with a counter, button, title, and status message.';
const BOUNDED_ARABIC = 'بدي جدول مبيعات فيه اسم الصنف والكمية والسعر، والسعر لا يقبل صفر';

describe('the criteria come from HIS brief, never from a fixed checklist', () => {
    it('a wide brief yields every thing it asked for', () => {
        const ids = acceptanceFor(BRIEF).map(c => c.id).sort();
        expect(ids).toEqual([
            'add_row', 'browser_check', 'dashboard', 'empty_state', 'export',
            'filter', 'preview', 'production_build', 'readme', 'rtl', 'search',
        ].sort());
    });

    it('and a plain request asks for almost nothing — so almost nothing is judged', () => {
        const ids = acceptanceFor('ابنِ لي موقع لمطعم إيطالي اسمه لا بيلا').map(c => c.id);
        expect(ids).not.toContain('export');
        expect(ids).not.toContain('readme');
        expect(ids).not.toContain('browser_check');
        expect(ids).not.toContain('production_build');
    });

    it('distinguishes building an app from explicitly building for production', () => {
        expect(acceptanceFor('build me a simple calculator app').map(c => c.id))
            .not.toContain('production_build');
        expect(acceptanceFor('ابنِ لي نسخة إنتاج من الموقع').map(c => c.id))
            .toContain('production_build');
    });

    it('nothing is invented: a criterion he never mentioned is never judged', () => {
        expect(acceptanceFor('ابنِ صفحة هبوط بسيطة').map(c => c.id)).not.toContain('search');
    });

    it('reads exactly the four general UI shapes named by the request', () => {
        expect(acceptanceFor(SHAPE_BRIEF).map(c => c.id).sort()).toEqual([
            'button', 'counter', 'status_message', 'title',
        ].sort());
    });

    it('freezes the Gate062 acceptance input separately from the live input', () => {
        expect(acceptanceFor(GATE062_ACCEPTANCE_PROMPT).map(c => c.id).sort()).toEqual([
            'button', 'counter', 'status_message', 'title',
        ].sort());
        //  THE LIVE PROMPT NOW DERIVES SIX, AND THE SIXTH IS DECLARED HERE.
        //
        //  It ends «Do not modify existing projects» — a stated rule, and one
        //  Joe silently dropped for as long as nothing read rules. It is the
        //  most consequential sentence in the whole brief: it is the one that
        //  protects the owner's other work.
        //
        //  The reference denominator therefore moves 5 → 6. That is not the
        //  prompt changing — not one character of it has — it is Joe reading a
        //  sentence he used to ignore. Every «x/5» published before today is
        //  incomparable with every «x/6» after it, and this comment is the
        //  record of exactly when and why, so nobody has to guess later.
        expect(acceptanceFor(GATE062_LIVE_PROMPT).map(c => c.id).sort()).toEqual([
            'button', 'counter', 'preview', 'rule:1', 'status_message', 'title',
        ].sort());
        const rule = acceptanceFor(GATE062_LIVE_PROMPT).find(c => c.id === 'rule:1');
        expect((rule as any).expectedRule.text).toBe('Do not modify existing projects');
        expect((rule as any).expectedRule.kind).toBe('forbid');
    });

    it('derives a stated numeric bound from the request and does not invent it when silent', () => {
        const constrained = acceptanceFor(BOUNDED_ARABIC);
        expect(constrained.map(c => c.id)).toEqual([
            'column:text1', 'column:count1', 'column:money1', 'constraint:money1:min',
        ]);
        expect(constrained.find(c => c.id === 'constraint:money1:min')?.expectedBound)
            .toEqual({ min: 0, minExclusive: true });

        const withoutBound = acceptanceFor(BOUNDED_ARABIC.replace('، والسعر لا يقبل صفر', ''));
        expect(withoutBound.map(c => c.id)).toEqual([
            'column:text1', 'column:count1', 'column:money1',
        ]);
        expect(withoutBound.some(c => c.expectedBound)).toBe(false);
    });

    it('derives explicit bounds for an invented column name without a name catalogue', () => {
        const invented = 'Build a table with columns: zqixdal_val, companion_field, third_field, and zqixdal_val must be greater than 4.';
        const criteria = acceptanceFor(invented);
        expect(criteria.map(c => c.id)).toEqual([
            'column:text1',
            'constraint:text1:min',
            'column:text2',
            'column:text3',
        ]);
        const bound = criteria.find(c => c.id === 'constraint:text1:min');
        expect(bound?.expectedColumn).toBe('zqixdal_val');
        expect(bound?.expectedBound).toEqual({ min: 4, minExclusive: true });

        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-acceptance-invented-bound-'));
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'src', 'App.jsx'), `const fields = [
          { key: 'text1', label: 'zqixdal_val', type: 'number', min: 4, minExclusive: true },
          { key: 'text2', label: 'companion_field', type: 'text' },
          { key: 'text3', label: 'third_field', type: 'text' },
        ];`);
        try {
            const judged = judgeAcceptance([bound!], { dir }, false);
            expect(judged.criteria[0]?.verdict).toBe('met');
            expect(judged.met).toBe(1);
            expect(judged.unmet).toBe(0);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }

        const silent = acceptanceFor('Build a table with columns: zqixdal_val, companion_field, third_field.');
        expect(silent.map(c => c.id)).toEqual(['column:text1', 'column:text2', 'column:text3']);
        expect(silent.some(c => c.expectedBound)).toBe(false);
    });

    it('does not invent a record-add criterion from Create alone', () => {
        expect(acceptanceFor('Create a polished product landing page').map(c => c.id))
            .not.toContain('add_row');
        expect(acceptanceFor('Create a new customer record').map(c => c.id))
            .toContain('add_row');
        expect(acceptanceFor('ابن لي موقع لمطعمي فيه قائمة الطعام والأسعار').map(c => c.id))
            .not.toContain('list');
    });
});

describe('delivery voices cannot contradict one another', () => {
    const claimed = [
        'create, edit and delete records for real',
        'instant search, filter and sort',
        'durable storage, CSV export, and reads from the project API when one exists',
    ];
    const missing = ['edit', 'search', 'sorting', 'durable storage', 'CSV export'];

    it('the old message shape is a real negative control', () => {
        expect(deliveryVoiceOverlap(claimed, missing)).toEqual(expect.arrayContaining(['crud', 'search', 'sort', 'storage', 'csv']));
    });

    it('keeps unrelated disagreement unmet while resolving mapped delivery contradictions', () => {
        const reconciled = reconcileDeliveryVoices(claimed, missing, ['search', 'export']);
        expect(reconciled.unmet).toEqual(['edit', 'sorting', 'durable storage']);
        expect(reconciled.unjudged).toEqual([]);
        expect(reconciled.abilities).toEqual([]);
        expect(deliveryVoiceOverlap(reconciled.abilities, [...reconciled.unmet, ...reconciled.unjudged])).toEqual([]);
        expect(reconciled.conflicts).toEqual(expect.arrayContaining(['crud', 'sort', 'storage']));
    });

    it('keeps source-backed search and row totals positive in the delivery voice', () => {
        const sourceClaims = [
            'instant search, filter and sort',
            'numbers computed from YOUR rows',
        ];
        const reconciled = reconcileDeliveryVoices(
            sourceClaims,
            ['text search', 'a running total that updates from the actual rows'],
            ['search', 'counter'],
            ['search', 'counter'],
        );
        expect(reconciled.abilities).toEqual(sourceClaims);
        expect(reconciled.unmet).toEqual([]);
        expect(reconciled.unjudged).toEqual([]);
        expect(reconciled.conflicts).toEqual([]);
    });

    it('uses UNJUDGED only when a mapped criterion has no measured delivery claim', () => {
        const reconciled = reconcileDeliveryVoices([], ['text search'], ['search'], ['search']);
        expect(reconciled.unjudged).toEqual(['text search']);
        expect(reconciled.unmet).toEqual([]);
    });

    it('accepts request-shaped column criteria without inventing a delivery topic', () => {
        const reconciled = reconcileDeliveryVoices(
            ['a measured unrelated ability'],
            ['an unrelated missing ability'],
            ['column:text1', 'column:tel1'],
            ['column:text1', 'column:tel1'],
        );
        expect(reconciled).toEqual({
            abilities: ['a measured unrelated ability'],
            unmet: ['an unrelated missing ability'],
            unjudged: [],
            conflicts: [],
        });
    });

    it('fails loudly by name when a criterion has no delivery mapping', () => {
        expect(() => reconcileDeliveryVoices([], [], [], ['future_criterion']))
            .toThrow(/delivery_acceptance_unmapped:future_criterion/);
    });
});

describe('preview claims require a measured HTTP response', () => {
    it('keeps the candidate URL only when the response is HTTP 200', () => {
        const url = 'http://127.0.0.1:40127/project-preview/probe/index.html';
        expect(previewUrlFromStatus(200, url)).toBe(url);
        expect(previewUrlFromStatus(404, url)).toBe('');
        expect(previewUrlFromStatus(null, url)).toBe('');
        expect(previewUrlFromStatus(200, '')).toBe('');
    });

    it('turns an invalid or unavailable preview into an unmet-safe empty URL', async () => {
        await expect(verifiedPreviewUrl('not-a-url')).resolves.toBe('');
        await expect(verifiedPreviewUrl('http://127.0.0.1:65534/project-preview/missing/index.html')).resolves.toBe('');
    });
});

describe('capability claims require a measured engine contract', () => {
    /**
     *  THE FIXTURE CARRIES CONTROLS NOW, NOT WORDS.
     *
     *  It used to list `search filter sort` as bare tokens, because that is
     *  what the proof looked for — and `filter` and `sort` are JavaScript's
     *  own array methods, present in every React file ever generated. A
     *  records app with no filter control at all was told it could filter.
     *
     *  The claims are proven by the STATE their controls drive, so the
     *  fixture names those, and the filter also needs a select column: its
     *  control renders only when one exists, so without one the markup never
     *  reaches the screen.
     */
    const RECORDS_SOURCE = "function RecordsApp(){ setRows add create edit update delete required validate"
        + " setQuery( setFilter( setSort( groupTotals localStorage fetch toCsv download"
        + " fields:[{key:'status',type:'select'}] }";

    it('returns only measured claims for a known engine with source evidence', () => {
        const report = measuredAppAbilities('records', true, RECORDS_SOURCE);
        expect(report.measured).toBe(true);
        expect(report.abilities).toContain('إضافة وتعديل وحذف السجلات فعلياً');
        expect(report.abilities).toContain('حفظ دائم + تصدير CSV + قراءة من خادم المشروع إن وُجد');
        expect(report.unmeasured).toEqual([]);
    });

    it('drops the CSV claim when a records source has no CSV evidence', () => {
        const source = 'function RecordsApp(){ setRows add create edit update delete required validate search filter sort groupTotals localStorage }';
        const report = measuredAppAbilities('records', false, source);
        expect(report.measured).toBe(true);
        expect(report.abilities).not.toContain('durable storage, CSV export, and reads from the project API when one exists');
        expect(report.unmeasured).toContain('durable storage, CSV export, and reads from the project API when one exists');
    });

    it('does not claim any known-engine ability when its source cannot be read', () => {
        const report = measuredAppAbilities('records', true, '');
        expect(report).toEqual(expect.objectContaining({ abilities: [], measured: false }));
        //  EVERY ability of the engine, not a number that has to be edited
        //  each time the contract gets more precise. It was written as `5`,
        //  and splitting one false claim («search, filter and sort», proven
        //  by two array methods) into three provable ones broke a test that
        //  had nothing to say about the change. The count is derived from a
        //  fully-evidenced run, so it describes the intent instead of a
        //  snapshot of it.
        const everyAbility = measuredAppAbilities('records', true, RECORDS_SOURCE).abilities;
        expect(everyAbility.length).toBeGreaterThan(4);
        expect(report.unmeasured).toHaveLength(everyAbility.length);
    });

    it('does not inherit records claims for an unknown engine', () => {
        const ar = measuredAppAbilities('future-engine', true, 'setRows toCsv');
        const en = measuredAppAbilities('future-engine', false, 'setRows toCsv');
        expect(ar).toEqual({ abilities: [], unmeasured: [], measured: false });
        expect(en).toEqual({ abilities: [], unmeasured: [], measured: false });
        expect(ar.abilities.join(' ')).not.toContain('السجلات');
        expect(en.abilities.join(' ')).not.toContain('records');
        expect(REACT).not.toContain('ABILITIES[appBp.engine] || ABILITIES.records');
        expect(REACT).toContain('غير مثبتة في مصدر المشروع');
    });
});

describe('a criterion is met by EVIDENCE, or it is not met', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-accept-'));

    beforeAll(() => {
        fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
        fs.writeFileSync(path.join(tmp, 'src', 'App.jsx'),
            `import { useState } from 'react';
            export default function App(){
              const [count, setCount] = useState(6);
              const [statusMessage, setStatusMessage] = useState('جاهز');
              function save(event){ event.preventDefault(); setStatusMessage('تم الحفظ'); }
              return <div dir="rtl">
                <h1>لوحة الحجوزات</h1>
                <span data-count={count}>{count}</span>
                <p role="status" aria-live="polite">{statusMessage}</p>
                <input type="search" />
                <select><option>الحالة</option></select>
                <form onSubmit={save}><button type="submit" onClick={() => { setCount(count + 1); setStatusMessage('تم الحفظ'); }}>إضافة</button></form>
                <a download="rows.csv" href={URL.createObjectURL(blob)}>تصدير</a>
                <p>لا توجد حجوزات بعد</p>
              </div>;
            }`);
    });

    it('a feature really present in the source is met, and says where from', () => {
        const a = judgeAcceptance(acceptanceFor(BRIEF), { dir: tmp, built: false }, true);
        const by = (id: string) => a.criteria.find(c => c.id === id)!;
        for (const id of ['search', 'filter', 'add_row', 'export', 'empty_state', 'rtl']) {
            expect(by(id).verdict).toBe('met');
        }
        expect(a.met).toBe(7);
        expect(a.unmet).toBe(4);
        expect(a.accepted).toBe(false);
    });

    it.each([
        ['LF', '\n'],
        ['CRLF', '\r\n'],
    ] as const)('uses the same acceptance evidence on %s generated source endings', (_label, ending) => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-acceptance-line-endings-positive-'));
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        const source = [
            'import { useState } from "react";',
            'export default function App(){',
            '  const [count, setCount] = useState(0);',
            '  const [status, setStatus] = useState("Ready");',
            '  return <>',
            '    <h1>Gate 062</h1>',
            '    <p role="status">{status}</p>',
            '    <button onClick={() => { setCount(prev => prev + 1); setStatus("Clicked"); }}>{count}</button>',
            '  </>;',
            '}',
        ].join('\n');
        fs.writeFileSync(path.join(dir, 'src', 'App.jsx'), source.replace(/\n/g, ending));
        try {
            const raw = fs.readFileSync(path.join(dir, 'src', 'App.jsx'), 'utf8');
            const newlineCount = (raw.match(/\n/g) || []).length;
            const crlfCount = (raw.match(/\r\n/g) || []).length;
            expect(crlfCount).toBe(ending === '\r\n' ? newlineCount : 0);
            const judged = judgeAcceptance(acceptanceFor(SHAPE_BRIEF), { dir, built: true }, false);
            expect(judged.criteria.map(c => c.verdict)).toEqual(['met', 'met', 'met', 'met']);
            expect(judged.met).toBe(4);
            expect(judged.unmet).toBe(0);
            expect(judged.accepted).toBe(true);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it.each([
        ['LF', '\n'],
        ['CRLF', '\r\n'],
    ] as const)('rejects the same missing button evidence on %s generated source endings', (_label, ending) => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-acceptance-line-endings-negative-'));
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        const source = [
            'import { useState } from "react";',
            'export default function App(){',
            '  const [count, setCount] = useState(0);',
            '  const [status, setStatus] = useState("Ready");',
            '  return <>',
            '    <h1>Gate 062</h1>',
            '    <p role="status">{status}</p>',
            '    <input onChange={() => { setCount(prev => prev + 1); setStatus("Changed"); }} />',
            '    <button>{count}</button>',
            '  </>;',
            '}',
        ].join('\n');
        fs.writeFileSync(path.join(dir, 'src', 'App.jsx'), source.replace(/\n/g, ending));
        try {
            const judged = judgeAcceptance(acceptanceFor(SHAPE_BRIEF), { dir, built: true }, false);
            expect(judged.criteria.map(c => [c.id, c.verdict])).toEqual([
                ['counter', 'met'],
                ['button', 'unmet'],
                ['title', 'met'],
                ['status_message', 'met'],
            ]);
            expect(judged.met).toBe(3);
            expect(judged.unmet).toBe(1);
            expect(judged.accepted).toBe(false);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('derives an unknown-token brief by requested shape, not a project-name dictionary', () => {
        const request = 'Build a qzzworp_stub page with a counter and a button.';
        expect(acceptanceFor(request).map(c => c.id)).toEqual(['counter', 'button']);
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-acceptance-unknown-token-'));
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'src', 'App.jsx'), `
          import { useState } from 'react';
          export default function App(){
            const [count, setCount] = useState(0);
            return <button onClick={() => setCount(prev => prev + 1)}>{count}</button>;
          }
        `);
        try {
            const judged = judgeAcceptance(acceptanceFor(request), { dir }, false);
            expect(judged.criteria.some(c => c.id.includes('qzzworp'))).toBe(false);
            expect(judged.criteria.every(c => c.verdict === 'met')).toBe(true);
            expect(judged.accepted).toBe(true);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('does not accept a generic XELITE landing page as the five-part Gate062 run', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-xelite-gate062-'));
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'src', 'App.jsx'), `
          export default function App(){
            return <main>
              <h1>Gate062 — TypeScript + Vite</h1>
              <p>Build beautiful apps.</p>
              <button>Get started</button>
            </main>;
          }
        `);
        const a = judgeAcceptance(acceptanceFor(GATE062_LIVE_PROMPT), { dir }, true);
        expect(a.met).toBe(0);
        //  SIX, not five: `unmet` is now the count of everything NOT PROVEN,
        //  because a criterion the judge could not check is still an acceptance
        //  obligation the run did not discharge. Otherwise a run scores 100% by
        //  proving only the subset the judge happened to know how to inspect.
        //  The partition below is what keeps the two kinds distinguishable.
        //  Five looked for and missing, one this judge cannot check. The
        //  aggregate is asserted as the SUM so neither kind can quietly
        //  absorb the other, which is the whole point of keeping them apart.
        expect(a.unmet).toBe(5);
        expect(a.unprovable).toBe(1);
        expect(a.unmet + a.unprovable).toBe(a.criteria.length);
        expect(a.criteria.length).toBe(6);
        expect(a.accepted).toBe(false);
        //  Five are unmet and the sixth is UNPROVABLE, which is a different
        //  answer and has to stay a different answer: «I could not check
        //  this» is not «this failed». Asserted one by one rather than as a
        //  blanket, because `every(c => unmet || unprovable)` would also pass
        //  on a day when all six quietly became unprovable.
        expect(a.criteria.filter(c => c.verdict === 'unmet').map(c => c.id).sort())
            .toEqual(['button', 'counter', 'preview', 'status_message', 'title']);
        const declared = a.criteria.filter(c => c.verdict === 'unprovable');
        expect(declared.map(c => c.id)).toEqual(['rule:1']);
        //  And it says WHICH condition it could not prove, in his own words.
        expect(declared[0].why).toContain('Do not modify existing projects');
    });

    it('counts each named UI shape independently from the generated source', () => {
        const a = judgeAcceptance(acceptanceFor(SHAPE_BRIEF), { dir: tmp }, true);
        const by = (id: string) => a.criteria.find(c => c.id === id)!;
        for (const id of ['counter', 'button', 'title', 'status_message']) {
            expect(by(id).verdict).toBe('met');
            expect(by(id).why).toContain('مصدر المشروع');
        }
        expect(a.met).toBe(4);
        expect(a.unmet).toBe(0);
    });

    it('judges a stated bound from the generated field object and fails a mutation that removes it', () => {
        const criteria = acceptanceFor(BOUNDED_ARABIC);
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-acceptance-bound-'));
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        const source = `const fields = [
          { key: 'text1', label: 'اسم الصنف', type: 'text', required: true },
          { key: 'count1', label: 'الكمية', type: 'number', required: true },
          { key: 'money1', label: 'السعر', type: 'number', required: true, min: 0, minExclusive: true },
        ];
        export default function App(){ return <div>{fields.map(field => <span key={field.key}>{field.label}</span>)}</div>; }`;
        fs.writeFileSync(path.join(dir, 'src', 'App.jsx'), source);
        try {
            const positive = judgeAcceptance(criteria, { dir }, true);
            expect(positive.criteria.find(c => c.id === 'constraint:money1:min')?.verdict).toBe('met');
            expect(positive.met).toBe(4);
            expect(positive.unmet).toBe(0);
            expect(positive.accepted).toBe(true);

            fs.writeFileSync(path.join(dir, 'src', 'App.jsx'), source.replace(', minExclusive: true', ''));
            const mutated = judgeAcceptance(criteria, { dir }, true);
            expect(mutated.criteria.find(c => c.id === 'constraint:money1:min')?.verdict).toBe('unmet');
            expect(mutated.met).toBe(3);
            expect(mutated.unmet).toBe(1);
            expect(mutated.accepted).toBe(false);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    it('extracts only a safe requested title and proves the exact heading', () => {
        const english = acceptanceFor('Create one polished page titled Gate 062 with a heading, a short status message, and a button.');
        const arabic = acceptanceFor('ابنِ صفحة بعنوان متجر الأمل فيها قائمة المنتجات');
        expect(titleTextFrom(GATE062_ACCEPTANCE_PROMPT)).toBe('Gate 062');
        expect(english.find(c => c.id === 'title')!.expectedText).toBe('Gate 062');
        expect(arabic.find(c => c.id === 'title')!.expectedText).toBe('متجر الأمل');

        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-title-positive-'));
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'src', 'App.jsx'), '<h1>Gate 062</h1>');
        const title = judgeAcceptance(english.filter(c => c.id === 'title'), { dir }, true).criteria[0];
        expect(title.verdict).toBe('met');
        expect(title.why).toContain('Gate 062');
    });

    it('does not prove action-bound shapes from generic markup alone', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-negative-shapes-'));
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'src', 'App.jsx'), `
          const count = 6;
          export default function App(){ return <>
            <span data-count={count}>{count}</span>
            <button>Open</button>
            <p>Ready</p>
            <h1>Other title</h1>
          </>; }
        `);
        const request = 'Build a page with a counter, button, title, and status message.';
        const a = judgeAcceptance(acceptanceFor(request), { dir }, true);
        const by = (id: string) => a.criteria.find(c => c.id === id)!;
        expect(by('counter').verdict).toBe('unmet');
        expect(by('button').verdict).toBe('unmet');
        expect(by('status_message').verdict).toBe('unmet');
        expect(by('title').verdict).toBe('met');
    });

    it('rejects unrelated state from counter and status evidence', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-unrelated-state-'));
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'src', 'App.jsx'), `
          import { useState } from 'react';
          export default function App(){
            const [name, setName] = useState('Ada');
            return <>
              <span data-count={name}>{name}</span>
              <p role="status" aria-live="polite">{name}</p>
              <button onClick={() => setName('Grace')}>Rename</button>
            </>;
          }
        `);
        const request = 'Build a page with a counter and status message.';
        const a = judgeAcceptance(acceptanceFor(request), { dir }, true);
        expect(a.criteria.find(c => c.id === 'counter')!.verdict).toBe('unmet');
        expect(a.criteria.find(c => c.id === 'status_message')!.verdict).toBe('unmet');
    });

    it('rejects state that is rendered but never updated by an action', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-never-updated-'));
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'src', 'App.jsx'), `
          import { useState } from 'react';
          export default function App(){
            const [count, setCount] = useState(6);
            const [statusMessage, setStatusMessage] = useState('Ready');
            return <>
              <span data-count={count}>{count}</span>
              <p role="status" aria-live="polite">{statusMessage}</p>
              <button>Open</button>
            </>;
          }
        `);
        const request = 'Build a page with a counter and status message.';
        const a = judgeAcceptance(acceptanceFor(request), { dir }, true);
        expect(a.criteria.find(c => c.id === 'counter')!.verdict).toBe('unmet');
        expect(a.criteria.find(c => c.id === 'status_message')!.verdict).toBe('unmet');
    });

    it('does not accept a requested title when the generated heading differs', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-title-negative-'));
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'src', 'App.jsx'), '<h1>Other title</h1>');
        const criteria = acceptanceFor('Create one polished page titled Gate 062 with a heading.');
        const title = judgeAcceptance(criteria.filter(c => c.id === 'title'), { dir }, true).criteria[0];
        expect(title.verdict).toBe('unmet');
    });

    it('a build that did not happen is unmet — the flag comes from a real process', () => {
        const a = judgeAcceptance(acceptanceFor(BRIEF), { dir: tmp, built: false }, true);
        expect(a.criteria.find(c => c.id === 'production_build')!.verdict).toBe('unmet');
        expect(judgeAcceptance(acceptanceFor(BRIEF), { dir: tmp, built: true }, true)
            .criteria.find(c => c.id === 'production_build')!.verdict).toBe('met');
    });

    it('a preview is met only by a url that was verified alive', () => {
        const without = judgeAcceptance(acceptanceFor(BRIEF), { dir: tmp }, true);
        expect(without.criteria.find(c => c.id === 'preview')!.verdict).toBe('unmet');
        const withUrl = judgeAcceptance(acceptanceFor(BRIEF), { dir: tmp, liveUrl: 'http://127.0.0.1:4300/' }, true);
        expect(withUrl.criteria.find(c => c.id === 'preview')!.verdict).toBe('met');
        expect(withUrl.criteria.find(c => c.id === 'preview')!.why).toContain('4300');
    });

    /**
     * A skipped browser audit is the case that started all this: the run read
     * as a success while Chromium had never started.
     */
    it('a browser check that was SKIPPED is unmet, and says why', () => {
        const a = judgeAcceptance(acceptanceFor(BRIEF),
            { dir: tmp, audit: { skipped: 'playwright not installed' } }, true);
        const c = a.criteria.find(x => x.id === 'browser_check')!;
        expect(c.verdict).toBe('unmet');
        expect(c.why).toContain('playwright not installed');
    });

    it('a missing README is unmet, and a present one is met', () => {
        expect(judgeAcceptance(acceptanceFor(BRIEF), { dir: tmp }, true)
            .criteria.find(c => c.id === 'readme')!.verdict).toBe('unmet');
        fs.writeFileSync(path.join(tmp, 'README.md'), '# x');
        expect(judgeAcceptance(acceptanceFor(BRIEF), { dir: tmp }, true)
            .criteria.find(c => c.id === 'readme')!.verdict).toBe('met');
    });

    it('with no source to read, a feature is UNPROVABLE — never quietly met', () => {
        const a = judgeAcceptance(acceptanceFor(BRIEF), { dir: '/nowhere-at-all' }, true);
        expect(a.criteria.find(c => c.id === 'search')!.verdict).toBe('unprovable');
        expect(a.unmet + a.unprovable).toBe(a.criteria.length);
        expect(a.accepted).toBe(false);
    });

    it('uses every derived criterion as the denominator for a complete and incomplete run', () => {
        const criteria = acceptanceFor(SHAPE_BRIEF);
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-acceptance-denominator-'));
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'src', 'App.jsx'), `
          import { useState } from 'react';
          export default function App(){
            const [count, setCount] = useState(0);
            const [status, setStatus] = useState('Ready');
            return <>
              <h1>Gate 062</h1>
              <p role="status" aria-live="polite">{status}</p>
              <button onClick={() => { setCount(prev => prev + 1); setStatus('Clicked'); }}>{count}</button>
            </>;
          }
        `);

        const complete = judgeAcceptance(criteria, { dir, built: true }, false);
        expect(complete.met).toBe(criteria.length);
        expect(complete.unmet).toBe(0);
        expect(complete.accepted).toBe(true);
        expect(acceptanceBlock(complete, false)).toContain(`all ${criteria.length}/${criteria.length} requested criteria were proven`);

        const withoutEvidence = judgeAcceptance(criteria, { dir: '/no-evidence-at-all' }, false);
        expect(withoutEvidence.met).toBe(0);
        expect(withoutEvidence.unmet + withoutEvidence.unprovable).toBe(criteria.length);
        expect(withoutEvidence.accepted).toBe(false);
        expect(withoutEvidence.criteria.every(c => c.verdict !== 'met')).toBe(true);
        const blocked = acceptanceBlock(withoutEvidence, false);
        expect(blocked).toContain(`0 of ${criteria.length} requested criteria were proven`);
        //  With no directory at all NOTHING is checkable, so all four are
        //  unprovable and none is unmet — and the head must say exactly
        //  that rather than rounding the gap into a failure. Both numbers
        //  are asserted so neither kind can absorb the other.
        expect(blocked).toContain('0 were not proven');
        expect(blocked).toContain(`${criteria.length} I did not know how to check`);
        expect(blocked).not.toContain('⏭️');
    });

    it('refuses to format an internally inconsistent ledger', () => {
        const clean = judgeAcceptance(acceptanceFor(SHAPE_BRIEF), { dir: '/no-evidence-at-all' }, false);
        expect(() => acceptanceBlock(clean, false)).not.toThrow();
        const broken = { ...clean, unmet: clean.unmet + 1 };
        expect(() => acceptanceBlock(broken, false)).toThrow('acceptance_ledger_count_mismatch');
    });

    it('accepted is false while a single criterion is unmet', () => {
        const a = judgeAcceptance(acceptanceFor(BRIEF), { dir: tmp, built: true }, true);
        expect(a.unmet).toBeGreaterThan(0);
        expect(a.accepted).toBe(false);
    });
});

describe('the ledger is published, in his language', () => {
    it('an incomplete run declares the judge boundary and names every known gap', () => {
        const a = judgeAcceptance(acceptanceFor(BRIEF), { dir: '/nope', built: false }, true);
        const block = acceptanceBlock(a, true);
        expect(block).toContain('التسليم محجوب');
        //  ⛔ NORMALISED ON BOTH SIDES, and this is not tidiness.
        //  This line carried ت+shadda+damma while the source wrote
        //  ت+damma+shadda — the same word to every human eye, two
        //  different byte sequences to `includes`, and a guard that fails
        //  on a difference no reader can see is a guard nobody can trust.
        //  NFC puts combining marks in canonical order, so the comparison
        //  finally asks what a reader asks.
        const nfc = (x: string) => x.normalize('NFC');
        expect(nfc(block)).toContain(nfc('أثبتُّ 0 من أصل 11'));
        //  4 looked for and missing, 7 unknown to this judge — and BOTH
        //  numbers reach him. Asserting only the total would let one kind
        //  hide inside the other.
        expect(nfc(block)).toContain(nfc('4 لم يُثبت'));
        expect(nfc(block)).toContain(nfc('7 لم أعرف كيف أفحصه'));
        expect(block).not.toContain('ولم أفحص بقية نص طلبك');
        expect(block).toContain('❌');
        expect(block).toContain('README');
    });

    it('the rejected English branch also discloses the judge boundary', () => {
        const a = judgeAcceptance(
            acceptanceFor('Create a page with a counter, title, and production build.'),
            { dir: '/nope', built: false },
            false,
        );
        const block = acceptanceBlock(a, false);
        expect(block).toContain('Delivery blocked');
        expect(block).toContain('0 of 3 requested criteria were proven');
        expect(block).toContain('1 were not proven');
        expect(block).toContain('2 I did not know how to check');
        expect(block).not.toContain('I did not inspect the rest of your request');
    });

    it('the terminal receipt uses the same bounded judge vocabulary in both languages', () => {
        //  Both languages print the SAME count, and neither over-claims. This
        //  used to pin the two sentences letter for letter, which made it a
        //  spelling test: it went red the moment the line said MORE, not less.
        expect(REACT).toContain('acceptance: ${acceptance.met}/${acceptance.criteria.length} (${scope})');
        expect(REACT).toContain("c.verdict !== 'met'");
        expect(REACT).not.toContain('of what I know how to prove is proven');
    });

    it('⛔ the count declares WHAT it is a count of', () => {
        //  Measured live in his terminal, two lines apart:
        //
        //      acceptance denominator: 1 (known-features list — your request was not read)
        //      acceptance: 1/1 requested criteria proven
        //
        //  Both true. Together they mislead, and the second is the one he
        //  reads — a perfect score over a catalogue nobody asked for, printed
        //  one line after Joe admitted it had not read the request. Honesty is
        //  not a property of a sentence; it is a property of what the reader is
        //  left believing.
        expect(REACT).toContain('const fromHisWords = acceptance.criteria.some');
        expect(REACT).toContain('your request was not read');
        expect(REACT).toContain('لم يُقرأ طلبك');
    });

    it('⛔ and when it fell back, it says how many of HIS things went unproven', () => {
        //  «1/1 from the known-features list» is honest and still hides the
        //  shape of the failure. Five things were read from his sentence and
        //  none of them proven — that number is the one that tells him what
        //  actually happened, and it only appears on the fallback path.
        expect(REACT).toMatch(/const missed = !fromHisWords && namedByHim\.length/);
        expect(REACT).toContain('I proved none of');
    });

    it('a complete catalogue subset declares its boundary instead of claiming the whole request', () => {
        const prompt03 = 'اصنع صفحة فيها قائمة بأسماء ثلاث مدن، وعنوان في أعلاها.';
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-partial-ar-'));
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'src', 'App.jsx'), '<h1>صفحة المدن</h1>');
        const block = acceptanceBlock(
            judgeAcceptance(acceptanceFor(prompt03), { dir, built: true }, true),
            true,
        );
        expect(block).toContain('حكم القبول:');
        expect(block).toContain('جميع المعايير المطلوبة');
        expect(block).not.toContain('ولم أفحص بقية نص طلبك');
        expect(block).not.toContain('كل ما طلبتَه');
        expect(block).not.toContain('كل ما طلبته');
        expect(block).not.toContain('مُثبَت بدليل.');
    });

    it('the English catalogue subset also declares its boundary', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-partial-en-'));
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'src', 'App.jsx'), '<h1>City list</h1>');
        const block = acceptanceBlock(
            judgeAcceptance(acceptanceFor('Create a page with a title and a list of three cities.'), { dir }, false),
            false,
        );
        expect(block).toContain('Acceptance accepted');
        expect(block).toContain('requested criteria were proven');
        expect(block).not.toContain('I did not inspect the rest of your request');
        expect(block).not.toContain('every one of the');
    });

    it('a complete run says so plainly without restoring the old whole-request claim', () => {
        const only = acceptanceFor('ابنِ الموقع ثم ابنِ نسخة إنتاج');
        const block = acceptanceBlock(judgeAcceptance(only, { dir: '/x', built: true }, true), true);
        expect(block).toContain('✅');
        expect(block).not.toContain('❌');
        expect(block).not.toContain('كل ما طلبتَه');
    });

    it('nothing asked for announces that no acceptance judgment was issued', () => {
        const ar = acceptanceBlock(judgeAcceptance([], {}, true), true);
        const en = acceptanceBlock(judgeAcceptance([], {}, false), false);
        expect(ar).toContain('لم أستخرج معياراً قابلاً للفحص');
        expect(ar).toContain('لم أصدر حكم قبول');
        expect(en).toContain('could not derive a checkable criterion');
        expect(en).toContain('did not issue an acceptance judgment');
    });
});

describe('THE WIRING: the build is judged before it is delivered', () => {
    it('the judge runs on the real evidence of THIS build', () => {
        /**
         *  ⛔ THIS ASSERTION USED TO PIN THE SPELLING, AND THE SPELLING WAS THE BUG.
         *
         *  It read `judgeAcceptance(acceptanceCriteriaFor(request), {` and went
         *  green on exactly the line that made the denominator one: a single
         *  catalogue reader serving as BOTH the extraction and the judgement.
         *  A guard cannot protect a claim it has confused with a string, and
         *  putting that text back somewhere useless to restore the green is the
         *  trap this repository has already been caught in once.
         *
         *  So it is relational now. Whatever the argument is called, it must be
         *  assembled from the reading of HIS request — and the check follows the
         *  identifier rather than requiring a name.
         */
        const arg = (/const acceptance = judgeAcceptance\((\w+), \{/.exec(REACT) || [])[1];
        expect({ theJudgeTakesANamedList: !!arg }).toEqual({ theJudgeTakesANamedList: true });
        const assembled = new RegExp('const ' + arg + ' = [\\s\\S]{0,900}?namedJudged').test(REACT);
        expect({ arg, builtFromTheReadingOfHisRequest: assembled })
            .toEqual({ arg, builtFromTheReadingOfHisRequest: true });
        //  ...and the reading is proven against the source that was really
        //  built, not against the request a second time.
        expect(REACT).toMatch(/verifyNamed\(namedByHim, projectEvidence,/);
        //  ...and the catalogue survives as the floor for when the reading
        //  could not happen. Deleting it would trade one silent failure for
        //  another the first time a provider is down.
        expect(REACT).toMatch(/: catalogueCriteria;/);
        expect(REACT).toMatch(/liveUrl: previewUrl,/);
        expect(REACT).toMatch(/audit: audit \|\| null,/);
        expect(REACT).toMatch(/const reconciledVoices = reconcileDeliveryVoices\(/);
        expect(REACT).toContain("throw new Error('delivery_message_voice_overlap')");
        expect(REACT).toMatch(/deliveryVoiceOverlap\(reconciledAppAbilities, \[\.\.\.unmet, \.\.\.unjudged\]\)/);
        expect(REACT).toMatch(/const abilityBlock = reconciledAppAbilities\.length \|\| unmeasuredAbilitiesNotice/);
        // This file-level lock checks the delivery ledger's semantic parts; the
        // live linked-handoff test proves the resulting message/acceptance.
        expect(REACT).toContain('const appBlock = appBp ?');
        expect(REACT).toContain('${unbuiltBlock}');
        expect(REACT).toContain('${unjudgedBlock}');
        expect(REACT).toContain('${unmetBlock}');
    });

    it('the ledger reaches the message in both languages, and the caller', () => {
        expect((REACT.match(/\$\{qaBlock\}\$\{shellBlock\}\$\{acceptBlock\}/g) || []).length).toBe(2);
        expect(REACT).toMatch(/const acceptBlock = `\$\{acceptanceBlock\(acceptance, isAr\)\}\\n`;/);
        expect(REACT).toMatch(/const acceptanceBlocked = acceptance\.criteria\.length > 0 && !acceptance\.accepted;/);
        expect(REACT).toMatch(/output: \{ message, acceptance,/);
    });

    /**
     * An application build replaces the whole file set with its own, so a
     * README added to the section-path map is silently dropped for exactly the
     * requests most likely to ask for one. Measured: the first attempt went in
     * above and the ledger still said «لم أكتب README» on a booking board.
     */
    it('the README is written where BOTH build paths can reach it', () => {
        const at = REACT.indexOf("if (asksFor(request).readme) {");
        expect(at).toBeGreaterThan(-1);
        expect(at).toBeGreaterThan(REACT.indexOf('if (appBp) {'));
        expect(at).toBeLessThan(REACT.indexOf('for (const [rel, body] of Object.entries(files))'));
    });
});
