import fs from 'fs';
import path from 'path';

const ROUTER = fs.readFileSync(path.join(__dirname, '..', 'core', 'llm', 'intelligent-router.ts'), 'utf8');

describe('offline local provider deadline', () => {
    it('keeps one real Ollama attempt bounded instead of waiting ten minutes', () => {
        expect(ROUTER).toContain('OFFLINE_LOCAL_TIMEOUT_MS');
        expect(ROUTER).toMatch(/OFFLINE_LOCAL_TIMEOUT_MS[\s\S]{0,500}45_000/);
        expect(ROUTER).toContain("if (offlineMode && p.name === 'Local (Auto)')");
        expect(ROUTER).toContain('timeoutValue = Math.min(timeoutValue, OFFLINE_LOCAL_TIMEOUT_MS);');
    });

    it('allows a bounded environment override without accepting an unsafe value', () => {
        expect(ROUTER).toContain('Math.min(120_000, Math.max(10_000, configured))');
    });
});
