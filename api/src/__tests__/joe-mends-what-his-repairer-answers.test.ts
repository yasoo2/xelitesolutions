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
        [{ id: 'controls_not_reached', severity: 'low' }, true],
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
