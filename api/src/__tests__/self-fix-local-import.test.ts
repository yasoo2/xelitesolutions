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
    expect(plan.suggestedInput).toBeDefined();
    if (plan.suggestedInput === undefined) {
      throw new Error('build_fix plan is missing suggested input');
    }
    /**
     *  ⛔ THIS LINE CARRIED THE SAME DEFECT AS THE CODE IT GUARDS.
     *
     *  It normalised with a regex matching TWO consecutive backslashes —
     *  exactly what `missingExplicitLocalTarget` did a few lines away in
     *  the file under test. **Both sides were no-ops on Windows, and both
     *  were no-ops on Linux for the opposite reason, so the two agreed
     *  perfectly and this test was green while neither did anything.**
     *
     *  A guard written by the same hand with the same mistake is not a
     *  second opinion. That is why the class-level check at the bottom of
     *  this file scans the SOURCE for the broken spelling instead of
     *  trusting any one assertion about behaviour.
     */
    /**
     *  ⛔ THIS LINE CARRIED THE SAME DEFECT AS THE CODE IT GUARDS.
     *
     *  It read `importer.replace(/\\\\/g, '/')` — a regex matching TWO
     *  consecutive backslashes — which is exactly what
     *  `missingExplicitLocalTarget` read a few lines away in the file under
     *  test. **Both sides were no-ops on Windows, and both were no-ops on
     *  Linux for the opposite reason, so the two agreed perfectly and the
     *  test was green while neither did anything.**
     *
     *  A guard written by the same hand with the same mistake is not a second
     *  opinion. That is why the class-level check at the bottom of this file
     *  scans the SOURCE for the broken spelling instead of trusting any one
     *  assertion about behaviour.
     */
    expect(plan.suggestedInput).toMatchObject({
      path: importer.replace(/\\/g, '/'),
    });
    expect(plan.suggestedInput.description).toMatch(/importer .* missing/i);
    expect(plan.suggestedInput.description).toContain('../styles/app.css');
    expect(plan.suggestedInput).not.toHaveProperty('filename');

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

/**
 * ⛔ THE CLASS, NOT THE INSTANCE — «أصلح فئة الخطأ التي أنتجته».
 *
 * Four lines in `SelfFixService.ts` normalised Windows separators with a regex
 * matching a DOUBLE backslash. A path in memory holds single ones, so the four
 * did nothing, and one plan object went out with `filename` normalised and
 * `path` raw: the same file under two different strings, so anything comparing
 * them found two files.
 *
 * Seventy-eight normalisations in this repository are spelled correctly and
 * four were not. The wrong one is never the only one — it is the one nobody
 * re-read — so this counts them rather than naming them.
 *
 * ⛔ AND IT WAS INVISIBLE WHERE THE GATE USED TO RUN. On Linux a path has no
 * backslashes at all, so both spellings behave identically and every suite is
 * green. The defect has existed for as long as the file has, and it surfaced
 * in the first hour that the owner's own machine became the only place the
 * gate has to pass.
 */
describe('a separator is normalised by a regex that matches one, not two', () => {
    const SOURCES = (() => {
        const out: Record<string, string> = {};
        const walk = (dir: string) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const p = path.join(dir, e.name);
                if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') walk(p); continue; }
                if (e.name.endsWith('.ts')) out[p] = fs.readFileSync(p, 'utf-8');
            }
        };
        walk(path.join(__dirname, '..'));
        return out;
    })();

    //  Built from pieces so this file does not itself contain the pattern it
    //  forbids — a guard that trips on its own text is a guard that cannot be
    //  written down.
    const BS = String.fromCharCode(92);
    const BROKEN = 'replace(/' + BS + BS + BS + BS + '/g';
    const CORRECT = 'replace(/' + BS + BS + '/g';
    const isComment = (l: string) => /^\s*(\/\/|\*|\/\*)/.test(l);

    it('⛔ POSITIVE — no production file normalises with the double form', () => {
        const offenders: string[] = [];
        for (const [file, src] of Object.entries(SOURCES)) {
            src.split('\n').forEach((line, i) => {
                if (isComment(line)) return;
                if (line.includes(BROKEN)) offenders.push(`${path.basename(file)}:${i + 1}`);
            });
        }
        expect(offenders).toEqual([]);
    });

    it('⛔ NEGATIVE — and the correct form is what the repository is built on', () => {
        //  A tree with zero normalisations would also pass the test above, and
        //  «none broken» over none at all is the empty-gate shape this
        //  repository has been bitten by before.
        let good = 0;
        for (const src of Object.values(SOURCES)) {
            good += src.split('\n').filter(l => !isComment(l) && l.includes(CORRECT) && !l.includes(BROKEN)).length;
        }
        expect(good).toBeGreaterThan(40);
    });
});
