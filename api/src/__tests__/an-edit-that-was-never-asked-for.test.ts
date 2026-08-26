/**
 * A REQUEST THAT NAMED NOTHING SURGICALLY EDITED THE OWNER'S PROJECT.
 *
 * Measured on his machine, in front of him. A sales project was open. I typed
 * a sentence that names no subject, no file, no element, in dialect:
 *
 *     «سوّي لي شي حلو»
 *
 *     00:06:58   data/projects/my-workspace/react-مشروعي-5523e76d/src/content.js
 *     reply      «عُدّل المشروع جراحياً — 1 ملف: src/content.js (+1 −1)»
 *
 * He never named that project in that sentence. Joe changed it anyway, then
 * scored the result 97/100 and reported success.
 *
 * The path: the intent classifier answered `edit_page` (an edit verb and an
 * open project are enough for it), the file ranker put `content.js` first, and
 * the model was handed the file with instructions ending «nothing else» — a
 * format with no way to say the request does not tell it what to change. Every
 * layer gave a confident verdict; none of them could say «I cannot tell».
 *
 * There is a guard already written for this, four lines below the ranker:
 *
 *     if (!scored.length) return 'لم أستطع تحديد الملف المقصود — سمِّ الملف…'
 *
 * It cannot fire. `content.js` is given 4 points as a TIE-BREAKER before any
 * word of the request is looked for, so the ranked list is never empty while
 * that file exists. A prior was being read as evidence — the list is never
 * empty, so «no evidence at all» and «weak evidence» look identical from here.
 *
 * The class is this session's recurring one, now with a MUTATING consequence:
 * a reader that must return a verdict, with no vocabulary for «I cannot tell».
 * The cure is to give it that word and to honour it — the model reads both the
 * request and the file, so it is the layer that can actually tell.
 */

import { modelCannotTell } from '../modules/tools/definitions/ProjectEditTool';

describe('the model can say it does not know what to change', () => {
    it('reads the refusal and carries what it would need to know', () => {
        const said = modelCannotTell('CANNOT TELL: the request does not name an element, a colour or a file');
        expect(said).toBe('the request does not name an element, a colour or a file');
    });

    it('accepts it with the surrounding noise a model actually emits', () => {
        //  Fixed inputs, because this is the judging step. Each is a shape
        //  seen from a real model: a leading newline, a code fence, bold.
        for (const raw of [
            '\nCANNOT TELL: nothing to go on',
            '```\nCANNOT TELL: nothing to go on\n```',
            '**CANNOT TELL:** nothing to go on',
            'cannot tell: nothing to go on',
        ]) {
            expect(modelCannotTell(raw)).toBeTruthy();
        }
    });

    it('and a real edit is never mistaken for a refusal', () => {
        //  The negative case that keeps the cure from becoming the disease.
        //  A guard that refuses everything is not honesty, it is a dead tool.
        const realEdit = [
            'FILE: src/content.js',
            '<<<<<<< SEARCH',
            "  brand: 'مبيعات',",
            '=======',
            "  brand: 'سوق',",
            '>>>>>>> REPLACE',
        ].join('\n');
        expect(modelCannotTell(realEdit)).toBeNull();
        expect(modelCannotTell('')).toBeNull();
        //  And the words in prose, where they are discussion and not a verdict.
        expect(modelCannotTell('I cannot tell you the colour, but here is the edit:\nFILE: a.js')).toBeNull();
    });
});

describe('the ranker separates what it knows from what it prefers', () => {
    it('a request sharing no word with the project carries no evidence', () => {
        const { rankFilesForEdit } = require('../modules/tools/definitions/ProjectEditTool');
        const files = [
            { f: 'src/content.js', body: "export const content = { brand: 'مبيعات', title: 'سوق' };" },
            { f: 'src/App.jsx', body: 'export default function App() { return null; }' },
        ];
        const { scored, evidence } = rankFilesForEdit('سوّي لي شي حلو', files);
        //  The list is NOT empty — that is the whole point, and why the guard
        //  written against an empty list never fired.
        expect(scored.length).toBeGreaterThan(0);
        expect(evidence).toBe(0);
    });

    it('and a request naming something in the project carries it', () => {
        const { rankFilesForEdit } = require('../modules/tools/definitions/ProjectEditTool');
        const files = [
            { f: 'src/content.js', body: "export const content = { brand: 'مبيعات', title: 'سوق' };" },
            { f: 'src/App.jsx', body: 'export default function App() { return null; }' },
        ];
        const { scored, evidence } = rankFilesForEdit('غيّر اسم المشروع من مبيعات إلى سوق', files);
        expect(scored[0].f).toBe('src/content.js');
        expect(evidence).toBeGreaterThan(0);
    });
});
