/**
 * A file the model writes is told, in its own relative terms, which local
 * imports resolve from it, and an import retry rewrites the rejected file
 * instead of starting again from the same brief.
 *
 * P001 (run500, 2026-10-27, run-1793107680340): src/App.tsx was planned beside
 * src/components/{Hero,Services,Reviews,ContactForm}.tsx. The model imported
 * ./pages/Home, ./components/Navbar … on the first write, on both import
 * retries and on two repair attempts: «unresolved_local_import … no file
 * resolves from the importing file», phase 2 partial. The layout it was shown
 * was project-relative and joined with a literal backslash-n; the retry carried
 * neither the rejected file nor a single specifier it could write.
 * Only the model call is substituted; the path resolver, the filesystem and
 * the import validator are the real code.
 */
import fs from 'fs';
import path from 'path';

const callLLM = jest.fn();
jest.mock('../core/llm', () => ({ callLLM: (...a: any[]) => callLLM(...a) }));

import { AIGeneratorTool } from '../modules/tools/definitions/AIGeneratorTool';
import { workspaceService } from '../modules/services/WorkspaceService';

const WORKSPACE = 'session-imports-that-resolve-test';
const SITE = path.join(path.resolve(workspaceService.externalRoot), WORKSPACE, 'clinic-site');
const API = path.join(path.resolve(workspaceService.externalRoot), WORKSPACE, 'clinic-api');
const write = (root: string, rel: string, body: string) => {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
};
const PLANNED = ['clinic-site/src/components/Hero.tsx', 'clinic-site/src/components/Services.tsx'];

beforeAll(() => {
    write(SITE, 'package.json', JSON.stringify({ name: 'clinic-site', type: 'module', scripts: { build: 'vite build' }, dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' }, devDependencies: { vite: '^5.0.0' } }));
    write(SITE, 'vite.config.ts', "export default {};\n");
    write(SITE, 'index.html', '<div id="root"></div>\n');
    write(SITE, 'src/main.tsx', "import App from './App';\n");
    write(SITE, 'src/i18n.ts', 'export const t = (k: string) => k;\n');
    write(API, 'package.json', JSON.stringify({ name: 'clinic-api', type: 'module', scripts: { start: 'node server.js' }, dependencies: {} }));
    write(API, 'db.js', 'export const db = {};\n');
});

afterAll(() => {
    fs.rmSync(path.dirname(SITE), { recursive: true, force: true });
});

beforeEach(() => callLLM.mockReset());

const APP_WITH_INVENTED_PAGES = "import React from 'react';\nimport Home from './pages/Home';\nexport default function App() { return <Home />; }\n";
const APP_ON_PLANNED_FILES = "import React from 'react';\nimport Hero from './components/Hero';\nimport { t } from './i18n';\nexport default function App() { return <main><Hero />{t('x')}</main>; }\n";

test('the first prompt lists the exact specifiers that resolve from the file being written, one per line', async () => {
    callLLM.mockResolvedValue(APP_ON_PLANNED_FILES);
    const result: any = await new AIGeneratorTool().execute(
        { path: 'clinic-site/src/App.tsx', description: 'Main App component for the Home, Services and Contact sections.' },
        { engineeringPipeline: true, projectRoot: SITE, workspaceId: WORKSPACE, plannedPhaseFiles: PLANNED });
    expect(result.ok).toBe(true);
    const prompt = String(callLLM.mock.calls[0][0]);
    const layout = prompt.slice(prompt.indexOf('VERIFIED PROJECT FILE LAYOUT'));
    expect(layout).not.toContain('\\n');
    expect(layout).toContain('\n- src/main.tsx\n');
    const resolvable = layout.slice(layout.indexOf('RELATIVE IMPORTS THAT RESOLVE FROM src/App.tsx'));
    expect(resolvable.length).toBeLessThan(layout.length);
    for (const specifier of ['./components/Hero', './components/Services', './i18n', './main']) expect(resolvable).toContain(`\n- ${specifier}\n`);
    for (const noise of ['package.json', 'vite.config', 'index.html', './App\n']) expect(resolvable).not.toContain(noise);
});

test('an import retry rewrites the rejected file, with the specifiers it may use', async () => {
    callLLM
        .mockResolvedValueOnce(APP_WITH_INVENTED_PAGES)
        .mockResolvedValueOnce(APP_ON_PLANNED_FILES);
    const result: any = await new AIGeneratorTool().execute(
        { path: 'clinic-site/src/App.tsx', description: 'Main App component for the Home, Services and Contact sections.' },
        { engineeringPipeline: true, projectRoot: SITE, workspaceId: WORKSPACE, plannedPhaseFiles: PLANNED });
    expect(result.ok).toBe(true);
    expect(callLLM).toHaveBeenCalledTimes(2);
    const retry = String(callLLM.mock.calls[1][0]);
    const rejected = retry.slice(retry.indexOf('REJECTED CANDIDATE CONTENT'));
    expect(rejected).toContain("import Home from './pages/Home';");
    expect(retry).toContain('\n- ./components/Hero\n');
    expect(fs.readFileSync(path.join(SITE, 'src/App.tsx'), 'utf8')).toContain("from './components/Hero'");
});

test('a nested file is told the parent-relative paths, and a Node module keeps its .js extension', async () => {
    callLLM.mockResolvedValue("import React from 'react';\nimport { t } from '../i18n';\nexport default function Hero() { return <h1>{t('hero')}</h1>; }\n");
    const nested: any = await new AIGeneratorTool().execute(
        { path: 'clinic-site/src/components/Hero.tsx', description: 'Hero section.' },
        { engineeringPipeline: true, projectRoot: SITE, workspaceId: WORKSPACE, plannedPhaseFiles: PLANNED });
    expect(nested.ok).toBe(true);
    const nestedPrompt = String(callLLM.mock.calls[0][0]);
    for (const specifier of ['../i18n', '../main', './Services']) expect(nestedPrompt).toContain(`\n- ${specifier}\n`);

    callLLM.mockReset();
    callLLM.mockResolvedValue("import { db } from './db.js';\nexport const app = { db };\n");
    const server: any = await new AIGeneratorTool().execute(
        { path: 'clinic-api/server.js', description: 'HTTP server for the clinic API.' },
        { engineeringPipeline: true, projectRoot: API, workspaceId: WORKSPACE });
    expect(server.ok).toBe(true);
    expect(String(callLLM.mock.calls[0][0])).toContain('\n- ./db.js\n');
});
