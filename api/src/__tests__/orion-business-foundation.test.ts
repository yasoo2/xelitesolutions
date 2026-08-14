import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { isOrionBusinessOperatingSystemRequest } from '../modules/tools/definitions/ProjectPipelineTool';
import { OrionBusinessFoundationTool } from '../modules/tools/definitions/OrionBusinessFoundationTool';

const orionRequest = [
  'Build ORION, a multi-tenant business operating system for enterprise operations.',
  'It must include tenant isolation, RBAC, CRM, inventory, orders, approvals, local payment capture, accounting ledger, audit records, versioned events, a command-center UI, and locally executable acceptance tests.',
  'Do not deploy, publish, call external payment providers, or apply infrastructure.',
].join(' ');

describe('ORION business operating system route', () => {
  test('identifies ORION business requirements without stealing unrelated enterprise engineering platforms', () => {
    expect(isOrionBusinessOperatingSystemRequest(orionRequest)).toBe(true);
    expect(isOrionBusinessOperatingSystemRequest('Build a Fortune 500 multi-agent engineering platform with Kubernetes and Kafka.')).toBe(false);
    expect(isOrionBusinessOperatingSystemRequest('Build a small React task tracker.')).toBe(false);
  });

  test('routes an ORION specification ahead of Git-derived workflow cues', async () => {
    const goal = `${orionRequest} Read ORION_SPECIFICATION.md in the current workspace before building it; the specification also describes repository and CI conventions.`;
    const plan = await PlanningEngine.generatePlan({ intent: { goal, complexity: 'high', riskLevel: 'medium', rawIntent: {} } as any });
    expect(plan.steps[0].tool).toBe('project_pipeline');
    expect(plan.steps.some((step: any) => step.tool === 'git_local_workflow')).toBe(false);
  });

  test('writes and verifies an executable local ORION foundation in the selected workspace', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-orion-foundation-'));
    try {
      const result: any = await new OrionBusinessFoundationTool().execute({ request: orionRequest }, {
        workspaceRoot: root,
        sessionId: 'orion-business-foundation-test',
        language: 'en',
      });

      expect(result.ok).toBe(true);
      expect(result.output.projectPath).toBe(path.join(root, 'orion-business-operating-system'));
      expect(result.output.writtenFiles).toBeGreaterThanOrEqual(20);
      expect(result.output.verification).toMatch(/acceptance tests/i);
      expect(result.output.deliveryScope).toMatch(/no payment, cloud, deployment/i);

      const project = result.output.projectPath;
      expect(fs.existsSync(path.join(project, 'services', 'business-core', 'orion', 'core.py'))).toBe(true);
      expect(fs.existsSync(path.join(project, 'services', 'business-core', 'orion', '__init__.py'))).toBe(true);
      expect(fs.existsSync(path.join(project, 'apps', 'command-center', 'app', 'page.tsx'))).toBe(true);
      expect(fs.existsSync(path.join(project, 'contracts', 'events', 'payment-captured.v1.json'))).toBe(true);
      expect(fs.existsSync(path.join(project, 'tests', 'test_orion_acceptance.py'))).toBe(true);
      expect(fs.existsSync(path.join(project, 'docs', 'verification-report.md'))).toBe(true);

      const domain = fs.readFileSync(path.join(project, 'services', 'business-core', 'orion', 'core.py'), 'utf8');
      const acceptance = fs.readFileSync(path.join(project, 'tests', 'test_orion_acceptance.py'), 'utf8');
      const workflow = fs.readFileSync(path.join(project, '.github', 'workflows', 'ci.yml'), 'utf8');
      const event = JSON.parse(fs.readFileSync(path.join(project, 'contracts', 'events', 'payment-captured.v1.json'), 'utf8'));
      const commandCenterPackage = JSON.parse(fs.readFileSync(path.join(project, 'apps', 'command-center', 'package.json'), 'utf8'));
      const commandCenterTsconfig = JSON.parse(fs.readFileSync(path.join(project, 'apps', 'command-center', 'tsconfig.json'), 'utf8'));
      expect(domain).toMatch(/tenant/i);
      expect(domain).toMatch(/approve/i);
      expect(domain).toMatch(/ledger|journal/i);
      expect(acceptance).toMatch(/tenant/i);
      expect(acceptance).toMatch(/approval/i);
      expect(acceptance).toMatch(/audit/i);
      expect(acceptance).toContain('CORE_ROOT');
      const python = process.platform === 'win32' ? 'python' : 'python3';
      const cleanEnvironment = { ...process.env };
      delete cleanEnvironment.PYTHONPATH;
      expect(() => execFileSync(python, ['-m', 'unittest', 'discover', '-s', 'tests', '-v'], {
        cwd: project,
        env: cleanEnvironment,
        stdio: 'pipe',
      })).not.toThrow();
      expect(workflow).toContain('PYTHONPATH=services/business-core python -m unittest discover -s tests -v');
      expect(event.$id || event.title).toBeTruthy();
      expect(commandCenterPackage.dependencies.next).toBe('16.2.11');
      expect(commandCenterPackage.dependencies.react).toBe('19.0.1');
      expect(commandCenterTsconfig.compilerOptions.jsx).toBe('react-jsx');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
