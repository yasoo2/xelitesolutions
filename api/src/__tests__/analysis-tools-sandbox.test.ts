/**
 * The analysis tools, and the alias layer in front of every tool.
 *
 * Joe had FOUR independently written path resolvers. Three were wrong, each in
 * its own way:
 *
 *   modules/tools/utils.ts        — fixed earlier; the one everything uses now
 *   SystemTools.ts                — absolute paths returned unchecked
 *   AnalysisTools.ts              — absolute unchecked AND no containment at all
 *   ToolService.ts (×3)           — `startsWith`, so a sibling prefix passed
 *
 * AnalysisTools is the one people are tempted to wave through, because these
 * tools only read. But analyze_codebase walks a directory and sends what it
 * finds to a model, so an unchecked path is not a read — it is an upload.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import { AnalyzeProjectTool, AnalyzeCodebaseTool, ProjectDetectTool } from '../modules/tools/definitions/AnalysisTools';
import { workspaceService } from '../modules/services/WorkspaceService';

const landsAt = (rel: string) => path.resolve(workspaceService.getActiveRoot(), rel);
const DIR = '__analysis_tools_test__';

afterAll(() => { try { fs.rmSync(landsAt(DIR), { recursive: true, force: true }); } catch { } });

describe('the analysis tools cannot be pointed outside the workspace', () => {
    const outside = [
        ['a system directory', '/etc'],
        ['a home directory that holds keys', '/root'],
        ['the system temp directory', os.tmpdir()],
        ['a traversal that climbs out', '../../../../../../etc'],
    ] as const;

    describe('analyze_project', () => {
        // This one did not even use the local resolver: it passed input.path
        // straight to the Analyst.
        it.each(outside)('refuses %s', async (_label, target) => {
            const res: any = await new AnalyzeProjectTool().execute({ path: target });
            expect(res.ok).toBe(false);
            expect(String(res.error)).toMatch(/path_outside_workspace/);
        });

        it('still analyses the workspace when given no path', async () => {
            const res: any = await new AnalyzeProjectTool().execute({});
            // The Analyst may or may not find anything worth reporting; what
            // matters is that a default path is not refused as an escape.
            expect(String(res.error || '')).not.toMatch(/path_outside_workspace/);
        });
    });

    describe('analyze_codebase', () => {
        it.each(outside)('refuses %s before reading anything', async (_label, target) => {
            const res: any = await new AnalyzeCodebaseTool().execute({ path: target });
            expect(res.ok).toBe(false);
            expect(String(res.error)).toMatch(/path_outside_workspace/);
            // The refusal must come from the gate, not from the model call
            // failing further down — those are different guarantees.
            expect(String(res.error)).not.toMatch(/provider|api key/i);
        });

        it('keeps treating a URL as a redirect rather than a path', async () => {
            const res: any = await new AnalyzeCodebaseTool().execute({ path: 'https://github.com/x/y' });
            expect(res.ok).toBe(true);
            expect(res.output.suggestedTool).toBe('browser_run');
        });
    });

    describe('project_detect', () => {
        it.each(outside)('refuses %s', async (_label, target) => {
            const res: any = await new ProjectDetectTool().execute({ path: target });
            expect(res.ok).toBe(false);
            expect(String(res.error)).toMatch(/path_outside_workspace/);
        });

        it('still detects a project that is genuinely inside the workspace', async () => {
            const dir = landsAt(path.join(DIR, 'proj'));
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"x"}', 'utf-8');

            const res: any = await new ProjectDetectTool().execute({ path: path.join(DIR, 'proj') });

            expect(res.ok).toBe(true);
            expect(JSON.stringify(res.output.nodeProjects)).toContain('proj');
        });
    });
});
