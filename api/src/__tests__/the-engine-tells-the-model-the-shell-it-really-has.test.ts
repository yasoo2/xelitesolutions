/**
 * THE MODEL IS TOLD THE SHELL IT REALLY HAS.
 *
 * On Windows the engine's shell tools run Windows PowerShell 5.1. There `&&`
 * is a parse error, so a command chained with it does not run at all. The
 * standing instructions used to recommend `&&` as Windows syntax, and every
 * chained install-then-build the model wrote that way failed before it began.
 */
import { systemPrompt } from '../core/engine/prompt';

describe('the standing instructions name the shell the tools run', () => {
    const windows = systemPrompt({ platform: 'win32', shell: 'Windows PowerShell 5.1', node: '22.11.0' });

    it('on Windows they chain with ; and if ($?), and warn that && does not parse', () => {
        expect(windows).toMatch(/chain commands with `;`/);
        expect(windows).toMatch(/first; if \(\$\?\) \{ second \}/);
        expect(windows).toMatch(/`&&` and `\|\|` are parse errors/);
        expect(windows).not.toMatch(/use Windows syntax: [^\n]*`&&`/);
    });

    it('elsewhere they say nothing about PowerShell', () => {
        expect(systemPrompt({ platform: 'linux', shell: 'bash' })).not.toMatch(/PowerShell/);
    });

    it('are the same bytes every time for the same machine, so a server can reuse the prefix', () => {
        expect(systemPrompt({ platform: 'win32', shell: 'Windows PowerShell 5.1', node: '22.11.0' })).toBe(windows);
    });
});
