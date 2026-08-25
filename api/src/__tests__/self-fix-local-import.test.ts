import fs from 'fs';
import os from 'os';
import path from 'path';
import { SelfFixService } from '../modules/services/SelfFixService';

function ticketFor(importer: string, specifier: string): any {
  return {
    severity: 'error',
    primaryError: `unresolved_local_import: ${importer} imports "${specifier}", but no file resolves from the importer`,
    failedTasks: [],
    context: { workspaceId: 'local-import-test' },
  };
}

describe('SelfFixService evidence-bound local import repair', () => {
  it('repairs a wrong relative path when the parent-layout target exists', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-local-import-'));
    const importer = path.join(root, 'src', 'components', 'WeatherApp.jsx');
    const stylesheet = path.join(root, 'src', 'styles', 'app.css');
    fs.mkdirSync(path.dirname(importer), { recursive: true });
    fs.mkdirSync(path.dirname(stylesheet), { recursive: true });
    fs.writeFileSync(importer, `import './styles/app.css';\nexport default function WeatherApp() { return null; }\n`);
    fs.writeFileSync(stylesheet, '.weather-app { color: red; }\n');

    const plan = SelfFixService.plan(ticketFor(importer, './styles/app.css'));

    expect(plan.allowed).toBe(true);
    expect(plan.strategy).toBe('code_fix');
    expect(plan.suggestedTool).toBe('file_edit');
    expect(plan.suggestedInput).toMatchObject({
      filename: importer.replace(/\\/g, '/'),
      find: './styles/app.css',
      replace: '../styles/app.css',
    });
    expect(plan.suggestedInput).not.toHaveProperty('filePath');

    fs.rmSync(root, { recursive: true, force: true });
  });

  it('repairs every proven local import in one importer atomically', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-local-import-'));
    const importer = path.join(root, 'src', 'components', 'WeatherApp.jsx');
    const stylesheet = path.join(root, 'src', 'styles', 'app.css');
    const weatherService = path.join(root, 'src', 'services', 'weatherService.ts');
    const favoritesService = path.join(root, 'src', 'services', 'favoritesService.ts');
    fs.mkdirSync(path.dirname(importer), { recursive: true });
    fs.mkdirSync(path.dirname(stylesheet), { recursive: true });
    fs.mkdirSync(path.dirname(weatherService), { recursive: true });
    fs.writeFileSync(importer, [
      "import './styles/app.css';",
      "import { getWeather } from './services/weatherService';",
      "import { loadFavorites } from './services/favoritesService';",
      'export default function WeatherApp() { return null; }',
      '',
    ].join('\\n'));
    fs.writeFileSync(stylesheet, '.weather-app { color: red; }\\n');
    fs.writeFileSync(weatherService, 'export const getWeather = () => null;\\n');
    fs.writeFileSync(favoritesService, 'export const loadFavorites = () => [];\\n');

    const plan = SelfFixService.plan({
      ...ticketFor(importer, './styles/app.css'),
      primaryError: [
        `unresolved_local_import: ${importer} imports "./styles/app.css", "./services/weatherService", "./services/favoritesService", but no file resolves from the importer`,
      ].join('\\n'),
    });

    expect(plan.allowed).toBe(true);
    expect(plan.strategy).toBe('code_fix');
    expect(plan.suggestedTool).toBe('file_edit_advanced');
    expect(plan.suggestedInput).toMatchObject({
      filePath: importer.replace(/\\/g, '/'),
      edits: [
        { find: './styles/app.css', replace: '../styles/app.css' },
        { find: './services/weatherService', replace: '../services/weatherService' },
        { find: './services/favoritesService', replace: '../services/favoritesService' },
      ],
    });

    fs.rmSync(root, { recursive: true, force: true });
  });

  it('normalizes a malformed ellipsis traversal when the parent-layout target exists', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-local-import-'));
    const importer = path.join(root, 'src', 'components', 'WeatherApp.jsx');
    const stylesheet = path.join(root, 'src', 'styles', 'app.css');
    fs.mkdirSync(path.dirname(importer), { recursive: true });
    fs.mkdirSync(path.dirname(stylesheet), { recursive: true });
    fs.writeFileSync(importer, `import '.../styles/app.css';\nexport default function WeatherApp() { return null; }\n`);
    fs.writeFileSync(stylesheet, '.weather-app { color: red; }\n');

    const plan = SelfFixService.plan(ticketFor(importer, '.../styles/app.css'));

    expect(plan.allowed).toBe(true);
    expect(plan.strategy).toBe('code_fix');
    expect(plan.suggestedTool).toBe('file_edit');
    expect(plan.suggestedInput).toMatchObject({
      filename: importer.replace(/\\/g, '/'),
      find: '.../styles/app.css',
      replace: '../styles/app.css',
    });

    fs.rmSync(root, { recursive: true, force: true });
  });

  it('regenerates a missing importer when its parent-layout target exists', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-local-import-'));
    const importer = path.join(root, 'src', 'components', 'WeatherApp.jsx');
    const stylesheet = path.join(root, 'src', 'styles', 'app.css');
    fs.mkdirSync(path.dirname(stylesheet), { recursive: true });
    fs.writeFileSync(stylesheet, '.weather-app { color: red; }\\n');

    const plan = SelfFixService.plan(ticketFor(importer, './styles/app.css'));

    expect(plan.allowed).toBe(true);
    expect(plan.strategy).toBe('build_fix');
    expect(plan.suggestedTool).toBe('ai_write_file');
    const suggestedInput = plan.suggestedInput;
    if (!suggestedInput) throw new Error('an allowed build_fix plan carried no suggestedInput to hand the writer');
    expect(suggestedInput).toMatchObject({
      path: importer.replace(/\\\\/g, '/'),
    });
    expect(suggestedInput.description).toMatch(/importer .* missing/i);
    expect(suggestedInput.description).toContain('../styles/app.css');
    expect(suggestedInput).not.toHaveProperty('filename');

    fs.rmSync(root, { recursive: true, force: true });
  });

  it('regenerates an existing importer when the rejected candidate was never written', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-local-import-'));
    const importer = path.join(root, 'src', 'components', 'WeatherApp.tsx');
    const stylesheet = path.join(root, 'src', 'App.css');
    fs.mkdirSync(path.dirname(importer), { recursive: true });
    fs.writeFileSync(importer, "import React from 'react';\nexport default function WeatherApp() { return null; }\n");
    fs.writeFileSync(stylesheet, '.weather-app { color: red; }\n');

    const plan = SelfFixService.plan(ticketFor(importer, './App.css'));

    expect(plan.allowed).toBe(true);
    expect(plan.strategy).toBe('build_fix');
    expect(plan.suggestedTool).toBe('ai_write_file');
    expect(plan.suggestedInput?.path).toBe(importer.replace(/\\/g, '/'));
    expect(plan.suggestedInput?.description).toContain('does not contain the rejected specifier');
    expect(plan.suggestedInput?.description).toContain('../App.css');
    expect(plan.suggestedInput).not.toHaveProperty('filename');

    fs.rmSync(root, { recursive: true, force: true });
  });

  it('does not invent a malformed ellipsis target when no in-project target exists', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-local-import-'));
    const importer = path.join(root, 'src', 'components', 'WeatherApp.jsx');
    fs.mkdirSync(path.dirname(importer), { recursive: true });

    const plan = SelfFixService.plan(ticketFor(importer, '.../styles/app.css'));

    expect(plan.suggestedTool).toBe('ai_write_file');
    expect(plan.suggestedInput?.path).toBe(importer.replace(/\\/g, '/'));
    expect(plan.suggestedInput?.path).not.toContain(`${path.sep}...${path.sep}`);

    fs.rmSync(root, { recursive: true, force: true });
  });

  it('does not invent a redirect when no in-project target exists', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-local-import-'));
    const importer = path.join(root, 'src', 'components', 'WeatherApp.jsx');
    fs.mkdirSync(path.dirname(importer), { recursive: true });

    const plan = SelfFixService.plan(ticketFor(importer, './styles/app.css'));

    expect(plan.suggestedTool).toBe('ai_write_file');
    expect(plan.suggestedInput?.path).toBe(path.join(root, 'src', 'components', 'styles', 'app.css').replace(/\\/g, '/'));

    fs.rmSync(root, { recursive: true, force: true });
  });
});

afterAll(() => {
  jest.restoreAllMocks();
});
