import fs from 'fs';
import os from 'os';
import path from 'path';
import { EngineeringDiscoveryTool } from '../modules/tools/definitions/EngineeringDiscoveryTool';

describe('evidence-first engineering discovery', () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
  });

  test('inspects an existing project and declared checks without changing any file', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-discovery-'));
    roots.push(root);
    const project = path.join(root, 'customer-portal');
    fs.mkdirSync(path.join(project, 'src'), { recursive: true });
    fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({
      name: 'customer-portal',
      scripts: { test: 'vitest run', build: 'vite build', lint: 'eslint .' },
    }, null, 2));
    fs.writeFileSync(path.join(project, 'src', 'main.tsx'), 'export {};\n');
    const before = fs.readFileSync(path.join(project, 'package.json'), 'utf8');

    const result: any = await new EngineeringDiscoveryTool().execute({
      request: 'Fix the existing customer portal locally. Do not deploy or publish.',
    }, { workspaceRoot: root });

    expect(result.ok).toBe(true);
    expect(result.output.evidence.mode).toBe('existing_workspace');
    expect(result.output.evidence.selectedProject.root).toBe(project);
    expect(result.output.evidence.selectedProject.projectKinds).toContain('node');
    expect(result.output.evidence.selectedProject.candidateChecks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'test', command: 'npm run test' }),
      expect.objectContaining({ kind: 'build', command: 'npm run build' }),
      expect.objectContaining({ kind: 'lint', command: 'npm run lint' }),
    ]));
    expect(result.output.evidence.constraints.forbidDeploy).toBe(true);
    expect(fs.readFileSync(path.join(project, 'package.json'), 'utf8')).toBe(before);
  });

  test('reads a Python project through its own manifests and declared local tests, not a Node template', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-python-evidence-'));
    roots.push(root);
    const project = path.join(root, 'forecast-engine');
    fs.mkdirSync(path.join(project, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(project, 'pyproject.toml'), '[project]\nname = "forecast-engine"\n');
    fs.writeFileSync(path.join(project, 'main.py'), 'print("ready")\n');
    fs.writeFileSync(path.join(project, 'tests', 'test_smoke.py'), 'import unittest\n');

    const result: any = await new EngineeringDiscoveryTool().execute({
      request: 'Improve the existing forecasting service locally without deployment.',
    }, { workspaceRoot: root });

    expect(result.ok).toBe(true);
    expect(result.output.evidence.selectedProject.projectKinds).toContain('python');
    expect(result.output.evidence.selectedProject.candidateChecks).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'test', command: 'python -m unittest discover -s tests' }),
    ]));
    expect(result.output.evidence.selectedProject.projectKinds).not.toContain('node');
  });

  test('does not pretend a GitHub URL was cloned or choose a replacement template', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-remote-evidence-'));
    roots.push(root);

    const result: any = await new EngineeringDiscoveryTool().execute({
      request: 'Clone https://github.com/example/unfamiliar-service and inspect its tests before changing it.',
    }, { workspaceRoot: root });

    expect(result.ok).toBe(true);
    expect(result.output.evidence.mode).toBe('remote_repository');
    expect(result.output.evidence.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'remote_not_cloned' }),
    ]));
    expect(fs.readdirSync(root)).toEqual([]);
  });

  test('project pipeline cannot dispatch a product-named request directly to a product foundation', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectPipelineTool.ts'), 'utf8');
    const discoveryIndex = source.indexOf("executeTool('engineering_discovery'");
    const plannerIndex = source.indexOf("executeTool('project_planner'");

    expect(discoveryIndex).toBeGreaterThanOrEqual(0);
    expect(plannerIndex).toBeGreaterThan(discoveryIndex);
    expect(source).not.toContain("executeTool('orion_business_foundation'");
    expect(source).not.toContain("executeTool('enterprise_platform_foundation'");
    expect(source).not.toContain("tool: 'api_project'");
    expect(source).not.toContain("tool: 'react_project'");
  });
});
