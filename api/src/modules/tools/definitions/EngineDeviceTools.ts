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
import { describeNetwork, networkScanScript, parseNetworkScan, type NetworkScan } from '../../../core/devices/network-scan';
import { deviceLinks, linkCommand, reachableBase, type ForgetResult } from '../../../core/devices/device-link';
import { KeptStoreError } from '../../../core/devices/linked-computers';
import { config } from '../../../shared/config';
import fs from 'fs';
import os from 'os';
import path from 'path';

/** This computer and the owner's linked ones, as device_computers says them. */
export function computersText(owner: string, now = Date.now()): string {
    const linked = deviceLinks.list(owner);
    const here = `This computer: ${os.hostname()} (${WINDOWS ? 'Windows: Joe can work its desktop' : `${process.platform}: no desktop control here`}).`;
    if (!linked.length) return `${here}\nNo other computer is linked. To link one for good, device_link_new with the name the owner gives it: he runs one line on it once, and it calls Joe by itself from then on.`;
    const ago = (t: number) => {
        if (!t) return 'never seen yet';
        const m = Math.round((now - t) / 60_000);
        return m < 2 ? 'seen a moment ago' : m < 120 ? `last seen ${m} min ago` : `last seen ${Math.round(m / 60)} h ago`;
    };
    return [here, 'The owner\'s other computers:', ...linked.map(d => {
        const what = `${d.os || 'Windows'}${d.user ? `, user ${d.user}` : ''}${d.screen ? `, screen ${d.screen}` : ''}`;
        const state = d.online !== false ? 'ONLINE now: device_use it' : `OFF or without internet (${ago(d.lastSeen)}): it connects by itself when it is on`;
        return `- «${d.name}»${d.kept ? ' (linked for good)' : ' (linked for this session)'} — ${what} — ${state}`;
    })].join('\n');
}

const WINDOWS = process.platform === 'win32';

/**
 * A refused forget, worded for the model: nothing was forgotten, and the
 * owner is to be ASKED which computer he means — never guessed for him
 * (device-link.ts forgetExactly; «the office laptop» once forgot «laptop»,
 * 2026-11-08).
 */
export function forgetRefusalText(r: Extract<ForgetResult, { ok: false }>): string {
    const names = (list: string[]) => list.map(n => `«${n}»`).join(', ');
    if (r.reason === 'store') return `Nothing was unlinked. ${r.error} Say so to the owner.`;
    const then = 'Ask the owner which computer he means (ask_owner), then call device_forget again with that computer\'s exact name as device_computers lists it. Do not pick one for him.';
    if (r.reason === 'ambiguous') return `Nothing was unlinked: «${r.asked}» is the name of more than one of the owner's computers (${names(r.close)}). ${then}`;
    const near = r.close.length
        ? `The names that come close: ${names(r.close)}.`
        : r.all.length ? `His computers are: ${names(r.all)}.` : 'He has no computer linked.';
    return `Nothing was unlinked: unlinking for good takes a computer's exact name, and no computer of the owner is named exactly «${r.asked}». ${near} ${r.all.length ? then : 'Say so to the owner.'}`;
}

/**
 * A scan that ran ON the owner's linked computer, said as that computer's own
 * network. describeNetwork speaks of «this computer»; here that is the linked
 * one, so it is named, and its own line says it is the computer that scanned.
 */
export function describeLinkedNetwork(scan: NetworkScan, computer: string, joeHost = os.hostname()): string {
    const devices = scan.devices.map(d => d.self ? { ...d, kind: `«${computer}» itself (the linked computer that scanned)` } : d);
    const body = describeNetwork({ ...scan, devices }).replace(/^This computer is on /mu, `«${computer}» is on `);
    return [`Scanned ON «${computer}», the owner's linked computer: this is ITS network, not the network of Joe's own computer «${joeHost}».`, body].join('\n');
}

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
            op: { type: 'string', description: 'look | windows | focus | click | move | drag | scroll | type | key | open | ui | act | computers | pair | linked | network | forget' },
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
            //  With a name, a PERMANENT link (linked-computers.ts): installed once, it calls Joe at every start.
            const keepAs = String(input?.name || '').trim();
            let paired: { code: string; expiresAt: number };
            try { paired = deviceLinks.newPairingCode(owner, Date.now(), keepAs || undefined); }
            catch (e: any) {
                //  The record of kept computers cannot be read: no line is given (linked-computers.ts).
                if (!(e instanceof KeptStoreError)) throw e;
                return { ok: false, error: e.message, output: { text: `${e.message} Say so to the owner; no line was made.` } } as any;
            }
            const { code, expiresAt } = paired;
            const base = reachableBase('http', `127.0.0.1:${config.port || 5000}`);
            const command = linkCommand(`${base.http}/api/devices/${keepAs ? 'install' : 'link'}.ps1?code=${code}`);
            return { ok: true, output: { text: `PAIR\t${command}\t${expiresAt}\t${base.via}`, command, expiresAt, via: base.via, keep: !!keepAs, name: keepAs } } as any;
        }
        if (String(input?.op || '') === 'linked') {
            return { ok: true, output: { text: JSON.stringify(deviceLinks.list(owner).map(d => ({ name: d.name, os: d.os, connectedAt: d.connectedAt, online: d.online !== false, kept: !!d.kept }))) } } as any;
        }
        //  The devices on the owner's Wi-Fi (core/devices/network-scan.ts).
        if (String(input?.op || '') === 'network') {
            const computer = String(input?.computer || '').trim();
            //  A linked computer chosen (device_use): the scan runs ON it, through its own agent
            //  (device-link.ts scanNetwork), and the answer is its network. It ran on Joe's own
            //  computer before, which only said so (2026-11-08: the office PC's Wi-Fi was asked
            //  for). Whatever Joe's own system is: the linked computer does the scanning.
            //  Nothing else is ever scanned in its place: Joe's network is not that computer's.
            if (computer) {
                const r = await deviceLinks.scanNetwork(owner, computer, networkScanScript(), 90_000);
                if (!r.ok) {
                    const text = r.oldAgent
                        ? `«${r.name}» was linked before Joe could scan a linked computer's network: its agent answered that it does not know the network scan. The owner must relink «${r.name}» once (device_link_new, and the one line run on that computer once); until then Joe cannot see its network. Nothing else was scanned in its place: Joe's own network is not «${r.name}»'s. Say so to the owner.`
                        : `${r.error}. Nothing else was scanned in its place: Joe's own network is not «${r.name}»'s. Say so to the owner.`;
                    return { ok: false, error: r.oldAgent ? `«${r.name}» must be relinked once to scan its network` : r.error, output: { text, computer: r.name, ...(r.oldAgent ? { relink: true } : {}) } } as any;
                }
                const scan = parseNetworkScan(r.out);
                if (!scan.ok) return { ok: false, error: scan.error, output: { text: `On «${r.name}»: ${scan.error} (the scan ran on «${r.name}» itself.)`, computer: r.name } } as any;
                return {
                    ok: true,
                    output: {
                        text: describeLinkedNetwork(scan, r.name),
                        devices: scan.devices, ip: scan.ip, gateway: scan.gateway, network: scan.network, prefix: scan.prefix, swept: scan.swept,
                        scannedFrom: r.name, scannedOn: 'linked',
                    },
                } as any;
            }
            if (!WINDOWS) {
                const text = `This computer runs ${process.platform}; Joe's network scan works on Windows in this version. Say so to the owner.`;
                return { ok: false, error: 'the network scan is Windows-only in this version', output: { text } } as any;
            }
            const r = await gatewayPowerShell(networkScanScript(), 60_000);
            const scan = parseNetworkScan(r.stdout);
            if (!scan.ok) return { ok: false, error: scan.error, output: { text: scan.error } } as any;
            const from = os.hostname();
            return {
                ok: true,
                output: {
                    text: describeNetwork(scan, { from }),
                    devices: scan.devices, ip: scan.ip, gateway: scan.gateway, network: scan.network, prefix: scan.prefix, swept: scan.swept,
                    scannedFrom: from,
                },
            } as any;
        }
        if (String(input?.op || '') === 'forget') {
            //  By the exact name or id only; anything else is refused with the names that come close,
            //  worded so the model asks the owner (device-link.ts forgetExactly).
            const r = deviceLinks.forgetExactly(owner, String(input?.computer || input?.name || ''));
            if (r.ok) return { ok: true, output: { text: `«${r.device.name}» is unlinked for good: its key opens nothing now, and its agent removes itself the next time it calls.`, name: r.device.name } } as any;
            return {
                ok: false,
                error: r.reason === 'store' ? 'the record of linked computers cannot be read or saved' : r.reason === 'ambiguous' ? 'that name fits more than one computer' : 'no computer has exactly that name',
                output: { text: forgetRefusalText(r), close: r.close, ask: r.reason !== 'store' },
            } as any;
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

/*
 * THIS COMPUTER'S SCREEN, LIVE, IN JOE'S PREVIEW.
 *
 * The owner, 2026-11-08: the preview shows whatever Joe is working on — the
 * phone, the computer, the browser. While Joe works this computer's desktop
 * the preview asks for its screen again and again (api/routes/devices.ts).
 * The whole screen, scaled to 1280 pixels wide, through the desktop host Joe
 * already runs (or one PowerShell through the gateway when it is not up).
 * One capture at a time; a frame younger than 500 ms is shared.
 */
export type ComputerFrame = { ok: true; png: Buffer; at: number } | { ok: false; code: 'not_windows' | 'failed'; error: string };
let lastComputer: (ComputerFrame & { ok: true }) | null = null;
let capturingComputer: Promise<ComputerFrame> | null = null;

export async function computerScreenNow(): Promise<ComputerFrame> {
    if (!WINDOWS) return { ok: false, code: 'not_windows', error: `This computer runs ${process.platform}; the live view of its screen works on Windows in this version.` };
    if (lastComputer && Date.now() - lastComputer.at < 500) return lastComputer;
    if (capturingComputer) return capturingComputer;
    capturingComputer = (async (): Promise<ComputerFrame> => {
        const dir = path.join(os.tmpdir(), 'joe-live');
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, 'computer.png');
        const action: DesktopAction = { op: 'look', file, left: 0, top: 0, width: 0, height: 0, maxWidth: 1280 };
        const r = (await desktopHost().send(action, 20_000).catch(() => null)) || await runDesktop(gatewayPowerShell, action, 30_000);
        if (!r.ok) return { ok: false, code: 'failed', error: r.error || 'the screen could not be captured' };
        let png: Buffer;
        try { png = fs.readFileSync(file); } catch { return { ok: false, code: 'failed', error: 'the screen picture did not come back' }; }
        lastComputer = { ok: true, png, at: Date.now() };
        return lastComputer;
    })().finally(() => { capturingComputer = null; });
    return capturingComputer;
}
