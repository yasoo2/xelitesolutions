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
    fs.mkdirSync(path.join(project, 'src', '__tests__'), { recursive: true });
    fs.writeFileSync(path.join(project, 'src', '__tests__', 'main.test.ts'), 'test("smoke", () => expect(true).toBe(true));\n');
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
    expect(result.output.evidence.selectedProject.testFiles).toContain(path.join(project, 'src', '__tests__', 'main.test.ts'));
    expect(result.output.evidence.constraints.forbidDeploy).toBe(true);
    expect(fs.readFileSync(path.join(project, 'package.json'), 'utf8')).toBe(before);
  });

  test('recognizes an incomplete existing project root so repair can restore its missing manifest', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-incomplete-repair-'));
    roots.push(root);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'index.ts'), 'export const ready = true;\n');
    fs.writeFileSync(path.join(root, 'tests', 'smoke.test.ts'), 'test("smoke", () => expect(true).toBe(true));\n');

    const result: any = await new EngineeringDiscoveryTool().execute({
      request: 'Repair the existing project locally and restore the missing runnable manifest. Do not deploy.',
    }, { workspaceRoot: root });

    expect(result.ok).toBe(true);
    expect(result.output.evidence.mode).toBe('existing_workspace');
    expect(result.output.evidence.selectedProject.root).toBe(root);
    expect(result.output.evidence.selectedProject.manifests).toEqual([]);
    expect(result.output.evidence.selectedProject.likelyEntrypoints).toContain(path.join(root, 'src', 'index.ts'));
    expect(result.output.evidence.selectedProject.testFiles).toContain(path.join(root, 'tests', 'smoke.test.ts'));
    expect(result.output.evidence.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'workspace.incomplete_project' }),
    ]));
    expect(result.output.evidence.blockers).toEqual([]);
  });

  test('binds the same incomplete root when a greenfield run enters bounded live-run repair', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-live-repair-root-'));
    roots.push(root);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'index.ts'), 'export const ready = true;\n');
    fs.writeFileSync(path.join(root, 'tests', 'smoke.test.ts'), 'test("smoke", () => expect(true).toBe(true));\n');

    const greenfield: any = await new EngineeringDiscoveryTool().execute({
      request: 'Build a production-grade platform locally as a new project. First inspect existing infrastructure for read-only evidence. Do not deploy.',
    }, { workspaceRoot: root });
    expect(greenfield.output.evidence.mode).toBe('greenfield');
    expect(greenfield.output.evidence.selectedProject).toBeUndefined();

    const repair: any = await new EngineeringDiscoveryTool().execute({
      request: [
        'Repair the current project in place after a failed live-run acceptance check.',
        'Treat the existing workspace root as the write target for this bounded repair.',
        'Original build request: Build a production-grade platform locally as a new project. Do not deploy.',
        'Observed live-run failure: no runnable project was found.',
      ].join('\\n'),
    }, { workspaceRoot: root });
    expect(repair.output.evidence.mode).toBe('existing_workspace');
    expect(repair.output.evidence.selectedProject.root).toBe(root);
    expect(repair.output.evidence.selectedProject.manifests).toEqual([]);
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
  });

  /**
   * This pair used to also ban `tool: 'api_project'` and `tool: 'react_project'`
   * from this file — and that ban is precisely what left the system with
   * nothing to do when no model answered. A generic builder is not a product
   * foundation: it carries no product name, no stored business template, and
   * it reads the request. Banning it did not protect the evidence-first rule,
   * it removed the only plan a dead provider mesh can still produce.
   *
   * The invariant worth keeping is narrower and is asserted here: the planner
   * owns the normal path, and the deterministic builders may appear only
   * BEHIND it, as the fallback for when it cannot be reached.
   */
  test('the deterministic builders are a fallback behind the planner, never the primary route', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectPipelineTool.ts'), 'utf8');
    const plannerIndex = source.indexOf("executeTool('project_planner'");
    const fallbackIndex = source.indexOf('deterministicPhasesFor(request)');

    expect(fallbackIndex).toBeGreaterThan(plannerIndex);
    // …and it is reached only after the planner has actually failed.
    expect(source).toContain('if (!plannerResult?.ok || plannerResult?.output?.fallback)');
    // …and only for a request that creates something new, so it can never
    // scaffold on top of a project the user asked to be modified.
    expect(source).toContain('evidence?.constraints?.createsNewProject');
  });

  test('does not mistake greenfield preflight language for an existing-project target', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-greenfield-multi-'));
    roots.push(root);
    for (const name of ['alpha', 'beta']) {
      fs.mkdirSync(path.join(root, name), { recursive: true });
      fs.writeFileSync(path.join(root, name, 'package.json'), JSON.stringify({ name, scripts: { test: 'npm test' } }));
    }

    const result: any = await new EngineeringDiscoveryTool().execute({
      request: 'Build a production-grade platform. First inspect the existing project and reuse working infrastructure where appropriate. Do not unnecessarily rewrite working infrastructure.',
    }, { workspaceRoot: root });

    expect(result.ok).toBe(true);
    expect(result.output.evidence.mode).toBe('greenfield');
    expect(result.output.evidence.constraints.createsNewProject).toBe(true);
    expect(result.output.evidence.constraints.userRequestedExistingProject).toBe(false);
    expect(result.output.evidence.blockers).toEqual([]);
    expect(result.output.evidence.selectedProject).toBeUndefined();
    expect(result.output.evidence.referenceProjects).toHaveLength(2);
    expect(result.output.evidence.referenceProjects).toEqual(expect.arrayContaining([
      expect.objectContaining({ projectKinds: ['node'], manifests: [expect.objectContaining({ kind: 'package.json' })] }),
    ]));
    expect(result.output.evidence.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'workspace.reference_projects' }),
    ]));
  });

  test('does not select the only existing project as a greenfield write target', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-greenfield-single-'));
    roots.push(root);
    fs.mkdirSync(path.join(root, 'existing-app', 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'existing-app', 'package.json'), JSON.stringify({ name: 'existing-app' }));
    fs.writeFileSync(path.join(root, 'existing-app', 'src', 'index.ts'), 'export const existing = true;');

    const result: any = await new EngineeringDiscoveryTool().execute({
      request: 'Build a new platform locally. Inspect the existing project only for useful architecture evidence. Do not modify it.',
    }, { workspaceRoot: root });

    expect(result.ok).toBe(true);
    expect(result.output.evidence.mode).toBe('greenfield');
    expect(result.output.evidence.selectedProject).toBeUndefined();
    expect(result.output.evidence.referenceProjects).toHaveLength(1);
    expect(result.output.evidence.referenceProjects[0].root).toBe(path.join(root, 'existing-app'));
    expect(result.output.evidence.constraints.createsNewProject).toBe(true);
  });

  test('keeps an explicit mutation of an existing project decision-bound', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-existing-multi-'));
    roots.push(root);
    for (const name of ['alpha', 'beta']) {
      fs.mkdirSync(path.join(root, name), { recursive: true });
      fs.writeFileSync(path.join(root, name, 'package.json'), JSON.stringify({ name }));
    }

    const result: any = await new EngineeringDiscoveryTool().execute({
      request: 'Improve the existing project locally without deployment.',
    }, { workspaceRoot: root });

    expect(result.ok).toBe(true);
    expect(result.output.evidence.mode).toBe('ambiguous');
    expect(result.output.evidence.constraints.createsNewProject).toBe(false);
    expect(result.output.evidence.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'multiple_projects' }),
    ]));
  });
});


describe('local specification evidence', () => {
  const roots: string[] = [];
  afterEach(() => {
    while (roots.length) fs.rmSync(roots.pop()!, { recursive: true, force: true });
  });

  test('records a local specification with its complete line count without treating it as a project manifest', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-spec-evidence-'));
    roots.push(root);
    fs.writeFileSync(path.join(root, 'platform_specification.txt'), 'Requirement one\nRequirement two\nRequirement three\n');

    const result: any = await new EngineeringDiscoveryTool().execute({
      request: 'Read the local specification then implement it locally without deployment.',
    }, { workspaceRoot: root });

    expect(result.ok).toBe(true);
    expect(result.output.evidence.mode).toBe('greenfield');
    expect(result.output.evidence.instructionFiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ relativePath: 'platform_specification.txt', lineCount: 4 }),
    ]));
    const specification = result.output.evidence.instructionFiles.find((file: any) => file.relativePath === 'platform_specification.txt');
    expect(specification).toBeDefined();
    expect(specification).not.toHaveProperty('path');
    expect(path.isAbsolute(specification.relativePath)).toBe(false);
  });

  test('reads a discovered local specification through read_file before asking the planner to plan', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectPipelineTool.ts'), 'utf8');
    const specificationRead = source.indexOf('await this.readRequestedSpecifications(request, evidence, context, logs, say, isAr)');
    const planner = source.search(/(?:const|let) plannerResult[^\n]*executeTool\('project_planner'/);

    expect(specificationRead).toBeGreaterThanOrEqual(0);
    expect(planner).toBeGreaterThan(specificationRead);
    expect(source).toContain("executeTool('read_file'");
    expect(source).toContain('Reading complete local specification');
    expect(source).toContain('instructionFiles');
  });
});
