import fs from 'fs';
import os from 'os';
import path from 'path';

jest.mock('../modules/tools/definitions/AIGeneratorTool', () => ({
    AIGeneratorTool: class {
        async execute(input: any) {
            if (String(input?.description || '').includes('PRESERVE_EVIDENCE')) {
                return {
                    ok: false,
                    error: 'unresolved_local_import: /tmp/WeatherGo/src/components/WeatherApp.jsx imports ./styles/app.css, but no file resolves from the importing file.',
                };
            }
            return {
                ok: false,
                error: '⚠️ تعذّر الوصول إلى محرّك الذكاء (لم يستجب أي مزوّد).',
            };
        }
    },
}));

const { ReactProjectTool } = require('../modules/tools/definitions/ReactProjectTool');

describe('React domain authoring preserves provider outages for orchestration recovery', () => {
    it('keeps the provider fallback inside the canonical engineering path', () => {
        const source = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf8');
        expect(source).toMatch(/context\?\.engineeringPipeline\s*===\s*true/);
        expect(source).toContain('request_derived_engine');
        expect(source).toContain('same QA gates');
        expect(source).toContain('allowProviderRetry: false');
    });

    it('does not repeat a long provider outage when a verified fallback exists', () => {
        const source = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'AIGeneratorTool.ts'), 'utf8');
        expect(source).toContain('context?.allowProviderRetry !== false');
        expect(source).toContain('engineering provider retry skipped');
    });

    it('returns the stable provider failure instead of domain_generation_failed', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-domain-provider-'));
        try {
            const result: any = await new ReactProjectTool().execute({
                request: 'Build a React weather application called WeatherGo with live forecasts.',
                skipInstall: true,
                root,
            }, { sessionId: 'domain-provider-failure-test', allowModelAuthoringInTest: true });

            expect(result.ok).toBe(false);
            expect(result.error).toMatch(/^⚠️ تعذّر الوصول إلى محرّك الذكاء/);
            expect(result.error).not.toBe('domain_generation_failed');
            expect(result.output?.path).toBeTruthy();
            expect(fs.existsSync(result.output.path)).toBe(true);
            expect(fs.existsSync(path.join(result.output.path, 'package.json'))).toBe(true);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    }, 120000);

    it('returns validation/import evidence instead of hiding it as a generic domain failure', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-domain-evidence-'));
        try {
            const result: any = await new ReactProjectTool().execute({
                request: 'PRESERVE_EVIDENCE: Build a React weather application called WeatherGo.',
                skipInstall: true,
                root,
            }, { sessionId: 'domain-evidence-failure-test', allowModelAuthoringInTest: true });

            expect(result.ok).toBe(false);
            expect(result.error).toMatch(/^unresolved_local_import:/);
            expect(result.error).toContain('./styles/app.css');
            expect(result.error).not.toBe('domain_generation_failed');
            expect(result.output?.path).toBeTruthy();
            expect(fs.existsSync(result.output.path)).toBe(true);
            expect(fs.existsSync(path.join(result.output.path, 'package.json'))).toBe(true);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    }, 120000);

});

export {};

