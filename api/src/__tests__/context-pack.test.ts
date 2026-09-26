import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildContextPack } from '../core/implementation/context-pack';

const callLLM = jest.fn();
const mockLlmModule: any = { callLLM: (...a: any[]) => callLLM(...a) };
jest.mock('../core/llm', () => mockLlmModule);

import { AIGeneratorTool } from '../modules/tools/definitions/AIGeneratorTool';
import { workspaceService } from '../modules/services/WorkspaceService';

describe('context-pack unit', () => {
    let root = '';

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-pack-'));
        fs.mkdirSync(path.join(root, 'src', 'routes'), { recursive: true });
        fs.mkdirSync(path.join(root, 'node_modules', 'leftpad'), { recursive: true });
        fs.mkdirSync(path.join(root, '.git'), { recursive: true });
        fs.writeFileSync(path.join(root, 'src', 'routes', 'users.js'), 'const router = require("express").Router();\nmodule.exports = router;\n');
        fs.writeFileSync(path.join(root, 'src', 'routes', 'orders.js'), 'const router = require("express").Router();\nmodule.exports = router;\n');
        fs.writeFileSync(path.join(root, 'src', 'server.js'), 'const app = require("express")();\napp.listen(3000);\n');
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'demo', type: 'module', dependencies: { express: '^4.0.0' }, devDependencies: {} }));
        fs.writeFileSync(path.join(root, '.env'), 'JWT_SECRET=topsecretvalue');
        fs.writeFileSync(path.join(root, 'id_rsa.key'), 'fake-private-key-bytes');
        fs.writeFileSync(path.join(root, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]));
        fs.writeFileSync(path.join(root, 'node_modules', 'leftpad', 'index.js'), 'module.exports = () => {};');
    });

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('packs tree, manifest, and sibling excerpts for a target', () => {
        const pack = buildContextPack(root, 'src/routes/health.js');
        expect(pack.text).toContain('src/routes/');
        expect(pack.text).toContain('users.js');
        expect(pack.text).toContain('express');
        expect(pack.text).toContain('package demo [type: module]');
        expect(pack.text).toContain('dependencies: express');
        expect(pack.files).toContain('src/routes/users.js');
        expect(pack.files).toContain('src/routes/orders.js');
        expect(pack.files).not.toContain('src/routes/health.js');
        expect(pack.truncated).toBe(false);
    });

    it('never reads secret-looking or binary files', () => {
        const pack = buildContextPack(root, 'src/new.js', { maxFiles: 20 });
        expect(pack.text).not.toContain('topsecretvalue');
        expect(pack.text).not.toContain('fake-private-key-bytes');
        // Names stay visible in the tree (layout fidelity); contents never load.
        expect(pack.files).not.toContain('.env');
        expect(pack.files).not.toContain('id_rsa.key');
        expect(pack.files).not.toContain('logo.png');
    });

    it('skips dependency and VCS directories in the tree', () => {
        const pack = buildContextPack(root, 'src/new.js');
        expect(pack.text).not.toContain('node_modules');
        expect(pack.text).not.toContain('.git');
    });

    it('respects file and char budgets and reports truncation', () => {
        const capped = buildContextPack(root, 'src/routes/health.js', { maxFiles: 1 });
        expect(capped.files).toHaveLength(1);
        expect(capped.truncated).toBe(true);
        const full = buildContextPack(root, 'src/routes/health.js');
        expect(full.truncated).toBe(false);
        fs.writeFileSync(path.join(root, 'src', 'routes', 'big.js'), `// pad\n${'x'.repeat(3000)}\n`);
        const tiny = buildContextPack(root, 'src/routes/health.js', { maxChars: 500 });
        expect(tiny.text.length).toBeLessThanOrEqual(500);
        expect(tiny.truncated).toBe(true);
    });

    it('is deterministic and never throws on a missing root', () => {
        const first = buildContextPack(root, 'src/routes/health.js');
        const second = buildContextPack(root, 'src/routes/health.js');
        expect(second).toEqual(first);
        expect(buildContextPack(path.join(root, 'nope'), 'a.js')).toEqual({ text: '', files: [], truncated: false });
    });
});

describe('ai_write_file repo context', () => {
    const tool = new AIGeneratorTool();
    const DIR = '__ai_write_file_pack_test__';
    const scratch = (name: string) => path.join(DIR, name);
    const landsAt = (rel: string) => path.resolve(workspaceService.getActiveRoot(), rel);

    beforeEach(() => {
        callLLM.mockReset();
        fs.mkdirSync(landsAt(scratch('pack')), { recursive: true });
    });

    afterEach(() => {
        try { fs.rmSync(landsAt(DIR), { recursive: true, force: true }); } catch { }
    });

    it('attaches sibling evidence to the prompt and reports pack stats', async () => {
        fs.writeFileSync(landsAt(scratch('pack/sibling.html')), '<nav>SIBLING-MARKER-NAV</nav>');
        callLLM.mockResolvedValue('<!DOCTYPE html><title>gen</title>');

        const result: any = await tool.execute(
            { path: scratch('pack/target.html'), description: 'Create a page reusing the site nav.' },
            { engineeringPipeline: true },
        );

        expect(result.ok).toBe(true);
        const [prompt] = callLLM.mock.calls[0];
        expect(prompt).toContain('Repository layout evidence');
        expect(prompt).toContain('SIBLING-MARKER-NAV');
        expect(prompt).toContain('sibling.html');
        const packLog = result.logs.find((line: string) => line.startsWith('repo_context_pack='));
        expect(packLog).toBeDefined();
        const stats = JSON.parse(packLog.split('=', 2)[1]);
        expect(stats.files).toBeGreaterThanOrEqual(1);
        expect(stats.chars).toBeGreaterThan(0);
    });

    it('omits the pack when contextPack is false', async () => {
        fs.writeFileSync(landsAt(scratch('pack/sibling.html')), '<nav>SIBLING-MARKER-NAV</nav>');
        callLLM.mockResolvedValue('<!DOCTYPE html><title>gen</title>');

        const result: any = await tool.execute(
            { path: scratch('pack/target.html'), description: 'Create a page.', contextPack: false },
            { engineeringPipeline: true },
        );

        expect(result.ok).toBe(true);
        const [prompt] = callLLM.mock.calls[0];
        expect(prompt).not.toContain('Repository layout evidence');
        expect(prompt).not.toContain('SIBLING-MARKER-NAV');
        const packLog = result.logs.find((line: string) => line.startsWith('repo_context_pack='));
        expect(JSON.parse(packLog.split('=', 2)[1])).toEqual({ files: 0, chars: 0, truncated: false });
    });

    it('still generates when the directory is empty', async () => {
        callLLM.mockResolvedValue('<!DOCTYPE html><title>gen</title>');

        const result: any = await tool.execute(
            { path: scratch('pack/target.html'), description: 'Create a page.' },
            { engineeringPipeline: true },
        );

        expect(result.ok).toBe(true);
        expect(fs.readFileSync(landsAt(scratch('pack/target.html')), 'utf-8')).toContain('<title>gen</title>');
    });
});
