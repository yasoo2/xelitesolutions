import { RepairTicketService } from '../modules/services/RepairTicketService';
import { SelfFixService } from '../modules/services/SelfFixService';

/**
 * Quoted-module routing honesty.
 *
 * Real-UI evidence (CRITICAL-REAL-JOE-UI-001 run 8): the engine ran
 * `node --check 'index.js'` through cmd, so node reported
 * `Cannot find module 'D:\...\jfilter\'index.js''` — a specifier with
 * literal quote characters, i.e. a corrupted command line, not a missing
 * package. Self-fix routed the `cannot find module` text to dependency_fix
 * and burned its one attempt on `npm install`, which could never cure a
 * quoting defect. A quoting artifact must refuse the doomed install with
 * an honest diagnostic; genuine missing packages keep their route.
 */
describe('self-fix quoted-module routing', () => {
  function planFor(error: string, command: string) {
    const ticket = RepairTicketService.build({
      projectName: 'QUOTE',
      phase: { phaseNumber: 2, name: 'Implement Widget' },
      phaseResult: {
        error,
        output: {
          status: 'partial',
          results: [{
            task: 'Check syntax of built sources',
            tool: 'auto_tester',
            ok: false,
            error,
            command,
            cwd: 'D:\\proj\\QUOTE',
          }],
        },
      },
    });
    return SelfFixService.plan(ticket);
  }

  it('refuses npm install when the missing specifier embeds literal quotes (run-8 shape)', () => {
    const error = [
      `Error: Cannot find module 'D:\\proj\\QUOTE\\jfilter\\'index.js''`,
      '    at Function._resolveFilename (node:internal/modules/cjs/loader:1140:15)',
      '    at Function._load (node:internal/modules/cjs/loader:981:27)',
      "  code: 'MODULE_NOT_FOUND',",
      '  requireStack: []',
    ].join('\n');
    const plan = planFor(error, `node --check 'index.js'`);

    expect(plan.allowed).toBe(false);
    expect(plan.strategy).toBe('manual_review');
    expect(plan.suggestedTool).toBeUndefined();
    expect(String(plan.reason)).toMatch(/quot/i);
    expect(String(plan.reason)).toMatch(/refus/i);
  });

  it('transfers to a posix-flavored quoting artifact', () => {
    const error = `Error: Cannot find module '/opt/app/dist/'server.js''`;
    const plan = planFor(error, `node --check 'server.js'`);

    expect(plan.allowed).toBe(false);
    expect(plan.strategy).toBe('manual_review');
    expect(String(plan.reason)).toMatch(/quot/i);
  });

  it('transfers to a doubled-quote specifier shape', () => {
    const error = `Error: Cannot find module ''config''`;
    const plan = planFor(error, `node --check ''config''`);

    expect(plan.allowed).toBe(false);
    expect(plan.strategy).toBe('manual_review');
  });

  it('still installs a genuine missing package', () => {
    const error = [
      `Error: Cannot find module 'express'`,
      '    at Function._resolveFilename (node:internal/modules/cjs/loader:1140:15)',
      "  code: 'MODULE_NOT_FOUND',",
      '  requireStack: [ \'D:\\proj\\QUOTE\\index.js\' ]',
    ].join('\n');
    const plan = planFor(error, 'node index.js');

    expect(plan.allowed).toBe(true);
    expect(plan.strategy).toBe('dependency_fix');
  });

  it('does not divert a jest module-resolution report with a from-clause', () => {
    const error = `Cannot find module 'jest-expo' from 'jest.config.js'`;
    const plan = planFor(error, 'npm run test');

    expect(plan.allowed).toBe(true);
    expect(plan.strategy).toBe('dependency_fix');
  });

  it('preserves the current route for a plain local path without artifact markers', () => {
    const error = `Error: Cannot find module 'C:\\proj\\QUOTE\\app.js'`;
    const plan = planFor(error, 'node app.js');

    expect(plan.allowed).toBe(true);
    expect(plan.strategy).toBe('dependency_fix');
  });

  it('preserves the current route when no specifier is named', () => {
    const plan = planFor('playwright unavailable: Cannot find module', 'npm run qa');

    expect(plan.allowed).toBe(true);
    expect(plan.strategy).toBe('dependency_fix');
  });
});
