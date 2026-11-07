/**
 * JOE LINK: ANOTHER COMPUTER OF THE OWNER'S, WORKED FROM HERE.
 *
 * The owner asked for Joe to work «a remote computer» as he works this one.
 * Nothing is opened on that computer and nothing listens there: it calls OUT
 * to Joe, the way a browser does, so it works behind any router.
 *
 *   1. Joe gives the signed-in owner a pairing code: 96 random bits, ten
 *      minutes, one use (newPairingCode). Nobody types it: it travels inside
 *      the one line he copies, so it can be long enough that guessing it is
 *      not a way in.
 *   2. On the other computer the owner runs one line that fetches the link
 *      script with that code (routes/devices.ts). The script loads the same
 *      desktop helper this computer uses (windows-desktop.ts), opens a window
 *      that says Joe is in control, and connects to /ws/device-link.
 *   3. The code is claimed once; the computer joins the owner's devices under
 *      its own name. Closing that window ends the link at once.
 *
 * Every action then travels as the same line the local desktop host reads
 * (desktop-host.ts hostLine), prefixed by a request number, and comes back as
 * the same answer. So the window guard, the calibration and the Arabic typing
 * are the remote computer's own, exactly as here. A picture of the remote
 * screen comes back inline (`lookdata`), since Joe cannot read a file there.
 */
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import { hostLine, readHostAnswer } from './desktop-host';
import { helperDllPath, helperSource, psQuote, type DesktopAction } from './windows-desktop';

export interface LinkSocket {
    send(data: string): void;
    close(code?: number, reason?: string): void;
    on(event: 'message', fn: (data: unknown) => void): unknown;
    on(event: 'close', fn: () => void): unknown;
}

export interface LinkedDevice {
    id: string;
    name: string;
    os: string;
    user: string;
    screen: string;
    connectedAt: number;
    lastSeen: number;
}

interface Live extends LinkedDevice {
    ownerId: string;
    socket: LinkSocket;
    pending: Map<string, (line: string | null) => void>;
    chain: Promise<unknown>;
}

/** A picture of the remote screen, as the remote helper answers it. */
export interface RemoteLook { frame: string; png: Buffer }

const CODE_MS = 10 * 60_000;

export class DeviceLinks {
    private codes = new Map<string, { ownerId: string; expiresAt: number }>();
    private live = new Map<string, Live>();
    private seq = 0;

    /** A code for this owner, valid ten minutes, good once. */
    newPairingCode(ownerId: string, now = Date.now()): { code: string; expiresAt: number } {
        for (const [c, v] of this.codes) if (v.expiresAt <= now) this.codes.delete(c);
        let code = '';
        do { code = crypto.randomBytes(12).toString('hex'); } while (this.codes.has(code));
        const expiresAt = now + CODE_MS;
        this.codes.set(code, { ownerId, expiresAt });
        return { code, expiresAt };
    }

    /** The owner a code was given to, once; null when it is unknown, used or expired. */
    claim(code: string, now = Date.now()): string | null {
        const c = String(code || '').trim();
        const v = this.codes.get(c);
        if (!v) return null;
        this.codes.delete(c);
        return v.expiresAt > now ? v.ownerId : null;
    }

    /** True while a code is waiting to be used (the link script is served only for one). */
    isWaiting(code: string, now = Date.now()): boolean {
        const v = this.codes.get(String(code || '').trim());
        return !!v && v.expiresAt > now;
    }

    /**
     * A computer that presented a claimed code. Its hello is what it says it
     * is; the name is cleaned and made unique among this owner's devices.
     */
    attach(socket: LinkSocket, ownerId: string, hello: Partial<LinkedDevice>, now = Date.now()): LinkedDevice {
        const clean = (s: unknown, max: number) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
        let name = clean(hello.name, 60) || 'computer';
        const taken = new Set([...this.live.values()].filter(d => d.ownerId === ownerId).map(d => d.name.toLowerCase()));
        for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${clean(hello.name, 56) || 'computer'}-${n}`;
        const device: Live = {
            id: crypto.randomBytes(8).toString('hex'),
            name, os: clean(hello.os, 80), user: clean(hello.user, 60), screen: clean(hello.screen, 40),
            connectedAt: now, lastSeen: now, ownerId, socket, pending: new Map(), chain: Promise.resolve(),
        };
        this.live.set(device.id, device);
        socket.on('message', data => {
            device.lastSeen = Date.now();
            const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
            const tab = text.indexOf('\t');
            if (tab <= 0) return;
            const resolve = device.pending.get(text.slice(0, tab));
            if (resolve) { device.pending.delete(text.slice(0, tab)); resolve(text.slice(tab + 1)); }
        });
        socket.on('close', () => this.detach(device.id));
        return this.view(device);
    }

    detach(id: string): void {
        const d = this.live.get(id);
        if (!d) return;
        this.live.delete(id);
        for (const resolve of d.pending.values()) resolve(null);
        d.pending.clear();
    }

    /** Ends a link from Joe's side: the remote window closes with a word of why. */
    disconnect(ownerId: string, nameOrId: string): boolean {
        const d = this.find(ownerId, nameOrId);
        if (!d) return false;
        try { d.socket.send('0\tbye'); } catch { /* gone */ }
        try { d.socket.close(1000, 'disconnected by the owner'); } catch { /* gone */ }
        this.detach(d.id);
        return true;
    }

    list(ownerId: string): LinkedDevice[] {
        return [...this.live.values()].filter(d => d.ownerId === ownerId).map(d => this.view(d));
    }

    private find(ownerId: string, nameOrId: string): Live | null {
        const key = String(nameOrId || '').trim().toLowerCase();
        const mine = [...this.live.values()].filter(d => d.ownerId === ownerId);
        return mine.find(d => d.id === key) || mine.find(d => d.name.toLowerCase() === key) || null;
    }

    private view(d: Live): LinkedDevice {
        return { id: d.id, name: d.name, os: d.os, user: d.user, screen: d.screen, connectedAt: d.connectedAt, lastSeen: d.lastSeen };
    }

    /** One raw line to one device, in turn; null when it is gone or silent. */
    private request(d: Live, line: string, timeoutMs: number): Promise<string | null> {
        const run = () => new Promise<string | null>(resolve => {
            if (!this.live.has(d.id)) return resolve(null);
            const id = String(++this.seq);
            const timer = setTimeout(() => { d.pending.delete(id); resolve(null); }, timeoutMs);
            d.pending.set(id, answer => { clearTimeout(timer); resolve(answer); });
            try { d.socket.send(`${id}\t${line}`); } catch { clearTimeout(timer); d.pending.delete(id); resolve(null); }
        });
        const next = d.chain.then(run, run);
        d.chain = next.catch(() => undefined);
        return next;
    }

    /** One desktop action on the owner's linked computer, answered as the local host answers. */
    async send(ownerId: string, nameOrId: string, a: DesktopAction, timeoutMs = 90_000): Promise<{ ok: boolean; out: string; error?: string }> {
        const d = this.find(ownerId, nameOrId);
        if (!d) return { ok: false, out: '', error: `no linked computer named «${nameOrId}» is connected: ${this.list(ownerId).map(x => x.name).join(', ') || 'none is'}` };
        const line = await this.request(d, hostLine(a), timeoutMs);
        if (line === null) return { ok: false, out: '', error: `«${d.name}» did not answer` };
        return readHostAnswer(line);
    }

    /** A picture of the remote screen (or of a region of it), brought back inline. */
    async look(ownerId: string, nameOrId: string, region: { left?: number; top?: number; width?: number; height?: number; maxWidth?: number }, timeoutMs = 90_000): Promise<{ ok: true; look: RemoteLook } | { ok: false; error: string }> {
        const d = this.find(ownerId, nameOrId);
        if (!d) return { ok: false, error: `no linked computer named «${nameOrId}» is connected` };
        const int = (n: unknown) => String(Math.round(Number(n) || 0));
        const line = await this.request(d, ['lookdata', int(region.left), int(region.top), int(region.width), int(region.height), int(region.maxWidth || 1280)].join('\t'), timeoutMs);
        if (line === null) return { ok: false, error: `«${d.name}» did not answer` };
        const answer = readHostAnswer(line);
        if (!answer.ok) return { ok: false, error: answer.error || 'the picture failed' };
        const [tag, frame, data] = answer.out.split('\t');
        if (tag !== 'LOOKDATA' || !frame || !data) return { ok: false, error: 'the remote computer sent no picture' };
        return { ok: true, look: { frame: `LOOK\t${frame}`, png: Buffer.from(data, 'base64') } };
    }
}

export const deviceLinks = new DeviceLinks();

/**
 * The script the other computer runs: it says, in its own window, that Joe is
 * in control and how to stop him; loads (compiling once) the same helper as
 * this computer; says what it is; and serves the link until it ends.
 */
export function linkScript(wsUrl: string): string {
    const dllName = path.basename(helperDllPath());
    const source = helperSource();
    if (/^'@/mu.test(source)) throw new Error('the helper source cannot travel in a here-string');
    return [
        "$ErrorActionPreference = 'Stop'",
        'try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}',
        "try { $Host.UI.RawUI.WindowTitle = 'Joe is controlling this computer' } catch {}",
        "Write-Host ''",
        "Write-Host '  Joe is controlling this computer now. Close this window to stop him at once.' -ForegroundColor Yellow",
        "Write-Host '  جو يتحكم بهذا الحاسوب الآن. أغلق هذه النافذة لإيقافه فوراً.' -ForegroundColor Yellow",
        "Write-Host ''",
        'Add-Type -AssemblyName System.Windows.Forms, System.Drawing',
        `$dll = Join-Path $env:TEMP ${psQuote(dllName)}`,
        'if (-not ("JoeDesktop" -as [type])) {',
        '  if (-not (Test-Path $dll)) {',
        "    $cs = @'",
        source.replace(/^\s+|\s+$/gu, ''),
        "'@",
        '    try { Add-Type -TypeDefinition $cs -ReferencedAssemblies System.Windows.Forms, System.Drawing, Accessibility, System.Core -OutputAssembly $dll -OutputType Library } catch { if (-not (Test-Path $dll)) { throw } }',
        '  }',
        '  Add-Type -Path $dll',
        '}',
        '[JoeDesktop]::Init()',
        '$v = [System.Windows.Forms.SystemInformation]::VirtualScreen',
        "$os = 'Windows'; try { $os = (Get-CimInstance Win32_OperatingSystem).Caption } catch {}",
        '$hello = @{ name = $env:COMPUTERNAME; user = $env:USERNAME; os = $os; screen = "$($v.Width)x$($v.Height)" } | ConvertTo-Json -Compress',
        `$why = [JoeDesktop]::Link(${psQuote(wsUrl)}, $hello)`,
        'Write-Host ("  " + $why)',
    ].join(String.fromCharCode(10));
}

const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?$/i;

/** This computer's address on its own network (the first private IPv4), if it has one. */
export function lanAddress(interfaces = os.networkInterfaces()): string {
    for (const list of Object.values(interfaces)) {
        for (const a of list || []) {
            const family = String((a as any).family);
            if ((family === 'IPv4' || family === '4') && !a.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) return a.address;
        }
    }
    return '';
}

/**
 * The address another computer reaches this Joe at. The address given, unless
 * only this computer knows it (localhost): then PUBLIC_URL when it is set,
 * else this computer's address on its network (Joe listens on every interface
 * by default, shared/go-live.ts), else «local», said plainly by the caller.
 */
export function reachableBase(proto: string, host: string, env: NodeJS.ProcessEnv = process.env, lan: () => string = lanAddress): { http: string; ws: string; via: 'request' | 'public' | 'lan' | 'local' } {
    const p = proto === 'https' ? 'https' : 'http';
    const at = (scheme: string, h: string) => ({ http: `${scheme}://${h}`, ws: `${scheme === 'https' ? 'wss' : 'ws'}://${h}` });
    if (!LOCAL_HOST.test(host)) return { ...at(p, host), via: 'request' };
    try {
        const pub = new URL(String(env.PUBLIC_URL || ''));
        if (/^https?:$/.test(pub.protocol) && !LOCAL_HOST.test(pub.host)) return { ...at(pub.protocol.replace(':', ''), pub.host), via: 'public' };
    } catch { /* no public address */ }
    const ip = String(env.JOE_BIND_HOST || '0.0.0.0').trim() === '0.0.0.0' ? lan() : '';
    const port = (host.match(/:(\d+)$/) || [])[1];
    if (ip) return { ...at(p, port ? `${ip}:${port}` : ip), via: 'lan' };
    return { ...at(p, host), via: 'local' };
}

/** The one line the owner runs on the other computer. */
export function linkCommand(scriptUrl: string): string {
    return `powershell -NoProfile -ExecutionPolicy Bypass -Command "irm '${scriptUrl}' | iex"`;
}
