import { ToolDefinition } from '../types';
import fs from 'fs';
import path from 'path';

/**
 * GitHubActionsTool - GitHub Actions workflow generator
 * Create CI/CD workflows for GitHub Actions
 */
export class GitHubActionsTool implements ToolDefinition {
  name = 'github_actions';
  version = '1.0.0';
  description = 'Generate GitHub Actions workflows for CI/CD automation';
  tags = ['github', 'actions', 'ci-cd'];

  inputSchema = {
    type: 'object' as const,
    properties: {
      workflowType: {
        type: 'string' as const,
        enum: ['node-ci', 'deploy-vercel', 'docker-build', 'test-and-deploy'],
        description: 'Type of workflow'
      },
      projectPath: {
        type: 'string' as const,
        description: 'Project directory path'
      },
      projectName: {
        type: 'string' as const,
        description: 'Project name'
      }
    },
    required: ['workflowType', 'projectPath']
  };

  outputSchema = {
    type: 'object' as const,
    properties: {
      success: { type: 'boolean' as const },
      workflowPath: { type: 'string' as const }
    }
  };

  permissions = ['write' as const];
  sideEffects = ['write' as const];
  rateLimitPerMinute = 20;
  auditFields = ['workflowType'];
  mockSupported = false;

  async execute(input: any) {
    const { workflowType, projectPath, projectName = 'my-project', action } = input;
    const logs: string[] = [];

    try {
      // Listing real workflow runs requires the GitHub API (auth + repo). This tool
      // only GENERATES workflow files, so it must not fabricate run data — route the
      // caller to the real GitHub integration instead of returning invented rows.
      if (action === 'list_runs') {
        return {
          ok: false,
          error: 'github_actions does not list runs. Use the GitHub API / github_repo_manager for real run data.',
          logs: ['list_runs is not supported by the workflow generator']
        };
      }

      if (!workflowType) {
        return { ok: false, error: 'workflowType required for generation', logs: [] };
      }

      logs.push(`Generating ${workflowType} workflow for ${projectName}`);

      const workflow = this.generateWorkflow(workflowType, projectName);
      const workflowPath = await this.saveWorkflow(projectPath || process.cwd(), workflowType, workflow);

      logs.push(`Workflow saved: ${workflowPath}`);

      return {
        ok: true,
        output: {
          success: true,
          workflowPath,
          workflowType,
          message: `GitHub Actions workflow created: ${workflowType}`
        },
        logs
      };

    } catch (error: any) {
      logs.push(`Error: ${error.message}`);
      return {
        ok: false,
        error: error.message,
        logs
      };
    }
  }

  private generateWorkflow(type: string, projectName: string): string {
    const workflows: Record<string, string> = {
      'node-ci': this.nodeCI(projectName),
      'deploy-vercel': this.deployVercel(projectName),
      'docker-build': this.dockerBuild(projectName),
      'test-and-deploy': this.testAndDeploy(projectName)
    };

    return workflows[type] || workflows['node-ci'];
  }

  private nodeCI(projectName: string): string {
    return `name: Node.js CI

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [18.x, 20.x]

    steps:
    - uses: actions/checkout@v3
    
    - name: Use Node.js \${{ matrix.node-version }}
      uses: actions/setup-node@v3
      with:
        node-version: \${{ matrix.node-version }}
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run tests
      run: npm test
    
    - name: Build
      run: npm run build
`;
  }

  private deployVercel(projectName: string): string {
    return `name: Deploy to Vercel

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Deploy to Vercel
      uses: amondnet/vercel-action@v20
      with:
        vercel-token: \${{ secrets.VERCEL_TOKEN }}
        vercel-org-id: \${{ secrets.VERCEL_ORG_ID }}
        vercel-project-id: \${{ secrets.VERCEL_PROJECT_ID }}
        vercel-args: '--prod'
`;
  }

  private dockerBuild(projectName: string): string {
    return `name: Docker Build and Push

on:
  push:
    branches: [ main ]
    tags: [ 'v*' ]

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v2
    
    - name: Login to Docker Hub
      uses: docker/login-action@v2
      with:
        username: \${{ secrets.DOCKER_USERNAME }}
        password: \${{ secrets.DOCKER_PASSWORD }}
    
    - name: Build and push
      uses: docker/build-push-action@v4
      with:
        context: .
        push: true
        tags: \${{ secrets.DOCKER_USERNAME }}/${projectName}:latest
`;
  }

  private testAndDeploy(projectName: string): string {
    return `name: Test and Deploy

on:
  push:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: '20.x'
    - run: npm ci
    - run: npm test
    - run: npm run build

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
    - uses: actions/checkout@v3
    - name: Deploy
      run: echo "Deploy to production"
      # Add your deployment steps here
`;
  }

  private async saveWorkflow(projectPath: string, workflowType: string, content: string): Promise<string> {
    const workflowsDir = path.join(projectPath, '.github', 'workflows');

    if (!fs.existsSync(workflowsDir)) {
      fs.mkdirSync(workflowsDir, { recursive: true });
    }

    const fileName = `${workflowType}.yml`;
    const filePath = path.join(workflowsDir, fileName);

    fs.writeFileSync(filePath, content, 'utf-8');

    return filePath;
  }
}
