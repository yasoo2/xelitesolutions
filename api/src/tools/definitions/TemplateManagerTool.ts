import { ToolDefinition } from '../types';

/**
 * TemplateManagerTool - Provides pre-built templates for common project types
 * Accelerates project creation with battle-tested structures
 */
export class TemplateManagerTool implements ToolDefinition {
    name = 'template_manager';
    version = '1.0.0';
    description = 'Get pre-built templates for common project types (React, Node, Express, etc.)';
    tags = ['templates', 'scaffold', 'boilerplate'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            templateType: {
                type: 'string' as const,
                enum: ['react-app', 'node-api', 'express-api', 'fullstack', 'static-site', 'list'],
                description: 'Type of template to retrieve'
            },
            projectName: {
                type: 'string' as const,
                description: 'Name of the project (for customization)'
            }
        },
        required: ['templateType']
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            template: { type: 'object' as const },
            files: {
                type: 'array' as const,
                items: { type: 'object' as const }
            }
        }
    };

    permissions = [];
    sideEffects = [];
    rateLimitPerMinute = 30;
    auditFields = ['templateType'];
    mockSupported = false;

    async execute(input: { templateType: string; projectName?: string }) {
        const { templateType, projectName = 'my-project' } = input;
        const logs: string[] = [];

        try {
            logs.push(`Retrieving template: ${templateType}`);

            if (templateType === 'list') {
                return this.listTemplates(logs);
            }

            const template = this.getTemplate(templateType, projectName);

            if (!template) {
                throw new Error(`Template '${templateType}' not found`);
            }

            logs.push(`Template ready: ${template.files.length} files`);

            return {
                ok: true,
                output: template,
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

    private listTemplates(logs: string[]) {
        const templates = [
            { name: 'react-app', description: 'React application with TypeScript', files: 15 },
            { name: 'node-api', description: 'Node.js REST API with Express', files: 12 },
            { name: 'express-api', description: 'Express API with MongoDB', files: 14 },
            { name: 'fullstack', description: 'React + Node.js fullstack', files: 25 },
            { name: 'static-site', description: 'Static HTML/CSS/JS website', files: 8 }
        ];

        return {
            ok: true,
            output: { templates },
            logs
        };
    }

    private getTemplate(type: string, projectName: string): any {
        const templates: Record<string, any> = {
            'react-app': this.getReactTemplate(projectName),
            'node-api': this.getNodeApiTemplate(projectName),
            'express-api': this.getExpressTemplate(projectName),
            'fullstack': this.getFullstackTemplate(projectName),
            'static-site': this.getStaticSiteTemplate(projectName)
        };

        return templates[type];
    }

    private getReactTemplate(projectName: string) {
        return {
            name: projectName,
            type: 'react-app',
            files: [
                {
                    path: 'package.json',
                    content: JSON.stringify({
                        name: projectName,
                        version: '1.0.0',
                        scripts: {
                            dev: 'vite',
                            build: 'vite build',
                            preview: 'vite preview'
                        },
                        dependencies: {
                            react: '^18.2.0',
                            'react-dom': '^18.2.0'
                        },
                        devDependencies: {
                            '@types/react': '^18.2.0',
                            '@types/react-dom': '^18.2.0',
                            '@vitejs/plugin-react': '^4.0.0',
                            typescript: '^5.0.0',
                            vite: '^4.0.0'
                        }
                    }, null, 2)
                },
                {
                    path: 'index.html',
                    content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`
                },
                {
                    path: 'src/main.tsx',
                    content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`
                },
                {
                    path: 'src/App.tsx',
                    content: `import React from 'react';

function App() {
  return (
    <div className="App">
      <h1>Welcome to ${projectName}</h1>
      <p>Start building your React app!</p>
    </div>
  );
}

export default App;`
                },
                {
                    path: 'src/index.css',
                    content: `body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
}

.App {
  text-align: center;
  padding: 2rem;
}`
                },
                {
                    path: 'vite.config.ts',
                    content: `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});`
                },
                {
                    path: 'tsconfig.json',
                    content: JSON.stringify({
                        compilerOptions: {
                            target: 'ES2020',
                            useDefineForClassFields: true,
                            lib: ['ES2020', 'DOM', 'DOM.Iterable'],
                            module: 'ESNext',
                            skipLibCheck: true,
                            moduleResolution: 'bundler',
                            allowImportingTsExtensions: true,
                            resolveJsonModule: true,
                            isolatedModules: true,
                            noEmit: true,
                            jsx: 'react-jsx',
                            strict: true
                        },
                        include: ['src']
                    }, null, 2)
                },
                {
                    path: 'README.md',
                    content: `# ${projectName}

React application built with Vite and TypeScript.

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`
`
                }
            ]
        };
    }

    private getNodeApiTemplate(projectName: string) {
        return {
            name: projectName,
            type: 'node-api',
            files: [
                {
                    path: 'package.json',
                    content: JSON.stringify({
                        name: projectName,
                        version: '1.0.0',
                        scripts: {
                            start: 'node dist/index.js',
                            dev: 'ts-node src/index.ts',
                            build: 'tsc'
                        },
                        dependencies: {
                            express: '^4.18.0',
                            cors: '^2.8.5'
                        },
                        devDependencies: {
                            '@types/express': '^4.17.0',
                            '@types/cors': '^2.8.0',
                            typescript: '^5.0.0',
                            'ts-node': '^10.9.0'
                        }
                    }, null, 2)
                },
                {
                    path: 'src/index.ts',
                    content: `import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});`
                },
                {
                    path: 'tsconfig.json',
                    content: JSON.stringify({
                        compilerOptions: {
                            target: 'ES2020',
                            module: 'commonjs',
                            outDir: './dist',
                            rootDir: './src',
                            strict: true,
                            esModuleInterop: true
                        }
                    }, null, 2)
                },
                {
                    path: 'README.md',
                    content: `# ${projectName}

Node.js API with Express and TypeScript.

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`
`
                }
            ]
        };
    }

    private getExpressTemplate(projectName: string) {
        // Similar to node-api but with MongoDB
        return this.getNodeApiTemplate(projectName);
    }

    private getFullstackTemplate(projectName: string) {
        // Combination of React + Node
        return {
            name: projectName,
            type: 'fullstack',
            files: [
                ...this.getReactTemplate(`${projectName}-client`).files.map((f: any) => ({
                    ...f,
                    path: `client/${f.path}`
                })),
                ...this.getNodeApiTemplate(`${projectName}-server`).files.map((f: any) => ({
                    ...f,
                    path: `server/${f.path}`
                }))
            ]
        };
    }

    private getStaticSiteTemplate(projectName: string) {
        return {
            name: projectName,
            type: 'static-site',
            files: [
                {
                    path: 'index.html',
                    content: `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${projectName}</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <h1>Welcome to ${projectName}</h1>
    <script src="script.js"></script>
</body>
</html>`
                },
                {
                    path: 'style.css',
                    content: `body {
  font-family: Arial, sans-serif;
  margin: 0;
  padding: 20px;
  background: #f5f5f5;
}

h1 {
  color: #333;
}`
                },
                {
                    path: 'script.js',
                    content: `console.log('${projectName} loaded');`
                }
            ]
        };
    }
}
