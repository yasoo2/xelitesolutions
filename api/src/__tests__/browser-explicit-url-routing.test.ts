import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { asksToOpenTheActiveApp, localLivePreviewFor } from '../modules/tools/definitions/BrowserRunTool';

const plan = (goal: string) =>
    PlanningEngine.generatePlan({
        intent: { goal, complexity: 'low', riskLevel: 'low', rawIntent: {} } as any,
    });

describe('explicit URL browser routing', () => {
    test('opens a URL before reading its title instead of searching an empty page', async () => {
        const p = await plan('استخدم متصفح Joe لفتح https://example.com واقرأ عنوان الصفحة فقط. لا تسجل دخولاً ولا تنفذ أي إجراء آخر.');

        expect(p.steps).toHaveLength(1);
        expect(p.steps[0].tool).toBe('browser_launch');
        expect(p.steps[0].input).toMatchObject({ url: 'https://example.com' });
        expect(p.steps[0].description).toContain('عنوان الصفحة');
    });

    test('a request to summarize page content is not swallowed by the title-only open path', async () => {
        const p = await plan('افتح https://example.com ثم لخّص محتوى الصفحة.');

        expect(p.steps[0].tool).toBe('browser_readability');
        expect(p.steps[0].input).toMatchObject({ url: 'https://example.com' });
    });
});

describe('active live preview browser routing', () => {
    test('resolves an application QA request to the session live preview', () => {
        const sessionId = `browser-route-${Date.now()}`;
        const before = { ...(((global as any).joeProjects || {}) as Record<string, any>) };
        const key = sessionId.replace(/[^a-zA-Z0-9._-]/g, '_');
        (global as any).joeProjects = {
            ...before,
            [key]: { dir: process.cwd(), live: { url: 'http://localhost:4311/', port: 4311, pid: process.pid } },
        };
        try {
            expect(asksToOpenTheActiveApp('Open the application in a real browser and verify that it loads correctly.')).toBe(true);
            expect(localLivePreviewFor(sessionId)).toBe('http://localhost:4311/');
        } finally {
            (global as any).joeProjects = before;
        }
    });

    test('does not hijack explicit search intent even when a live app exists', () => {
        expect(asksToOpenTheActiveApp('Search Google for the latest browser documentation.')).toBe(false);
        expect(asksToOpenTheActiveApp('Search the web for the latest browser documentation.')).toBe(false);
        expect(asksToOpenTheActiveApp('افتح جوجل وابحث عن Vite')).toBe(false);
    });

    test('routes in-app QA search steps to the active live preview', () => {
        expect(asksToOpenTheActiveApp('Search Istanbul inside the running WeatherGo app.')).toBe(true);
        expect(asksToOpenTheActiveApp('Search another real city.')).toBe(true);
        expect(asksToOpenTheActiveApp('Add Istanbul to favorites in the app.')).toBe(true);
    });
});
