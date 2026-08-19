import fs from 'fs';
import os from 'os';
import path from 'path';
import { workspaceService } from '../modules/services/WorkspaceService';
import { AdvancedFileEditTool } from '../modules/tools/definitions/UtilityTools';
import { SelfFixService } from '../modules/services/SelfFixService';
import { phaseAfterRepair } from '../modules/services/SelfFixExecutionService';
import { RepairTicketService } from '../modules/services/RepairTicketService';

describe('evidence-aware file edit recovery', () => {
  let root = '';
  let activeRootSpy: jest.SpyInstance;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-file-edit-'));
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    activeRootSpy = jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(root);
  });

  afterEach(() => {
    activeRootSpy.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('recovers a formatting-only mismatch without weakening path safety', async () => {
    const file = path.join(root, 'src', 'app.ts');
    fs.writeFileSync(file, 'export function app() {\n  const value = 1;\n  return value;\n}\n');

    const result: any = await new AdvancedFileEditTool().execute({
      filePath: 'src/app.ts',
      edits: [{ find: 'const value=1;', replace: 'const value = 2;' }],
    });

    expect(result.ok).toBe(true);
    expect(fs.readFileSync(file, 'utf8')).toContain('const value = 2;');
  });

  it('does not persist a partial multi-edit when one evidence block misses', async () => {
    const file = path.join(root, 'src', 'app.ts');
    const original = 'const first = 1;\nconst second = 2;\n';
    fs.writeFileSync(file, original);

    const result: any = await new AdvancedFileEditTool().execute({
      filePath: 'src/app.ts',
      edits: [
        { find: 'const first = 1;', replace: 'const first = 10;' },
        { find: 'const absent = true;', replace: 'const absent = false;' },
      ],
    });

    expect(result.ok).toBe(false);
    expect(fs.readFileSync(file, 'utf8')).toBe(original);
  });

  it('builds a bounded ESLint config recovery from lint evidence', () => {
    const plan = SelfFixService.plan({
      type: 'phase_repair_ticket',
      projectName: 'NEXUS',
      phaseNumber: 1,
      phaseName: 'Architecture & Foundation',
      status: 'partial',
      severity: 'low',
      primaryError: "Failed to read JSON file at /workspace/NEXUS/.eslintrc.json: Unexpected token 'i', import is not valid JSON",
      failedTasks: [{
        task: 'Install dependencies and run lint',
        tool: 'shell_execute',
        error: "ESLint: 8.57.1\\nFailed to read JSON file at /workspace/NEXUS/.eslintrc.json: Unexpected token 'i', import is not valid JSON",
        command: 'npm install && npm run lint',
        cwd: '/workspace/NEXUS',
      }],
      suggestedNextAction: 'repair the lint configuration and rerun',
      retryPolicy: { maxRepairAttempts: 1, continueOnlyIfPhaseStatusBecomes: 'completed' },
      context: { workspaceId: 'workspace-test' },
      createdAt: new Date().toISOString(),
    });

    expect(plan.allowed).toBe(true);
    expect(plan.strategy).toBe('build_fix');
    expect(plan.suggestedTool).toBe('ai_write_file');
    expect(plan.maxAttempts).toBe(1);
    expect(plan.suggestedInput).toEqual(expect.objectContaining({
      path: '.eslintrc.json',
      description: expect.stringContaining('configuration format supported by the installed ESLint version'),
    }));
    expect(String(plan.suggestedInput?.description)).not.toContain('src/index.ts');
  });

  it('classifies local runtime imports as a targeted path repair, not npm dependency recovery', () => {
    const plan = SelfFixService.plan({
      type: 'phase_repair_ticket',
      projectName: 'TaskFlow AI',
      phaseNumber: 8,
      phaseName: 'Run and verify',
      status: 'partial',
      severity: 'high',
      primaryError: 'launchability: local runtime imports missing (server/index.js -> ./routes/authRoutes; server/index.js -> ./routes/taskRoutes)',
      failedTasks: [{
        task: 'Start the existing application and verify readiness',
        tool: 'project_run',
        error: 'launchability: local runtime imports missing (server/index.js -> ./routes/authRoutes; server/index.js -> ./routes/taskRoutes)',
        cwd: '/workspace/TaskFlow AI',
        file: 'server/index.js',
      }],
      suggestedNextAction: 'repair the proven local import paths and rerun project_run',
      retryPolicy: { maxRepairAttempts: 1, continueOnlyIfPhaseStatusBecomes: 'completed' },
      context: { workspaceId: 'workspace-test' },
      createdAt: new Date().toISOString(),
    });

    expect(plan.allowed).toBe(true);
    expect(plan.strategy).toBe('build_fix');
    expect(plan.suggestedTool).toBe('ai_write_file');
    expect(plan.suggestedInput).toEqual(expect.objectContaining({
      path: 'server/index.js',
      description: expect.stringContaining('Inspect the current project root'),
    }));
    expect(String(plan.suggestedInput?.description)).toContain('Never create a no-op placeholder');
    expect(String(plan.suggestedInput?.description)).toContain('run npm install');
  });

  it('targets a proven missing explicit local asset instead of rewriting its importer', () => {
    const importer = path.join(root, 'src', 'App.jsx');
    const plan = SelfFixService.plan({
      type: 'phase_repair_ticket',
      projectName: 'WeatherGo',
      phaseNumber: 1,
      phaseName: 'Application',
      status: 'partial',
      severity: 'high',
      primaryError: `launchability: local runtime imports missing (${importer} -> ./App.css)`,
      failedTasks: [{
        task: 'Start the application and verify readiness',
        tool: 'project_run',
        error: `launchability: local runtime imports missing (${importer} -> ./App.css)`,
        cwd: root,
        file: importer,
      }],
      suggestedNextAction: 'generate the proven missing stylesheet and rerun the failed phase',
      retryPolicy: { maxRepairAttempts: 1, continueOnlyIfPhaseStatusBecomes: 'completed' },
      context: { workspaceId: 'workspace-test' },
      createdAt: new Date().toISOString(),
    });

    expect(plan.allowed).toBe(true);
    expect(plan.strategy).toBe('build_fix');
    expect(plan.suggestedTool).toBe('ai_write_file');
    expect(plan.suggestedInput?.path).toBe(path.join(root, 'src', 'App.css'));
    expect(String(plan.suggestedInput?.description)).toContain('exact missing target');
    expect(String(plan.suggestedInput?.description)).toContain('not a substitute importer');
    expect(String(plan.suggestedInput?.description)).toContain('no-op placeholder');
  });

  it('targets a quoted unresolved local stylesheet emitted by ai_write_file', () => {
    const importer = path.join(root, 'src', 'components', 'WeatherApp.jsx');
    const plan = SelfFixService.plan({
      type: 'phase_repair_ticket',
      projectName: 'WeatherGo',
      phaseNumber: 1,
      phaseName: 'Application',
      status: 'partial',
      severity: 'high',
      primaryError: `unresolved_local_import: ${importer} imports \"./styles/app.css\", but no file resolves from the importing file.`,
      failedTasks: [{
        task: 'Write WeatherApp component',
        tool: 'ai_write_file',
        error: `unresolved_local_import: ${importer} imports \"./styles/app.css\", but no file resolves from the importing file.`,
        cwd: root,
        file: importer,
      }],
      suggestedNextAction: 'generate the proven missing stylesheet and rerun the failed phase',
      retryPolicy: { maxRepairAttempts: 1, continueOnlyIfPhaseStatusBecomes: 'completed' },
      context: { workspaceId: 'workspace-test' },
      createdAt: new Date().toISOString(),
    });

    expect(plan.allowed).toBe(true);
    expect(plan.strategy).toBe('build_fix');
    expect(plan.suggestedTool).toBe('ai_write_file');
    expect(plan.suggestedInput?.path).toBe(path.join(root, 'src', 'components', 'styles', 'app.css'));
    expect(String(plan.reason)).toContain('proven explicit local runtime target');
    expect(String(plan.suggestedInput?.description)).toContain('not a substitute importer');
  });

  it('redirects a broken relative import only when one exact-case target exists in the artifact', () => {
    const importer = path.join(root, 'src', 'components', 'WeatherApp.jsx');
    const stylesheet = path.join(root, 'src', 'styles', 'app.css');
    fs.mkdirSync(path.dirname(importer), { recursive: true });
    fs.mkdirSync(path.dirname(stylesheet), { recursive: true });
    fs.writeFileSync(importer, 'import "./styles/app.css";\n');
    fs.writeFileSync(stylesheet, ':root { color-scheme: light; }\n');
    const error = `unresolved_local_import: ${importer} imports "./styles/app.css", but no file resolves from the importing file.`;
    const plan = SelfFixService.plan({
      type: 'phase_repair_ticket',
      projectName: 'WeatherGo',
      phaseNumber: 1,
      phaseName: 'Application',
      status: 'partial',
      severity: 'high',
      primaryError: error,
      failedTasks: [{
        task: 'Write WeatherApp component',
        tool: 'ai_write_file',
        error,
        cwd: root,
        file: importer,
      }],
      suggestedNextAction: 'repair the proven local import path and rerun the failed phase',
      retryPolicy: { maxRepairAttempts: 1, continueOnlyIfPhaseStatusBecomes: 'completed' },
      context: { workspaceId: 'workspace-test' },
      createdAt: new Date().toISOString(),
    });

    expect(plan.allowed).toBe(true);
    expect(plan.strategy).toBe('code_fix');
    expect(plan.suggestedTool).toBe('file_edit');
    expect(plan.suggestedInput).toEqual({
      filename: importer,
      find: './styles/app.css',
      replace: '../styles/app.css',
    });
    expect(String(plan.reason)).toContain('unique exact-case valid path');
  });

  it('does not redirect when multiple exact-case artifact targets make the import ambiguous', () => {
    const importer = path.join(root, 'src', 'components', 'WeatherApp.jsx');
    const first = path.join(root, 'src', 'styles', 'app.css');
    const second = path.join(root, 'src', 'theme', 'app.css');
    fs.mkdirSync(path.dirname(importer), { recursive: true });
    fs.mkdirSync(path.dirname(first), { recursive: true });
    fs.mkdirSync(path.dirname(second), { recursive: true });
    fs.writeFileSync(importer, 'import "./styles/app.css";\n');
    fs.writeFileSync(first, ':root { color-scheme: light; }\n');
    fs.writeFileSync(second, ':root { color-scheme: dark; }\n');
    const error = `unresolved_local_import: ${importer} imports "./styles/app.css", but no file resolves from the importing file.`;
    const plan = SelfFixService.plan({
      type: 'phase_repair_ticket',
      projectName: 'WeatherGo',
      phaseNumber: 1,
      phaseName: 'Application',
      status: 'partial',
      severity: 'high',
      primaryError: error,
      failedTasks: [{
        task: 'Write WeatherApp component',
        tool: 'ai_write_file',
        error,
        cwd: root,
        file: importer,
      }],
      suggestedNextAction: 'repair the proven local import path and rerun the failed phase',
      retryPolicy: { maxRepairAttempts: 1, continueOnlyIfPhaseStatusBecomes: 'completed' },
      context: { workspaceId: 'workspace-test' },
      createdAt: new Date().toISOString(),
    });

    expect(plan.strategy).toBe('build_fix');
    expect(plan.suggestedTool).toBe('ai_write_file');
    expect(plan.suggestedInput).not.toHaveProperty('find');
    expect(String(plan.reason)).toContain('proven explicit local runtime target');
  });

  it('does not redirect a case-mismatched local target', () => {
    const importer = path.join(root, 'src', 'components', 'WeatherApp.jsx');
    const actual = path.join(root, 'src', 'styles', 'App.css');
    fs.mkdirSync(path.dirname(importer), { recursive: true });
    fs.mkdirSync(path.dirname(actual), { recursive: true });
    fs.writeFileSync(importer, 'import "./styles/app.css";\n');
    fs.writeFileSync(actual, ':root { color-scheme: light; }\n');
    const error = `unresolved_local_import: ${importer} imports "./styles/app.css", but no file resolves from the importing file.`;
    const plan = SelfFixService.plan({
      type: 'phase_repair_ticket',
      projectName: 'WeatherGo',
      phaseNumber: 1,
      phaseName: 'Application',
      status: 'partial',
      severity: 'high',
      primaryError: error,
      failedTasks: [{
        task: 'Write WeatherApp component',
        tool: 'ai_write_file',
        error,
        cwd: root,
        file: importer,
      }],
      suggestedNextAction: 'repair the proven local import path and rerun the failed phase',
      retryPolicy: { maxRepairAttempts: 1, continueOnlyIfPhaseStatusBecomes: 'completed' },
      context: { workspaceId: 'workspace-test' },
      createdAt: new Date().toISOString(),
    });

    expect(plan.strategy).toBe('build_fix');
    expect(plan.suggestedTool).toBe('ai_write_file');
    expect(plan.suggestedInput).not.toHaveProperty('find');
    expect(String(plan.reason)).toContain('proven explicit local runtime target');
  });

  it('does not let a stale permission_stop status block a proven local stylesheet repair', () => {
    const importer = path.join(root, 'src', 'components', 'WeatherApp.jsx');
    fs.mkdirSync(path.dirname(importer), { recursive: true });
    fs.writeFileSync(importer, 'import "./styles/app.css";\n');
    const error = `unresolved_local_import: ${importer} imports "./styles/app.css", "./styles/tokens.css", but no file resolves from the importing file.`;
    const ticket = RepairTicketService.build({
      phase: { phaseNumber: 1, name: 'Application' },
      projectName: 'WeatherGo',
      workspaceId: 'workspace-test',
      phaseResult: {
        output: {
          // This status can be inherited from an earlier guarded attempt; the
          // deterministic local-import evidence must remain repairable.
          status: 'permission_stop',
          results: [{
            task: 'Write WeatherApp component',
            tool: 'ai_write_file',
            ok: false,
            error,
            cwd: root,
            file: importer,
          }],
        },
      },
    });

    expect(ticket.severity).not.toBe('critical');
    const plan = SelfFixService.plan(ticket);
    expect(plan.allowed).toBe(true);
    expect(plan.strategy).toBe('build_fix');
    expect(plan.suggestedInput?.path).toBe(path.join(root, 'src', 'components', 'styles', 'app.css'));

    const securityTicket = RepairTicketService.build({
      phase: { phaseNumber: 1, name: 'Application' },
      phaseResult: {
        output: {
          status: 'permission_stop',
          results: [{ task: 'Security check', tool: 'shell_execute', ok: false, error: 'unauthorized credential access' }],
        },
      },
    });
    expect(securityTicket.severity).toBe('critical');
  });

  it('regenerates an undeclared runtime import under the verified project contract', () => {
    const file = '/workspace/WeatherGo/src/components/Favorites.jsx';
    const plan = SelfFixService.plan({
      type: 'phase_repair_ticket',
      projectName: 'WeatherGo',
      phaseNumber: 3,
      phaseName: 'API Integration',
      status: 'partial',
      severity: 'high',
      primaryError: `runtime_contract_mismatch: ${file} imports undeclared packages: react-router-dom`,
      failedTasks: [{
        task: 'Write Favorites component',
        tool: 'ai_write_file',
        error: `runtime_contract_mismatch: ${file} imports undeclared packages: react-router-dom`,
        cwd: '/workspace/WeatherGo',
        file,
        description: 'Build the favorites screen with the requested city persistence behavior.',
        artifactContext: '{"projectRoot":"/workspace/WeatherGo"}',
      }],
      suggestedNextAction: 'regenerate the evidenced file under the verified runtime contract and rerun',
      retryPolicy: { maxRepairAttempts: 1, continueOnlyIfPhaseStatusBecomes: 'completed' },
      context: { workspaceId: 'workspace-test' },
      createdAt: new Date().toISOString(),
    });

    expect(plan.allowed).toBe(true);
    expect(plan.strategy).toBe('code_fix');
    expect(plan.suggestedTool).toBe('ai_write_file');
    expect(plan.suggestedInput).toEqual(expect.objectContaining({ path: file }));
    expect(String(plan.suggestedInput?.description)).toContain('Do not install, add, or invent dependencies');
    expect(String(plan.suggestedInput?.description)).toContain('react-router-dom');
    expect(String(plan.suggestedInput?.context)).toContain('favorites screen');
    expect(JSON.stringify(plan.suggestedInput)).not.toContain('npm_manager');
  });

  it('preserves the react_project brief when runtime-contract evidence names the failed file only in the error', () => {
    const failedFile = '/workspace/WeatherGo/src/components/WeatherApp.jsx';
    const originalDescription = 'Build WeatherGo with Open-Meteo geocoding and forecast data, hourly and daily views, sunrise/sunset, favorites persistence, and Fahrenheit settings.';
    const originalContext = 'Use the existing React + Vite browser runtime and only packages declared in package.json.';
    const ticket = RepairTicketService.build({
      phase: { phaseNumber: 1, name: 'Application' },
      projectName: 'WeatherGo',
      workspaceId: 'workspace-test',
      phaseResult: {
        output: {
          status: 'partial',
          results: [{
            task: 'Build the WeatherGo application',
            tool: 'react_project',
            ok: false,
            error: `runtime_contract_mismatch: ${failedFile} imports undeclared package(s): react-redux. Update the project manifest only when necessary.`,
            description: originalDescription,
            artifactContext: originalContext,
          }],
        },
      },
    });
    const plan = SelfFixService.plan(ticket);

    expect(ticket.failedTasks[0]).toEqual(expect.objectContaining({
      description: originalDescription,
      artifactContext: originalContext,
    }));
    expect(plan.strategy).toBe('code_fix');
    expect(plan.suggestedTool).toBe('ai_write_file');
    expect(String(plan.suggestedInput?.description)).toContain('ORIGINAL GENERATION BRIEF');
    expect(String(plan.suggestedInput?.description)).toContain('Open-Meteo');
    expect(String(plan.suggestedInput?.context)).toContain('existing React + Vite browser runtime');
  });

  it('extracts only the package before verified runtime metadata', () => {
    const file = '/workspace/WeatherGo/src/components/Search.jsx';
    const error = `runtime_contract_mismatch: ${file} imports undeclared package(s): react [verified root: /workspace/WeatherGo; manifest: /workspace/WeatherGo/package.json]. Update the project manifest only when the requirements explicitly require a stack change.`;
    const plan = SelfFixService.plan({
      type: 'phase_repair_ticket',
      projectName: 'WeatherGo',
      phaseNumber: 3,
      phaseName: 'UI Components',
      status: 'partial',
      severity: 'high',
      primaryError: error,
      failedTasks: [{
        task: 'Write Search component',
        tool: 'ai_write_file',
        error,
        cwd: '/workspace/WeatherGo',
        file,
      }],
      suggestedNextAction: 'regenerate the evidenced file under the verified runtime contract and rerun',
      retryPolicy: { maxRepairAttempts: 1, continueOnlyIfPhaseStatusBecomes: 'completed' },
      context: { workspaceId: 'workspace-test' },
      createdAt: new Date().toISOString(),
    });

    expect(plan.strategy).toBe('code_fix');
    expect(plan.suggestedTool).toBe('ai_write_file');
    expect(plan.suggestedInput).toEqual(expect.objectContaining({ path: file }));
    expect(String(plan.reason)).toContain('react');
    expect(String(plan.suggestedInput?.description)).toContain('Remove the undeclared imports (react)');
    expect(String(plan.suggestedInput?.description)).not.toContain('verified root');
    expect(String(plan.suggestedInput?.description)).not.toContain('/workspace/WeatherGo; manifest');
  });

  it('extracts only the evidenced package from a truncated runtime contract message', () => {
    const truncated = 'runtime_contract_mismatch: /workspace/WeatherGo/src/services/weatherService.js imports undeclared package(s): axios. Update the project manifest only when the requireme';
    const plan = SelfFixService.plan({
      type: 'phase_repair_ticket',
      projectName: 'WeatherGo',
      phaseNumber: 2,
      phaseName: 'API Integration',
      status: 'partial',
      severity: 'high',
      primaryError: truncated,
      failedTasks: [{
        task: 'Validate runtime imports',
        tool: 'project_run',
        error: truncated,
        cwd: '/workspace/WeatherGo',
        file: '/workspace/WeatherGo/src/services/weatherService.js',
      }],
      suggestedNextAction: 'install the evidenced package in the product root and rerun',
      retryPolicy: { maxRepairAttempts: 1, continueOnlyIfPhaseStatusBecomes: 'completed' },
      context: { workspaceId: 'workspace-test' },
      createdAt: new Date().toISOString(),
    });

    expect(plan.strategy).toBe('code_fix');
    expect(plan.suggestedTool).toBe('ai_write_file');
    expect(plan.suggestedInput).toEqual(expect.objectContaining({
      path: '/workspace/WeatherGo/src/services/weatherService.js',
    }));
    expect(String(plan.suggestedInput?.description)).toContain('axios');
    expect(String(plan.suggestedInput?.description)).toContain('Do not install, add, or invent dependencies');
    expect(JSON.stringify(plan.suggestedInput)).not.toContain('explicitly');
  });

  it('targets the evidenced exported module for a Rollup import/export mismatch', () => {
    const importer = '/workspace/WeatherGo/src/App.jsx';
    const provider = '/workspace/WeatherGo/src/components/WeatherApp.jsx';
    const error = `\n[plugin:vite:import-analysis] ${provider} (2:7): \"default\" is not exported by \"${provider}\", imported by \"${importer}\"`;
    const plan = SelfFixService.plan({
      type: 'phase_repair_ticket',
      projectName: 'WeatherGo',
      phaseNumber: 1,
      phaseName: 'Application',
      status: 'partial',
      severity: 'high',
      primaryError: error,
      failedTasks: [{
        task: 'Run the production build',
        tool: 'shell_execute',
        error,
        cwd: '/workspace/WeatherGo',
        file: importer,
        command: 'npm run build',
      }],
      suggestedNextAction: 'repair the import/export mismatch and rerun the failed phase',
      retryPolicy: { maxRepairAttempts: 1, continueOnlyIfPhaseStatusBecomes: 'completed' },
      context: { workspaceId: 'workspace-test' },
      createdAt: new Date().toISOString(),
    });

    expect(plan.allowed).toBe(true);
    expect(plan.strategy).toBe('code_fix');
    expect(plan.suggestedTool).toBe('ai_write_file');
    expect(plan.suggestedInput).toEqual(expect.objectContaining({ path: provider }));
    expect(String(plan.suggestedInput?.description)).toContain('default');
    expect(String(plan.suggestedInput?.description)).toContain(importer);
    expect(String(plan.suggestedInput?.description)).toContain('Do not modify package manifests');
    expect(String(plan.suggestedInput?.context)).toContain('importExportMismatch');
  });

  it('binds generic syntax recovery to the failed generated-project file', () => {
    const failedFile = '/workspace/WeatherGo/src/services/__tests__/weatherService.test.js';
    const plan = SelfFixService.plan({
      type: 'phase_repair_ticket',
      projectName: 'WeatherGo',
      phaseNumber: 5,
      phaseName: 'Testing',
      status: 'partial',
      severity: 'high',
      primaryError: `source_syntax_mismatch: ${failedFile} contains invalid JavaScript`,
      failedTasks: [{
        task: 'Run the generated test suite',
        tool: 'auto_tester',
        error: `source_syntax_mismatch: ${failedFile} contains invalid JavaScript`,
        cwd: '/workspace/WeatherGo',
        file: failedFile,
      }],
      suggestedNextAction: 'repair the evidenced test file and rerun testing',
      retryPolicy: { maxRepairAttempts: 1, continueOnlyIfPhaseStatusBecomes: 'completed' },
      context: { workspaceId: 'workspace-test' },
      createdAt: new Date().toISOString(),
    });

    expect(plan.allowed).toBe(true);
    expect(plan.suggestedTool).toBe('ai_write_file');
    expect(plan.suggestedInput).toEqual(expect.objectContaining({ path: failedFile }));
    expect(String(plan.suggestedInput?.description)).toContain('source_syntax_mismatch');
    expect(String(plan.suggestedInput?.description)).toContain('complete valid artifact');
    expect(String(plan.suggestedInput?.description)).toContain('node --check');
    expect(JSON.stringify(plan.suggestedInput)).not.toContain('src/index.ts');
  });

  it('preserves the original ai_write_file brief and context during syntax recovery', () => {
    const failedFile = '/workspace/WeatherGo/src/screens/HomeScreen.js';
    const originalDescription = 'Build the WeatherGo home screen with a city search, current conditions, hourly forecast, favorites action, loading state, and API error state using the existing React web stack.';
    const originalContext = 'Use the existing Vite browser runtime, preserve the current routes, and do not switch to React Native.';
    const ticket = RepairTicketService.build({
      phase: { phaseNumber: 2, name: 'Core UI' },
      projectName: 'WeatherGo',
      workspaceId: 'workspace-test',
      phaseResult: {
        output: {
          status: 'partial',
          results: [{
            task: 'Write the WeatherGo home screen',
            tool: 'ai_write_file',
            ok: false,
            error: `source_syntax_mismatch: ${failedFile} is not valid JS syntax`,
            args: {
              path: failedFile,
              description: originalDescription,
              context: originalContext,
            },
          }],
        },
      },
    });
    const plan = SelfFixService.plan(ticket);

    expect(ticket.failedTasks[0]).toEqual(expect.objectContaining({
      description: originalDescription,
      artifactContext: originalContext,
    }));
    expect(String(plan.suggestedInput?.description)).toContain('ORIGINAL GENERATION BRIEF');
    expect(String(plan.suggestedInput?.description)).toContain('city search');
    expect(String(plan.suggestedInput?.context)).toContain(originalContext);
  });

  it('refuses a generic code repair when the failed task has no file evidence', () => {
    const plan = SelfFixService.plan({
      type: 'phase_repair_ticket',
      projectName: 'WeatherGo',
      phaseNumber: 5,
      phaseName: 'Testing',
      status: 'partial',
      severity: 'high',
      primaryError: 'source_syntax_mismatch: generated output is invalid',
      failedTasks: [{
        task: 'Run the generated test suite',
        tool: 'auto_tester',
        error: 'source_syntax_mismatch: generated output is invalid',
        cwd: '/workspace/WeatherGo',
      }],
      suggestedNextAction: 'inspect the failed artifact',
      retryPolicy: { maxRepairAttempts: 1, continueOnlyIfPhaseStatusBecomes: 'completed' },
      context: { workspaceId: 'workspace-test' },
      createdAt: new Date().toISOString(),
    });

    expect(plan.allowed).toBe(false);
    expect(plan.strategy).toBe('manual_review');
    expect(JSON.stringify(plan)).not.toContain('src/index.ts');
  });

  it('resumes react_project after a dependency repair so request-driven domain files are regenerated', () => {
    const phase = {
      phaseNumber: 1,
      name: 'Project Setup',
      tasks: [
        { task: 'Create the React project', tool: 'react_project', args: { projectName: 'WeatherGo' } },
        { task: 'Install dependencies and build', tool: 'shell_execute', command: 'npm run build', cwd: '/workspace/WeatherGo' },
        { task: 'Verify launchability', tool: 'project_run', cwd: '/workspace/WeatherGo' },
      ],
    };

    const resumed = phaseAfterRepair(phase, '/workspace/WeatherGo/package.json');

    expect(resumed.skipped).toEqual([]);
    expect(resumed.phase.tasks.map((task: any) => task.tool)).toEqual(['react_project', 'shell_execute', 'project_run']);
    expect(resumed.phase.tasks[0].args).toEqual(expect.objectContaining({ projectName: 'WeatherGo', resumeExisting: true }));
  });

  it('builds one bounded advanced-edit recovery from preserved file evidence', () => {
    const plan = SelfFixService.plan({
      type: 'phase_repair_ticket',
      projectName: 'NEXUS',
      phaseNumber: 5,
      phaseName: 'Foundation',
      status: 'partial',
      severity: 'low',
      primaryError: 'Text to replace not found',
      failedTasks: [{
        task: 'Update workflowEngine.js',
        tool: 'file_edit',
        error: 'Text to replace not found',
        file: 'NEXUS/agents/workflowEngine.js',
        find: 'const oldValue = true;',
        replace: 'const newValue = true;',
      }],
      suggestedNextAction: 'inspect and retry',
      retryPolicy: { maxRepairAttempts: 1, continueOnlyIfPhaseStatusBecomes: 'completed' },
      context: { workspaceId: 'workspace-test' },
      createdAt: new Date().toISOString(),
    });

    expect(plan.allowed).toBe(true);
    expect(plan.suggestedTool).toBe('file_edit_advanced');
    expect(plan.maxAttempts).toBe(1);
    expect(plan.suggestedInput).toEqual({
      filePath: 'NEXUS/agents/workflowEngine.js',
      edits: [{ find: 'const oldValue = true;', replace: 'const newValue = true;' }],
    });
  });

  it('resumes a single react_project task instead of dropping request-driven authoring', () => {
    const phase = {
      phaseNumber: 1,
      name: 'Project Setup',
      tasks: [
        { task: 'Create the React project', tool: 'react_project', args: { projectName: 'WeatherGo' } },
      ],
    };

    const resumed = phaseAfterRepair(phase, '/workspace/WeatherGo/package.json');

    expect(resumed.skipped).toEqual([]);
    expect(resumed.phase.name).toBe('Project Setup');
    expect(resumed.phase.tasks).toEqual([
      expect.objectContaining({
        tool: 'react_project',
        args: expect.objectContaining({ projectName: 'WeatherGo', resumeExisting: true }),
      }),
    ]);
  });

  it('verifies an existing React project instead of regenerating it after a source-file repair', () => {
    const projectRoot = root;
    fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({ name: 'weathergo' }));
    const repairedFile = path.join(projectRoot, 'src', 'components', 'WeatherApp.jsx');
    fs.mkdirSync(path.dirname(repairedFile), { recursive: true });
    fs.writeFileSync(repairedFile, 'export default function WeatherApp() { return null; }');

    const phase = {
      phaseNumber: 1,
      name: 'Project Setup',
      tasks: [{
        task: 'Create the React project',
        tool: 'react_project',
        args: { projectName: 'WeatherGo' },
      }],
    };

    const resumed = phaseAfterRepair(phase, repairedFile);

    expect(resumed.skipped).toEqual(['Create the React project']);
    expect(resumed.phase.name).toContain('post-repair verification');
    expect(resumed.phase.tasks).toEqual([
      {
        task: 'Build the repaired project without rewriting generated files',
        tool: 'shell_execute',
        args: {
          command: 'npm run build',
          cwd: projectRoot,
          projectPath: projectRoot,
        },
      },
      {
        task: 'Verify the repaired project can start',
        tool: 'project_run',
        args: { cwd: projectRoot },
      },
    ]);
  });
});
