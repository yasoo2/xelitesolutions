import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { asksToOpenTheActiveApp, localLivePreviewFor } from '../modules/tools/definitions/BrowserRunTool';
import fs from 'fs';
import os from 'os';
import path from 'path';

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

    test('falls back to Joe project-preview when a completed build has no live process', () => {
        const sessionId = `browser-static-${Date.now()}`;
        const before = { ...(((global as any).joeProjects || {}) as Record<string, any>) };
        const key = sessionId.replace(/[^a-zA-Z0-9._-]/g, '_');
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-preview-'));
        fs.mkdirSync(path.join(dir, 'dist'));
        fs.writeFileSync(path.join(dir, 'dist', 'index.html'), '<!doctype html><title>QA</title>');
        (global as any).joeProjects = {
            ...before,
            [key]: { dir, type: 'react', live: undefined },
        };
        try {
            expect(localLivePreviewFor(sessionId)).toBe(`http://localhost:${process.env.PORT || '5002'}/project-preview/${key}/index.html`);
        } finally {
            (global as any).joeProjects = before;
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    test('keeps multi-action browser QA in the live browser workflow', async () => {
        const p = await plan('Use the browser to test a local app: exercise every visible button and form field, capture console and network failures, and report the exact failing control.');
        expect(p.steps[0].tool).toBe('browser_run');
        expect(p.steps[0].agent).toBe('Browser');
    });

    test('does not reduce a browser e-commerce flow to a search-only action', async () => {
        const p = await plan('Use the browser to validate an e-commerce flow: search, open a product, add it to the cart, change quantity, remove it, and verify the total.');
        expect(p.steps[0].tool).toBe('browser_run');
    });

    test('routes an explicit repair of the active project to the same project', async () => {
        const sessionId = `repair-route-${Date.now()}`;
        const key = sessionId.replace(/[^a-zA-Z0-9._-]/g, '_');
        const before = { ...(((global as any).joeProjects || {}) as Record<string, any>) };
        (global as any).joeProjects = {
            ...before,
            [key]: { dir: 'C:/workspace/repair-me', type: 'react', updatedAt: Date.now() },
        };
        try {
            const p = await PlanningEngine.generatePlan(
                { intent: { goal: 'Repair the existing project and preserve its files.', complexity: 'medium', riskLevel: 'low', rawIntent: {} } as any },
                sessionId,
                { sessionId },
            );
            expect(p.steps[0].tool).toBe('project_repair');
            expect(p.steps[0].input).toMatchObject({
                projectDir: 'C:/workspace/repair-me',
                auditDir: 'C:\\workspace\\repair-me\\dist',
            });
        } finally {
            (global as any).joeProjects = before;
        }
    });

    test('keeps a new build with an embedded QA repair loop out of project_repair', async () => {
        const sessionId = `build-qa-route-${Date.now()}`;
        const key = sessionId.replace(/[^a-zA-Z0-9._-]/g, '_');
        const before = { ...(((global as any).joeProjects || {}) as Record<string, any>) };
        (global as any).joeProjects = {
            ...before,
            [key]: { dir: 'C:/workspace/older-project', type: 'react', updatedAt: Date.now() },
        };
        const goal = 'أنشئ تطبيقًا صغيرًا لإدارة مواعيد عيادة باسم موعدي مع نموذج هاتف وتاريخ. ابنِ التطبيق وشغّل المعاينة، ثم اختبر الحقول والأزرار على الهاتف، وأصلح أي مشكلة حقيقية قبل التقرير.';
        try {
            const p = await PlanningEngine.generatePlan(
                { intent: { goal, complexity: 'high', riskLevel: 'medium', rawIntent: {} } as any },
                sessionId,
                { sessionId },
            );
            expect(p.steps[0].tool).not.toBe('project_repair');
            expect(['project_pipeline', 'react_project']).toContain(p.steps[0].tool);
        } finally {
            (global as any).joeProjects = before;
        }
    });

    test('uses an explicit project path when the session registry was restarted', async () => {
        const sessionId = `repair-path-${Date.now()}`;
        const p = await PlanningEngine.generatePlan(
            {
                intent: {
                    goal: 'Repair the existing project at C:\\workspace\\repair-me in place. Preserve its files and rebuild it.',
                    complexity: 'medium',
                    riskLevel: 'low',
                    rawIntent: {},
                },
            } as any,
            sessionId,
            { sessionId },
        );
        expect(p.steps[0].tool).toBe('project_repair');
        expect(p.steps[0].input).toMatchObject({
            projectDir: 'C:\\workspace\\repair-me',
            auditDir: 'C:\\workspace\\repair-me\\dist',
        });
    });
});
