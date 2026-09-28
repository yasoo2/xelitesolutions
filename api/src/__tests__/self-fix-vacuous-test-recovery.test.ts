import fs from 'fs';
import path from 'path';
import { RepairTicketService } from '../modules/services/RepairTicketService';
import { SelfFixService } from '../modules/services/SelfFixService';

/**
 * Vacuous-test recovery.
 *
 * Real-UI evidence (CRITICAL-REAL-JOE-UI-001 runs 4b + 8): Joe scaffolded
 * comment-only test.js files whose bare `node test.js` exits 0 with empty
 * output. AutoTester now REFUSES such runs ("exited 0 ... zero tests
 * executed"), but SelfFix had no branch for that refusal contract: the
 * ticket carries no ReferenceError and no repairFile, so the planner
 * stopped with "no evidence-bound repair file" and the pipeline halted
 * with detection but no recovery.
 *
 * A general repair must recognize the tester's own zero-test refusal,
 * re-verify the evidenced test file on disk (statement-free, inside the
 * ticket boundary — never trust the prose alone), resolve the declared
 * script through the project manifest when the refusal carries only a
 * runner zero-report, and constrain regeneration to real Node built-in
 * assertions. Framework-runner discovery failures, outside-boundary
 * paths, and files that actually contain statements must keep the
 * honest stop.
 */
describe('self-fix vacuous-test recovery', () => {
  const roots: string[] = [];

  function makeProject(name: string, manifest: Record<string, unknown>, files: Record<string, string>) {
    const root = path.join(process.cwd(), '..', 'data', 'builds', `${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest, null, 2), 'utf8');
    for (const [rel, body] of Object.entries(files)) {
      const target = path.join(root, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, body, 'utf8');
    }
    roots.push(root);
    return root;
  }

  afterAll(() => {
    for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
  });

  function planFor(
    root: string,
    task: string,
    error: string,
    extraResult: Record<string, unknown> = {},
    extraBuild: Record<string, unknown> = {},
  ) {
    // Real auto_tester failure record shape: PhaseExecutor failure records
    // carry cwd (from toolArgs) but no command for non-shell tools, and the
    // tester returns no file/repairFile. The extractor must resolve
    // everything from cwd + manifest + message, inside the boundary.
    const ticket = RepairTicketService.build({
      projectName: 'VACUOUS',
      phase: { phaseNumber: 4, name: 'Run Tests and Final Verification' },
      phaseResult: {
        error,
        output: {
          status: 'partial',
          results: [{
            task,
            tool: 'auto_tester',
            ok: false,
            error,
            cwd: root,
            ...extraResult,
          }],
        },
      },
      ...extraBuild,
    });
    return SelfFixService.plan(ticket);
  }

  function expectVacuousRepair(plan: ReturnType<typeof SelfFixService.plan>, testPath: string) {
    expect(plan.allowed).toBe(true);
    expect(plan.strategy).toBe('code_fix');
    expect(plan.suggestedTool).toBe('ai_write_file');
    expect(plan.suggestedInput).toMatchObject({ path: testPath });
    expect(String(plan.reason)).toMatch(/zero tests|vacuous|no executable statements/i);
    const description = String((plan.suggestedInput as Record<string, unknown>).description || '');
    expect(description).toMatch(/node:test/);
    expect(description).toMatch(/node:assert/);
    expect(description).toMatch(/only.*repair|repair only/i);
    expect(description).toMatch(/implement/i);
  }

  it('repairs a statement-free bare-node test file named by the refusal', () => {
    const root = makeProject(
      'self-fix-vtr-basic',
      { name: 'taglines', scripts: { test: 'node test.js' } },
      {
        'index.js': 'console.log("tag");\n',
        'test.js': '// tests for taglines\n/* TODO: add assertions */\n',
      },
    );
    const error = 'Declared unit test script "test" exited 0 with no output and test.js contains no executable statements: zero tests executed.';
    const plan = planFor(root, 'Run unit tests', error);
    expectVacuousRepair(plan, path.join(root, 'test.js'));
  });

  it('transfers to a differently-named script with a nested ESM test file', () => {
    const root = makeProject(
      'self-fix-vtr-nested',
      { name: 'wordrank', type: 'module', scripts: { unit: 'node test/rank.test.mjs' } },
      {
        'rank.mjs': 'export const rank = (w) => w;\n',
        'test/rank.test.mjs': '// rank tests\n',
      },
    );
    const error = 'Declared unit test script "unit" exited 0 with no output and test/rank.test.mjs contains no executable statements: zero tests executed.';
    const plan = planFor(root, 'Run unit tests', error);
    expectVacuousRepair(plan, path.join(root, 'test', 'rank.test.mjs'));
  });

  it('recovers a runner zero-report that resolves to a statement-free bare node file', () => {
    const root = makeProject(
      'self-fix-vtr-manifest',
      { name: 'linecount', scripts: { test: 'node test.js' } },
      {
        'linecount.js': 'console.log(1);\n',
        'test.js': '/* empty suite */\n',
      },
    );
    const error = 'Declared unit test script "test" exited 0 but executed zero tests (output reports: "No tests found").';
    const plan = planFor(root, 'Run unit tests', error);
    expectVacuousRepair(plan, path.join(root, 'test.js'));
  });

  it('refuses a framework-runner zero-report instead of guessing a discovery repair', () => {
    const root = makeProject(
      'self-fix-vtr-jest',
      { name: 'csvcol', scripts: { test: 'jest' } },
      { 'index.js': 'module.exports = {};\n' },
    );
    const error = 'Declared unit test script "test" exited 0 but executed zero tests (output reports: "No tests found").';
    const plan = planFor(root, 'Run unit tests', error);
    expect(plan.allowed).toBe(false);
    expect(plan.strategy).toBe('manual_review');
  });

  it('refuses when the named file escapes the ticket boundary', () => {
    const root = makeProject(
      'self-fix-vtr-escape',
      { name: 'taglines', scripts: { test: 'node test.js' } },
      { 'index.js': 'console.log(1);\n' },
    );
    const outside = path.join(path.dirname(root), `vtr-outside-${Date.now()}.js`);
    fs.writeFileSync(outside, '// outside\n', 'utf8');
    roots.push(path.dirname(outside));
    const error = `Declared unit test script "test" exited 0 with no output and ../${path.basename(outside)} contains no executable statements: zero tests executed.`;
    const plan = planFor(root, 'Run unit tests', error);
    expect(plan.allowed).toBe(false);
    expect(plan.strategy).toBe('manual_review');
  });

  it('refuses when the named file actually contains statements', () => {
    const root = makeProject(
      'self-fix-vtr-stale',
      { name: 'taglines', scripts: { test: 'node test.js' } },
      {
        'index.js': 'console.log(1);\n',
        'test.js': "const assert = require('node:assert/strict');\nassert.strictEqual(1, 1);\nconsole.log('ok');\n",
      },
    );
    const error = 'Declared unit test script "test" exited 0 with no output and test.js contains no executable statements: zero tests executed.';
    const plan = planFor(root, 'Run unit tests', error);
    expect(plan.allowed).toBe(false);
    expect(plan.strategy).toBe('manual_review');
  });

  it('ignores zero-test prose from non-tester tools', () => {
    const root = makeProject(
      'self-fix-vtr-tool',
      { name: 'taglines', scripts: { test: 'node test.js' } },
      {
        'index.js': 'console.log(1);\n',
        'test.js': '// empty\n',
      },
    );
    const error = 'Declared unit test script "test" exited 0 with no output and test.js contains no executable statements: zero tests executed.';
    const ticket = RepairTicketService.build({
      projectName: 'VACUOUS',
      phase: { phaseNumber: 4, name: 'Run Tests and Final Verification' },
      phaseResult: {
        error,
        output: {
          status: 'partial',
          results: [{ task: 'Run command', tool: 'shell_execute', ok: false, error, command: 'npm test', cwd: root }],
        },
      },
    });
    const plan = SelfFixService.plan(ticket);
    // The vacuous contract belongs to auto_tester; a shell record with the
    // same prose must not reach the single-file test rewrite.
    expect(plan.suggestedTool === 'ai_write_file' && plan.strategy === 'code_fix'
      ? String((plan.suggestedInput as Record<string, unknown>).description || '')
      : 'no-test-rewrite').not.toMatch(/zero tests executed|vacuous test file/i);
  });

  it('refuses when the named file does not exist', () => {
    const root = makeProject(
      'self-fix-vtr-missing',
      { name: 'taglines', scripts: { test: 'node test.js' } },
      { 'index.js': 'console.log(1);\n' },
    );
    const error = 'Declared unit test script "test" exited 0 with no output and test.js contains no executable statements: zero tests executed.';
    const plan = planFor(root, 'Run unit tests', error);
    expect(plan.allowed).toBe(false);
    expect(plan.strategy).toBe('manual_review');
  });
});
