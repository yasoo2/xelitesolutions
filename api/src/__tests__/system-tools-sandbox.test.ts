/**
 * `write_file`, `file_edit` and `ls` — the file tools the agent reaches for most.
 *
 * The sandbox test next door covers `modules/tools/utils.resolveToolPath`, and
 * its header claims "seven tool files depend on this function". SystemTools.ts
 * was not one of them: it carried a PRIVATE resolver of the same name whose
 * first line was
 *
 *     if (path.isAbsolute(val)) return val;
 *
 * — the exact hole that was fixed in the shared copy, still open in the tools
 * that write, edit and list files. Fixing one resolver while three others exist
 * is how the ai_write_file mistake happened twice.
 *
 * These drive the real tool classes against real paths on the real filesystem.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import { WriteFileTool, FileEditTool, LsTool, ScaffoldProjectTool, normalizeReactScaffoldStructure } from '../modules/tools/definitions/SystemTools';
import { workspaceService } from '../modules/services/WorkspaceService';

const OUT = path.join(os.tmpdir(), 'joe-systemtools-escape-' + process.pid);
const DIR = '__system_tools_test__';
const landsAt = (rel: string) => path.resolve(workspaceService.getActiveRoot(), rel);

afterEach(() => { try { fs.rmSync(OUT, { recursive: true, force: true }); } catch { } });
afterAll(() => { try { fs.rmSync(landsAt(DIR), { recursive: true, force: true }); } catch { } });

describe('write_file cannot write outside the workspace', () => {
    it.each([
        ['an absolute path in the system temp directory', OUT],
        ['an absolute path under /etc', '/etc/joe-owned-write-file.txt'],
        ['a traversal that climbs out', '../../../../../../tmp/joe-owned-rel-' + process.pid + '.txt'],
    ])('refuses %s', async (_label, target) => {
        const res: any = await new WriteFileTool().execute({ filename: target, content: 'owned' });

        expect(res.ok).toBe(false);
        expect(String(res.error)).toMatch(/path_outside_workspace/);
        const abs = path.isAbsolute(target) ? target : landsAt(target);
        expect(fs.existsSync(abs)).toBe(false);
    });

    it('still writes normally inside the workspace', async () => {
        const rel = path.join(DIR, 'ok.txt');
        const res: any = await new WriteFileTool().execute({ filename: rel, content: 'hello' });

        expect(res.ok).toBe(true);
        expect(fs.readFileSync(landsAt(rel), 'utf-8')).toBe('hello');
    });

    it('does not create the parent directory of a path it is about to refuse', async () => {
        // Creating the directory before the security gate leaves a trail of
        // attacker-chosen directories across the filesystem even when every
        // write is correctly refused.
        const nested = path.join(OUT, 'deep', 'deeper', 'file.txt');
        await new WriteFileTool().execute({ filename: nested, content: 'x' });

        expect(fs.existsSync(OUT)).toBe(false);
    });
});

describe('file_edit cannot reach a file outside the workspace', () => {
    it('refuses an absolute path and leaves the file untouched', async () => {
        fs.mkdirSync(OUT, { recursive: true });
        const victim = path.join(OUT, 'victim.txt');
        fs.writeFileSync(victim, 'original contents', 'utf-8');

        const res: any = await new FileEditTool().execute({
            filename: victim, find: 'original', replace: 'replaced',
        });

        expect(res.ok).toBe(false);
        expect(String(res.error)).toMatch(/path_outside_workspace/);
        expect(fs.readFileSync(victim, 'utf-8')).toBe('original contents');
    });
});

describe('scaffold_project contains every key, not just the base directory', () => {
    it('registers a named project and strips a repeated baseDir prefix', async () => {
        const sessionId = `scaffold-session-${process.pid}`;
        const baseDir = path.join(DIR, 'registered-project');
        const keyPrefix = baseDir.replace(/\\/g, '/');
        const before = { ...(((global as any).joeProjects || {}) as Record<string, any>) };
        const res: any = await new ScaffoldProjectTool().execute({
            baseDir,
            structure: {
                [`${keyPrefix}/package.json`]: '{"name":"registered-project"}',
                [`${keyPrefix}/src/index.ts`]: 'export default 1;',
            },
        }, { sessionId });

        expect(res.ok).toBe(true);
        expect(res.output.created).toEqual(expect.arrayContaining(['package.json', 'src/index.ts']));
        expect(fs.existsSync(landsAt(path.join(baseDir, 'src/index.ts')))).toBe(true);
        const sessionKey = sessionId.replace(/[^a-zA-Z0-9._-]/g, '_');
        expect((global as any).joeProjects?.[sessionKey]?.dir).toBe(landsAt(baseDir));
        (global as any).joeProjects = before;
    });

    it('new scaffolds replace stale API ownership for the same session', async () => {
        const sessionId = `stale-api-session-${process.pid}`;
        const sessionKey = sessionId.replace(/[^a-zA-Z0-9._-]/g, '_');
        const baseDir = path.join(DIR, 'fresh-project');
        const before = { ...(((global as any).joeProjects || {}) as Record<string, any>) };
        (global as any).joeProjects = {
            ...before,
            [sessionKey]: { dir: path.join(DIR, 'old-api'), type: 'api', resource: 'old', appKind: 'old' },
        };
        try {
            const res: any = await new ScaffoldProjectTool().execute({
                baseDir,
                structure: { 'package.json': '{"scripts":{"dev":"vite"}}' },
            }, { sessionId });
            expect(res.ok).toBe(true);
            expect((global as any).joeProjects?.[sessionKey]).toEqual(expect.objectContaining({
                dir: landsAt(baseDir), type: 'scaffold',
            }));
            expect((global as any).joeProjects?.[sessionKey]?.resource).toBeUndefined();
            expect((global as any).joeProjects?.[sessionKey]?.appKind).toBeUndefined();
        } finally {
            (global as any).joeProjects = before;
        }
    });

    it('refuses a structure key that climbs out, and still writes the ones that do not', async () => {
        // Containing the base is not enough: each key of `structure` is a path
        // fragment the model chose, and they are joined onto the base one by one.
        const base = path.join(DIR, 'scaffolded');
        const escapeTarget = path.join(os.tmpdir(), 'joe-scaffold-escape-' + process.pid + '.txt');
        const escapeKey = '../../../../../../../..' + escapeTarget;
        const res: any = await new ScaffoldProjectTool().execute({
            baseDir: base,
            structure: {
                'src/index.ts': 'export default 1;',
                [escapeKey]: 'owned',
            },
        });

        expect(res.ok).toBe(false);
        expect(res.output.errors.join(' ')).toMatch(/path_outside_workspace/);
        expect(fs.existsSync(escapeTarget)).toBe(false);
        // The legitimate entry is not collateral damage of the refusal.
        expect(res.output.created).toContain('src/index.ts');
        expect(fs.readFileSync(landsAt(path.join(base, 'src/index.ts')), 'utf-8')).toBe('export default 1;');
    });
});

describe('React scaffold manifests are runnable when the evidence is explicit', () => {
    it('adds React and Vite dependencies to a Vite + JSX scaffold', () => {
        const result = normalizeReactScaffoldStructure({
            'package.json': JSON.stringify({ name: 'quick-notes', scripts: { dev: 'vite', build: 'vite build' } }),
            'src/App.jsx': "import React from 'react'; export default function App(){ return <div />; }",
        });

        expect(result.changed).toBe(true);
        const manifest = JSON.parse(result.structure['package.json']);
        expect(manifest.dependencies.react).toBe('^18.2.0');
        expect(manifest.dependencies['react-dom']).toBe('^18.2.0');
        expect(manifest.devDependencies.vite).toBe('^5.0.0');
        expect(manifest.devDependencies['@vitejs/plugin-react']).toBe('^4.0.0');
        expect(manifest.scripts.preview).toBe('vite preview');
    });

    it('does not add React dependencies to a non-React Vite scaffold', () => {
        const structure = {
            'package.json': JSON.stringify({ name: 'plain-vite', scripts: { dev: 'vite' } }),
            'src/main.js': 'document.body.textContent = "ok";',
        };
        const result = normalizeReactScaffoldStructure(structure);
        expect(result.changed).toBe(false);
        expect(result.structure).toBe(structure);
    });
});

describe('ls cannot enumerate outside the workspace', () => {
    it('refuses to list an absolute directory outside it', async () => {
        // Directory listing is not a harmless read: it is how a path to
        // something worth stealing gets found.
        const res: any = await new LsTool().execute({ path: '/etc' });

        expect(res.ok).toBe(false);
        expect(String(res.error)).toMatch(/path_outside_workspace/);
        expect(res.output?.entries).toBeUndefined();
    });

    it('still lists a directory inside the workspace', async () => {
        const rel = path.join(DIR, 'listed');
        fs.mkdirSync(landsAt(rel), { recursive: true });
        fs.writeFileSync(path.join(landsAt(rel), 'a.txt'), '', 'utf-8');

        const res: any = await new LsTool().execute({ path: rel });

        expect(res.ok).toBe(true);
        expect(res.output.entries).toContain('a.txt');
    });
});
