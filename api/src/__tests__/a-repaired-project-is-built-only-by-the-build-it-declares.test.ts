/**
 * Eval 2026-10-27, P001-landing-ar (run-1793086226335): the scope repair
 * rewrote src/app.js, and the post-repair proof then ran «npm run build» on a
 * project whose manifest declares only `start: npx serve src`. npm answered
 * «Missing script: "build"», the rerun ended partial and the repair counted as
 * failed although project_run had just started the repaired site.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { phaseAfterRepair } from '../modules/services/SelfFixExecutionService';

const roots: string[] = [];
afterAll(() => { for (const root of roots) fs.rmSync(root, { recursive: true, force: true }); });

function repairedProject(manifest: string): { root: string; file: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-post-repair-build-'));
  roots.push(root);
  fs.writeFileSync(path.join(root, 'package.json'), manifest);
  const file = path.join(root, 'src', 'app.js');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'export {};\n');
  return { root, file };
}

function rerunAfterEditing(file: string) {
  return phaseAfterRepair({
    phaseNumber: 3,
    name: 'Integration and QA',
    tasks: [{ task: 'Update main app', tool: 'file_edit', args: { filename: 'src/app.js', path: file, find: 'x', replace: 'y' } }],
  }, file);
}

describe('a repaired project is built only by the build it declares', () => {
  it('a build-free project is proven by its start alone, never by a build it does not have', () => {
    const { root, file } = repairedProject(JSON.stringify({ name: 'clinic-landing-ar', scripts: { start: 'npx serve src' } }));
    const after = rerunAfterEditing(file);
    expect(after.phase.name).toContain('post-repair verification');
    expect(after.phase.tasks).toEqual([
      { task: 'Verify the repaired project can start', tool: 'project_run', args: { cwd: root } },
    ]);
  });

  it('a project that declares a build is still built before it is started', () => {
    const { root, file } = repairedProject(JSON.stringify({ name: 'site', scripts: { build: 'vite build', start: 'vite preview' } }));
    const after = rerunAfterEditing(file);
    expect(after.phase.tasks.map((task: any) => [task.tool, task.args.command || ''])).toEqual([
      ['shell_execute', 'npm run build'],
      ['project_run', ''],
    ]);
    expect(after.phase.tasks[0].args.cwd).toBe(root);
  });

  it('an empty build script is no build', () => {
    const { file } = repairedProject(JSON.stringify({ name: 'site', scripts: { build: '  ', start: 'node server.js' } }));
    expect(rerunAfterEditing(file).phase.tasks.map((task: any) => task.tool)).toEqual(['project_run']);
  });

  it('a manifest that cannot be read keeps the build, so npm reports the real error', () => {
    const { file } = repairedProject('{ not json');
    expect(rerunAfterEditing(file).phase.tasks.map((task: any) => task.tool)).toEqual(['shell_execute', 'project_run']);
  });
});
