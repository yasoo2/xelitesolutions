/**
 * ⛔ A DELIVERED PROJECT DOWNLOADS ON ITS OWN — AND NOTHING OUTSIDE ITS WORKSPACE.
 *
 * Read on 2026-11-05: the only download was the whole workspace root, every
 * project in it together, and the run's card offered none. The card now offers
 * the run's own folder, by its name: `/project/export?project=joe-app-…`
 * resolves a bare folder name directly inside the caller's workspace, and
 * refuses a path, a parent, a sibling's way out, or a folder that is not there.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { workspaceProjectDir } from '../api/routes/project';

const root = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-export-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));
fs.mkdirSync(path.join(root, 'joe-app-abc123'), { recursive: true });
fs.writeFileSync(path.join(root, 'notes.txt'), 'x');

describe('the project a download may name', () => {
    it('is the whole workspace when none is named, as before', () => {
        expect(workspaceProjectDir(root, undefined)).toBe(path.resolve(root));
        expect(workspaceProjectDir(root, '')).toBe(path.resolve(root));
    });

    it('is a folder directly inside the workspace, by its bare name', () => {
        expect(workspaceProjectDir(root, 'joe-app-abc123')).toBe(path.join(path.resolve(root), 'joe-app-abc123'));
    });

    it('is never a path, a parent, an absolute address or a file', () => {
        for (const name of ['../', '..', '../etc', 'joe-app-abc123/../..', 'a/b', 'a\\b', path.resolve(root), 'C:\\Windows', '.hidden', '-x']) {
            expect([name, typeof workspaceProjectDir(root, name)]).toEqual([name, 'object']);
        }
        expect(workspaceProjectDir(root, 'notes.txt')).toEqual({ error: 'no such project in this workspace', status: 404 });
        expect(workspaceProjectDir(root, 'joe-app-missing')).toEqual({ error: 'no such project in this workspace', status: 404 });
    });
});
