/**
 *  A GUARD MUST WATCH THE VALUE THE ACTION USES.
 *
 *  Measured on a generated app, twice from one page state: the first
 *  «Export CSV» produced a file with the header and the data row; the
 *  second produced a file with the header and nothing else. The page still
 *  showed the row, and the row was still in localStorage both times.
 *
 *  The button was guarded on `rows.length`. The export writes `visible`.
 *  Those two part company the moment a search or a status filter is set
 *  and matches nothing — rows exist, so the button is live; nothing is
 *  visible, so what lands in his Downloads folder is a header and no data,
 *  and nothing anywhere says so.
 *
 *  A file that looks like a successful export and contains nothing is the
 *  same lie as a green test that ran nothing.
 *
 *  HOW THESE CASES JUDGE. Two of them run the generated `toCsv` — the
 *  actual function text this generator emits, evaluated, not described —
 *  and read what it returns. The third is a source assertion, and it is
 *  one on purpose and with the caveat stated: the button's `disabled`
 *  expression lives inside a React component that this suite has no DOM to
 *  mount, so it is anchored on the SEMANTIC token `visible.length` rather
 *  than on any window of characters around it.
 */

import { blueprintFor } from '../core/design/app-blueprints';
import { buildAppFiles } from '../modules/tools/definitions/react-app-templates';

const files = buildAppFiles(
    blueprintFor('tasks', 'مهامي', true),
    { isArabic: true, brand: 'Joe', storeKey: 'k', api: 'http://localhost:4100/api/items' } as any,
    'app',
);

/** Lift the generated `toCsv` out of the generated store and make it callable. */
function generatedToCsv(): (fields: any[], rows: any[]) => string {
    const store = files['src/app/store.js'];
    expect(typeof store).toBe('string');
    const start = store.indexOf('export function toCsv');
    expect(start).toBeGreaterThan(-1);
    //  From the declaration to the blank line that follows its closing brace.
    const body = store.slice(start).replace(/^export /, '');
    const end = body.indexOf('\n}\n') + 3;
    // eslint-disable-next-line no-new-func
    return new Function(body.slice(0, end) + '; return toCsv;')();
}

describe('the generated export writes what it was given', () => {
    const FIELDS = [{ key: 'title', label: 'العنوان' }, { key: 'amount', label: 'المبلغ' }];

    //  POSITIVE — with rows, the file carries them.
    it('carries every row it is handed', () => {
        const csv = generatedToCsv()(FIELDS, [{ title: 'أ', amount: 3 }, { title: 'ب', amount: 5 }]);
        const lines = csv.split('\n');
        expect(lines).toHaveLength(3);
        expect(lines[1]).toContain('أ');
        expect(lines[2]).toContain('ب');
    });

    //  NEGATIVE — and with none, it produces a header and nothing else. This
    //  is not a bug in `toCsv`; it is exactly why the BUTTON must never be
    //  pressable in that state, which is what the next case is about.
    it('produces a header and no data when handed nothing — which is the whole danger', () => {
        const csv = generatedToCsv()(FIELDS, []);
        expect(csv.split('\n').filter(Boolean)).toHaveLength(1);
        expect(csv).toContain('العنوان');
    });
});

describe('the export button is guarded on what the export reads', () => {
    /**
     *  SOURCE ASSERTION, DECLARED. The behaviour is a `disabled` attribute on
     *  a React element, and this suite runs in node with no DOM to mount it
     *  in. The anchor is the semantic expression itself — it survives any
     *  reformatting of the JSX around it — and it is checked in both
     *  directions so a rename cannot leave the file passing by accident.
     */
    const records = () => {
        const src = files['src/components/RecordsApp.jsx'];
        expect(typeof src).toBe('string');
        return src;
    };

    it('reads visible.length, which is what leaves with him', () => {
        expect(records()).toContain('disabled={!visible.length}');
    });

    it('no longer reads rows.length, which is what let the empty file out', () => {
        expect(records()).not.toContain('disabled={!rows.length}');
    });

    //  POSITIVE — and `visible` really is the value handed to the export, so
    //  the guard and the action are reading one thing and not two.
    it('hands that same visible list to toCsv', () => {
        const src = records();
        const btn = src.slice(src.indexOf('disabled={!visible.length}'));
        expect(btn.slice(0, 400)).toContain('toCsv(');
        expect(btn.slice(0, 400)).toContain('visible');
    });
});
