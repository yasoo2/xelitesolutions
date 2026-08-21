import fs from 'fs';
import path from 'path';

const callLLM = jest.fn();
jest.mock('../core/llm', () => ({
    callLLM: (...args: any[]) => callLLM(...args),
}));

import { executeTool } from '../modules/services/ToolService';
import { workspaceService } from '../modules/services/WorkspaceService';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';

describe('ToolService ai_write_file runtime-root contract', () => {
    let workspaceRoot: string;
    let boundProjectRoot: string;
    let activeRootSpy: jest.SpyInstance;

    beforeAll(() => {
        workspaceRoot = fs.mkdtempSync(path.join(workspaceService.externalRoot, 'joe-root-contract-workspace-'));
        boundProjectRoot = path.join(workspaceRoot, 'react-weathergo');
        fs.mkdirSync(boundProjectRoot, { recursive: true });
        fs.writeFileSync(path.join(boundProjectRoot, 'package.json'), JSON.stringify({
            name: 'react-weathergo',
            private: true,
        }), 'utf8');
        activeRootSpy = jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(workspaceRoot);
    });

    afterAll(() => {
        activeRootSpy?.mockRestore();
        fs.rmSync(workspaceRoot, { recursive: true, force: true });
    });

    beforeEach(() => {
        callLLM.mockReset();
        callLLM.mockResolvedValue('export default function App() { return <main>root-contract</main>; }');
    });

    it('resolves the logical project path inside the runtime-bound project root', async () => {
        const logicalPath = 'WeatherGo/src/App.tsx';
        const outsideWorkspaceProjectPath = path.join(workspaceRoot, logicalPath);
        const expectedBoundPath = path.join(boundProjectRoot, 'src/App.tsx');

        const result: any = await executionFirewall.runAsSystem(() => executeTool('ai_write_file', {
            path: logicalPath,
            description: 'Write the main React weather screen for the runtime-bound project.',
        }, {
            workspaceId: 'root-contract-workspace',
            projectRoot: boundProjectRoot,
            projectRootRuntimeBound: true,
            projectName: 'WeatherGo',
            engineeringPipeline: true,
        } as any));

        expect(result.ok).toBe(true);
        expect(callLLM).toHaveBeenCalledTimes(1);
        expect(fs.existsSync(outsideWorkspaceProjectPath)).toBe(false);
        expect(fs.existsSync(expectedBoundPath)).toBe(true);
        expect(fs.readFileSync(expectedBoundPath, 'utf8')).toContain('root-contract');
    });
});

