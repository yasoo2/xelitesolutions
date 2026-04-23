import fs from 'fs';
import path from 'path';
import type { ProjectContext } from './types';

function safeReadJson(file: string): any | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function exists(root: string, rel: string) {
  return fs.existsSync(path.join(root, rel));
}

function collectExisting(root: string, rels: string[]) {
  return rels.filter((rel) => exists(root, rel));
}

export class ProjectInspector {
  inspect(projectRoot?: string): ProjectContext {
    const root = path.resolve(projectRoot || path.join(process.cwd(), path.basename(process.cwd()) === 'api' ? '..' : '.'));
    const rootPkg = safeReadJson(path.join(root, 'package.json')) || {};
    const apiPkg = safeReadJson(path.join(root, 'api', 'package.json')) || {};
    const webPkg = safeReadJson(path.join(root, 'web', 'package.json')) || {};

    const frameworks = new Set<string>();
    const deps = {
      ...(rootPkg.dependencies || {}),
      ...(rootPkg.devDependencies || {}),
      ...(apiPkg.dependencies || {}),
      ...(apiPkg.devDependencies || {}),
      ...(webPkg.dependencies || {}),
      ...(webPkg.devDependencies || {}),
    };

    if (deps.react) frameworks.add('React');
    if (deps.vite) frameworks.add('Vite');
    if (deps.express) frameworks.add('Express');
    if (deps.mongoose) frameworks.add('MongoDB/Mongoose');
    if (deps.ws) frameworks.add('WebSocket');
    if (deps.playwright) frameworks.add('Playwright');
    if (deps.typescript) frameworks.add('TypeScript');

    const packageScripts: Record<string, string> = {
      ...Object.fromEntries(Object.entries(rootPkg.scripts || {}).map(([k, v]) => [`root:${k}`, String(v)])),
      ...Object.fromEntries(Object.entries(apiPkg.scripts || {}).map(([k, v]) => [`api:${k}`, String(v)])),
      ...Object.fromEntries(Object.entries(webPkg.scripts || {}).map(([k, v]) => [`web:${k}`, String(v)])),
    };

    const entryFiles = collectExisting(root, [
      'api/src/api/index.ts',
      'api/src/api/app.ts',
      'api/src/core/llm.ts',
      'web/src/main.tsx',
      'web/src/App.tsx',
      'web/src/config.ts',
    ]);

    const configFiles = collectExisting(root, [
      'package.json',
      'api/package.json',
      'web/package.json',
      'api/tsconfig.json',
      'web/tsconfig.json',
      'web/vite.config.ts',
      'web/nginx.conf',
    ]);

    const deployFiles = collectExisting(root, [
      'api/Dockerfile',
      'web/Dockerfile',
      'docker-compose.yml',
      'docker-compose.production.yml',
      'render.yaml',
      'vercel.json',
    ]);

    const buildCommands = Object.keys(packageScripts)
      .filter((k) => k.endsWith(':build') || k.includes('build'))
      .map((k) => `${k} -> ${packageScripts[k]}`);

    const testCommands = Object.keys(packageScripts)
      .filter((k) => k.includes('test'))
      .map((k) => `${k} -> ${packageScripts[k]}`);

    const envHints = collectExisting(root, ['.env.example', 'env.example', 'api/.env.example', 'web/.env.example']);

    return {
      root,
      frameworks: Array.from(frameworks),
      packageScripts,
      frontendRoot: exists(root, 'web') ? 'web' : undefined,
      backendRoot: exists(root, 'api') ? 'api' : undefined,
      entryFiles,
      configFiles,
      testCommands,
      buildCommands,
      deployFiles,
      envHints,
    };
  }
}

export const projectInspector = new ProjectInspector();
