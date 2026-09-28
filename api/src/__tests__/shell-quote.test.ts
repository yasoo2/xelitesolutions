import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { quoteShellArg } from '../modules/tools/shell-quote';
import { AutoTesterTool } from '../modules/tools/definitions/AutoTesterTool';
import { workspaceService } from '../modules/services/WorkspaceService';
import * as ToolService from '../modules/services/ToolService';

/**
 * Platform-aware shell quoting.
 *
 * Real-UI evidence (CRITICAL-REAL-JOE-UI-001 run 8): auto_tester built
 * `node --check 'index.js'` with POSIX single-quote grouping and sent it
 * through shell_execute; on Windows cmd.exe passes single quotes literally,
 * so node looked for a file literally named `'index.js'` and the run died
 * with MODULE_NOT_FOUND for a file that exists. Tool-produced commands must
 * be quoted for the shell that parses them.
 */
describe('quoteShellArg', () => {
  it('posix: wraps a simple name in single quotes', () => {
    expect(quoteShellArg('index.js', 'posix')).toBe(`'index.js'`);
  });

  it('posix: escapes an embedded single quote the Bourne way', () => {
    expect(quoteShellArg(`it's.js`, 'posix')).toBe(`'it'\\''s.js'`);
  });

  it('posix: quotes names with spaces', () => {
    expect(quoteShellArg('my mod.js', 'posix')).toBe(`'my mod.js'`);
  });

  it('win32: wraps a simple name in double quotes', () => {
    expect(quoteShellArg('index.js', 'win32')).toBe('"index.js"');
  });

  it('win32: passes an apostrophe through inside double quotes', () => {
    expect(quoteShellArg(`it's.js`, 'win32')).toBe(`"it's.js"`);
  });

  it('win32: quotes names with spaces', () => {
    expect(quoteShellArg('my mod.js', 'win32')).toBe('"my mod.js"');
  });

  it('win32: escapes an embedded double quote for the child C runtime', () => {
    expect(quoteShellArg('say "hi".js', 'win32')).toBe('"say \\"hi\\".js"');
  });

  it('win32: doubles a trailing backslash so it cannot swallow the closing quote', () => {
    expect(quoteShellArg('dir\\', 'win32')).toBe('"dir\\\\"');
  });

  it('win32: passes a lone percent through without doubling', () => {
    // CODEX read-only review of 6b61602f (DEFECT_FOUND): on the cmd command
    // line %% does NOT collapse the way it does in batch files — measured
    // `"100%%.js"` delivers `100%%.js` to the child — so doubling corrupts
    // real filenames such as `100%.js`. A lone % is literal to cmd.
    expect(quoteShellArg('100%.js', 'win32')).toBe('"100%.js"');
  });

  it('win32: leaves an empty %% pair plain', () => {
    // An empty pair cannot name a variable, so plain quoting stays verbatim.
    expect(quoteShellArg('100%%.js', 'win32')).toBe('"100%%.js"');
  });

  it('win32: splits a non-empty %NAME% pair out of the quoted runs', () => {
    // A non-empty pair MAY expand when NAME is defined, so every % leaves
    // the quoted runs as ^% outside quotes; cmd consumes the carets and no
    // pair can form a defined name across the separators.
    expect(quoteShellArg('%PATH%.js', 'win32')).toBe('^%"PATH"^%".js"');
    expect(quoteShellArg('%%A%%', 'win32')).toBe('^%^%"A"^%^%');
  });

  it('win32: doubles inner quotes inside split runs', () => {
    // \" would desynchronize cmd's naive quote counter from the child
    // parser and leave the ^% carets literal (measured); "" keeps both
    // synchronized, the same rule cmd itself applies.
    expect(quoteShellArg('say "%PATH%"', 'win32')).toBe('"say """^%"PATH"^%""""');
  });

  it('posix: passes percent signs through inside single quotes', () => {
    expect(quoteShellArg('100%.js', 'posix')).toBe(`'100%.js'`);
    expect(quoteShellArg('%PATH%.js', 'posix')).toBe(`'%PATH%.js'`);
  });

  it('win32: quotes the empty argument as an empty pair', () => {
    expect(quoteShellArg('', 'win32')).toBe('""');
  });

  it('defaults to the executing platform', () => {
    const expected = process.platform === 'win32' ? '"index.js"' : `'index.js'`;
    expect(quoteShellArg('index.js')).toBe(expected);
  });
});

describe('auto_tester syntax command shape', () => {
  let workspaceRoot = '';
  let activeRootSpy: jest.SpyInstance;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-shell-quote-'));
    activeRootSpy = jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(workspaceRoot);
  });

  afterEach(() => {
    activeRootSpy.mockRestore();
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('quotes the checked file for the executing shell', async () => {
    fs.writeFileSync(path.join(workspaceRoot, 'index.js'), 'const answer = 42;\n');
    const executeToolSpy = jest.spyOn(ToolService, 'executeTool').mockResolvedValue({
      ok: true,
      output: '',
      logs: [],
    } as any);
    try {
      const result: any = await new AutoTesterTool().execute({
        testType: 'syntax',
        projectPath: '.',
        files: ['index.js'],
      }, { workspaceId: 'workspace-quote-1' });

      expect(result.ok).toBe(true);
      const expected = process.platform === 'win32'
        ? 'node --check "index.js"'
        : `node --check 'index.js'`;
      expect(executeToolSpy).toHaveBeenCalledWith(
        'shell_execute',
        expect.objectContaining({ command: expected, cwd: workspaceRoot }),
        expect.anything(),
      );
      if (process.platform === 'win32') {
        const actual = String(executeToolSpy.mock.calls[0][1].command);
        expect(actual).not.toContain(`'`);
      }
    } finally {
      executeToolSpy.mockRestore();
    }
  });

  it('joins multi-file checks without leaking posix grouping on windows', async () => {
    fs.mkdirSync(path.join(workspaceRoot, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'a.js'), 'const a = 1;\n');
    fs.writeFileSync(path.join(workspaceRoot, 'sub', 'b.js'), 'const b = 2;\n');
    const executeToolSpy = jest.spyOn(ToolService, 'executeTool').mockResolvedValue({
      ok: true,
      output: '',
      logs: [],
    } as any);
    try {
      await new AutoTesterTool().execute({
        testType: 'syntax',
        projectPath: '.',
        files: ['a.js', 'sub/b.js'],
      }, { workspaceId: 'workspace-quote-2' });

      const actual = String(executeToolSpy.mock.calls[0][1].command);
      expect(actual).toContain('&&');
      const nested = path.relative(workspaceRoot, path.join(workspaceRoot, 'sub', 'b.js'));
      const expected = process.platform === 'win32'
        ? `node --check "a.js" && node --check "${nested}"`
        : `node --check 'a.js' && node --check '${nested}'`;
      expect(actual).toBe(expected);
    } finally {
      executeToolSpy.mockRestore();
    }
  });
});

describe('quoted command real-shell proof', () => {
  let dir = '';

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-shell-quote-exec-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('the quoted check passes through the real platform shell', () => {
    fs.writeFileSync(path.join(dir, 'my mod.js'), 'const ok = 1;\n');
    const command = `node --check ${quoteShellArg('my mod.js')}`;
    const result = spawnSync(command, { cwd: dir, shell: true, encoding: 'utf8' });
    expect(`${result.stdout}${result.stderr}`).not.toMatch(/cannot find module/i);
    expect(result.status).toBe(0);
  });

  (process.platform === 'win32' ? it : it.skip)(
    'the posix-quoted form fails on cmd for an existing file (the run-8 defect)',
    () => {
      fs.writeFileSync(path.join(dir, 'index.js'), 'const ok = 1;\n');
      const result = spawnSync(`node --check 'index.js'`, { cwd: dir, shell: true, encoding: 'utf8' });
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toMatch(/cannot find module/i);
    },
  );
});

describe('percent argv proof on cmd', () => {
  let dir = '';
  const probeVar = 'JOE_SHELL_QUOTE_PROBE';

  function argvOf(word: string): { argv: string; status: number | null } {
    const result = spawnSync(`node -p "process.argv[1]" ${word}`, {
      cwd: dir,
      shell: true,
      encoding: 'utf8',
      env: { ...process.env, [probeVar]: 'EXPLODED' },
    });
    return { argv: String(result.stdout || '').split('\n')[0], status: result.status };
  }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-shell-quote-pct-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  (process.platform === 'win32' ? it : it.skip)(
    'a lone percent reaches the child verbatim',
    () => {
      const seen = argvOf(quoteShellArg('100%.js', 'win32'));
      expect(seen.status).toBe(0);
      expect(seen.argv).toBe('100%.js');
    },
  );

  (process.platform === 'win32' ? it : it.skip)(
    'a defined %NAME% pair reaches the child verbatim instead of expanding',
    () => {
      const seen = argvOf(quoteShellArg('%JOE_SHELL_QUOTE_PROBE%.js', 'win32'));
      expect(seen.status).toBe(0);
      expect(seen.argv).toBe('%JOE_SHELL_QUOTE_PROBE%.js');
    },
  );

  (process.platform === 'win32' ? it : it.skip)(
    'an undefined %NAME% pair reaches the child verbatim',
    () => {
      const seen = argvOf(quoteShellArg('%JOE_SHELL_QUOTE_UNDEF_9Z%.js', 'win32'));
      expect(seen.status).toBe(0);
      expect(seen.argv).toBe('%JOE_SHELL_QUOTE_UNDEF_9Z%.js');
    },
  );

  (process.platform === 'win32' ? it : it.skip)(
    'quotes combined with a defined pair reach the child verbatim',
    () => {
      const seen = argvOf(quoteShellArg('say "%JOE_SHELL_QUOTE_PROBE%"', 'win32'));
      expect(seen.status).toBe(0);
      expect(seen.argv).toBe('say "%JOE_SHELL_QUOTE_PROBE%"');
    },
  );

  (process.platform === 'win32' ? it : it.skip)(
    'node --check finds a real percent-named file through the quoted word',
    () => {
      fs.writeFileSync(path.join(dir, '%JOE_SHELL_QUOTE_PROBE%.js'), 'const ok = 1;\n');
      const command = `node --check ${quoteShellArg('%JOE_SHELL_QUOTE_PROBE%.js', 'win32')}`;
      const result = spawnSync(command, {
        cwd: dir,
        shell: true,
        encoding: 'utf8',
        env: { ...process.env, [probeVar]: 'EXPLODED' },
      });
      // Had cmd expanded the pair, node would chase EXPLODED.js and fail.
      expect(`${result.stdout}${result.stderr}`).not.toMatch(/cannot find module/i);
      expect(result.status).toBe(0);
    },
  );
});
