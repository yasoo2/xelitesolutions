/**
 * WHAT JOE CAN MEND HIMSELF, HE MENDS BEFORE HE REFUSES (core/engine/browser-mend.ts).
 *
 * The ladder exam, 2026-11-09: 69 of 150 prompts had their delivery refused by
 * the browser check, most for what Joe's own repairer answers (buttons under
 * 40 px: 38 prompts) or what the auditors call minor taste (a flat heading
 * scale: 17). Pinned here, on real files:
 *   - a minor finding of taste does not refuse; what is about proof, and an
 *     Arabic field typing from the left, still does;
 *   - the repairer is asked only for what it answers;
 *   - a button the browser measured too small is widened in the SOURCE, by
 *     name, and «undo» puts every file back byte for byte.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { mendable, mendPage, refuses, TOLD_NOT_REFUSED } from '../core/engine/browser-mend';

jest.setTimeout(120_000);

describe('which findings refuse a delivery', () => {
    test.each([
        [{ id: 'flat_hierarchy', severity: 'low' }, false],
        [{ id: 'type_scale_drift', severity: 'low' }, false],
        [{ id: 'form_no_validation', severity: 'low' }, false],
        [{ id: 'h1_count', severity: 'low' }, false],
        //  About proof: the walk did not reach them, the data was not checked live.
        //  A few the walk could not press are told — the builder cannot make the walk press what its own
        //  presses took away (L162, 2026-11-10: three refusals for 1 of 22); a fifth of the page or more refuses.
        [{ id: 'controls_not_reached', severity: 'low' }, false],
        [{ id: 'controls_not_reached', severity: 'major' }, true],
        [{ id: 'live_data_not_verified', severity: 'low' }, true],
        //  Arabic is his: a field that types it from the left is fixed before delivery.
        [{ id: 'arabic_field_ltr', severity: 'low' }, true],
        [{ id: 'small_targets', severity: 'medium' }, true],
        [{ id: 'dead_controls', severity: 'high' }, true],
        //  A finding of taste the auditor did not call minor still refuses.
        [{ id: 'flat_hierarchy', severity: 'medium' }, true],
    ])('%j → refuses: %s', (f, r) => {
        expect(refuses(f)).toBe(r);
    });

    test('the repairer is asked only for what it answers', () => {
        expect(mendable([{ id: 'small_targets' }])).toBe(true);
        expect(mendable([{ id: 'flat_hierarchy' }])).toBe(true);
        expect(mendable([{ id: 'dead_controls' }, { id: 'console_errors' }])).toBe(false);
        expect([...TOLD_NOT_REFUSED].every(id => typeof id === 'string')).toBe(true);
    });
});

describe('a real repair, and its undo', () => {
    let dir = '';
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-mend-'));
        fs.writeFileSync(path.join(dir, 'index.html'), [
            '<!doctype html>', '<html lang="en">', '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
            '<title>Mend</title><link rel="stylesheet" href="styles.css"></head>',
            '<body><main><h1>Mend</h1><button class="go" type="button">Go</button></main></body>', '</html>', '',
        ].join('\n'));
        fs.writeFileSync(path.join(dir, 'styles.css'), '.go { height: 30px; width: 30px; padding: 0; }\n');
    });
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    test('the button the browser measured is widened in the source, and undo puts every file back', async () => {
        const before = { html: fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), css: fs.readFileSync(path.join(dir, 'styles.css'), 'utf8') };
        const lines: string[] = [];
        const m = await mendPage(dir, [{ id: 'small_targets', severity: 'medium', evidence: [{ sel: 'button.go', label: 'Go', w: 30, h: 30 }] }], false, l => lines.push(l));
        expect(m).not.toBeNull();
        expect(m!.changed.length).toBeGreaterThan(0);
        const after = m!.changed.map(rel => fs.readFileSync(path.join(dir, rel), 'utf8')).join('\n');
        expect(after).toMatch(/button\.go[\s\S]*min-height:\s*4\d+px/);
        expect(m!.repairs.join(' ')).toMatch(/target/i);
        await m!.undo();
        expect(fs.readFileSync(path.join(dir, 'index.html'), 'utf8')).toBe(before.html);
        expect(fs.readFileSync(path.join(dir, 'styles.css'), 'utf8')).toBe(before.css);
    });

    test('nothing it answers: nothing is touched', async () => {
        expect(await mendPage(dir, [{ id: 'dead_controls', severity: 'high' }], false, () => undefined)).toBeNull();
    });
});

describe('the page the browser opened is mended where it lives', () => {
    //  The ladder, 2026-11-09 (L155): a Node server's page in public/ — the source
    //  walk leaves public/ out, so «buttons under 40px» was never repaired by Joe.
    const tmp = () => fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-mend-public-'));
    const finding = [{ id: 'small_targets', severity: 'medium', evidence: [{ sel: 'button.small', label: 'تعديل', w: 51, h: 25 }] }];

    test('a Node server\'s public/ page is repaired, and undo puts it back', async () => {
        const root = tmp();
        try {
            fs.mkdirSync(path.join(root, 'public'));
            fs.writeFileSync(path.join(root, 'server.js'), 'require("http").createServer().listen(3000);\n');
            fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { start: 'node server.js' } }));
            fs.writeFileSync(path.join(root, 'public', 'index.html'), '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>t</title><link rel="stylesheet" href="style.css"></head><body><h1>ع</h1><button class="small">تعديل</button></body></html>');
            const css = 'button.small { padding: 4px 10px; font-size: 13px; }\n';
            fs.writeFileSync(path.join(root, 'public', 'style.css'), css);
            const said: string[] = [];
            expect(await mendPage(root, finding, true, l => said.push(l))).toBeNull();          // without the page's folder: nothing it sees
            const m = await mendPage(root, finding, true, l => said.push(l), path.join(root, 'public'));
            expect(m?.changed).toContain('public/style.css');
            expect(fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8')).toMatch(/min-height:\s*4\dpx/);
            await m!.undo();
            expect(fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8')).toBe(css);
        } finally { fs.rmSync(root, { recursive: true, force: true }); }
    });

    test('a file put back is the same file to the browser walk\'s own record: its time is put back too', async () => {
        //  app-audit.ts codeFingerprint: a walk that ran out of time is carried
        //  only over the same code, and Joe's own repair must not make the code
        //  he put back look new.
        const { codeFingerprint } = require('../core/quality/app-audit');
        const root = tmp();
        try {
            fs.mkdirSync(path.join(root, 'public'));
            fs.writeFileSync(path.join(root, 'server.js'), 'require("http").createServer().listen(3000);\n');
            fs.writeFileSync(path.join(root, 'public', 'index.html'), '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>t</title><link rel="stylesheet" href="style.css"></head><body><h1>ع</h1><button class="small">تعديل</button></body></html>');
            fs.writeFileSync(path.join(root, 'public', 'style.css'), 'button.small { padding: 4px 10px; font-size: 13px; }\n');
            const old = new Date(Date.now() - 3_600_000);
            fs.utimesSync(path.join(root, 'public', 'style.css'), old, old);
            const code = codeFingerprint(root);
            const m = await mendPage(root, finding, true, () => undefined, path.join(root, 'public'));
            expect(m?.changed).toContain('public/style.css');
            expect(codeFingerprint(root)).not.toBe(code);
            await m!.undo();
            expect(codeFingerprint(root)).toBe(code);
        } finally { fs.rmSync(root, { recursive: true, force: true }); }
    });

    test('a build\'s output and node_modules are never mended: the sources are', () => {
        const { mendSources } = require('../core/engine/browser-mend');
        const root = tmp();
        try {
            fs.mkdirSync(path.join(root, 'src'));
            fs.mkdirSync(path.join(root, 'dist'));
            fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts: { build: 'vite build' } }));
            fs.writeFileSync(path.join(root, 'src', 'app.css'), 'button{}');
            fs.writeFileSync(path.join(root, 'dist', 'index.html'), '<html></html>');
            expect(Object.keys(mendSources(root, path.join(root, 'dist')))).toEqual(['src/app.css']);
            expect(Object.keys(mendSources(root, path.join(root, 'node_modules', 'x')))).toEqual(['src/app.css']);
            expect(Object.keys(mendSources(root, path.join(os.tmpdir(), 'elsewhere')))).toEqual(['src/app.css']);
        } finally { fs.rmSync(root, { recursive: true, force: true }); }
    });
});

describe('a repair that leaves fewer of the same is kept', () => {
    //  The hard sample, 2026-11-09 (L272): «21 tap targets» and «unresponsive controls»;
    //  the repair answered the first, and was put back because two kinds stayed two.
    const { mendIsBetter, findingWeight } = require('../core/engine/browser-mend');
    const small = (n: number) => ({ id: 'small_targets', severity: 'medium', detailEn: `${n} tap target(s) under 40px: Sign out` });
    const dead = { id: 'some_dead_controls', severity: 'major', detailEn: 'Unresponsive controls: "Save"', evidence: [{ label: 'Save' }, { label: 'Apply' }] };

    test('instances are read from the finding: its count, else its evidence, else one', () => {
        expect(findingWeight(small(21))).toBe(21);
        expect(findingWeight(dead)).toBe(2);
        expect(findingWeight({ id: 'x' })).toBe(1);
    });

    test.each([
        ['fewer kinds', [small(21), dead], [dead], true],
        ['the same kinds, fewer instances', [small(21), dead], [small(3), dead], true],
        ['the same kinds, as many', [small(21), dead], [small(21), dead], false],
        ['a kind the repair brought', [small(21), dead], [{ id: 'mobile_overflow', severity: 'high', detailEn: '2 element(s) spill' }], false],
        ['more instances', [small(3)], [small(9)], false],
        ['only a minor note gone', [small(3), { id: 'flat_hierarchy', severity: 'low' }], [small(3)], true],
    ])('%s: kept %s', (_name, before, after, kept) => {
        expect(mendIsBetter(before, after)).toBe(kept);
    });
});
