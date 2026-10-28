/**
 * The import evidence ai_write_file hands the model is true, and a retry
 * rewrites the whole rejected file.
 *
 * Round 21 review (f7c6cc63): the specifier list stopped at 80 while telling
 * the model «any other relative import is rejected» — false, the gate accepts
 * every import that resolves to an existing or planned file, so a project with
 * more modules than that was told its own files were forbidden; a stylesheet or
 * a JSON file was offered TS/JSX modules it can never import; and the import,
 * syntax and runtime retries cut the rejected candidate at 24 000 characters
 * and asked for a rewrite of the cut copy as if it were the file.
 * Only the model call is substituted; the layout walk, the resolver and every
 * gate are the real code.
 */
import fs from 'fs';
import path from 'path';

const callLLM = jest.fn();
jest.mock('../core/llm', () => ({ callLLM: (...a: any[]) => callLLM(...a) }));

import { AIGeneratorTool } from '../modules/tools/definitions/AIGeneratorTool';
import { workspaceService } from '../modules/services/WorkspaceService';

const WORKSPACE = 'session-import-list-truth-test';
const SITE = path.join(path.resolve(workspaceService.externalRoot), WORKSPACE, 'site');
const BIG = path.join(path.resolve(workspaceService.externalRoot), WORKSPACE, 'big');
const write = (root: string, rel: string, body: string) => {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
};
const MANIFEST = JSON.stringify({ name: 'site', type: 'module', scripts: { build: 'vite build' }, dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' }, devDependencies: { vite: '^5.0.0' } });
const name = (i: number) => `C${String(i).padStart(3, '0')}`;

beforeAll(() => {
    write(SITE, 'package.json', MANIFEST);
    write(SITE, 'src/main.tsx', "import App from './App';\n");
    write(SITE, 'src/styles/base.css', 'body { margin: 0; }\n');
    write(SITE, 'src/data/items.json', '[]\n');
    for (let i = 0; i < 100; i++) write(SITE, `src/components/${name(i)}.tsx`, `export default function ${name(i)}() { return null; }\n`);
    write(BIG, 'package.json', MANIFEST.replace('"site"', '"big"'));
    for (let i = 0; i < 200; i++) write(BIG, `src/m${String(i).padStart(3, '0')}.ts`, `export const v${i} = ${i};\n`);
});
afterAll(() => { fs.rmSync(path.dirname(SITE), { recursive: true, force: true }); });
beforeEach(() => callLLM.mockReset());

const promptFor = async (root: string, file: string, reply: string) => {
    callLLM.mockReset();
    callLLM.mockResolvedValue(reply);
    const result: any = await new AIGeneratorTool().execute(
        { path: `${path.basename(root)}/${file}`, description: 'Write this file.' },
        { engineeringPipeline: true, projectRoot: root, workspaceId: WORKSPACE });
    expect(result.ok).toBe(true);
    const prompt = String(callLLM.mock.calls[0][0]);
    return prompt.slice(prompt.indexOf('VERIFIED PROJECT FILE LAYOUT'));
};

test('every module that resolves is listed, and no sentence calls the rest rejected', async () => {
    const layout = await promptFor(SITE, 'src/App.tsx', "import C000 from './components/C000';\nexport default function App() { return <C000 />; }\n");
    const listed = layout.slice(layout.indexOf('RELATIVE IMPORTS THAT RESOLVE FROM src/App.tsx'));
    for (let i = 0; i < 100; i++) expect(listed).toContain(`\n- ./components/${name(i)}\n`);
    expect(layout).not.toMatch(/any other relative import is rejected/i);
});

test('a stylesheet is offered stylesheets, and a JSON file nothing', async () => {
    const css = await promptFor(SITE, 'src/styles/app.css', "@import './base.css';\n.hero { color: red; }\n");
    const listed = css.slice(css.indexOf('RELATIVE IMPORTS THAT RESOLVE FROM src/styles/app.css'));
    expect(listed).toContain('\n- ./base.css\n');
    expect(listed).not.toMatch(/components\/|\.\.\/main|items\.json/);
    const json = await promptFor(SITE, 'src/data/more.json', '[]');
    expect(json).not.toContain('RELATIVE IMPORTS THAT RESOLVE FROM');
});

test('a listing that stops says so', async () => {
    const layout = await promptFor(BIG, 'src/index.ts', "export * from './m000';\n");
    expect(layout).toContain('This listing stopped at 180 files');
    expect(layout).toContain('a file missing here may still exist');
});

/** A rejected candidate longer than the old 24 000-character cut, with a marker at its very end. */
const long = (head: string) => `${head}\n${Array.from({ length: 900 }, (_, i) => `export const filler${i} = 'the rejected file keeps going past any cut';`).join('\n')}\n// END OF THE REJECTED FILE\n`;
const VALID = "import C000 from './components/C000';\nexport default function App() { return <C000 />; }\n";

test.each([
    ['an import retry', long("import Home from './pages/Home';\nexport default function App() { return <Home />; }"), 'REJECTED CANDIDATE CONTENT'],
    ['a runtime-contract retry', long("import pad from 'left-pad';\nexport default function App() { return pad('x', 2); }"), 'REJECTED CANDIDATE CONTENT'],
    ['a syntax retry', long('export default function App() { return <main>; }'), 'REJECTED SOURCE'],
])('%s rewrites the whole rejected file, not a cut copy', async (_kind, rejected, label) => {
    expect(rejected.length).toBeGreaterThan(24_000);
    callLLM.mockResolvedValueOnce(rejected).mockResolvedValue(VALID);
    const result: any = await new AIGeneratorTool().execute(
        { path: 'site/src/App.tsx', description: 'Main App component.' },
        { engineeringPipeline: true, projectRoot: SITE, workspaceId: WORKSPACE });
    expect(result.ok).toBe(true);
    const retry = String(callLLM.mock.calls[1][0]);
    expect(retry.slice(retry.indexOf(label))).toContain('// END OF THE REJECTED FILE');
});
