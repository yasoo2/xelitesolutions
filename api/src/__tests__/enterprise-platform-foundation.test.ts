import fs from 'fs';
import os from 'os';
import path from 'path';
import { isEnterprisePlatformRequest } from '../modules/tools/definitions/ProjectPipelineTool';
import { EnterprisePlatformFoundationTool } from '../modules/tools/definitions/EnterprisePlatformFoundationTool';

describe('enterprise multi-agent platform route', () => {
  const request = `You are not just a software engineer. Build a Fortune 500 enterprise-grade multi-agent autonomous engineering platform with CEO, CTO, security, SRE and QA agents, microservices, Kafka, Kubernetes, Helm, Terraform, observability and CI/CD.`;

  test('detects a true enterprise multi-agent request without stealing ordinary full-stack applications', () => {
    expect(isEnterprisePlatformRequest(request)).toBe(true);
    expect(isEnterprisePlatformRequest('Build a complete inventory application with React and a REST API')).toBe(false);
  });

  test('writes and locally verifies a reviewable foundation inside the selected workspace', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-enterprise-foundation-'));
    try {
      const result = await new EnterprisePlatformFoundationTool().execute({ request }, {
        workspaceRoot: root,
        sessionId: 'enterprise-foundation-test',
      });
      expect(result.ok).toBe(true);
      expect(result.output.projectPath).toBe(path.join(root, 'autonomous-engineering-platform'));
      expect(result.output.writtenFiles).toBeGreaterThanOrEqual(25);
      expect(result.output.verification).toMatch(/control-plane API contract tests/i);
      expect(result.output.deliveryScope).toMatch(/no external deployment/i);

      const project = result.output.projectPath;
      expect(fs.existsSync(path.join(project, 'docs', 'architecture.md'))).toBe(true);
      expect(fs.existsSync(path.join(project, 'services', 'control-plane', 'app', 'main.py'))).toBe(true);
      expect(fs.existsSync(path.join(project, 'services', 'control-plane', 'app', 'domain.py'))).toBe(true);
      expect(fs.existsSync(path.join(project, 'services', 'control-plane', 'Dockerfile'))).toBe(true);
      expect(fs.existsSync(path.join(project, 'apps', 'operations-console', 'app', 'page.tsx'))).toBe(true);
      expect(fs.existsSync(path.join(project, 'contracts', 'events', 'task-reviewed.v1.json'))).toBe(true);
      expect(fs.existsSync(path.join(project, 'deploy', 'helm', 'autonomous-engineering-platform', 'Chart.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(project, 'docs', 'agent-collaboration.md'))).toBe(true);
      expect(fs.existsSync(path.join(project, 'docs', 'testing-strategy.md'))).toBe(true);
      expect(fs.existsSync(path.join(project, 'docs', 'deployment-strategy.md'))).toBe(true);
      expect(fs.existsSync(path.join(project, 'docs', 'monitoring-strategy.md'))).toBe(true);
      const ciWorkflow = fs.readFileSync(path.join(project, '.github', 'workflows', 'ci.yml'), 'utf8');
      const controlPlaneContractTest = fs.readFileSync(path.join(project, 'services', 'control-plane', 'tests', 'test_contract.py'), 'utf8');
      expect(ciWorkflow).toContain('python -m unittest discover -s tests -v');
      expect(ciWorkflow).toContain('python -m unittest discover -s services/control-plane/tests -v');
      expect(ciWorkflow).toContain('npm install && npm run build');
      expect(controlPlaneContractTest).toContain('unittest.IsolatedAsyncioTestCase');
      expect(controlPlaneContractTest).toContain('sys.path.insert');
      const consoleTsconfig = fs.readFileSync(path.join(project, 'apps', 'operations-console', 'tsconfig.json'), 'utf8');
      const consoleEnv = fs.readFileSync(path.join(project, 'apps', 'operations-console', 'next-env.d.ts'), 'utf8');
      expect(consoleTsconfig).toContain('"jsx": "react-jsx"');
      expect(consoleTsconfig).toContain('.next/dev/types/**/*.ts');
      expect(consoleEnv).toContain('./.next/types/routes.d.ts');
      expect(consoleEnv).toContain('./.next/types/root-params.d.ts');
      expect(JSON.parse(fs.readFileSync(path.join(project, 'foundation-manifest.json'), 'utf8')).externalEffects).toBe('none');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
