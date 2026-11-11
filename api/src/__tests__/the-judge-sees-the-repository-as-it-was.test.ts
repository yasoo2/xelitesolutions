/**
 * THE JUDGE SEES HIS REPOSITORY AS IT WAS BEFORE THE CHANGE (verify.ts beforeThisChange).
 *
 * The Codex exam in Arabic, 2026-11-08: C03 asked for `--json` «and the plain
 * output stays exactly as it is»; the acceptance judge saw only the files as
 * they are now, ruled it unprovable («no previous version»), and the delivery
 * was refused — though Joe had kept that version himself. Pinned: each file
 * the change modified or deleted is given as it was; an unchanged file is not;
 * an added one is named; the machine's own folders are never read.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { beforeThisChange } from '../core/engine/verify';
import { snapshotProject } from '../core/project/versions';

jest.setTimeout(120_000);

let dir = '';
beforeEach(() => {
    dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-before-'));
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'todo', version: '1.0.0', scripts: { test: 'node --test' } }));
    fs.mkdirSync(path.join(dir, 'src'));
    fs.writeFileSync(path.join(dir, 'src', 'list.js'), "exports.plain = tasks => tasks.map(t => `- ${t}`).join('\\n');\n");
    fs.writeFileSync(path.join(dir, 'src', 'old.js'), 'exports.old = 1;\n');
    fs.writeFileSync(path.join(dir, 'README.md'), '# todo\n');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

test('the files the change modified or deleted, as they were; the added ones by name; nothing else', async () => {
    const kept = snapshotProject(dir, 'before: --json');
    expect(kept?.id).toBeTruthy();
    fs.writeFileSync(path.join(dir, 'src', 'list.js'), "exports.plain = tasks => tasks.map(t => `- ${t}`).join('\\n');\nexports.json = tasks => JSON.stringify(tasks);\n");
    fs.rmSync(path.join(dir, 'src', 'old.js'));
    fs.writeFileSync(path.join(dir, 'src', 'json.js'), 'exports.x = 1;\n');
    fs.mkdirSync(path.join(dir, 'node_modules', 'dep'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'node_modules', 'dep', 'index.js'), 'module.exports = 1;\n');

    const text = await beforeThisChange(dir, kept!.id);
    expect(text).toMatch(/^THE SAME REPOSITORY BEFORE THIS CHANGE/);
    expect(text).toContain('(before this change) src/list.js');
    expect(text).not.toContain('exports.json');
    expect(text).toContain('(before this change) src/old.js — deleted by this change');
    expect(text).not.toContain('(before this change) README.md');
    expect(text).toMatch(/Files this change added: src\/json\.js$/m);
    expect(text).not.toMatch(/node_modules/);
});

test('no snapshot, or nothing changed: nothing is added to what the judge reads', async () => {
    expect(await beforeThisChange(dir, '')).toBe('');
    expect(await beforeThisChange(dir, 'no-such-version')).toBe('');
    const kept = snapshotProject(dir, 'before');
    expect(await beforeThisChange(dir, kept!.id)).toBe('');
});
