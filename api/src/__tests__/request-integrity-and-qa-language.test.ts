import fs from 'fs';
import path from 'path';
import { valueFor } from '../core/quality/behaviour-audit';

const source = (...parts: string[]) => fs.readFileSync(
    path.join(__dirname, '..', ...parts),
    'utf8',
);

describe('request integrity and browser QA language', () => {
    it('hands the complete user goal to the product pipeline', () => {
        const orchestrator = source('orchestration', 'AgentOrchestrator.ts');
        expect(orchestrator).toMatch(
            /if \(node\.tool === 'project_pipeline'\)[\s\S]{0,180}nodeInput\.request = goalText;/,
        );
    });

    it('hands the canonical project identity to both full-stack builders', () => {
        const phaseExecutor = source('modules', 'tools', 'definitions', 'PhaseExecutorTool.ts');
        expect(phaseExecutor).toContain("['api_project', 'react_project'].includes(toolName)");
        expect(source('modules', 'tools', 'definitions', 'ApiProjectTool.ts'))
            .toContain("projectName: { type: 'string'");
    });

    it('does not inject bilingual QA residue into user data', () => {
        expect(valueFor('textarea', 'textarea', 'run', 'en'))
            .toBe('Joe self-QA test message.');
        expect(valueFor('textarea', 'textarea', 'run', 'ar'))
            .toBe('رسالة اختبار من فحص الجودة الذاتي في جو.');
        expect(valueFor('text', 'input', 'run', 'en')).toBe('Joe QA');
        expect(valueFor('text', 'input', 'run', 'ar')).toBe('اختبار جو');
    });
});
