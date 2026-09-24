import fs from 'fs';
import os from 'os';
import path from 'path';
import { ProjectRuntimeGuideTool } from '../modules/tools/definitions/ProjectRunTool';

describe('project_runtime_guide', () => {
    test('reads declared startup evidence without starting a process or changing a project', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-runtime-guide-'));
        try {
            fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
                name: 'guide-fixture',
                scripts: { dev: 'vite --host 127.0.0.1', test: 'vitest run' },
                devDependencies: { vite: '5.0.0' },
            }));
            const result: any = await new ProjectRuntimeGuideTool().execute(
                { cwd: root, projectQuery: 'كيف أشغّل التطبيق؟' },
                { language: 'ar', sessionId: `runtime-guide-${Date.now()}` },
            );
            expect(result.ok).toBe(true);
            expect(result.output.command).toBe('npm run dev');
            expect(result.output.scripts).toEqual(expect.objectContaining({ dev: 'vite --host 127.0.0.1' }));
            expect(result.output.summary).toContain('لم أبدأ خادماً');
            expect(result.logs.join('\n')).toContain('read-only contract');
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    test('turns an absent project into a bounded selection result, never a repair candidate', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-runtime-guide-empty-'));
        try {
            const result: any = await new ProjectRuntimeGuideTool().execute(
                { cwd: root, projectQuery: 'how do I run the project?' },
                { language: 'en', sessionId: `runtime-guide-empty-${Date.now()}` },
            );
            expect(result.ok).toBe(false);
            expect(result.output).toMatchObject({ requiresUserDecision: true });
            expect(result.output.summary).toContain('No runnable project');
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});
