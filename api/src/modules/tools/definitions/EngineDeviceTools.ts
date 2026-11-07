/**
 * engine_device: Joe's hands on THIS computer, through his tool gateway.
 *
 * One registered tool carries every desktop action of the agent engine
 * (core/engine/tools/devices.ts), so the firewall, the session owner, the
 * audit, the rate limit and the run's Stop button apply to each click and
 * each key exactly as they do to a shell command. The action itself is run by
 * core/devices/windows-desktop.ts, one PowerShell process through
 * ExecutionGateway (never child_process here).
 *
 * Windows only in this version. On another system the tool says so plainly,
 * so the model can tell the owner instead of pretending.
 */
import type { ToolDefinition, ToolExecutionResult, ToolPermission } from '../types';
import { ExecutionGateway } from '../../../kernel/ExecutionGateway';
import { encodedCommand, runDesktop, type DesktopAction, type PowerShellRunner } from '../../../core/devices/windows-desktop';
import { DesktopHost } from '../../../core/devices/desktop-host';
import { deviceLinks, linkCommand, reachableBase } from '../../../core/devices/device-link';
import { config } from '../../../shared/config';
import fs from 'fs';
import os from 'os';
import path from 'path';

/** This computer and the owner's linked ones, as device_computers says them. */
export function computersText(owner: string): string {
    const linked = deviceLinks.list(owner);
    const here = `This computer: ${os.hostname()} (${WINDOWS ? 'Windows: Joe can work its desktop' : `${process.platform}: no desktop control here`}).`;
    if (!linked.length) return `${here}\nNo other computer is linked. The owner links one from Joe's settings (Devices): one line run on that computer.`;
    return [here, 'Linked computers:', ...linked.map(d => `- ${d.name} (${d.os || 'Windows'}${d.user ? `, user ${d.user}` : ''}${d.screen ? `, screen ${d.screen}` : ''}) connected`)].join('\n');
}

const WINDOWS = process.platform === 'win32';

/** Every desktop action runs as one Windows PowerShell process through the gateway. */
export const gatewayPowerShell: PowerShellRunner = async (script, timeoutMs) => {
    const r: any = await ExecutionGateway.execute('powershell.exe',
        ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedCommand(script)],
        { timeout: timeoutMs, windowsHide: true, shell: false });
    const data = r?.data || {};
    return {
        exitCode: typeof data.exitCode === 'number' ? data.exitCode : (r?.success ? 0 : null),
        stdout: String(data.output || ''),
        stderr: String(data.error || r?.error || ''),
    };
};

/**
 * The one desktop host of this Joe (core/devices/desktop-host.ts), started
 * through ExecutionGateway the first time an action needs it. Started inside
 * the run's execution context (the firewall allows it there), kept by the
 * process ledger, ended by itself after ten idle minutes.
 */
let host: DesktopHost | null = null;
function desktopHost(): DesktopHost {
    if (!host) {
        host = new DesktopHost(script => {
            ExecutionGateway.startManaged('powershell.exe',
                ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedCommand(script)],
                { windowsHide: true });
        });
    }
    return host;
}

/** Ends this Joe's desktop host, if one is running (tests, and a Joe shutting down). */
export function closeDesktopHost(): void {
    host?.stop();
    host = null;
}

const OPS = new Set(['look', 'windows', 'focus', 'click', 'move', 'drag', 'scroll', 'type', 'key', 'open', 'ui', 'act']);

/** The action as the gateway received it, checked: numbers are numbers, text is text. */
export function desktopActionOf(input: any): DesktopAction | { error: string } {
    const op = String(input?.op || '');
    if (!OPS.has(op)) return { error: `engine_device: unknown action «${op}»` };
    const n = (v: unknown) => Number.isFinite(Number(v)) ? Math.round(Number(v)) : NaN;
    const window = input?.window === undefined || input?.window === null ? undefined : n(input.window);
    switch (op) {
        case 'look': return { op, file: String(input.file || ''), left: n(input.left) || 0, top: n(input.top) || 0, width: n(input.width) || 0, height: n(input.height) || 0, maxWidth: n(input.maxWidth) || 1280 };
        case 'windows': return { op };
        case 'focus': return Number.isFinite(window) ? { op, handle: window as number } : { error: 'engine_device focus needs a window' };
        case 'click': return { op, x: n(input.x), y: n(input.y), button: ['left', 'right', 'middle'].includes(input.button) ? input.button : 'left', count: n(input.count) || 1, window };
        case 'move': return { op, x: n(input.x), y: n(input.y) };
        case 'drag': return { op, x: n(input.x), y: n(input.y), toX: n(input.toX), toY: n(input.toY) };
        case 'scroll': return { op, x: n(input.x), y: n(input.y), notches: n(input.notches) || 0, window };
        case 'type': return { op, text: String(input.text ?? ''), window };
        case 'key': return Array.isArray(input.codes) && input.codes.length ? { op, codes: input.codes.map(n), window } : { error: 'engine_device key needs codes' };
        case 'open': return String(input.target || '').trim() ? { op, target: String(input.target).trim() } : { error: 'engine_device open needs a target' };
        case 'ui': return { op, handle: Number.isFinite(window) ? window as number : null, limit: n(input.limit) || 150 };
        case 'act': return { op, handle: Number.isFinite(window) ? window as number : null, index: n(input.index), action: String(input.action || ''), value: String(input.value ?? ''), limit: n(input.limit) || 150 };
    }
    return { error: 'engine_device: unreachable' };
}

export class EngineDeviceTool implements ToolDefinition {
    readonly name = 'engine_device';
    readonly version = '1.0.0';
    readonly description = 'Agent engine only: one action on this computer\'s desktop (look, windows, focus, click, type, keys, scroll, open, read a window\'s controls, act on a control). Input reaches only the window named, and only while it is in front.';
    readonly tags = ['engine', 'device'];
    readonly inputSchema = {
        type: 'object',
        properties: {
            op: { type: 'string', description: 'look | windows | focus | click | move | drag | scroll | type | key | open | ui | act | computers | pair | linked' },
            window: { type: 'number', description: 'The window handle the action is for.' },
            computer: { type: 'string', description: 'A linked computer\'s name; absent for this computer.' },
        },
        required: ['op'],
    };
    readonly outputSchema = { type: 'object', properties: { text: { type: 'string' } } };
    permissions: ToolPermission[] = ['execute'];
    sideEffects: ToolPermission[] = ['execute'];
    rateLimitPerMinute = 240;
    auditFields = ['op', 'window', 'target', 'computer'];
    mockSupported = false;

    async execute(input: any, context?: any): Promise<ToolExecutionResult> {
        const owner = String(context?.userId || context?.auth?.sub || config.localUserId || '').trim();
        if (String(input?.op || '') === 'computers') return { ok: true, output: { text: computersText(owner) } } as any;
        //  Asked in the chat for a computer that is not linked yet: the line to run there (device-link.ts).
        if (String(input?.op || '') === 'pair') {
            const { code, expiresAt } = deviceLinks.newPairingCode(owner);
            const base = reachableBase('http', `127.0.0.1:${config.port || 5000}`);
            const command = linkCommand(`${base.http}/api/devices/link.ps1?code=${code}`);
            return { ok: true, output: { text: `PAIR\t${command}\t${expiresAt}\t${base.via}`, command, expiresAt, via: base.via } } as any;
        }
        if (String(input?.op || '') === 'linked') {
            return { ok: true, output: { text: JSON.stringify(deviceLinks.list(owner).map(d => ({ name: d.name, os: d.os, connectedAt: d.connectedAt }))) } } as any;
        }
        //  A linked computer (core/devices/device-link.ts): its own helper acts, its own guard decides.
        const computer = String(input?.computer || '').trim();
        if (computer) {
            const action = desktopActionOf(input);
            if ('error' in action) return { ok: false, error: action.error, output: { text: action.error } } as any;
            const timeout = action.op === 'ui' || action.op === 'act' || action.op === 'look' ? 90_000 : 60_000;
            if (action.op === 'look') {
                const seen = await deviceLinks.look(owner, computer, action, timeout);
                if (!seen.ok) return { ok: false, error: seen.error, output: { text: seen.error } } as any;
                try { fs.mkdirSync(path.dirname(action.file), { recursive: true }); fs.writeFileSync(action.file, seen.look.png); }
                catch (e: any) { return { ok: false, error: `the picture could not be kept: ${e?.message || e}`, output: { text: 'the picture could not be kept' } } as any; }
                return { ok: true, output: { text: seen.look.frame } } as any;
            }
            const r = await deviceLinks.send(owner, computer, action, timeout);
            return r.ok
                ? { ok: true, output: { text: r.out } } as any
                : { ok: false, error: r.error || 'the action failed on the linked computer', output: { text: r.error || r.out } } as any;
        }
        if (!WINDOWS) {
            const text = `This computer runs ${process.platform}; Joe's desktop control works on Windows in this version. Say so to the owner.`;
            return { ok: false, error: 'desktop control is Windows-only in this version', output: { text } } as any;
        }
        const action = desktopActionOf(input);
        if ('error' in action) return { ok: false, error: action.error, output: { text: action.error } } as any;
        const timeout = action.op === 'ui' || action.op === 'act' ? 90_000 : 60_000;
        //  The host answers in tens of milliseconds; one PowerShell per action
        //  is the fallback when the host cannot be reached.
        const r = (await desktopHost().send(action, timeout).catch(() => null)) || await runDesktop(gatewayPowerShell, action, timeout);
        return r.ok
            ? { ok: true, output: { text: r.out } } as any
            : { ok: false, error: r.error || 'the desktop action failed', output: { text: r.error || r.out } } as any;
    }
}

export const ENGINE_DEVICE_TOOLS: ToolDefinition[] = [new EngineDeviceTool()];
