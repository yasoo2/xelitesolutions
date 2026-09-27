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

  function planFor(root: string, task: string, command: string, error: string) {
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
          }],
        },
      },
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
