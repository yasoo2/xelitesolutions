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

  it('win32: doubles percent signs against cmd environment expansion', () => {
    expect(quoteShellArg('100%.js', 'win32')).toBe('"100%%.js"');
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
