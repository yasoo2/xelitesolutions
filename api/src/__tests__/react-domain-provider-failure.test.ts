import fs from 'fs';
import os from 'os';
import path from 'path';

jest.mock('../modules/tools/definitions/AIGeneratorTool', () => ({
    AIGeneratorTool: class {
        async execute() {
            return {
                ok: false,
                error: '⚠️ تعذّر الوصول إلى محرّك الذكاء (لم يستجب أي مزوّد).',
            };
        }
    },
}));

const { ReactProjectTool } = require('../modules/tools/definitions/ReactProjectTool');

describe('React domain authoring preserves provider outages for orchestration recovery', () => {
    it('returns the stable provider failure instead of domain_generation_failed', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-domain-provider-'));
        try {
            const result: any = await new ReactProjectTool().execute({
                request: 'Build a React weather application called WeatherGo with live forecasts.',
                skipInstall: true,
                root,
            }, { sessionId: 'domain-provider-failure-test' });

            expect(result.ok).toBe(false);
            expect(result.error).toMatch(/^⚠️ تعذّر الوصول إلى محرّك الذكاء/);
            expect(result.error).not.toBe('domain_generation_failed');
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    }, 120000);
});

export {};

