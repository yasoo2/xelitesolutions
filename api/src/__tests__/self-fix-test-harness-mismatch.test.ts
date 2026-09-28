import fs from 'fs';
import path from 'path';
import { RepairTicketService } from '../modules/services/RepairTicketService';
import { SelfFixService } from '../modules/services/SelfFixService';

/**
 * Test-harness mismatch diagnosis.
 *
 * Real-UI evidence (CRITICAL-REAL-JOE-UI-001 run 7): Joe scaffolded
 * `"test": "node test.js"` but authored mocha-style `describe/it` tests.
 * `npm test` failed with `ReferenceError: describe is not defined`, self-fix
 * regenerated test.js WITHOUT diagnosing the runner/framework incoherence,
 * and the rerun failed identically ("Self-fix follow-up did not complete
 * the failed phase. Status: partial").
 *
 * A general repair must distinguish "test file disagrees with its runner"
 * from "implementation is wrong", name the mismatch, and constrain the
 * regeneration to the runner's actual contract (Node built-ins).
 */
describe('self-fix test-harness mismatch', () => {
  const roots: string[] = [];

  function makeProject(name: string, manifest: Record<string, unknown>, testFile: string, testBody: string) {
    const root = path.join(process.cwd(), '..', 'data', 'builds', `${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest, null, 2), 'utf8');
    const target = path.join(root, testFile);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, testBody, 'utf8');
    roots.push(root);
    return root;
  }

  afterAll(() => {
    for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
  });

  function harnessError(testPath: string, globalName: string, usageLine: string, lineNo: number) {
    return [
      `${testPath}:${lineNo}`,
      usageLine,
      '^',
      '',
      `ReferenceError: ${globalName} is not defined`,
      `    at Object.<anonymous> (${testPath}:${lineNo}:1)`,
      '    at Module._compile (node:internal/modules/cjs/loader:1521:14)',
    ].join('\n');
  }

  function planFor(
    root: string,
    task: string,
    command: string,
    error: string,
    extraResult: Record<string, unknown> = {},
    extraBuild: Record<string, unknown> = {},
  ) {
    const ticket = RepairTicketService.build({
      projectName: 'HARNESS',
      phase: { phaseNumber: 4, name: 'Run Tests and Final Verification' },
      phaseResult: {
        error,
        output: {
          status: 'partial',
          results: [{
            task,
            tool: 'shell_execute',
            ok: false,
            error,
            command,
            cwd: root,
            ...extraResult,
          }],
        },
      },
      ...extraBuild,
    });
    return SelfFixService.plan(ticket);
  }

  it('diagnoses mocha-style globals executed by a bare node test script', () => {
    const root = makeProject(
      'self-fix-thm-mocha',
      { name: 'csvcol', scripts: { test: 'node test.js' } },
      'test.js',
      [
        "const assert = require('assert');",
        '',
        "describe('csvcol', function() {",
        "  it('extracts', function() {",
        '    assert.strictEqual(1 + 1, 2);',
        '  });',
        '});',
        '',
      ].join('\n'),
    );
    const testPath = path.join(root, 'test.js');
    const error = harnessError(testPath, 'describe', "describe('csvcol', function() {", 3);

    const plan = planFor(root, 'Run tests', 'npm test', error);

    expect(plan.allowed).toBe(true);
    expect(plan.strategy).toBe('code_fix');
    expect(plan.suggestedTool).toBe('ai_write_file');
    expect(plan.suggestedInput).toMatchObject({ path: testPath });
    expect(String(plan.reason)).toMatch(/describe/);
    expect(String(plan.reason)).toMatch(/bare node|test runner|harness/i);
    const description = String((plan.suggestedInput as Record<string, unknown>).description || '');
    expect(description).toMatch(/node:test/);
    expect(description).toMatch(/node:assert/);
    expect(description).toMatch(/only.*test\.js|test\.js.*only/i);
  });

  it('transfers to jest-style globals under a differently named npm script', () => {
    const root = makeProject(
      'self-fix-thm-jest',
      { name: 'wordrank', scripts: { unit: 'node --test test/rank.test.js' } },
      path.join('test', 'rank.test.js'),
      [
        "test('ranks', () => {",
        '  expect(1 + 1).toBe(2);',
        '});',
        '',
      ].join('\n'),
    );
    const nested = path.join(root, 'test', 'rank.test.js');
    const error = harnessError(nested, 'expect', '  expect(1 + 1).toBe(2);', 2);

    const plan = planFor(root, 'Run unit tests', 'npm run unit', error);

    expect(plan.allowed).toBe(true);
    expect(plan.strategy).toBe('code_fix');
    expect(plan.suggestedTool).toBe('ai_write_file');
    expect(plan.suggestedInput).toMatchObject({ path: nested });
    expect(String(plan.reason)).toMatch(/expect/);
    expect(String(plan.reason)).toMatch(/bare node|test runner|harness/i);
  });

  it('transfers to a direct node invocation without manifest resolution', () => {
    const root = makeProject(
      'self-fix-thm-direct',
      { name: 'plain', scripts: {} },
      'check.test.js',
      [
        'const assert = require("node:assert");',
        'beforeEach(() => {});',
        '',
      ].join('\n'),
    );
    const testPath = path.join(root, 'check.test.js');
    const error = harnessError(testPath, 'beforeEach', 'beforeEach(() => {});', 2);

    const plan = planFor(root, 'Run checks', `node ${testPath}`, error);

    expect(plan.allowed).toBe(true);
    expect(plan.strategy).toBe('code_fix');
    expect(plan.suggestedTool).toBe('ai_write_file');
    expect(plan.suggestedInput).toMatchObject({ path: testPath });
    expect(String(plan.reason)).toMatch(/beforeEach/);
  });

  it('does not claim a harness mismatch when the file properly imports node:test', () => {
    const root = makeProject(
      'self-fix-thm-clean',
      { name: 'clean', scripts: { test: 'node --test' } },
      'test.js',
      [
        "const { describe, it } = require('node:test');",
        "const assert = require('node:assert/strict');",
        '',
        "describe('clean', () => {",
        "  it('works', () => {",
        '    assert.equal(total(1), 1);',
        '  });',
        '});',
        '',
      ].join('\n'),
    );
    const testPath = path.join(root, 'test.js');
    const error = harnessError(testPath, 'total', '    assert.equal(total(1), 1);', 6);

    const plan = planFor(root, 'Run tests', 'npm test', error);

    expect(String(plan.reason)).not.toMatch(/harness/i);
  });

  it('does not claim a harness mismatch when a real framework binary ran', () => {
    const root = makeProject(
      'self-fix-thm-framework',
      { name: 'framed', scripts: { test: 'mocha test.js' }, devDependencies: { mocha: '^10.0.0' } },
      'test.js',
      [
        "describe('framed', function() {",
        '});',
        '',
      ].join('\n'),
    );
    const testPath = path.join(root, 'test.js');
    const error = harnessError(testPath, 'describe', "describe('framed', function() {", 1);

    const plan = planFor(root, 'Run tests', 'npx mocha test.js', error);

    expect(String(plan.reason)).not.toMatch(/harness/i);
  });

  it('does not read a stack-derived crash file outside the project boundary', () => {
    // CODEX read-only review of 354889a6 (REVIEW_FOLLOWUP): stack-derived
    // absolute paths and repairFile/file hints must not let SelfFixService.plan
    // read a local file outside the trusted project boundary before execution
    // safety checks. A bare-describe file that exists, but outside the cwd
    // boundary, must not produce a harness claim.
    const root = makeProject(
      'self-fix-thm-fence',
      { name: 'fenced', scripts: { test: 'node test.js' } },
      'test.js',
      'console.log("fenced");\n',
    );
    const outside = path.join(path.dirname(root), `thm-outside-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    fs.mkdirSync(outside, { recursive: true });
    roots.push(outside);
    const outsideTest = path.join(outside, 'test.js');
    fs.writeFileSync(outsideTest, "describe('outside', () => {});\n", 'utf8');
    const error = harnessError(outsideTest, 'describe', "describe('outside', () => {});", 1);

    const plan = planFor(root, 'Run tests', 'npm test', error);

    expect(String(plan.reason)).not.toMatch(/harness/i);
  });

  it('does not follow a repairFile hint outside the project boundary', () => {
    const root = makeProject(
      'self-fix-thm-hint',
      { name: 'hinted', scripts: { test: 'node test.js' } },
      'test.js',
      'console.log("hinted");\n',
    );
    const outside = path.join(path.dirname(root), `thm-hint-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
    fs.mkdirSync(outside, { recursive: true });
    roots.push(outside);
    const outsideTest = path.join(outside, 'test.js');
    fs.writeFileSync(outsideTest, "describe('hint', () => {});\n", 'utf8');
    const ghost = path.join(root, 'deleted.test.js');
    const error = harnessError(ghost, 'describe', "describe('hint', () => {});", 1);

    const plan = planFor(root, 'Run tests', 'npm test', error, { repairFile: outsideTest });

    expect(String(plan.reason)).not.toMatch(/harness/i);
  });

  it('does not ascend above the project root when resolving the npm script', () => {
    // The manifest walk must stop at the ticket project root: a bare-node
    // script found only in a manifest ABOVE the boundary must not prove the
    // runner, or plan() reads and trusts a foreign package.json.
    const parent = path.join(
      process.cwd(), '..', 'data', 'builds', `thm-decoy-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    );
    const root = path.join(parent, 'proj');
    const nested = path.join(root, 'sub');
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(parent, 'package.json'), JSON.stringify({ name: 'decoy', scripts: { test: 'node test.js' } }), 'utf8');
    fs.writeFileSync(path.join(root, 'test.js'), "describe('decoyed', () => {});\n", 'utf8');
    roots.push(parent);
    const testPath = path.join(root, 'test.js');
    const error = harnessError(testPath, 'describe', "describe('decoyed', () => {});", 1);

    const plan = planFor(nested, 'Run tests', 'npm test', error, {}, { projectRoot: root });

    expect(String(plan.reason)).not.toMatch(/harness/i);
  });

  it('still resolves a manifest at the project root from a nested cwd', () => {
    // No-overblocking pin: a nested execution cwd inside the boundary keeps
    // the upward walk up TO the project root.
    const root = makeProject(
      'self-fix-thm-nested',
      { name: 'nested', scripts: { test: 'node sub/t.test.js' } },
      path.join('sub', 't.test.js'),
      "describe('nested', () => {});\n",
    );
    const nested = path.join(root, 'sub', 't.test.js');
    const error = harnessError(nested, 'describe', "describe('nested', () => {});", 1);

    const plan = planFor(path.join(root, 'sub'), 'Run tests', 'npm test', error, {}, { projectRoot: root });

    expect(plan.strategy).toBe('code_fix');
    expect(String(plan.reason)).toMatch(/harness/i);
  });

  it('does not claim a harness mismatch when the crashing file is absent', () => {
    const root = makeProject(
      'self-fix-thm-ghost',
      { name: 'ghost', scripts: { test: 'node test.js' } },
      'test.js',
      'console.log("ghost");\n',
    );
    const ghost = path.join(root, 'deleted.test.js');
    const error = harnessError(ghost, 'describe', "describe('ghost', () => {});", 1);

    const plan = planFor(root, 'Run tests', 'npm test', error);

    expect(String(plan.reason)).not.toMatch(/harness/i);
  });
});
