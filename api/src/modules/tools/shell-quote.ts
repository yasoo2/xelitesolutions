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
 * Whether cmd.exe could expand a `%NAME%` pair in this text: a non-empty
 * pair exists. The scan mirrors cmd's own: at `%` find the next `%`; an
 * empty `%%` cannot name a variable, but its closer may reopen (`%%A%%`
 * still pairs `A`), so resume after the opening `%`, not after the pair.
 * A lone `%`, an undefined `%NAME%`, and `%%` all pass through the cmd
 * command line literally (measured); `%%` does NOT collapse the way it
 * does in batch files, so doubling corrupts real names such as `100%.js`.
 */
function hasNonEmptyPercentPair(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '%') continue;
    const close = text.indexOf('%', i + 1);
    if (close === -1) return false;
    if (close > i + 1) return true;
  }
  return false;
}

/**
 * Quote one run for cmd.exe. `doubleInnerQuotes` selects the `"` escape:
 * `\"` (MSVCRT backslash rules) for plain words, `""` for split runs,
 * which carry no `%`. The split shape needs `""` because cmd counts
 * quotes naively: a `\"` desynchronizes cmd's counter from the child
 * parser and leaves the `^%` separators literal (measured), while `""`
 * keeps both synchronized, the same rule cmd itself applies.
 */
function quoteCmdRun(text: string, doubleInnerQuotes: boolean): string {
  let out = '"';
  let backslashes = 0;
  for (const ch of text) {
    if (ch === '\\') {
      backslashes++;
      continue;
    }
    if (ch === '"') {
      out += doubleInnerQuotes
        ? '\\'.repeat(backslashes * 2) + '""'
        : '\\'.repeat(backslashes * 2 + 1) + '"';
      backslashes = 0;
      continue;
    }
    out += '\\'.repeat(backslashes);
    backslashes = 0;
    out += ch;
  }
  out += '\\'.repeat(backslashes * 2) + '"';
  return out;
}

/**
 * cmd.exe double-quote wrapping with MSVCRT word rules: cmd strips the
 * outer quotes and the child C runtime parses `\"` escapes and trailing
 * backslashes. `%` is passed through: lone and undefined pairs are literal
 * to cmd. When a non-empty `%NAME%` pair exists, NAME may be defined and
 * cmd WOULD expand it even inside quotes, so every `%` leaves the quoted
 * runs as `^%` outside quotes instead: cmd consumes the carets, no pair
 * can form a defined name across the separators, and the child runtime
 * concatenates the runs back into the verbatim argument (all measured
 * against the real shell). `!` needs no escape: delayed expansion is off
 * under `cmd /c`.
 */
function quoteForCmd(text: string): string {
  if (!hasNonEmptyPercentPair(text)) return quoteCmdRun(text, false);
  return text
    .split('%')
    .map(run => (run ? quoteCmdRun(run, true) : ''))
    .join('^%');
}
