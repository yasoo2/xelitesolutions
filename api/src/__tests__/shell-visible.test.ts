/**
 * When Joe runs a command autonomously, the user must SEE it in the Terminal
 * tab — the standing "use the terminal" promise is empty if the work is
 * invisible. shell_execute must broadcast the command and its output to the
 * agent terminal view ('joe-agent'), never to the interactive local_terminal.
 */
import fs from 'fs';
import path from 'path';

describe('shell_execute — visible in the terminal', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'SystemTools.ts'), 'utf-8');

    test('it broadcasts terminal_output to the agent view, not the interactive one', () => {
        expect(src).toContain("const AGENT_TERM = 'joe-agent'");
        expect(src).toMatch(/broadcast\(\{ type: 'terminal_output', id: AGENT_TERM/);
        // It must NOT target the interactive session id.
        expect(src).not.toMatch(/broadcast\(\{ type: 'terminal_output', id: 'local_terminal'/);
    });

    test('the command is echoed BEFORE it runs and the result AFTER', () => {
        // echoCommand() precedes handleShellCommand; echoResult() follows it.
        const echoCmdAt = src.indexOf('echoCommand();\n            const r = await handleShellCommand');
        const echoResAt = src.indexOf('echoResult(String(r.output');
        expect(echoCmdAt).toBeGreaterThan(0);
        expect(echoResAt).toBeGreaterThan(echoCmdAt);
    });

    test('output is CRLF-normalized so a child process does not stair-step', () => {
        expect(src).toMatch(/replace\(\/\\r\?\\n\/g, '\\r\\n'\)/);
    });

    test('secrets stay redacted in the echoed command', () => {
        expect(src).toContain('echoCommand = () => paintToTerminal(`\\r\\n\\x1b[36m$ ${redactCmd(command)}');
    });
});

describe('the terminal panel renders the agent stream', () => {
    const ui = fs.readFileSync(
        path.join(__dirname, '..', '..', '..', 'web', 'src', 'components', 'terminal', 'EnterpriseTerminalPanel.tsx'), 'utf-8');

    test('incoming joe-agent output is accepted alongside the interactive session', () => {
        expect(ui).toMatch(/msg\.id === 'joe-agent'/);
    });
});
