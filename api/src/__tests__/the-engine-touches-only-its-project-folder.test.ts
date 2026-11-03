/**
 * THE ENGINE TOUCHES ONLY ITS PROJECT FOLDER, FOR WHAT A PATH MEANS.
 *
 * The model names paths, never the root. A path that is spelled inside but
 * points outside (`..`, an absolute path, a junction) is refused, and so are
 * files that hold secrets. Measured against a real folder on disk.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { resolveInProject, projectRootProblem, isSecretName } from '../core/engine/workspace';

let base: string;
let root: string;
let outside: string;

beforeAll(() => {
    base = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-eng-workspace-'));
    root = path.join(base, 'project');
    outside = path.join(base, 'elsewhere');
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'app.js'), 'console.log(1)');
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'not yours');
    // A junction inside the project that points outside it.
    fs.symlinkSync(outside, path.join(root, 'linked'), 'junction');
});
afterAll(() => {
    try { fs.unlinkSync(path.join(root, 'linked')); } catch { /* removed already */ }
    fs.rmSync(base, { recursive: true, force: true });
});

describe('a path is judged by where it leads', () => {
    it('a path inside resolves, and may wander inside', async () => {
        const r = await resolveInProject(root, 'src/../src/app.js', 'read');
        expect(r).toMatchObject({ ok: true, rel: 'src/app.js', exists: true, isDir: false });
    });

    it('the folder itself is "."', async () => {
        expect(await resolveInProject(root, '', 'list')).toMatchObject({ ok: true, rel: '.', isDir: true });
    });

    it('a new file in a new folder is allowed for writing', async () => {
        expect(await resolveInProject(root, 'src/components/Hero.jsx', 'write')).toMatchObject({ ok: true, exists: false });
    });

    it('.. that climbs out is refused', async () => {
        const r = await resolveInProject(root, '../elsewhere/secret.txt', 'read');
        expect(r.ok).toBe(false);
        expect((r as any).error).toMatch(/outside the project folder/);
    });

    it('an absolute path outside is refused; an absolute path inside is accepted', async () => {
        expect((await resolveInProject(root, path.join(outside, 'secret.txt'), 'read')).ok).toBe(false);
        expect(await resolveInProject(root, path.join(root, 'src', 'app.js'), 'read')).toMatchObject({ ok: true, rel: 'src/app.js' });
    });

    it('a junction is refused even though it is spelled inside', async () => {
        const r = await resolveInProject(root, 'linked/secret.txt', 'read');
        expect(r.ok).toBe(false);
        expect((r as any).error).toMatch(/is a link/);
    });
});

describe('secrets and owned folders', () => {
    it('.env files are never read or written; .env.example is fine', async () => {
        expect((await resolveInProject(root, '.env', 'read')).ok).toBe(false);
        expect((await resolveInProject(root, 'config/.env.production', 'write')).ok).toBe(false);
        expect((await resolveInProject(root, '.env.example', 'write')).ok).toBe(true);
        expect(isSecretName('server.pem')).toBe(true);
        expect(isSecretName('id_rsa')).toBe(true);
        expect(isSecretName('README.md')).toBe(false);
    });

    it('writes never enter node_modules, .git or .joe, but reading .joe is allowed', async () => {
        for (const p of ['node_modules/react/index.js', '.git/config', '.joe/result.json']) {
            const r = await resolveInProject(root, p, 'write');
            expect(`${p}:${r.ok}`).toBe(`${p}:false`);
        }
        expect((await resolveInProject(root, '.joe/out/0001-1-shell_run.txt', 'read')).ok).toBe(true);
    });

    it('control characters and network paths are refused', async () => {
        expect((await resolveInProject(root, 'a\u0000b', 'read')).ok).toBe(false);
        expect((await resolveInProject(root, '\\\\server\\share\\x', 'read')).ok).toBe(false);
    });

    (process.platform === 'win32' ? it : it.skip)('Windows device names and stream names are refused', async () => {
        expect((await resolveInProject(root, 'src/con.js', 'write')).ok).toBe(false);
        expect((await resolveInProject(root, 'src/app.js:hidden', 'write')).ok).toBe(false);
    });
});

describe('the project folder must sit inside the workspace', () => {
    it('inside is fine; the workspace root itself and anything outside are not', () => {
        expect(projectRootProblem(root, base)).toBeNull();
        expect(projectRootProblem(base, base)).toMatch(/not inside this workspace/);
        expect(projectRootProblem(outside, root)).toMatch(/not inside this workspace/);
        expect(projectRootProblem(undefined, base)).toMatch(/No project folder/);
    });
});
