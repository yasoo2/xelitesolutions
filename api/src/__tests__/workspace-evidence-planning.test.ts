import fs from 'fs';
import os from 'os';
import path from 'path';

import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { workspaceService } from '../modules/services/WorkspaceService';

describe('planner workspace evidence enrichment', () => {
    let root: string;
    let project: string;
    let activeRootSpy: jest.SpiedFunction<typeof workspaceService.getActiveRoot>;
    let previousProjects: any;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-planner-evidence-'));
        project = path.join(root, 'customer-portal');
        fs.mkdirSync(path.join(project, 'src'), { recursive: true });
        fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({
            name: 'customer-portal',
            scripts: { test: 'vitest run', build: 'vite build' },
        }), 'utf8');
        fs.writeFileSync(path.join(project, 'src', 'main.tsx'), 'export default function App(){ return null; }\n', 'utf8');

        previousProjects = (global as any).joeProjects;
        (global as any).joeProjects = {
            'session-evidence': { dir: project, type: 'imported' },
        };
        activeRootSpy = jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(root);
    });

    afterEach(() => {
        activeRootSpy.mockRestore();
        (global as any).joeProjects = previousProjects;
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('fills review files and workspace-relative projectPath from the active project', () => {
        const steps: any[] = [{
            id: 'review-current-project',
            tool: 'code_reviewer',
            description: 'راجع المشروع الحالي بالتفصيل',
            input: {},
        }];

        const result = PlanningEngine.fillRequiredArgs(steps, 'راجع المشروع الحالي بالتفصيل', {
            sessionId: 'session-evidence',
            workspaceId: 'workspace-evidence',
        });

        expect(result[0].tool).toBe('code_reviewer');
        expect(result[0].input.projectPath).toBe('customer-portal');
        expect(result[0].input.files).toEqual(expect.arrayContaining(['src/main.tsx', 'package.json']));
    });

    it('fills the project path for unit verification without inventing a test command', () => {
        const steps: any[] = [{
            id: 'verify-current-project',
            tool: 'auto_tester',
            description: 'شغّل اختبارات الوحدة للمشروع الحالي',
            input: { testType: 'unit' },
        }];

        const result = PlanningEngine.fillRequiredArgs(steps, 'شغّل اختبارات الوحدة للمشروع الحالي', {
            sessionId: 'session-evidence',
            workspaceId: 'workspace-evidence',
        });

        expect(result[0].tool).toBe('auto_tester');
        expect(result[0].input.projectPath).toBe('customer-portal');
        expect(result[0].input.testType).toBe('unit');
    });

    it('does not manufacture review files when the workspace contains no reviewable evidence', () => {
        fs.rmSync(project, { recursive: true, force: true });
        (global as any).joeProjects = {};

        const steps: any[] = [{
            id: 'review-without-evidence',
            tool: 'code_reviewer',
            description: 'راجع المشروع الحالي',
            input: {},
        }];

        const result = PlanningEngine.fillRequiredArgs(steps, 'راجع المشروع الحالي', {
            sessionId: 'session-evidence',
            workspaceId: 'workspace-evidence',
        });

        expect(result[0].tool).toBe('central_answer');
        expect(result[0].input.question).toContain('files');
    });
});
