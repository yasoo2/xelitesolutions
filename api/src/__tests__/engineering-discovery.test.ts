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
    const fallbackIndex = source.indexOf('deterministicPhasesFor(productRequest)');

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

  test('does not select a same-named artifact for a new greenfield build', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-greenfield-same-name-'));
    roots.push(root);
    const stale = path.join(root, 'WeatherGo');
    fs.mkdirSync(path.join(stale, 'src'), { recursive: true });
    fs.writeFileSync(path.join(stale, 'package.json'), JSON.stringify({ name: 'weathergo', scripts: { build: 'vite build' } }));
    fs.writeFileSync(path.join(stale, 'src', 'main.tsx'), 'export {}\\n');

    const result: any = await new EngineeringDiscoveryTool().execute({
      request: 'Build a new browser application called WeatherGo locally. Create it in a fresh directory and do not modify the existing WeatherGo project.',
    }, { workspaceRoot: root, sessionId: 'greenfield-same-name-chat' });

    expect(result.ok).toBe(true);
    expect(result.output.evidence.mode).toBe('greenfield');
    expect(result.output.evidence.constraints.createsNewProject).toBe(true);
    expect(result.output.evidence.selectedProject).toBeUndefined();
    expect(result.output.evidence.referenceProjects).toEqual([
      expect.objectContaining({ root: stale }),
    ]);
  });

  test('treats the live shell-contract phrase as a greenfield constraint, not a stale write target', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-live-shell-contract-'));
    roots.push(root);
    const staleRoots = ['react-weathergo', 'react-weathergo-266a'].map((name) => path.join(root, name));
    for (const stale of staleRoots) {
      fs.mkdirSync(path.join(stale, 'src'), { recursive: true });
      fs.writeFileSync(path.join(stale, 'package.json'), JSON.stringify({ name: path.basename(stale), scripts: { build: 'vite build' } }));
      fs.writeFileSync(path.join(stale, 'src', 'main.tsx'), `export const stale = ${JSON.stringify(path.basename(stale))};\\n`);
    }
    const before = staleRoots.map((stale) => fs.readFileSync(path.join(stale, 'src', 'main.tsx'), 'utf8'));

    const result: any = await new EngineeringDiscoveryTool().execute({
      request: [
        'Build a production-ready React TypeScript weather application called WeatherGo.',
        'Keep the existing Joe app shell contract and use the existing runtime infrastructure as a compatibility constraint.',
        'Do not silently select or modify any discovered project; create the new app in a fresh directory.',
      ].join(' '),
    }, { workspaceRoot: root, sessionId: 'live-shell-contract-chat' });

    expect(result.ok).toBe(true);
    expect(result.output.evidence.mode).toBe('greenfield');
    expect(result.output.evidence.constraints.createsNewProject).toBe(true);
    expect(result.output.evidence.constraints.userRequestedExistingProject).toBe(false);
    expect(result.output.evidence.selectedProject).toBeUndefined();
    expect(result.output.evidence.blockers).toEqual([]);
    expect(result.output.evidence.referenceProjects).toEqual(expect.arrayContaining(
      staleRoots.map((stale) => expect.objectContaining({ root: stale })),
    ));
    expect(staleRoots.map((stale) => fs.readFileSync(path.join(stale, 'src', 'main.tsx'), 'utf8'))).toEqual(before);
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

  test('explicitly named React target outranks an excluded API sibling in a fresh chat', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-explicit-weathergo-'));
    roots.push(root);
    const api = path.join(root, 'api-weathergo-a587');
    const react = path.join(root, 'react-weathergo-a587');
    fs.mkdirSync(path.join(api, 'src'), { recursive: true });
    fs.writeFileSync(path.join(api, 'package.json'), JSON.stringify({ name: 'api-weathergo', scripts: { start: 'node server.js' } }));
    fs.writeFileSync(path.join(api, 'server.js'), 'console.log("api");\n');
    fs.mkdirSync(path.join(react, 'src'), { recursive: true });
    fs.mkdirSync(path.join(react, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(react, 'package.json'), JSON.stringify({ name: 'weathergo', scripts: { build: 'vite build', test: 'node --test scripts/smoke-test.test.mjs' } }));
    fs.writeFileSync(path.join(react, 'src', 'main.tsx'), 'export {};\n');
    fs.writeFileSync(path.join(react, 'scripts', 'smoke-test.test.mjs'), 'import assert from "node:assert/strict"; assert.equal(true, true);\n');

    const result: any = await new EngineeringDiscoveryTool().execute({
      request: 'Continue by repairing the existing WeatherGo application in the current workspace. Target the exact existing project named react-weathergo-a587 (the React WeatherGo app), not api-weathergo-a587 and not any other project. Run its real build and test; do not create MyApp2.',
    }, { workspaceRoot: root, sessionId: 'fresh-explicit-weathergo-chat' });

    expect(result.ok).toBe(true);
    expect(result.output.evidence.mode).toBe('existing_workspace');
    expect(result.output.evidence.selectedProject.root).toBe(react);
    expect(result.output.evidence.blockers).toEqual([]);
    expect(result.output.evidence.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'workspace.selected_project_by_explicit_name' }),
    ]));
  });

  test('selects a named runnable React project across a fresh chat instead of blocking on API/UI siblings', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-named-project-'));
    roots.push(root);
    const api = path.join(root, 'api-weathergo');
    const react = path.join(root, 'react-weathergo-a587');
    fs.mkdirSync(path.join(api, 'src'), { recursive: true });
    fs.writeFileSync(path.join(api, 'package.json'), JSON.stringify({ name: 'api-weathergo', scripts: { start: 'node server.js' } }));
    fs.writeFileSync(path.join(api, 'server.js'), 'console.log("api");\n');
    fs.mkdirSync(path.join(react, 'src'), { recursive: true });
    fs.mkdirSync(path.join(react, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(react, 'package.json'), JSON.stringify({ name: 'weathergo', scripts: { build: 'vite build', test: 'node --test scripts/smoke-test.test.mjs' } }));
    fs.writeFileSync(path.join(react, 'src', 'main.tsx'), 'export {};\n');
    fs.writeFileSync(path.join(react, 'scripts', 'smoke-test.test.mjs'), 'import assert from "node:assert/strict"; assert.equal(true, true);\n');

    const result: any = await new EngineeringDiscoveryTool().execute({
      request: 'Continue the WeatherGo task from the current generated project. Fix the existing React mobile application in place, run its build and test, and do not create MyApp2.',
    }, { workspaceRoot: root, sessionId: 'fresh-weathergo-chat' });

    expect(result.ok).toBe(true);
    expect(result.output.evidence.mode).toBe('existing_workspace');
    expect(result.output.evidence.selectedProject.root).toBe(react);
    expect(result.output.evidence.blockers).toEqual([]);
    expect(result.output.evidence.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'workspace.selected_project_by_name' }),
    ]));
  });

  test('does not hide an explicitly named target after the first 24 workspace projects', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-discovery-breadth-'));
    roots.push(root);
    for (let index = 0; index < 30; index += 1) {
      const project = path.join(root, `legacy-project-${String(index).padStart(2, '0')}`);
      fs.mkdirSync(path.join(project, 'src'), { recursive: true });
      fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({
        name: path.basename(project),
        scripts: { test: 'node --test', build: 'node -e "process.exit(0)"' },
      }));
      fs.writeFileSync(path.join(project, 'src', 'index.js'), 'module.exports = {};\n');
    }
    const target = path.join(root, 'react-weathergo-a587');
    fs.mkdirSync(path.join(target, 'src'), { recursive: true });
    fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({
      name: 'weathergo',
      scripts: { test: 'node --test', build: 'node -e "process.exit(0)"' },
    }));
    fs.writeFileSync(path.join(target, 'src', 'main.jsx'), 'export default function App() { return null; }\n');

    const result: any = await new EngineeringDiscoveryTool().execute({
      request: 'Repair the existing project named react-weathergo-a587. Do not create a new project or modify any other project.',
    }, { workspaceRoot: root, sessionId: 'breadth-regression-chat' });

    expect(result.ok).toBe(true);
    expect(result.output.evidence.mode).toBe('existing_workspace');
    expect(result.output.evidence.selectedProject.root).toBe(target);
    expect(result.output.evidence.blockers).toEqual([]);
  });

  test('keeps generic product taxonomy out of existing-project target detection', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-generic-category-'));
    roots.push(root);
    for (const name of ['alpha', 'beta']) {
      fs.mkdirSync(path.join(root, name), { recursive: true });
      fs.writeFileSync(path.join(root, name, 'package.json'), JSON.stringify({ name }));
    }

    const result: any = await new EngineeringDiscoveryTool().execute({
      request: 'Build the capabilities and reasoning needed to create this class of application generally; do not hide missing work behind a canned template.',
    }, { workspaceRoot: root });

    expect(result.ok).toBe(true);
    expect(result.output.evidence.mode).toBe('greenfield');
    expect(result.output.evidence.constraints.createsNewProject).toBe(true);
    expect(result.output.evidence.constraints.userRequestedExistingProject).toBe(false);
    expect(result.output.evidence.blockers).toEqual([]);
    expect(result.output.evidence.selectedProject).toBeUndefined();
    expect(result.output.evidence.referenceProjects).toHaveLength(2);
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
    const specificationRead = source.indexOf('await this.readRequestedSpecifications(productRequest, evidence, context, logs, say, isAr)');
    const planner = source.search(/(?:const|let) plannerResult[^\n]*executeTool\('project_planner'/);

    expect(specificationRead).toBeGreaterThanOrEqual(0);
    expect(planner).toBeGreaterThan(specificationRead);
    expect(source).toContain("executeTool('read_file'");
    expect(source).toContain('Reading complete local specification');
    expect(source).toContain('instructionFiles');
  });
});

describe('«اكمل» points at work that exists', () => {
    /**
     * A bare continuation in a session that had just produced a real artifact
     * used to read as a BUILD — looksLikeBuild saw the verb, createsNewProject
     * came back true, and the pipeline scaffolded api-myapp and react-myapp
     * beside the finished work: the subject-less brand fallback, wearing a
     * folder. Measured on a crowded workspace: the continuation now SELECTS
     * the session's known artifact — other projects are not ambiguity when
     * the target is on record — and a genuine new-build sentence, or a
     * session with nothing on record, keeps exactly today's behaviour.
     */
    const os = require('os');
    let root: string;
    const SID = 'continuation-proof';

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-cont-'));
        for (const name of ['react-evidenceboard', 'api-other']) {
            const d = path.join(root, name);
            fs.mkdirSync(d, { recursive: true });
            fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name, scripts: { start: 'node s.js' } }));
        }
        (global as any).joeProjects = {
            ...(global as any).joeProjects,
            [SID]: { dir: path.join(root, 'react-evidenceboard'), type: 'react' },
        };
    });
    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
        delete (global as any).joeProjects?.[SID];
    });

    const discover = (request: string, sessionId = SID) =>
        new EngineeringDiscoveryTool().execute({ request }, { sessionId, workspaceRoot: root });

    test.each(['اكمل', 'continue', 'اكمل من حيث توقفت', 'أكمل العمل'])(
        '«%s» binds to the known artifact and creates nothing', async (req) => {
            const r: any = await discover(req);
            const ev = r.output.evidence;
            expect(ev.constraints.createsNewProject).toBe(false);
            expect(ev.mode).toBe('existing_workspace');
            expect(path.basename(ev.selectedProject.root)).toBe('react-evidenceboard');
            expect(ev.blockers).toHaveLength(0);
        });

    it('an explicit repair request naming the current generated project binds to the active artifact', async () => {
        const r: any = await discover('Continue the WeatherGo task from the current generated project. Fix the remaining quality findings in the active project, rebuild and rerun Browser QA.');
        const ev = r.output.evidence;
        expect(ev.constraints.userRequestedExistingProject).toBe(true);
        expect(ev.constraints.createsNewProject).toBe(false);
        expect(ev.mode).toBe('existing_workspace');
        expect(path.basename(ev.selectedProject.root)).toBe('react-evidenceboard');
        expect(ev.blockers).toHaveLength(0);
    });

    it('a real new-build sentence stays greenfield even with an artifact on record', async () => {
        const r: any = await discover('ابنِ نظاماً جديداً لمطعم');
        expect(r.output.evidence.mode).toBe('greenfield');
        expect(r.output.evidence.constraints.createsNewProject).toBe(true);
    });

    it('a bare continuation with nothing on record keeps the honest ambiguous stop', async () => {
        const r: any = await discover('اكمل', 'session-with-no-artifact');
        expect(r.output.evidence.constraints.createsNewProject).toBe(false);
        expect(r.output.evidence.mode).toBe('ambiguous');
    });
});
