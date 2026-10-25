/**
 * P001-landing-ar (run500, 2026-10-25, code 1b97d1e9): a plain-JavaScript
 * landing page with only a `start` script failed its final phase because
 * quality_run {action: 'lint'} ran all four checks, found no npm script for
 * any of them, and reported «No requested quality checks were available to
 * execute (lint, typecheck, test, build)» without reading one line of code.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { QualityRunTool, requestedQualityTasks } from '../modules/tools/definitions/QualityTools';
import { checkJavaScriptSyntax } from '../core/quality/js-syntax-check';
import { handleShellCommand } from '../modules/tools/handlers';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';

jest.mock('../modules/tools/handlers', () => ({ handleShellCommand: jest.fn() }));
jest.mock('../modules/tools/utils', () => ({ resolveToolPath: (value: string) => value }));

jest.setTimeout(60_000);

// At runtime quality_run runs inside the orchestrator; the parse goes through
// the ExecutionGateway, which refuses any call outside that context.
const quality = (input: any) => executionFirewall.runAsSystem(() => new QualityRunTool().execute(input));

describe('a project without a lint script is still parsed', () => {
    let root: string;
    const write = (rel: string, text: string) => {
        fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        fs.writeFileSync(path.join(root, rel), text);
    };
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-lint-parse-'));
        jest.clearAllMocks();
    });
    afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

    it('reads the one check a plan names as action', () => {
        expect(requestedQualityTasks({ action: 'lint' })).toEqual(['lint']);
        expect(requestedQualityTasks({ task: 'test, build' })).toEqual(['test', 'build']);
        expect(requestedQualityTasks({ tasks: ['typecheck'], action: 'lint' })).toEqual(['typecheck']);
        expect(requestedQualityTasks({ action: 'run' })).toEqual(['lint', 'typecheck', 'test', 'build']);
        expect(requestedQualityTasks({})).toEqual(['lint', 'typecheck', 'test', 'build']);
    });

    it('passes P001\'s shape: vanilla JS, start script only, lint requested', async () => {
        write('package.json', JSON.stringify({ name: 'clinic', scripts: { start: 'node src/app.js' } }));
        write('src/app.js', "document.addEventListener('DOMContentLoaded', () => console.log('ok'));\n");
        write('src/components/hero.js', 'export function hero() { return `<section>مرحبا</section>`; }\n');
        write('node_modules/broken/index.js', 'const = ;\n');

        const result = await quality({ path: root, action: 'lint' });

        expect(result).toMatchObject({ ok: true, output: { status: 'completed' } });
        expect(result.output.results).toEqual([expect.objectContaining({ task: 'lint', ok: true, skipped: false, method: 'node --check' })]);
        expect(result.output.results[0].output).toContain('2 JavaScript file(s)');
        expect(handleShellCommand).not.toHaveBeenCalled();
    });

    it('fails with the file and the parser\'s words when the code does not parse', async () => {
        write('package.json', JSON.stringify({ scripts: { start: 'node src/app.js' } }));
        write('src/app.js', "console.log('fine');\n");
        // ESM in a .js file of a non-module package: plain `node --check`
        // exits 0 on this (Node 24.18); the forced module goal catches it.
        write('src/components/contact.js', 'import x from "./x.js";\nconst = 1;\n');

        const result = await quality({ path: root, action: 'lint' });

        expect(result.ok).toBe(false);
        expect(result.output.status).toBe('failed');
        expect(result.error).toMatch(/lint: src\/components\/contact\.js:2: SyntaxError/u);
    });

    it('does no work without a project path', async () => {
        const result = await quality({ action: 'lint' });
        expect(result).toMatchObject({ ok: false, output: { status: 'incomplete', results: [] } });
        expect(result.error).toMatch(/needs the path/u);
        expect(handleShellCommand).not.toHaveBeenCalled();
    });

    it('leaves a project with nothing to parse incomplete', async () => {
        write('package.json', JSON.stringify({ scripts: { start: 'serve .' } }));
        write('index.html', '<!doctype html><title>x</title>');
        const result = await quality({ path: root, action: 'lint' });
        expect(result).toMatchObject({ ok: false, output: { status: 'incomplete' } });
    });

    it('does not parse raw sources a build script compiles', async () => {
        write('package.json', JSON.stringify({ scripts: { build: 'react-scripts build' } }));
        write('src/App.js', 'export default function App() { return <div />; }\n');
        (handleShellCommand as jest.Mock).mockResolvedValue({ ok: true, output: 'built' });
        const result = await quality({ path: root });
        expect(result.output.results.find((r: any) => r.task === 'lint')).toEqual({ task: 'lint', ok: true, skipped: true });
        expect(result).toMatchObject({ ok: true, output: { status: 'completed' } });
    });

    it('lists only project sources and respects .cjs/.mjs goals', async () => {
        write('a.cjs', 'module.exports = 1;\n');
        write('b.mjs', 'export default 1;\n');
        write('dist/bundle.js', 'const = ;\n');
        const syntax = await executionFirewall.runAsSystem(() => checkJavaScriptSyntax(root));
        expect(syntax).toEqual({ files: ['a.cjs', 'b.mjs'], failure: null });
    });
});
