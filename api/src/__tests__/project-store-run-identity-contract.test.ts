import fs from 'fs';
import os from 'os';
import path from 'path';

import { loadJoeProjects, samePipelineRun, writeJoeProject } from '../api/page-store';
import { canSyncRuntimeProjectContext } from '../modules/tools/definitions/PhaseExecutorTool';

describe('joeProjects pipeline-run identity boundary', () => {
    let storeDir: string;
    const previousStoreDir = process.env.JOE_CHAT_STORE_DIR;

    beforeEach(() => {
        storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-project-store-identity-'));
        process.env.JOE_CHAT_STORE_DIR = storeDir;
        delete (global as any).joeProjects;
    });

    afterEach(() => {
        delete (global as any).joeProjects;
        fs.rmSync(storeDir, { recursive: true, force: true });
        if (previousStoreDir === undefined) delete process.env.JOE_CHAT_STORE_DIR;
        else process.env.JOE_CHAT_STORE_DIR = previousStoreDir;
    });

    it('writes an explicit run identity and never republishes a previous identity', () => {
        const first = writeJoeProject('session-a', { dir: '/tmp/old-project' }, 'run-old');
        expect(first.pipelineRunId).toBe('run-old');

        const current = writeJoeProject('session-a', { dir: '/tmp/current-project' });
        expect(current.dir).toBe('/tmp/current-project');
        expect(current.pipelineRunId).toBeNull();
        expect(Object.prototype.hasOwnProperty.call(current, 'pipelineRunId')).toBe(true);
        expect(samePipelineRun('run-old', current.pipelineRunId)).toBe(false);
    });

    it('accepts handoff only for the same non-null run id', () => {
        expect(samePipelineRun('run-a', 'run-a')).toBe(true);
        expect(samePipelineRun('run-a', 'run-b')).toBe(false);
        expect(samePipelineRun('run-a', null)).toBe(false);
        expect(samePipelineRun(null, null)).toBe(false);
        expect(samePipelineRun(undefined, 'run-a')).toBe(false);
    });

    it('rejects cross-run and legacy active roots, while accepting the same run', () => {
        expect(canSyncRuntimeProjectContext({ runId: 'run-new' }, { dir: '/tmp/old', pipelineRunId: 'run-old' }, 'run-new')).toBe(false);
        expect(canSyncRuntimeProjectContext({ runId: 'run-new' }, { dir: '/tmp/legacy', pipelineRunId: null }, 'run-new')).toBe(false);
        expect(canSyncRuntimeProjectContext({ runId: 'run-new' }, { dir: '/tmp/missing' }, 'run-new')).toBe(false);

        const current = writeJoeProject('session-current', { dir: '/tmp/current' }, 'run-new');
        expect(canSyncRuntimeProjectContext({ runId: 'run-new' }, current, 'run-new')).toBe(true);

        const source = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'PhaseExecutorTool.ts'), 'utf8');
        expect(source).toContain('if (!canSyncRuntimeProjectContext(projectContext, active, pipelineRunId))');
        expect(source).toContain('bindRuntimeProjectFromEvidence(toolName, toolArgs, toolResult, projectContext, executionContext.runId, logs)');
        expect(source).toContain('syncRuntimeProjectContext(projectContext, executionContext.runId, logs)');
    });

    it('marks disk-loaded legacy entries with an explicit null identity', () => {
        fs.writeFileSync(path.join(storeDir, 'joe-projects.json'), JSON.stringify({
            legacy: { dir: '/tmp/legacy-project', type: 'react' },
            owned: { dir: '/tmp/owned-project', type: 'react', pipelineRunId: 'run-owned' },
        }), 'utf8');

        loadJoeProjects();

        expect((global as any).joeProjects.legacy.pipelineRunId).toBeNull();
        expect((global as any).joeProjects.owned.pipelineRunId).toBe('run-owned');
        expect(samePipelineRun('run-owned', (global as any).joeProjects.legacy.pipelineRunId)).toBe(false);
    });

    it('keeps explicit resume behavior represented while enforcing the boundary', () => {
        const source = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf8');
        expect(source).toContain('resumeExisting');
        expect(source).toContain('samePipelineHandoff');
        expect(source).toContain('writeJoeProject(sessionKey');
    });

    it('has no production map-item writer outside page-store', () => {
        const sourceRoot = path.join(__dirname, '..');
        const offenders: string[] = [];
        const visit = (dir: string) => {
            for (const name of fs.readdirSync(dir)) {
                if (name === 'node_modules' || name === 'dist' || name.startsWith('zz-')) continue;
                const full = path.join(dir, name);
                const stat = fs.statSync(full);
                if (stat.isDirectory()) visit(full);
                else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) {
                    const text = fs.readFileSync(full, 'utf8');
                    for (const [index, line] of text.split('\n').entries()) {
                        if (/\b(?:joeProjects|projects)\[[^\]]+\]\s*=/.test(line) && !full.endsWith(path.join('api', 'page-store.ts'))) {
                            offenders.push(`${path.relative(sourceRoot, full)}:${index + 1}`);
                        }
                    }
                }
            }
        };
        visit(sourceRoot);
        expect(offenders).toEqual([]);
    });
});
