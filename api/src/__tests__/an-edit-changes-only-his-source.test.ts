/**
 * A wording edit changes his source, and nothing that is not his.
 *
 * Round 21 second review (W2, W3 — regressions of that round, which made the
 * edit see the whole project): «Change the text "Save changes" to "Save"»
 * rewrote src/content.js and vendor/acme/…/form.js (Composer's),
 * env/lib/python3.11/site-packages/django/…/actions.js (a virtualenv named
 * env), client/package-lock.json and data.json (an api project's records) —
 * «Surgical edit — 5 file(s)». And a bare `coverage` at any depth hid
 * src/coverage/Plans.jsx from every edit and from the export, which also lost
 * .joe/external-api.json. His source is now decided by kind
 * (shared/utils/project-tree). Realistic projects; no model is called.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';

const callLLM = jest.fn();
jest.mock('../core/llm', () => ({ callLLM: (...a: any[]) => callLLM(...a) }));

import { ProjectEditTool } from '../modules/tools/definitions/ProjectEditTool';
import { archiveProject } from '../core/transfer/project-archive';
import { listProjectFiles, PROJECT_FS_CONCURRENCY } from '../shared/utils/project-tree';

jest.setTimeout(120_000);

const roots: string[] = [];
const project = (files: Record<string, string>) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-r22-writing-source-'));
    roots.push(root);
    for (const [rel, body] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        fs.writeFileSync(path.join(root, rel), body);
    }
    return root;
};
afterAll(() => { for (const root of roots) fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });

const SAVE = "export const label = 'Save changes';\n";
const edit = async (dir: string, sessionId: string) => {
    const res: any = await new ProjectEditTool().execute({ request: 'Change the text "Save changes" to "Save"', dir }, { sessionId });
    delete (global as any).joeProjects?.[sessionId];
    return res;
};
const holds = (dir: string, rel: string) => fs.readFileSync(path.join(dir, rel), 'utf-8').includes('Save changes');

describe('a literal edit changes his source only', () => {
    it('a Laravel app: Composer\'s vendor folder is known by its own record, not by its name', async () => {
        const dir = project({
            'package.json': '{"name":"shop","private":true}',
            'composer.json': '{"name":"acme/shop"}',
            'resources/js/app.js': SAVE,
            'vendor/composer/installed.json': '{"packages":[]}',
            'vendor/acme/forms/resources/js/form.js': SAVE,
        });
        const res = await edit(dir, 'r22-source-laravel');
        expect(res.output.touched).toEqual(['resources/js/app.js']);
        expect(holds(dir, 'vendor/acme/forms/resources/js/form.js')).toBe(true);
        expect(res.output.message).toContain('resources/js/app.js');
    });

    it('a Django app with a virtualenv named env, found by pyvenv.cfg', async () => {
        const dir = project({
            'package.json': '{"name":"portal","private":true}',
            'static/js/forms.js': SAVE,
            'env/pyvenv.cfg': 'home = /usr/bin\nversion = 3.11.9\n',
            'env/lib/python3.11/site-packages/django/contrib/admin/static/admin/js/actions.js': SAVE,
            'env/share/portal/ui.js': SAVE,
        });
        const res = await edit(dir, 'r22-source-django');
        expect(res.output.touched).toEqual(['static/js/forms.js']);
        expect(holds(dir, 'env/share/portal/ui.js')).toBe(true);
    });

    it('a monorepo: a lockfile at any depth is the package manager\'s', async () => {
        const dir = project({
            'package.json': '{"name":"mono","private":true,"workspaces":["client"]}',
            'client/package.json': '{"name":"client","description":"Save changes"}',
            'client/package-lock.json': '{"name":"client","lockfileVersion":3,"packages":{"":{"description":"Save changes"}}}',
            'client/src/Toolbar.jsx': SAVE,
        });
        const res = await edit(dir, 'r22-source-monorepo');
        expect(res.output.touched).toEqual(['client/src/Toolbar.jsx']);
        expect(holds(dir, 'client/package-lock.json')).toBe(true);
        expect(holds(dir, 'client/package.json')).toBe(true);
    });

    it('an api project: data.json is his users\' records — by its .gitignore, and by the code that writes it', async () => {
        const server = "import fs from 'fs';\nimport path from 'path';\nconst HERE = path.dirname(new URL(import.meta.url).pathname);\nconst FILE = path.join(HERE, 'data.json');\nexport const save = (s) => fs.writeFileSync(FILE, JSON.stringify(s));\n";
        const records = '{"rows":[{"id":1,"title":"Save changes"}]}';
        // As ApiProjectTool writes it: its .gitignore lists data.json, but not the
        // entities.json its entities.js keeps — the code that writes it says so.
        const entities = "import fs from 'fs';\nconst FILE = new URL('./entities.json', import.meta.url).pathname;\nexport const save = (s) => { try { fs.writeFileSync(FILE, JSON.stringify(s)); } catch {} };\n";
        const withIgnore = project({ 'package.json': '{"name":"api"}', '.gitignore': 'node_modules\n.npm-cache\ndata.db\ndata.json\n.auth-secret\n', 'server.js': server, 'entities.js': entities, 'public/app.js': SAVE, 'data.json': records, 'entities.json': records });
        const res = await edit(withIgnore, 'r22-source-api-ignore');
        expect(res.output.touched).toEqual(['public/app.js']);
        expect(holds(withIgnore, 'data.json')).toBe(true);
        expect(holds(withIgnore, 'entities.json')).toBe(true);

        const noIgnore = project({ 'package.json': '{"name":"api"}', 'server.js': server, 'public/app.js': SAVE, 'data.json': records });
        const bare = await edit(noIgnore, 'r22-source-api-bare');
        expect(bare.output.touched).toEqual(['public/app.js']);
        expect(holds(noIgnore, 'data.json')).toBe(true);
        expect(bare.output.message).toContain('data.json');
    });

    it('NEGATIVE — a folder named coverage that holds his pages is his; the tool\'s report at the root is not', async () => {
        const dir = project({
            'package.json': '{"name":"insurer"}',
            'src/App.jsx': "import Plans from './coverage/Plans';\nexport default Plans;\n",
            'src/coverage/Plans.jsx': "export default function Plans() { return <h2>Full coverage plans</h2>; }\n",
            'coverage/lcov.info': 'TN:\nSF:src/coverage/Plans.jsx\n',
            'coverage/lcov-report/index.html': '<h1>Full coverage plans</h1>\n',
        });
        const res: any = await new ProjectEditTool().execute({ request: 'Change the text "Full coverage plans" to "All plans"', dir }, { sessionId: 'r22-source-coverage' });
        delete (global as any).joeProjects?.['r22-source-coverage'];
        expect(res.output.touched).toEqual(['src/coverage/Plans.jsx']);
        expect(fs.readFileSync(path.join(dir, 'coverage', 'lcov-report', 'index.html'), 'utf-8')).toContain('Full coverage plans');
    });
});

describe('the export carries what is his, and the record that belongs to his project', () => {
    it('src/coverage and .joe/external-api.json travel; the coverage report, Joe\'s caches and the virtualenv do not', () => {
        const dir = project({
            'package.json': '{"name":"weather"}',
            'src/App.jsx': "import Plans from './coverage/Plans';\n",
            'src/coverage/Plans.jsx': 'export default () => null;\n',
            '.joe/external-api.json': '{"provider":"open-meteo"}',
            '.joe/npm-cache/_cacache/index': 'x',
            'coverage/lcov.info': 'TN:\n',
            'env/pyvenv.cfg': 'version = 3.11.9\n',
            'env/lib/site.py': '# python\n',
        });
        const names = new AdmZip(archiveProject(dir).buffer).getEntries().map(entry => entry.entryName).sort();
        expect(names).toEqual(['.joe/external-api.json', 'joe-project.json', 'package.json', 'src/App.jsx', 'src/coverage/Plans.jsx']);
    });
});

describe('the shared walker', () => {
    it('honours the project\'s own .gitignore files at every depth, negation included', async () => {
        const dir = project({
            '.gitignore': '*.log\n/build-cache/\n',
            'client/.gitignore': 'dist/\n!dist/keep.js\nlocal.js\n',
            'client/src/a.js': '',
            'client/local.js': '',
            'client/dist/out.js': '',
            'app.log': '',
            'build-cache/x.js': '',
            'src/build-cache/y.js': '',
        });
        expect(await listProjectFiles(dir)).toEqual(['.gitignore', 'client/.gitignore', 'client/src/a.js', 'src/build-cache/y.js']);
    });

    it('reads a wide project a bounded number of folders at a time', async () => {
        const files: Record<string, string> = { 'package.json': '{}' };
        for (let i = 0; i < 160; i++) files[`pages/p${String(i).padStart(3, '0')}/index.js`] = '';
        const dir = project(files);
        const readdir = fs.promises.readdir;
        let inFlight = 0, most = 0;
        const spy = jest.spyOn(fs.promises, 'readdir').mockImplementation(async (...args: any[]) => {
            inFlight++; most = Math.max(most, inFlight);
            try { return await (readdir as any).apply(fs.promises, args); } finally { inFlight--; }
        });
        try {
            const listed = await listProjectFiles(dir);
            expect(listed).toHaveLength(161);
            expect(most).toBeGreaterThan(1);
            expect(most).toBeLessThanOrEqual(PROJECT_FS_CONCURRENCY);
        } finally { spy.mockRestore(); }
    });
});
