/**
 * A command's failure leads with the failure (eval P001, 2026-10-26): npm
 * printed four `npm warn allow-scripts` lines before `npm error could not
 * determine executable to run`, and the headline he was shown — like every
 * other head-first view of a failure — held only the warnings.
 */
jest.mock('../kernel/ExecutionGateway', () => ({
    ExecutionGateway: { execute: jest.fn() },
}));

import { ExecutionGateway } from '../kernel/ExecutionGateway';
import { handleShellCommand } from '../modules/tools/handlers';
import { leadWithFailure } from '../shared/utils/failure-text';
import { RepairTicketService } from '../modules/services/RepairTicketService';

const warned = (count: number) => [
    `npm warn allow-scripts ${count} packages have install scripts not yet covered by allowScripts:`,
    ...Array.from({ length: count }, (_, i) => `npm warn allow-scripts   pkg-${i}@1.0.${i} (install: (install scripts present))`),
    'npm warn allow-scripts',
    'npm warn allow-scripts Run `npm approve-scripts --allow-scripts-pending` to review, or `npm approve-scripts <pkg>` to allow.',
];
const npmFailure = (count: number) => [
    ...warned(count),
    'npm error could not determine executable to run',
    'npm error A complete log of this run can be found in: C:/npm-cache/_logs/debug-0.log',
    '',
].join('\r\n');

describe('a command failure leads with the failure', () => {
    it('moves leading npm warnings behind the npm error, dropping nothing', () => {
        const raw = npmFailure(6);
        const led = leadWithFailure(raw);
        expect(led.startsWith('npm error could not determine executable to run\r\nnpm error A complete log')).toBe(true);
        for (const line of warned(6)) expect(led).toContain(line);
        expect(led.split('\r\n').filter(Boolean).sort()).toEqual(raw.split('\r\n').filter(Boolean).sort());
    });

    it('keeps a located error exactly as printed', () => {
        const syntax = 'D:/app/server.js:3\nconst = 1;\n      ^\n\nSyntaxError: Unexpected token \'=\'\n    at wrapSafe (node:internal/modules/cjs/loader:1)';
        expect(leadWithFailure(syntax)).toBe(syntax);
        const trace = 'Traceback (most recent call last):\n  File "app.py", line 1\nValueError: x';
        expect(leadWithFailure(trace)).toBe(trace);
    });

    it('leaves text that is only noise unchanged', () => {
        const onlyWarnings = warned(2).join('\n') + '\n\n';
        expect(leadWithFailure(onlyWarnings)).toBe(onlyWarnings);
        expect(leadWithFailure('')).toBe('');
    });

    it('moves node, pip and install-progress preambles too', () => {
        const node = '(node:4242) ExperimentalWarning: SQLite is an experimental feature\n(Use `node --trace-warnings ...` to show where the warning was created)\nError: Cannot find module \'./db\'';
        expect(leadWithFailure(node).startsWith("Error: Cannot find module './db'")).toBe(true);
        const pip = 'WARNING: You are using pip version 21.0\nERROR: No matching distribution found for nonexistent-pkg';
        expect(leadWithFailure(pip).startsWith('ERROR: No matching distribution')).toBe(true);
        const install = 'added 4 packages, and audited 100 packages in 3s\n\n15 packages are looking for funding\n  run `npm fund` for details\n\n4 vulnerabilities (3 moderate, 1 high)\n\nTo address all issues (including breaking changes), run:\n  npm audit fix --force\n\nRun `npm audit` for details.\n\'vite\' is not recognized as an internal or external command,';
        expect(leadWithFailure(install).startsWith("'vite' is not recognized")).toBe(true);
    });

    it('handleShellCommand reports the failure first and keeps the raw stderr', async () => {
        const raw = npmFailure(6);
        (ExecutionGateway.execute as jest.Mock).mockResolvedValue({ success: false, error: raw });
        const r = await handleShellCommand('npx tailwindcss init -p', [], process.cwd());
        expect(r.ok).toBe(false);
        expect(r.error!.startsWith('npm error could not determine executable to run')).toBe(true);
        expect(r.stderr).toBe(raw);
    });

    it('the repair ticket headline he is shown names the real error', async () => {
        (ExecutionGateway.execute as jest.Mock).mockResolvedValue({ success: false, error: npmFailure(6) });
        const r = await handleShellCommand('npx tailwindcss init -p', [], process.cwd());
        const ticket = RepairTicketService.build({
            phaseStatus: 'failed',
            phaseResult: { output: { status: 'failed', results: [{ ok: false, tool: 'shell_execute', task: 'init tailwind', error: r.error }] } },
        });
        // ProjectPipelineTool shows `ticket.primaryError.slice(0, 220)` as «الخطأ».
        expect(ticket.primaryError.slice(0, 220)).toContain('could not determine executable to run');
    });
});
