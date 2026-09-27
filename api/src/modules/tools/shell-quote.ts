/**
 * Platform-aware quoting for a single shell argument.
 *
 * Tool-produced commands run through the platform shell (cmd.exe on Windows
 * via spawn shell:true, sh on POSIX). Single-quote grouping is POSIX-only:
 * cmd.exe passes single quotes literally, so `node --check 'index.js'`
 * made node look for a file literally named `'index.js'` and a real run
 * died with MODULE_NOT_FOUND for a file that exists. Quote for the shell
 * that will actually parse the command, not for the author's laptop.
 */
export type ShellQuotePlatform = 'win32' | 'posix';

export function defaultShellQuotePlatform(): ShellQuotePlatform {
  return process.platform === 'win32' ? 'win32' : 'posix';
}

/**
 * Quote one argv word so the platform shell delivers it verbatim.
 * The platform parameter exists so both shapes are pinned by tests on any OS.
 */
export function quoteShellArg(value: string, platform: ShellQuotePlatform = defaultShellQuotePlatform()): string {
  const text = String(value ?? '');
  if (platform === 'win32') return quoteForCmd(text);
  return `'${text.replace(/'/g, "'\\''")}'`;
}

/**
 * cmd.exe double-quote wrapping with MSVCRT word rules: cmd strips the
 * outer quotes and the child C runtime parses `\"` escapes and trailing
 * backslashes. `%` is doubled because cmd expands %VAR% even inside
 * quotes. `!` needs no escape: delayed expansion is off under `cmd /c`.
 */
function quoteForCmd(text: string): string {
  let out = '"';
  let backslashes = 0;
  for (const ch of text) {
    if (ch === '\\') {
      backslashes++;
      continue;
    }
    if (ch === '"') {
      out += '\\'.repeat(backslashes * 2 + 1) + '"';
      backslashes = 0;
      continue;
    }
    out += '\\'.repeat(backslashes);
    backslashes = 0;
    out += ch === '%' ? '%%' : ch;
  }
  out += '\\'.repeat(backslashes * 2) + '"';
  return out;
}
