/**
 * Large-Scale Code Generation Engine
 * Generates production-ready, multi-file projects with best practices
 */

export interface CodeTemplate {
    name: string;
    description: string;
    language: string;
    framework?: string;
    files: TemplateFile[];
}

export interface TemplateFile {
    path: string;
    content: string | ((context: any) => string);
    type: 'code' | 'config' | 'docs' | 'test';
}

export interface ProjectConfig {
    name: string;
    type: 'web' | 'api' | 'fullstack' | 'mobile';
    framework: string;
    features: string[];
    styling?: 'tailwind' | 'css' | 'styled-components';
    database?: 'mongodb' | 'postgres' | 'mysql';
    auth?: boolean;
    testing?: boolean;
}

/**
 * React + TypeScript + Vite Template
 */
export const REACT_VITE_TEMPLATE: CodeTemplate = {
    name: 'react-vite-ts',
    description: 'React + TypeScript + Vite',
    language: 'typescript',
    framework: 'react',
    files: [
        {
            path: 'package.json',
            type: 'config',
            content: (ctx) => JSON.stringify({
                name: ctx.name || 'my-app',
                version: '1.0.0',
                type: 'module',
                scripts: {
                    dev: 'vite',
                    build: 'tsc && vite build',
                    preview: 'vite preview',
                    test: ctx.testing ? 'vitest' : undefined
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
                    vite: '^5.0.0',
                    ...(ctx.testing ? { vitest: '^1.0.0' } : {})
                }
            }, null, 2)
        },
        {
            path: 'tsconfig.json',
            type: 'config',
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
                    strict: true,
                    noUnusedLocals: true,
                    noUnusedParameters: true,
                    noFallthroughCasesInSwitch: true
                },
                include: ['src'],
                references: [{ path: './tsconfig.node.json' }]
            }, null, 2)
        },
        {
            path: 'vite.config.ts',
            type: 'config',
            content: `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
`
        },
        {
            path: 'index.html',
            type: 'code',
            content: (ctx) => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${ctx.name || 'My App'}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`
        },
        {
            path: 'src/main.tsx',
            type: 'code',
            content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`
        },
        {
            path: 'src/App.tsx',
            type: 'code',
            content: (ctx) => `import { useState } from 'react';
import './App.css';

function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="app">
      <header>
        <h1>${ctx.name || 'Welcome'}</h1>
      </header>
      <main>
        <button onClick={() => setCount(count + 1)}>
          Count: {count}
        </button>
      </main>
    </div>
  );
}

export default App;
`
        },
        {
            path: 'src/index.css',
            type: 'code',
            content: `:root {
  font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  font-weight: 400;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  min-height: 100vh;
  display: flex;
  place-items: center;
  justify-content: center;
}

.app {
  max-width: 1280px;
  margin: 0 auto;
  padding: 2rem;
  text-align: center;
}

button {
  padding: 0.6em 1.2em;
  font-size: 1em;
  font-weight: 500;
  cursor: pointer;
  border-radius: 8px;
  border: 1px solid transparent;
  transition: border-color 0.25s;
}

button:hover {
  border-color: #646cff;
}
`
        },
        {
            path: 'src/App.css',
            type: 'code',
            content: `.app {
  text-align: center;
}

header {
  margin-bottom: 2rem;
}

h1 {
  font-size: 3em;
  line-height: 1.1;
}
`
        },
        {
            path: 'README.md',
            type: 'docs',
            content: (ctx) => `# ${ctx.name || 'My App'}

A React + TypeScript + Vite application.

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

## Build

\`\`\`bash
npm run build
\`\`\`

## Features

${ctx.features?.map((f: string) => `- ${f}`).join('\n') || '- Modern React setup'}
`
        }
    ]
};

/**
 * Express + TypeScript API Template
 */
export const EXPRESS_API_TEMPLATE: CodeTemplate = {
    name: 'express-api-ts',
    description: 'Express + TypeScript REST API',
    language: 'typescript',
    framework: 'express',
    files: [
        {
            path: 'package.json',
            type: 'config',
            content: (ctx) => JSON.stringify({
                name: ctx.name || 'api',
                version: '1.0.0',
                main: 'dist/index.js',
                scripts: {
                    dev: 'tsx watch src/index.ts',
                    build: 'tsc',
                    start: 'node dist/index.js',
                    test: ctx.testing ? 'vitest' : undefined
                },
                dependencies: {
                    express: '^4.18.0',
                    cors: '^2.8.5',
                    dotenv: '^16.0.0',
                    ...(ctx.database === 'mongodb' ? { mongoose: '^8.0.0' } : {}),
                    ...(ctx.database === 'postgres' ? { pg: '^8.11.0' } : {})
                },
                devDependencies: {
                    '@types/express': '^4.17.0',
                    '@types/cors': '^2.8.0',
                    '@types/node': '^20.0.0',
                    typescript: '^5.0.0',
                    tsx: '^4.0.0',
                    ...(ctx.testing ? { vitest: '^1.0.0' } : {})
                }
            }, null, 2)
        },
        {
            path: 'tsconfig.json',
            type: 'config',
            content: JSON.stringify({
                compilerOptions: {
                    target: 'ES2020',
                    module: 'commonjs',
                    lib: ['ES2020'],
                    outDir: './dist',
                    rootDir: './src',
                    strict: true,
                    esModuleInterop: true,
                    skipLibCheck: true,
                    forceConsistentCasingInFileNames: true,
                    resolveJsonModule: true
                },
                include: ['src/**/*'],
                exclude: ['node_modules']
            }, null, 2)
        },
        {
            path: 'src/index.ts',
            type: 'code',
            content: (ctx) => `import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
${ctx.database === 'mongodb' ? "import mongoose from 'mongoose';" : ''}

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

${ctx.database === 'mongodb' ? `
// MongoDB connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/${ctx.name}';
mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));
` : ''}

// Start server
app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});

export default app;
`
        },
        {
            path: '.env.example',
            type: 'config',
            content: (ctx) => `PORT=3000
${ctx.database === 'mongodb' ? `MONGO_URI=mongodb://localhost:27017/${ctx.name}` : ''}
${ctx.database === 'postgres' ? `DATABASE_URL=postgresql://user:password@localhost:5432/${ctx.name}` : ''}
`
        },
        {
            path: 'README.md',
            type: 'docs',
            content: (ctx) => `# ${ctx.name || 'API'}

A TypeScript REST API built with Express.

## Setup

\`\`\`bash
npm install
cp .env.example .env
# Edit .env with your configuration
\`\`\`

## Development

\`\`\`bash
npm run dev
\`\`\`

## Build

\`\`\`bash
npm run build
npm start
\`\`\`

## API Endpoints

- \`GET /health\` - Health check

${ctx.features?.map((f: string) => `- ${f}`).join('\n') || ''}
`
        }
    ]
};

/**
 * Code Generator
 */
export class LargeScaleCodeGenerator {
    private templates: Map<string, CodeTemplate> = new Map();

    constructor() {
        this.registerTemplate(REACT_VITE_TEMPLATE);
        this.registerTemplate(EXPRESS_API_TEMPLATE);
    }

    registerTemplate(template: CodeTemplate) {
        this.templates.set(template.name, template);
    }

    /**
     * Generate a complete project
     */
    async generateProject(config: ProjectConfig): Promise<{
        files: Map<string, string>;
        structure: string;
    }> {
        const files = new Map<string, string>();

        // Select template
        let template: CodeTemplate | undefined;

        if (config.type === 'web' && config.framework === 'react') {
            template = this.templates.get('react-vite-ts');
        } else if (config.type === 'api' && config.framework === 'express') {
            template = this.templates.get('express-api-ts');
        } else if (config.type === 'fullstack') {
            // Generate both
            const frontendFiles = await this.generateFromTemplate(
                this.templates.get('react-vite-ts')!,
                { ...config, name: `${config.name}-frontend` }
            );
            const backendFiles = await this.generateFromTemplate(
                this.templates.get('express-api-ts')!,
                { ...config, name: `${config.name}-api` }
            );

            // Prefix paths
            for (const [path, content] of frontendFiles) {
                files.set(`frontend/${path}`, content);
            }
            for (const [path, content] of backendFiles) {
                files.set(`backend/${path}`, content);
            }

            // Add root files
            files.set('README.md', this.generateRootReadme(config));
            files.set('.gitignore', this.generateGitignore());

            return {
                files,
                structure: this.generateStructure(files)
            };
        }

        if (template) {
            const projectFiles = await this.generateFromTemplate(template, config);
            for (const [path, content] of projectFiles) {
                files.set(path, content);
            }

            // Add common files
            files.set('.gitignore', this.generateGitignore());
        }

        return {
            files,
            structure: this.generateStructure(files)
        };
    }

    private async generateFromTemplate(
        template: CodeTemplate,
        context: any
    ): Promise<Map<string, string>> {
        const files = new Map<string, string>();

        for (const file of template.files) {
            let content: string;

            if (typeof file.content === 'function') {
                content = file.content(context);
            } else {
                content = file.content;
            }

            files.set(file.path, content);
        }

        return files;
    }

    private generateRootReadme(config: ProjectConfig): string {
        return `# ${config.name}

A ${config.type} application built with ${config.framework}.

## Project Structure

\`\`\`
${config.name}/
├── frontend/     # React frontend
└── backend/      # Express API
\`\`\`

## Getting Started

### Frontend
\`\`\`bash
cd frontend
npm install
npm run dev
\`\`\`

### Backend
\`\`\`bash
cd backend
npm install
npm run dev
\`\`\`

## Features

${config.features.map(f => `- ${f}`).join('\n')}
`;
    }

    private generateGitignore(): string {
        return `node_modules/
dist/
.env
.env.local
*.log
.DS_Store
coverage/
`;
    }

    private generateStructure(files: Map<string, string>): string {
        const paths = Array.from(files.keys()).sort();
        const tree: any = {};

        for (const path of paths) {
            const parts = path.split('/');
            let current = tree;

            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                if (i === parts.length - 1) {
                    current[part] = null; // File
                } else {
                    current[part] = current[part] || {};
                    current = current[part];
                }
            }
        }

        return this.stringifyTree(tree, '', true);
    }

    private stringifyTree(node: any, prefix: string = '', isLast: boolean = true): string {
        let result = '';
        const entries = Object.entries(node);

        entries.forEach(([key, value], index) => {
            const isLastEntry = index === entries.length - 1;
            const connector = isLastEntry ? '└──' : '├──';
            const extension = isLastEntry ? '    ' : '│   ';

            result += `${prefix}${connector} ${key}\n`;

            if (value !== null) {
                result += this.stringifyTree(value, prefix + extension, isLastEntry);
            }
        });

        return result;
    }
}

export const codeGenerator = new LargeScaleCodeGenerator();

export default codeGenerator;
