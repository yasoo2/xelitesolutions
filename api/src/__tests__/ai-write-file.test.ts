/**
 * `ai_write_file` — the tool the agent uses to create a file from a description.
 *
 * This tool existed twice. One copy lived in EliteTools.ts and was never
 * reachable: the registry logs "Duplicate tool name skipped: ai_write_file"
 * because AIGeneratorTool claims the same name and registers first. Fixing the
 * unreachable copy fixed nothing, so these tests drive the class that actually
 * runs, and they drive it through `execute` rather than reading its source.
 *
 * Only the model call is substituted — that is the network boundary, and a unit
 * test must not reach it. Everything after the boundary is the real code: the
 * real path resolver, the real filesystem, the real guards.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

const callLLM = jest.fn();
// A single mutable module object, so a test can take `callLLM` away and
// exercise the real getLLM guard rather than a second copy of it.
const mockLlmModule: any = { callLLM: (...a: any[]) => callLLM(...a) };
jest.mock('../core/llm', () => mockLlmModule);

import { AIGeneratorTool } from '../modules/tools/definitions/AIGeneratorTool';
import { PROVIDER_FAILURE_PREFIX } from '../core/llm/intelligent-router';
import { workspaceService } from '../modules/services/WorkspaceService';

const tool = new AIGeneratorTool();

test('keeps a bounded engineering write budget above a ten-file pipeline phase', () => {
    expect((tool as any).rateLimitPerMinute).toBeGreaterThanOrEqual(30);
    expect((tool as any).rateLimitPerMinute).toBeLessThanOrEqual(120);
});

const DIR = '__ai_write_file_test__';
/** A path inside the workspace that the test owns and cleans up. */
const scratch = (name: string) => path.join(DIR, name);
/**
 * Where a relative path actually lands: the tool anchors to the active
 * workspace root, and the test asks the same service the tool does rather than
 * assuming a directory layout. Which roots are *permitted* is not taken on
 * trust — the escape cases below prove the boundary independently.
 */
const landsAt = (rel: string) => path.resolve(workspaceService.getActiveRoot(), rel);

afterAll(() => {
    try { fs.rmSync(landsAt(DIR), { recursive: true, force: true }); } catch { }
});

beforeEach(() => callLLM.mockReset());

describe('the happy path is a real write', () => {
    it('writes what the model returned, and reports the bytes it actually wrote', async () => {
        callLLM.mockResolvedValue('<!DOCTYPE html><title>hi</title>');
        const rel = scratch('page.html');

        const res: any = await tool.execute({ path: rel, description: 'a page' });

        expect(res.ok).toBe(true);
        const abs = landsAt(rel);
        expect(fs.readFileSync(abs, 'utf-8')).toBe('<!DOCTYPE html><title>hi</title>');
        // The byte count comes from stat, so it cannot claim a size the file
        // does not have.
        expect(res.output.bytes).toBe(fs.statSync(abs).size);
    });

    it('strips a markdown fence the model wrapped the file in', async () => {
        callLLM.mockResolvedValue('```html\n<h1>real</h1>\n```');
        const rel = scratch('fenced.html');

        await tool.execute({ path: rel, description: 'a page' });

        expect(fs.readFileSync(landsAt(rel), 'utf-8')).toBe('<h1>real</h1>');
    });

    it('normalizes a fenced JSON manifest before writing it', async () => {
        callLLM.mockResolvedValue('```json\n{"name":"taskflow-ai","scripts":{"start":"node server.js"}}\n```');
        const rel = scratch('package.json');

        const res: any = await tool.execute({ path: rel, description: 'Write the project manifest as JSON.' });

        expect(res.ok).toBe(true);
        expect(JSON.parse(fs.readFileSync(landsAt(rel), 'utf-8')).name).toBe('taskflow-ai');
        expect(fs.readFileSync(landsAt(rel), 'utf-8')).not.toMatch(/^```/);
    });

    it('salvages a complete JSON body when only the closing markdown fence was truncated', async () => {
        callLLM.mockResolvedValue('```json\n{"name":"taskflow-ai","private":true}');
        const rel = scratch('truncated-wrapper.json');

        const res: any = await tool.execute({ path: rel, description: 'Write a strict JSON project manifest.' });

        expect(res.ok).toBe(true);
        expect(JSON.parse(fs.readFileSync(landsAt(rel), 'utf-8'))).toEqual({ name: 'taskflow-ai', private: true });
        expect(fs.readFileSync(landsAt(rel), 'utf-8')).not.toMatch(/```/);
    });
});

describe('generated source and structured artifacts are rejected before disk writes', () => {
    it('retries one malformed JSON/fence completion before refusing the artifact', async () => {
        callLLM
            .mockResolvedValueOnce('```json\\n{"name":"taskflow-ai",\\n')
            .mockResolvedValueOnce('{"name":"taskflow-ai","private":true}');
        const rel = scratch('format-retry.json');

        const res: any = await tool.execute({ path: rel, description: 'Write a strict JSON manifest.' });

        expect(res.ok).toBe(true);
        expect(callLLM).toHaveBeenCalledTimes(2);
        expect(callLLM.mock.calls[1][0]).toMatch(/FORMAT RETRY REQUIRED/);
        expect(JSON.parse(fs.readFileSync(landsAt(rel), 'utf-8'))).toEqual({ name: 'taskflow-ai', private: true });
        expect(res.logs).toEqual(expect.arrayContaining([expect.stringMatching(/format retry requested/)]));
    });

    it('refuses malformed JSON instead of creating a broken manifest after the bounded retry', async () => {
        callLLM
            .mockResolvedValueOnce('{"name": "taskflow-ai",')
            .mockResolvedValueOnce('{"name": "taskflow-ai",');
        const rel = scratch('invalid.json');

        const res: any = await tool.execute({ path: rel, description: 'Write a JSON manifest.' });

        expect(res.ok).toBe(false);
        expect(res.error).toMatch(/valid JSON/);
        expect(callLLM).toHaveBeenCalledTimes(2);
        expect(fs.existsSync(landsAt(rel))).toBe(false);
    });

    it('refuses an incomplete JSON body even when it has an opening markdown fence', async () => {
        callLLM.mockResolvedValue('```json\n{"name":"taskflow-ai",');
        const rel = scratch('invalid-fenced.json');

        const res: any = await tool.execute({ path: rel, description: 'Write a JSON manifest.' });

        expect(res.ok).toBe(false);
        expect(res.error).toMatch(/incomplete Markdown fence|valid JSON/);
        expect(fs.existsSync(landsAt(rel))).toBe(false);
    });

    it('allows valid TypeScript-style imports in a JavaScript destination', async () => {
        callLLM.mockResolvedValue("import * as express from 'express';\nconst app = express();\nmodule.exports = app;");
        const rel = scratch('src/routes/auth.js');

        const res: any = await tool.execute({ path: rel, description: 'Write the Node.js authentication route.' });

        expect(res.ok).toBe(true);
        expect(fs.readFileSync(landsAt(rel), 'utf-8')).toMatch(/import \* as express/);
    });

    it('refuses Python markers in a JavaScript destination', async () => {
        callLLM.mockResolvedValue('from flask import Flask\n\ndef create_app():\n    return Flask(__name__)');
        const rel = scratch('src/index.js');

        const res: any = await tool.execute({ path: rel, description: 'Write the Node.js server entrypoint.' });

        expect(res.ok).toBe(false);
        expect(res.error).toMatch(/artifact_type_mismatch/);
        expect(fs.existsSync(landsAt(rel))).toBe(false);
    });

    it('refuses TypeScript-only syntax in a JavaScript destination before disk write', async () => {
        callLLM.mockResolvedValue('interface WeatherResult { temperature: number; }\nexport function readWeather(value: WeatherResult) { return value.temperature; }');
        const rel = scratch('src/services/weatherService.js');

        const res: any = await tool.execute({ path: rel, description: 'Write the JavaScript weather service.' });

        expect(res.ok).toBe(false);
        expect(res.error).toMatch(/source_syntax_mismatch/);
        expect(fs.existsSync(landsAt(rel))).toBe(false);
    });

    it('retries malformed JSX once and writes only the parser-approved completion', async () => {
        callLLM
            .mockResolvedValueOnce("import React from 'react';\nexport default function Search() { return <main>unfinished; }")
            .mockResolvedValueOnce("import React from 'react';\nexport default function Search() { return <main>Search</main>; }");
        const rel = scratch('src/screens/Search.jsx');

        const res: any = await tool.execute({ path: rel, description: 'Write the browser search screen in JSX.' });

        expect(res.ok).toBe(true);
        expect(callLLM).toHaveBeenCalledTimes(2);
        expect(callLLM.mock.calls[1][0]).toMatch(/SYNTAX RETRY REQUIRED/);
        expect(res.logs).toEqual(expect.arrayContaining([expect.stringMatching(/syntax retry requested/)]));
        expect(fs.readFileSync(landsAt(rel), 'utf-8')).toContain('<main>Search</main>');
    });

    it('keeps a failed syntax retry off disk but marks it recoverable for self-fix', async () => {
        callLLM.mockResolvedValue("import React from 'react';\nexport default function Search() { return <main>unfinished; }");
        const rel = scratch('src/screens/invalid-search.jsx');

        const res: any = await tool.execute({ path: rel, description: 'Write the browser search screen in JSX.' });

        expect(res.ok).toBe(false);
        expect(res.recoverable).toBe(true);
        expect(res.error).toMatch(/source_syntax_mismatch/);
        expect(callLLM).toHaveBeenCalledTimes(2);
        expect(fs.existsSync(landsAt(rel))).toBe(false);
    });
});

 describe('a path outside the workspace is refused, not written', () => {
    // Not theoretical: the previous resolver returned an absolute path unchecked,
    // and the twin of this tool created /etc/joe-owned.txt during testing.
    const escapes = [
        [path.join(os.tmpdir(), 'joe-escape-' + process.pid + '.txt'), 'an absolute path outside the project'],
        ['../../../../../../tmp/joe-escape-rel-' + process.pid + '.txt', 'a relative path that climbs out'],
    ] as const;

    it.each(escapes)('refuses %s (%s)', async (target) => {
        callLLM.mockResolvedValue('anything at all');

        const res: any = await tool.execute({ path: target, description: 'x' });

        expect(res.ok).toBe(false);
        expect(res.error).toMatch(/path_outside_workspace/);
        const abs = path.isAbsolute(target) ? target : landsAt(target);
        expect(fs.existsSync(abs)).toBe(false);
    });

    it('asks the model first and refuses after — so a refusal is never mistaken for a failed generation', async () => {
        callLLM.mockResolvedValue('content');
        const res: any = await tool.execute({ path: '/etc/joe-owned-' + process.pid + '.txt', description: 'x' });
        expect(res.ok).toBe(false);
        expect(fs.existsSync('/etc/joe-owned-' + process.pid + '.txt')).toBe(false);
    });
});

describe('artifact contracts prevent a familiar template from replacing the requested deliverable', () => {
    it('refuses an HTML document returned for a Markdown architecture document', async () => {
        callLLM.mockResolvedValue('<!doctype html><html><head><title>Dashboard</title></head><body>generic app</body></html>');
        const rel = scratch('architecture/initial_plan.md');

        const res: any = await tool.execute({
            path: rel,
            description: 'Write an architecture plan with boundaries, lifecycle, verification, and explicit open decisions.',
            context: 'AUTHORITATIVE REQUIREMENTS EVIDENCE: architecture document only; no user interface is requested.',
        });

        expect(res.ok).toBe(false);
        expect(res.error).toMatch(/artifact_type_mismatch/);
        expect(fs.existsSync(landsAt(rel))).toBe(false);
    });

    it('keeps the destination contract in the generation prompt for a Markdown file', async () => {
        callLLM.mockResolvedValue('# Architecture\n\n## Boundaries\nConcrete content.');
        const rel = scratch('architecture/contract.md');

        const res: any = await tool.execute({ path: rel, description: 'Write an architecture document.' });

        expect(res.ok).toBe(true);
        expect(callLLM.mock.calls[0][0]).toMatch(/technical document/i);
        expect(callLLM.mock.calls[0][1][0].content).toMatch(/markdown_document/i);
    });
});

describe('verified runtime contracts keep generated source on the project stack', () => {
    const projectRel = scratch('verified-web');
    const projectRoot = landsAt(projectRel);

    beforeAll(() => {
        fs.mkdirSync(projectRoot, { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({
            name: 'verified-web',
            dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' },
            devDependencies: { vite: '^5.0.0' },
        }), 'utf-8');
    });

    afterAll(() => {
        try { fs.rmSync(projectRoot, { recursive: true, force: true }); } catch { }
    });

    it('anchors a logical relative path to the runtime-bound project root', async () => {
        callLLM.mockResolvedValue("export default function App() { return <main>runtime-bound</main>; }");
        const logicalPath = 'src/runtime-bound/App.jsx';

        const res: any = await tool.execute({
            path: logicalPath,
            description: 'Write the browser entry component for the verified React project.',
        }, { projectRoot, engineeringPipeline: true });

        expect(res.ok).toBe(true);
        expect(fs.readFileSync(path.join(projectRoot, logicalPath), 'utf-8')).toContain('runtime-bound');
        expect(fs.existsSync(landsAt(logicalPath))).toBe(false);
    });

    it('retries a generated local import when the relative path does not resolve from the file', async () => {
        fs.mkdirSync(path.join(projectRoot, 'src', 'styles'), { recursive: true });
        fs.writeFileSync(path.join(projectRoot, 'src', 'styles', 'app.css'), '.app { color: red; }', 'utf8');
        callLLM
            .mockResolvedValueOnce("import React from 'react';\nimport './styles/app.css';\nexport default function WeatherApp() { return <main>Weather</main>; }")
            .mockResolvedValueOnce("import React from 'react';\nimport '../styles/app.css';\nexport default function WeatherApp() { return <main>Weather</main>; }");
        const rel = path.join(projectRel, 'src/components/WeatherApp.jsx');

        const res: any = await tool.execute({
            path: rel,
            description: 'Write the weather domain component for the existing React project.',
            context: 'The importing file is in src/components and the stylesheet is in src/styles/app.css.',
        }, { projectRoot, engineeringPipeline: true });

        expect(res.ok).toBe(true);
        expect(callLLM).toHaveBeenCalledTimes(2);
        expect(callLLM.mock.calls[1][0]).toMatch(/IMPORT PATH RETRY REQUIRED/);
        expect(fs.readFileSync(landsAt(rel), 'utf-8')).toMatch(/\.\.\/styles\/app\.css/);
    });

    it('allows an import of a file planned for a later task in the same phase', async () => {
        callLLM.mockResolvedValue("import React from 'react';\nimport { getWeather } from '../services/weatherService';\nexport default function WeatherApp() { return <main>{getWeather()}</main>; }");
        const rel = path.join(projectRel, 'src/components/WeatherApp.jsx');

        const res: any = await tool.execute({
            path: rel,
            description: 'Write the browser weather screen; the weather service will be written later in this phase.',
        }, {
            projectRoot,
            engineeringPipeline: true,
            plannedPhaseFiles: ['src/services/weatherService.ts'],
        });

        expect(res.ok).toBe(true);
        expect(callLLM).toHaveBeenCalledTimes(1);
        expect(fs.readFileSync(path.join(projectRoot, rel.replace(`${projectRel}${path.sep}`, '')), 'utf-8')).toMatch(/weatherService/);
    });

    it('rejects a React Native switch in a verified React/Vite project before disk write', async () => {
        callLLM.mockResolvedValue("import React from 'react';\nimport { View, Text } from 'react-native';\nexport default function App() { return <View><Text>Weather</Text></View>; }");
        const rel = path.join(projectRel, 'src/App.jsx');

        const res: any = await tool.execute({
            path: rel,
            description: 'Write the main browser screen for the existing React project.',
        }, { projectRoot, engineeringPipeline: true });

        expect(res.ok).toBe(false);
        expect(res.error).toMatch(/runtime_contract_mismatch/);
        expect(res.error).toMatch(/react-native/);
        expect(callLLM.mock.calls[0][0]).toMatch(/VERIFIED PROJECT RUNTIME CONTRACT/);
        expect(callLLM.mock.calls[0][0]).toMatch(/web React\/Vite\/Next/);
        expect(fs.existsSync(landsAt(rel))).toBe(false);
    });

    it('allows declared React DOM imports under the same verified contract', async () => {
        callLLM.mockResolvedValue("import React from 'react';\nimport { createRoot } from 'react-dom/client';\nexport function App() { return <main>Weather</main>; }\nvoid createRoot;");
        const rel = path.join(projectRel, 'src/App.jsx');

        const res: any = await tool.execute({
            path: rel,
            description: 'Write a browser React screen for the existing project.',
        }, { projectRoot, engineeringPipeline: true });

        expect(res.ok).toBe(true);
        expect(fs.readFileSync(landsAt(rel), 'utf8')).toMatch(/react-dom\/client/);
    });

    it('uses one bounded runtime retry to remove undeclared packages before writing', async () => {
        const rel = path.join(projectRel, 'src/runtime-retry/App.jsx');
        callLLM
            .mockResolvedValueOnce("import React from 'react';\nimport { Provider } from 'react-redux';\nimport { format } from 'date-fns';\nexport default function App() { return <main>{format(new Date(), 'yyyy')}</main>; }\nvoid Provider;")
            .mockResolvedValueOnce("import React from 'react';\nexport default function App() { return <main>runtime-safe</main>; }");

        const res: any = await tool.execute({
            path: rel,
            description: 'Write the browser React entry for the verified web project.',
        }, { projectRoot, engineeringPipeline: true });

        expect(res.ok).toBe(true);
        expect(callLLM).toHaveBeenCalledTimes(2);
        expect(callLLM.mock.calls[1][0]).toMatch(/RUNTIME CONTRACT RETRY REQUIRED/);
        expect(callLLM.mock.calls[1][0]).toMatch(/react-redux/);
        expect(callLLM.mock.calls[1][0]).toMatch(/date-fns/);
        const written = fs.readFileSync(landsAt(rel), 'utf8');
        expect(written).toContain('runtime-safe');
        expect(written).not.toMatch(/react-redux|date-fns/);
    });

    it('uses the nearest target-project manifest when the bound root belongs to another project', async () => {
        const outerRoot = path.join(projectRoot, 'outer-api');
        const nestedRoot = path.join(projectRoot, 'nested-react-product');
        const target = path.join(nestedRoot, 'src', 'App.jsx');
        fs.mkdirSync(outerRoot, { recursive: true });
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(path.join(outerRoot, 'package.json'), JSON.stringify({
            name: 'outer-api',
            dependencies: { express: '^4.0.0' },
        }), 'utf8');
        fs.writeFileSync(path.join(nestedRoot, 'package.json'), JSON.stringify({
            name: 'nested-react-product',
            dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' },
            devDependencies: { vite: '^5.0.0' },
        }), 'utf8');
        callLLM.mockResolvedValue("import React from 'react';\nimport { createRoot } from 'react-dom/client';\nexport default function App() { return <main>nested</main>; }\nvoid createRoot;");

        try {
            const res: any = await tool.execute({
                path: target,
                description: 'Write the React browser entry for the nested product.',
            }, { projectRoot: outerRoot, engineeringPipeline: true });

            expect(res.ok).toBe(true);
            expect(fs.readFileSync(target, 'utf8')).toMatch(/react-dom\/client/);
        } finally {
            try { fs.rmSync(outerRoot, { recursive: true, force: true }); } catch { }
            try { fs.rmSync(nestedRoot, { recursive: true, force: true }); } catch { }
        }
    });
});

describe('a failure is never written into the file as its contents', () => {
    it('refuses the router\'s no-provider notice', async () => {
        // The router answers with an apology STRING rather than throwing. Writing
        // it puts "تعذّر الوصول إلى محرّك الذكاء" into the user's source file and
        // reports success.
        callLLM.mockResolvedValue(PROVIDER_FAILURE_PREFIX + ' (لم يستجب أي مزوّد). لم أستطع تنفيذ الطلب.');
        const rel = scratch('never-written.html');

        const res: any = await tool.execute({ path: rel, description: 'a page' });

        expect(res.ok).toBe(false);
        expect(res.logs.join(' ')).toMatch(/nothing was written/);
        expect(fs.existsSync(landsAt(rel))).toBe(false);
    });

    it('retries one transient provider failure inside an engineering pipeline', async () => {
        const rel = scratch('engineering-retry.html');
        callLLM
            .mockResolvedValueOnce(PROVIDER_FAILURE_PREFIX + ' (لم يستجب أي مزوّد).')
            .mockResolvedValueOnce('<main>recovered</main>');

        const res: any = await tool.execute(
            { path: rel, description: 'Write the verified engineering artifact.' },
            { engineeringPipeline: true },
        );

        expect(res.ok).toBe(true);
        expect(callLLM).toHaveBeenCalledTimes(2);
        expect(res.logs.join(' ')).toMatch(/engineering provider retry requested/);
        expect(fs.readFileSync(landsAt(rel), 'utf-8')).toBe('<main>recovered</main>');
    });

    it('refuses an empty completion instead of truncating the file to nothing', async () => {
        const rel = scratch('kept.html');
        const abs = landsAt(rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, 'the previous version', 'utf-8');

        callLLM.mockResolvedValue('   \n  ');
        const res: any = await tool.execute({ path: rel, description: 'a page' });

        expect(res.ok).toBe(false);
        expect(res.error).toMatch(/no content/);
        expect(fs.readFileSync(abs, 'utf-8')).toBe('the previous version');
    });

    it('reports a thrown provider error rather than swallowing it', async () => {
        callLLM.mockRejectedValue(new Error('429 rate limited'));
        const rel = scratch('rate-limited.html');

        const res: any = await tool.execute({ path: rel, description: 'a page' });

        expect(res.ok).toBe(false);
        expect(res.error).toMatch(/429 rate limited/);
        expect(fs.existsSync(landsAt(rel))).toBe(false);
    });
});

describe('an unreachable LLM module fails the tool instead of answering for it', () => {
    it('returns an error when the module exports no callLLM', async () => {
        // getLLM used to answer a load failure with
        // `async () => "Error: LLM not available in Elite Tools context"` — a
        // stand-in shaped like an answer, which the caller then wrote to disk.
        const real = mockLlmModule.callLLM;
        delete mockLlmModule.callLLM;
        try {
            const rel = scratch('no-llm.html');
            const res: any = await tool.execute({ path: rel, description: 'x' });

            expect(res.ok).toBe(false);
            expect(res.error).toMatch(/exports no callLLM/);
            expect(fs.existsSync(landsAt(rel))).toBe(false);
        } finally {
            mockLlmModule.callLLM = real;
        }
    });
});

describe('only one tool owns the name', () => {
    it('ai_write_file is AIGeneratorTool and nothing else declares it', () => {
        expect(tool.name).toBe('ai_write_file');
        const elite = fs.readFileSync(
            path.resolve(__dirname, '../modules/tools/definitions/EliteTools.ts'), 'utf-8');
        // The duplicate was silently skipped by the registry, which meant every
        // fix applied to it changed nothing that runs.
        expect(elite).not.toMatch(/class\s+AIWriteFileTool/);
    });
});
