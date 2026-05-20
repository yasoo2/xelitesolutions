/**
 * ProgressiveGeneratorTool - Generate large projects progressively
 * 
 * Purpose: Enable building massive applications (100s-1000s of files) by:
 * 1. Breaking generation into batches
 * 2. Tracking progress and allowing resume
 * 3. Managing memory efficiently
 * 4. Providing real-time feedback
 */

import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import fs from 'fs';
import path from 'path';

export interface GenerationBatch {
    batchId: string;
    files: Map<string, string>;
    dependencies: string[];
    priority: number;
}

export interface ProjectManifest {
    projectId: string;
    name: string;
    type: 'web' | 'api' | 'fullstack' | 'microservices' | 'mobile';
    totalFiles: number;
    generatedFiles: number;
    batches: GenerationBatch[];
    status: 'planning' | 'generating' | 'completed' | 'failed';
    createdAt: string;
    updatedAt: string;
}

export class ProgressiveGeneratorTool extends BaseTool {
    name = 'progressive_generator';
    description = 'Generate large-scale projects progressively with batching, progress tracking, and resume capability';
    version = '1.0.0';
    tags = ['codegen', 'large-scale', 'progressive', 'enterprise'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            action: {
                type: 'string',
                enum: ['init', 'generate_batch', 'get_status', 'resume', 'finalize'],
                description: 'Action to perform'
            },
            projectId: {
                type: 'string',
                description: 'Project identifier for tracking'
            },
            config: {
                type: 'object',
                description: 'Project configuration (required for init)',
                properties: {
                    name: { type: 'string' },
                    type: { type: 'string' },
                    framework: { type: 'string' },
                    features: { type: 'array', items: { type: 'string' } },
                    scale: {
                        type: 'string',
                        enum: ['small', 'medium', 'large', 'enterprise'],
                        description: 'Project scale (determines file count)'
                    }
                }
            },
            batchId: {
                type: 'string',
                description: 'Batch ID to generate (for generate_batch action)'
            },
            batchSize: {
                type: 'number',
                default: 50,
                description: 'Files per batch (default: 50)'
            },
            baseDir: {
                type: 'string',
                description: 'Base directory for project'
            }
        },
        required: ['action']
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            success: { type: 'boolean' },
            projectId: { type: 'string' },
            status: { type: 'string' },
            progress: {
                type: 'object',
                properties: {
                    totalFiles: { type: 'number' },
                    generatedFiles: { type: 'number' },
                    percentage: { type: 'number' }
                }
            },
            nextBatch: { type: 'string' },
            message: { type: 'string' }
        }
    };

    permissions: ToolPermission[] = ['read', 'write'];
    sideEffects: ToolPermission[] = ['write'];

    // In-memory storage for manifests (should be moved to DB for production)
    private static manifests = new Map<string, ProjectManifest>();

    async execute(input: any) {
        const action = input.action;
        const projectId = input.projectId || this.generateProjectId();

        switch (action) {
            case 'init':
                return this.initProject(projectId, input.config, input.baseDir);
            case 'generate_batch':
                return this.generateBatch(projectId, input.batchId, input.baseDir);
            case 'get_status':
                return this.getStatus(projectId);
            case 'resume':
                return this.resumeGeneration(projectId, input.baseDir);
            case 'finalize':
                return this.finalizeProject(projectId);
            default:
                return {
                    ok: false,
                    error: `Unknown action: ${action}`,
                    logs: []
                };
        }
    }

    private generateProjectId(): string {
        return `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private async initProject(projectId: string, config: any, baseDir?: string) {
        const logs: string[] = [];
        
        if (!config) {
            return {
                ok: false,
                error: 'config is required for init action',
                logs
            };
        }

        logs.push(`🚀 Initializing project: ${config.name}`);

        // Determine scale and create batches
        const batches = this.createBatches(config);
        const totalFiles = batches.reduce((sum, b) => sum + b.files.size, 0);

        const manifest: ProjectManifest = {
            projectId,
            name: config.name,
            type: config.type || 'web',
            totalFiles,
            generatedFiles: 0,
            batches,
            status: 'planning',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        ProgressiveGeneratorTool.manifests.set(projectId, manifest);

        logs.push(`📦 Created ${batches.length} batches for ${totalFiles} files`);
        logs.push(`🎯 Scale: ${config.scale || 'medium'}`);

        return {
            ok: true,
            output: {
                success: true,
                projectId,
                status: 'planning',
                progress: {
                    totalFiles,
                    generatedFiles: 0,
                    percentage: 0
                },
                batchCount: batches.length,
                nextBatch: batches[0]?.batchId,
                message: `Project initialized with ${batches.length} batches`
            },
            logs
        };
    }

    private createBatches(config: any): GenerationBatch[] {
        const batches: GenerationBatch[] = [];
        const scale = config.scale || 'medium';
        const type = config.type || 'web';

        // Batch 1: Core infrastructure
        batches.push({
            batchId: 'batch_001_infrastructure',
            files: this.generateInfrastructureFiles(config),
            dependencies: [],
            priority: 10
        });

        // Batch 2: Frontend structure (if web/fullstack)
        if (type === 'web' || type === 'fullstack') {
            batches.push({
                batchId: 'batch_002_frontend_core',
                files: this.generateFrontendCoreFiles(config),
                dependencies: ['batch_001_infrastructure'],
                priority: 9
            });

            // Batch 3-N: Components (based on scale)
            const componentBatches = this.generateComponentBatches(config, scale);
            batches.push(...componentBatches);
        }

        // Backend batches (if api/fullstack)
        if (type === 'api' || type === 'fullstack') {
            batches.push({
                batchId: 'batch_backend_core',
                files: this.generateBackendCoreFiles(config),
                dependencies: ['batch_001_infrastructure'],
                priority: 9
            });

            const apiBatches = this.generateAPIBatches(config, scale);
            batches.push(...apiBatches);
        }

        // Final batch: Documentation and config
        batches.push({
            batchId: 'batch_final_docs',
            files: this.generateDocumentationFiles(config),
            dependencies: batches.map(b => b.batchId).slice(0, -1),
            priority: 1
        });

        return batches;
    }

    private generateInfrastructureFiles(config: any): Map<string, string> {
        const files = new Map<string, string>();
        const name = config.name;

        files.set('package.json', JSON.stringify({
            name,
            version: '1.0.0',
            private: true,
            scripts: {
                dev: 'npm run dev --workspaces',
                build: 'npm run build --workspaces',
                test: 'jest',
                lint: 'eslint .'
            },
            workspaces: config.type === 'fullstack' ? ['apps/frontend', 'apps/backend'] : undefined
        }, null, 2));

        files.set('.gitignore', `node_modules/
dist/
build/
.env
.env.local
*.log
.DS_Store
coverage/
.next/
.cache/
`);

        files.set('README.md', `# ${name}

${config.description || `A ${config.type} application built with ${config.framework}`}

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

## Features

${(config.features || []).map((f: string) => `- ${f}`).join('\n')}

## Tech Stack

- Framework: ${config.framework}
- Type: ${config.type}
`);

        files.set('.env.example', `# Application
NODE_ENV=development
PORT=3000

# Database (if applicable)
# DATABASE_URL=

# API Keys (if applicable)
# API_KEY=
`);

        return files;
    }

    private generateFrontendCoreFiles(config: any): Map<string, string> {
        const files = new Map<string, string>();
        const framework = config.framework || 'react';

        if (framework === 'react' || framework === 'next') {
            files.set('apps/frontend/src/App.tsx', `import React from 'react';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Welcome to ${config.name}</h1>
        <p>Built with ${framework}</p>
      </header>
    </div>
  );
}

export default App;
`);

            files.set('apps/frontend/src/index.tsx', `import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`);

            files.set('apps/frontend/public/index.html', `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${config.name}</title>
</head>
<body>
    <div id="root"></div>
</body>
</html>
`);
        }

        return files;
    }

    private generateComponentBatches(config: any, scale: string): GenerationBatch[] {
        const componentCount = scale === 'small' ? 5 : scale === 'large' ? 30 : scale === 'enterprise' ? 100 : 15;
        const batchSize = 10;
        const batches: GenerationBatch[] = [];

        for (let i = 0; i < componentCount; i += batchSize) {
            const batchNum = Math.floor(i / batchSize) + 1;
            const batchId = `batch_components_${batchNum.toString().padStart(3, '0')}`;
            const files = new Map<string, string>();

            const endIdx = Math.min(i + batchSize, componentCount);
            for (let j = i; j < endIdx; j++) {
                const componentName = `Component${j + 1}`;
                files.set(`apps/frontend/src/components/${componentName}.tsx`, 
                    this.generateComponentFile(componentName, config));
            }

            batches.push({
                batchId,
                files,
                dependencies: ['batch_002_frontend_core'],
                priority: 5
            });
        }

        return batches;
    }

    private generateComponentFile(name: string, config: any): string {
        return `PROMPT: Write a sophisticated React Functional Component named ${name} for a ${config.scale} ${config.type} application called ${config.name}. 
Features: ${(config.features || []).join(', ')}. 
Requirements: Use TypeScript, modern React hooks, and Tailwind/inline styling. Return ONLY the code.`;
    }

    private generateBackendCoreFiles(config: any): Map<string, string> {
        const files = new Map<string, string>();

        files.set('apps/backend/src/index.ts', `import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(\`✅ Server running on port \${PORT}\`);
});
`);

        files.set('apps/backend/package.json', JSON.stringify({
            name: `${config.name}-backend`,
            version: '1.0.0',
            scripts: {
                dev: 'ts-node src/index.ts',
                build: 'tsc',
                start: 'node dist/index.js'
            },
            dependencies: {
                express: '^4.18.0',
                cors: '^2.8.5'
            },
            devDependencies: {
                '@types/express': '^4.17.0',
                '@types/cors': '^2.8.0',
                'ts-node': '^10.9.0',
                typescript: '^5.0.0'
            }
        }, null, 2));

        return files;
    }

    private generateAPIBatches(config: any, scale: string): GenerationBatch[] {
        const endpointCount = scale === 'small' ? 5 : scale === 'large' ? 20 : scale === 'enterprise' ? 50 : 10;
        const batches: GenerationBatch[] = [];
        const files = new Map<string, string>();

        for (let i = 0; i < endpointCount; i++) {
            const routeName = `route${i + 1}`;
            files.set(`apps/backend/src/routes/${routeName}.ts`, 
                this.generateRouteFile(routeName));
        }

        batches.push({
            batchId: 'batch_api_routes',
            files,
            dependencies: ['batch_backend_core'],
            priority: 7
        });

        return batches;
    }

    private generateRouteFile(name: string): string {
        return `PROMPT: Write a complete Express.js Router for the business logic of '${name}'. 
It should include GET, POST, PUT, DELETE with realistic logic or mongoose queries. 
Return ONLY valid TypeScript code, no markdown block formatting.`;
    }

    private generateDocumentationFiles(config: any): Map<string, string> {
        const files = new Map<string, string>();

        files.set('ARCHITECTURE.md', `# ${config.name} - Architecture

## Overview

This is a ${config.scale || 'medium'}-scale ${config.type} application.

## Structure

\`\`\`
${config.name}/
├── apps/
│   ├── frontend/    # Frontend application
│   └── backend/     # Backend API
├── docs/            # Documentation
└── tests/           # Test suites
\`\`\`

## Tech Stack

- Framework: ${config.framework}
- Type: ${config.type}
- Scale: ${config.scale || 'medium'}

## Features

${(config.features || []).map((f: string) => `- ${f}`).join('\n')}
`);

        files.set('CONTRIBUTING.md', `# Contributing to ${config.name}

## Getting Started

1. Clone the repository
2. Install dependencies: \`npm install\`
3. Run development server: \`npm run dev\`

## Code Style

- Use TypeScript
- Follow ESLint rules
- Write tests for new features

## Pull Request Process

1. Create a feature branch
2. Make your changes
3. Write/update tests
4. Submit PR for review
`);

        return files;
    }

    private async generateBatch(projectId: string, batchId: string, baseDir?: string) {
        const logs: string[] = [];
        const manifest = ProgressiveGeneratorTool.manifests.get(projectId);

        if (!manifest) {
            return {
                ok: false,
                error: `Project ${projectId} not found`,
                logs
            };
        }

        const batch = manifest.batches.find(b => b.batchId === batchId);
        if (!batch) {
            return {
                ok: false,
                error: `Batch ${batchId} not found`,
                logs
            };
        }

        logs.push(`📦 Generating batch: ${batchId}`);
        logs.push(`📄 Files in batch: ${batch.files.size}`);

        const resolvedBase = baseDir || path.join(process.cwd(), manifest.name);
        let generatedCount = 0;

        const { callLLM } = require('../../../core/llm');

        for (const [filePath, content] of batch.files.entries()) {
            const fullPath = path.join(resolvedBase, filePath);
            const dir = path.dirname(fullPath);

            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            let finalContent = content;
            if (content.startsWith('PROMPT:')) {
                logs.push(`🤖 Generating using LLM: ${filePath}`);
                try {
                    const promptText = content.substring(7).trim();
                    const llmResponse = await callLLM(`You are an expert developer. Generate code for the file: ${filePath}\n\nTask: ${promptText}\n\nReturn EXACTLY the code to inject into this file without markdown backticks (\`\`\`).`);
                    finalContent = llmResponse.replace(/^\`\`\`[\s\S]*?\n/i, '').replace(/\`\`\`$/i, '').trim();
                } catch (err: any) {
                    logs.push(`❌ LLM failed for ${filePath}: ${err.message}`);
                    finalContent = `// ERROR GENERATING CODE\n// Prompt was: ${content}`;
                }
            }

            fs.writeFileSync(fullPath, finalContent, 'utf-8');
            generatedCount++;
        }

        // Update manifest
        manifest.generatedFiles += generatedCount;
        manifest.updatedAt = new Date().toISOString();
        manifest.status = manifest.generatedFiles >= manifest.totalFiles ? 'completed' : 'generating';

        // Find next batch
        const currentIndex = manifest.batches.findIndex(b => b.batchId === batchId);
        const nextBatch = manifest.batches[currentIndex + 1];

        const progress = {
            totalFiles: manifest.totalFiles,
            generatedFiles: manifest.generatedFiles,
            percentage: Math.round((manifest.generatedFiles / manifest.totalFiles) * 100)
        };

        logs.push(`✅ Generated ${generatedCount} files`);
        logs.push(`📊 Progress: ${progress.percentage}%`);

        return {
            ok: true,
            output: {
                success: true,
                projectId,
                status: manifest.status,
                progress,
                nextBatch: nextBatch?.batchId,
                message: `Batch ${batchId} completed (${generatedCount} files)`
            },
            logs
        };
    }

    private getStatus(projectId: string) {
        const manifest = ProgressiveGeneratorTool.manifests.get(projectId);

        if (!manifest) {
            return {
                ok: false,
                error: `Project ${projectId} not found`,
                logs: []
            };
        }

        const progress = {
            totalFiles: manifest.totalFiles,
            generatedFiles: manifest.generatedFiles,
            percentage: Math.round((manifest.generatedFiles / manifest.totalFiles) * 100)
        };

        const pendingBatches = manifest.batches.filter(
            (b, idx) => idx >= Math.floor(manifest.generatedFiles / 50)
        );

        return {
            ok: true,
            output: {
                success: true,
                projectId,
                status: manifest.status,
                progress,
                batchesTotal: manifest.batches.length,
                batchesPending: pendingBatches.length,
                nextBatch: pendingBatches[0]?.batchId
            },
            logs: [`Project ${manifest.name} status: ${manifest.status}`]
        };
    }

    private resumeGeneration(projectId: string, baseDir?: string) {
        const status = this.getStatus(projectId);
        
        if (!status.ok || !status.output) {
            return status;
        }

        const nextBatch = status.output.nextBatch;
        if (!nextBatch) {
            return {
                ok: true,
                output: {
                    success: true,
                    message: 'Project is already complete',
                    status: 'completed'
                },
                logs: ['Nothing to resume - project is complete']
            };
        }

        return this.generateBatch(projectId, nextBatch, baseDir);
    }

    private finalizeProject(projectId: string) {
        const manifest = ProgressiveGeneratorTool.manifests.get(projectId);

        if (!manifest) {
            return {
                ok: false,
                error: `Project ${projectId} not found`,
                logs: []
            };
        }

        manifest.status = 'completed';
        manifest.updatedAt = new Date().toISOString();

        return {
            ok: true,
            output: {
                success: true,
                projectId,
                status: 'completed',
                totalFiles: manifest.totalFiles,
                message: `Project ${manifest.name} finalized successfully!`
            },
            logs: [
                `🎉 Project finalized!`,
                `📦 Total files: ${manifest.totalFiles}`,
                `🎯 Type: ${manifest.type}`
            ]
        };
    }
}
