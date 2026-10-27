/**
 * Eval 2026-10-27, P001-landing-ar (run-1793086226335): the plan's write_file
 * for src/index.html carried `<section id="contact">...</section>` for every
 * part of the page, PhaseExecutor wrote it verbatim, and the delivered landing
 * page had no hero, no services and no contact form.
 */
const calls: Array<{ tool: string; args: any }> = [];
jest.mock('../modules/services/ToolService', () => ({
  executeTool: jest.fn(async (toolName: string, args: any) => {
    calls.push({ tool: toolName, args });
    return { ok: true, output: { message: `mock executed ${toolName}` } };
  }),
}));

import { PhaseExecutorTool } from '../modules/tools/definitions/PhaseExecutorTool';
import { elidedParts } from '../shared/utils/elided-content';

const OUTLINED_PAGE = [
  '<!DOCTYPE html>',
  '<html lang="ar" dir="rtl">',
  '<head><meta charset="UTF-8"><link rel="stylesheet" href="styles.css"></head>',
  '<body>',
  '    <nav class="navbar">...</nav>',
  '    <header class="hero">...</header>',
  '    <section id="services">...</section>',
  '    <section id="contact">...</section>',
  '    <footer>...</footer>',
  '</body>',
  '</html>',
].join('\n');

const projectContext = {
  projectName: 'outline-probe',
  workspaceId: 'outline-probe-workspace',
  sessionId: 'outline-probe-session',
  userId: 'outline-probe-user',
};

const runPhase = (tasks: any[]) => new PhaseExecutorTool().execute({
  phase: { phaseNumber: 2, name: 'Core page', tasks },
  projectContext,
}, projectContext);

describe('a file the plan only outlined is written in full', () => {
  beforeEach(() => { calls.length = 0; });

  it('names every elided part of an outline, in markup, code and styles', () => {
    expect(elidedParts('src/index.html', OUTLINED_PAGE)).toEqual([
      '<nav class="navbar">...</nav>',
      '<header class="hero">...</header>',
      '<section id="services">...</section>',
      '<section id="contact">...</section>',
      '<footer>...</footer>',
    ]);
    expect(elidedParts('src/app.js', 'function init() {\n  // ...\n}\nexport function send() { … }')).toEqual(['// ...', '{ … }']);
    expect(elidedParts('src/styles.css', '.hero { color: red; }\n/* ... */')).toEqual(['/* ... */']);
    expect(elidedParts('src/App.jsx', 'return (<main>\n  {/* ... */}\n</main>);')).toEqual(['{/* ... */}']);
  });

  it('does not take content that uses an ellipsis for an outline', () => {
    expect(elidedParts('src/index.html', '<button class="send">جارٍ الإرسال...</button><span>...</span><p>وأكثر...</p>')).toEqual([]);
    expect(elidedParts('src/App.jsx', 'const next = { ...state, open: true };\nreturn <Card {...props} />;')).toEqual([]);
    expect(elidedParts('README.md', '# Clinic\n\n...\n')).toEqual([]);
    expect(elidedParts('stubs.py', 'class Repo(Protocol):\n    def get(self): ...\n')).toEqual([]);
    expect(elidedParts('src/app.js', '')).toEqual([]);
  });

  it('writes an outlined file with the generator, carrying the outline and the task', async () => {
    const result: any = await runPhase([{
      task: 'Create main HTML structure with RTL direction',
      tool: 'write_file',
      args: { path: 'outline-probe/src/index.html', content: OUTLINED_PAGE },
    }]);

    expect(result.ok).toBe(true);
    expect(calls.map(call => call.tool)).toEqual(['ai_write_file']);
    const { args } = calls[0];
    expect(String(args.path)).toMatch(/src[\\/]index\.html$/);
    expect(args.content).toBeUndefined();
    expect(args.description).toContain('Create main HTML structure with RTL direction');
    expect(args.description).toContain('5 part(s)');
    expect(args.description).toContain('<section id="contact">...</section>');
    expect(result.logs.some((line: string) => line.includes('is an outline (5 part(s)'))).toBe(true);
  });

  it('writes a complete file exactly as the plan gave it', async () => {
    const whole = '<!DOCTYPE html>\n<html><body><section id="contact"><form><input name="email"></form></section></body></html>';
    await runPhase([{
      task: 'Create the page',
      tool: 'write_file',
      args: { path: 'outline-probe/src/index.html', content: whole },
    }]);

    expect(calls.map(call => call.tool)).toEqual(['write_file']);
    expect(calls[0].args.content).toBe(whole);
  });
});
