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
    expect(plan.suggestedInput).toMatchObject({
      path: importer.replace(/\\\\/g, '/'),
    });
    expect(plan.suggestedInput.description).toMatch(/importer .* missing/i);
    expect(plan.suggestedInput.description).toContain('../styles/app.css');
    expect(plan.suggestedInput).not.toHaveProperty('filename');

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
