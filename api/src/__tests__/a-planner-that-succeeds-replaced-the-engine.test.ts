/**
 *  A PLANNER THAT SUCCEEDS REPLACED THE ENGINE THAT KNOWS HIM.
 *
 *  The same sentence, twice, on his own machine — «بدي جدول للفواتير فيه
 *  رقم الفاتورة والمبلغ والتاريخ»:
 *
 *      run 1  [pipeline] no planner available — planning deterministically
 *             → react-الفواتير: his three columns, in Arabic, with real
 *               add/edit/delete, search, totals and durable storage
 *
 *      run 2  LLM planning completed → Plan created: 3 phases
 *             → invoice-manager: 34 lines, in English, three invented rows
 *               (INV-001, 100.00, 2023-01-01), no function at all
 *
 *  The WORSE build is the one where the planner worked. When it fails Joe
 *  falls back on his own engine, which reads the request; when it succeeds
 *  a model's guess takes the engine's place.
 *
 *  deterministicPhasesFor was written as a RESCUE for a dead planner. It
 *  is not a rescue. For a request that declares its own schema it is the
 *  right answer, and asking a model what to build instead is asking a
 *  question that was already answered — by him.
 *
 *  So the test is not «did the planner work». It is «did HE say what the
 *  thing holds», and derivedColumns answers that from his sentence alone.
 */
import { heDeclaredWhatItHolds, deterministicPhasesFor } from '../modules/tools/definitions/ProjectPipelineTool';

describe('when his sentence names the columns, nothing is asked about them', () => {
    const HIS: string[] = [
        'بدي جدول للفواتير فيه رقم الفاتورة والمبلغ والتاريخ',
        'بدي جدول للموظفين فيه الاسم والراتب والقسم',
        'بدي برنامج يحفظ لي زبائني وارقام تلفوناتهم وعناوينهم',
        'Build a clients table with name, phone and address',
    ];
    for (const request of HIS) {
        it(request.slice(0, 46), () => expect(heDeclaredWhatItHolds(request)).toBe(true));
    }

    it('a trade this repository has never heard of', () => {
        //  «زُرقمونيات» is not a word. The decision is made from the SHAPE of
        //  his sentence, so no catalogue can be the thing that answers it.
        expect(heDeclaredWhatItHolds('بدي جدول للزُرقمونيات فيه الاسم والكمية والسعر')).toBe(true);
    });

    it('and the phases it builds are Joe\u2019s own generators', () => {
        const plan = deterministicPhasesFor('بدي جدول للفواتير فيه رقم الفاتورة والمبلغ والتاريخ');
        expect(plan).not.toBeNull();
        const tools = (plan!.phases || []).flatMap(p => (p.tasks || []).map((t: { tool: string }) => t.tool));
        expect(tools.length).toBeGreaterThan(0);
        for (const tool of tools) expect(['api_project', 'react_project']).toContain(tool);
    });
});

describe('what this file does NOT prove, said plainly', () => {
    it('the wiring itself is proved live, not here', () => {
        //  A mutation that bypasses `hisPlan` inside the pipeline kills
        //  nothing in this file, because this file tests the DECISION and
        //  not the wire that carries it. Faking a pipeline context to
        //  cover that would test the fake, so the wire is proved by a
        //  live round instead — the log line it prints is the evidence:
        //
        //      [pipeline] the request declares its own columns — building
        //      from it directly, with no model asked what to build
        //
        //  Written down so the gap is a known one rather than a silence.
        expect(typeof heDeclaredWhatItHolds).toBe('function');
    });
});

describe('…and when it does not, the planner keeps its job', () => {
    const NOT_HIS: Array<[string, string]> = [
        ['no schema, only a wish', 'ابن لي موقعاً لمطعمي'],
        ['a shop with no columns named', 'بدي متجر صغير'],
        ['a question', 'ما الفرق بين قاعدة البيانات والجدول؟'],
        ['a greeting', 'مرحبا'],
        ['English prose with no list', 'Build me something nice for my restaurant'],
        ['a page, not a record store', 'Build a small portfolio site with a home page and a contact form.'],
    ];
    for (const [name, request] of NOT_HIS) {
        it(name, () => expect(heDeclaredWhatItHolds(request)).toBe(false));
    }

    it('a noun phrase is a specification, not a request — measured, not assumed', () => {
        //  «A clients table with name, phone and address» yields three
        //  columns and is still not a build: he named no ask. Put a verb
        //  in front of the same words and it is one. The columns were
        //  never the question here — whether he asked for anything was.
        expect(heDeclaredWhatItHolds('A clients table with name, phone and address')).toBe(false);
        expect(heDeclaredWhatItHolds('Create an invoices table with number, amount and date')).toBe(true);
        expect(heDeclaredWhatItHolds('Make an orders tracker with customer, quantity and total')).toBe(true);
    });

    it('one named column is not a declaration', () => {
        //  The floor is his, not mine: one noun after «جدول» is its subject.
        expect(heDeclaredWhatItHolds('بدي جدول للمبيعات')).toBe(false);
    });

    it('a column list without a request to build anything is not a build', () => {
        expect(heDeclaredWhatItHolds('الكتاب فيه الورق والحبر')).toBe(false);
    });
});
