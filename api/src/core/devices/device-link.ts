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
import { forgetComputer, keepComputer, keptComputers, sawComputer } from './linked-computers';
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
    /** Linked for good (linked-computers.ts): it calls Joe by itself each time Windows starts. */
    kept?: boolean;
    /** Connected now. A kept computer that is off is listed, not online. */
    online?: boolean;
}

interface Live extends LinkedDevice {
    ownerId: string;
    kept?: boolean;
    socket: LinkSocket;
    pending: Map<string, (line: string | null) => void>;
    chain: Promise<unknown>;
}

/** A picture of the remote screen, as the remote helper answers it. */
export interface RemoteLook { frame: string; png: Buffer }

const CODE_MS = 10 * 60_000;

export class DeviceLinks {
    private codes = new Map<string, { ownerId: string; expiresAt: number; keepAs?: string }>();
    private live = new Map<string, Live>();
    private seq = 0;

    /**
     * A code for this owner, valid ten minutes, good once. With `keepAs` it
     * installs a PERMANENT link under that name (linked-computers.ts).
     */
    newPairingCode(ownerId: string, now = Date.now(), keepAs?: string): { code: string; expiresAt: number } {
        for (const [c, v] of this.codes) if (v.expiresAt <= now) this.codes.delete(c);
        let code = '';
        do { code = crypto.randomBytes(12).toString('hex'); } while (this.codes.has(code));
        const expiresAt = now + CODE_MS;
        this.codes.set(code, { ownerId, expiresAt, ...(keepAs !== undefined ? { keepAs: String(keepAs) } : {}) });
        return { code, expiresAt };
    }

    /**
     * A permanent-link code, claimed once by the installer it fetches: the
     * computer is kept under the name the owner chose, and its key is made.
     */
    claimForKeeping(code: string, now = Date.now()): { ownerId: string; id: string; name: string; key: string } | null {
        const c = String(code || '').trim();
        const v = this.codes.get(c);
        if (!v || v.keepAs === undefined) return null;
        this.codes.delete(c);
        if (v.expiresAt <= now) return null;
        const kept = keepComputer(v.ownerId, v.keepAs, now);
        return { ownerId: v.ownerId, ...kept };
    }

    /** True while a permanent-link code is waiting (the installer is served only for one). */
    isWaitingToKeep(code: string, now = Date.now()): boolean {
        const v = this.codes.get(String(code || '').trim());
        return !!v && v.keepAs !== undefined && v.expiresAt > now;
    }

    /** The owner a code was given to, once; null when it is unknown, used or expired. */
    claim(code: string, now = Date.now()): string | null {
        const c = String(code || '').trim();
        const v = this.codes.get(c);
        //  A permanent-link code is the installer's, not a session's.
        if (!v || v.keepAs !== undefined) return null;
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
    attach(socket: LinkSocket, ownerId: string, hello: Partial<LinkedDevice>, now = Date.now(), kept?: { id: string; name: string }): LinkedDevice {
        const clean = (s: unknown, max: number) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
        let name = kept ? kept.name : clean(hello.name, 60) || 'computer';
        if (kept) {
            //  A kept computer that calls again (after a reboot, a lost line) replaces its old line.
            const old = this.live.get(kept.id);
            if (old) { try { old.socket.close(1000, 'replaced by a new connection'); } catch { /* gone */ } this.detach(kept.id); }
            sawComputer(kept.id, { os: hello.os, user: hello.user }, now);
        } else {
            const taken = new Set([...this.live.values()].filter(d => d.ownerId === ownerId).map(d => d.name.toLowerCase()));
            for (const k of keptComputers(ownerId)) taken.add(k.name.toLowerCase());
            for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${clean(hello.name, 56) || 'computer'}-${n}`;
        }
        const device: Live = {
            id: kept ? kept.id : crypto.randomBytes(8).toString('hex'),
            name, os: clean(hello.os, 80), user: clean(hello.user, 60), screen: clean(hello.screen, 40),
            connectedAt: now, lastSeen: now, ownerId, socket, pending: new Map(), chain: Promise.resolve(),
            ...(kept ? { kept: true } : {}),
        };
        this.live.set(device.id, device);
        socket.on('message', data => {
            device.lastSeen = Date.now();
            if (device.kept && device.lastSeen - (device as any).savedSeen > 60_000) { (device as any).savedSeen = device.lastSeen; sawComputer(device.id, {}, device.lastSeen); }
            const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
            const tab = text.indexOf('\t');
            if (tab <= 0) return;
            const resolve = device.pending.get(text.slice(0, tab));
            if (resolve) { device.pending.delete(text.slice(0, tab)); resolve(text.slice(tab + 1)); }
        });
        //  Only this line's close detaches it: a kept computer's NEW line must not be cut by its old one closing.
        socket.on('close', () => { if (this.live.get(device.id) === device) this.detach(device.id); });
        (device as any).savedSeen = now;
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

    /** The owner's computers: those connected now, and the kept ones that are off (online: false). */
    list(ownerId: string): LinkedDevice[] {
        const now = [...this.live.values()].filter(d => d.ownerId === ownerId).map(d => this.view(d));
        const off = keptComputers(ownerId).filter(k => !this.live.has(k.id)).map(k => ({
            id: k.id, name: k.name, os: k.os || '', user: k.user || '', screen: '', connectedAt: 0, lastSeen: k.lastSeen, kept: true, online: false,
        }));
        return [...now, ...off];
    }

    /**
     * Forgets a computer for good: a kept one's key opens nothing any more (its
     * agent removes itself on that refusal), and a connected line is ended.
     *
     * The target is resolved ONCE over the owner's computers — online AND kept,
     * as one pool — by exact id, then exact name, then a fuzzy match only when
     * it points at a single computer. forget used to search the online ones
     * first and the kept ones separately, so a loose name could disconnect one
     * computer while forgetting another (the owner's case, 2026-11-08).
     * Forgetting the WRONG computer is worse than refusing, so an ambiguous or
     * fuzzy-to-many name forgets NOTHING; forgetMatches() names the matches so
     * the chat can ask the owner which one he means.
     */
    forget(ownerId: string, nameOrId: string): LinkedDevice | null {
        const hit = this.resolveTarget(ownerId, nameOrId);
        if (!hit || 'ambiguous' in hit) return null;
        const kept = forgetComputer(ownerId, hit.id);
        const live = this.liveFor(ownerId, hit.id);
        if (live) {
            try { live.socket.send('0\tforget'); } catch { /* gone */ }
            try { live.socket.close(1000, 'forgotten by the owner'); } catch { /* gone */ }
            this.detach(live.id);
        }
        if (!live && !kept) return null;
        return live ? { ...this.view(live), online: false } : { id: kept!.id, name: kept!.name, os: kept!.os || '', user: kept!.user || '', screen: '', connectedAt: 0, lastSeen: kept!.lastSeen, kept: true, online: false };
    }

    /**
     * What a forget by this text would hit: the one computer (online or kept), or
     * the names that make it ambiguous — so the chat can ask the owner which one
     * he means instead of forgetting the wrong computer.
     */
    forgetMatches(ownerId: string, nameOrId: string): { one?: { id: string; name: string }; ambiguous?: string[] } {
        const hit = this.resolveTarget(ownerId, nameOrId);
        if (!hit) return {};
        return 'ambiguous' in hit ? { ambiguous: hit.names } : { one: { id: hit.id, name: hit.name } };
    }

    /** The owner's target, resolved once over online AND kept computers; ambiguous when a fuzzy name hits many. */
    private resolveTarget(ownerId: string, nameOrId: string): { id: string; name: string } | { ambiguous: true; names: string[] } | null {
        const key = String(nameOrId || '').trim().toLowerCase();
        if (!key) return null;
        //  One pool: the owner's computers online now AND the ones kept but off, deduped by id.
        const pool = new Map<string, { id: string; name: string }>();
        for (const d of this.live.values()) if (d.ownerId === ownerId) pool.set(d.id, { id: d.id, name: d.name });
        for (const k of keptComputers(ownerId)) if (!pool.has(k.id)) pool.set(k.id, { id: k.id, name: k.name });
        const all = [...pool.values()];
        //  1. an exact id.
        const byId = all.find(c => c.id.toLowerCase() === key);
        if (byId) return byId;
        //  2. an exact name (names are unique per owner).
        const byName = all.filter(c => c.name.toLowerCase() === key);
        if (byName.length === 1) return byName[0];
        if (byName.length > 1) return { ambiguous: true, names: byName.map(c => c.name) };
        //  3. a fuzzy match (one name contains the other), only when it points at ONE computer.
        const fuzzy = all.filter(c => c.name.toLowerCase().includes(key) || key.includes(c.name.toLowerCase()));
        const ids = new Set(fuzzy.map(c => c.id));
        if (ids.size === 1) return fuzzy[0];
        if (ids.size > 1) return { ambiguous: true, names: [...new Set(fuzzy.map(c => c.name))] };
        return null;
    }

    private liveFor(ownerId: string, id: string): Live | null {
        const d = this.live.get(id);
        return d && d.ownerId === ownerId ? d : null;
    }

    private find(ownerId: string, nameOrId: string): Live | null {
        const key = String(nameOrId || '').trim().toLowerCase();
        const mine = [...this.live.values()].filter(d => d.ownerId === ownerId);
        return mine.find(d => d.id === key) || mine.find(d => d.name.toLowerCase() === key)
            //  «كمبيوتر المكتب» for a computer kept as «المكتب», or the reverse.
            || (key ? mine.find(d => d.name.toLowerCase().includes(key) || key.includes(d.name.toLowerCase())) : undefined) || null;
    }

    private view(d: Live): LinkedDevice {
        return { id: d.id, name: d.name, os: d.os, user: d.user, screen: d.screen, connectedAt: d.connectedAt, lastSeen: d.lastSeen, ...(d.kept ? { kept: true } : {}), online: true };
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

/* ───────────── the permanent link: installed once, calls Joe at every start ───────────── */

/**
 * The agent a kept computer runs at every Windows sign-in (written by the
 * installer below to %LOCALAPPDATA%\Joe\link). It shows Joe's icon by the
 * clock — «Joe is linked to this computer», with «stop until restart» and
 * «unlink for good» — and keeps one line to Joe open, calling again after a
 * break. Its key travels in its first message, never in the address (no log
 * keeps it). When Joe refuses its id (the owner forgot this computer), it
 * removes itself: the sign-in entry, its folder, its icon.
 */
export function keptAgentScript(): string {
    return [
        "$ErrorActionPreference = 'Stop'",
        '$dir = Split-Path -Parent $MyInvocation.MyCommand.Path',
        "$cfg = Get-Content (Join-Path $dir 'link.json') -Raw -Encoding UTF8 | ConvertFrom-Json",
        //  One agent per computer and user.
        "$mutex = New-Object System.Threading.Mutex($false, ('Local\\JoeLink-' + $cfg.id))",
        'if (-not $mutex.WaitOne(0)) { exit }',
        'Add-Type -AssemblyName System.Windows.Forms, System.Drawing',
        //  Name the compiled helper after the HASH of helper.cs, so a new build compiles a new DLL
        //  instead of loading the old one a running agent still holds locked (the owner's case,
        //  2026-11-08). The old fixed name «JoeDesktop.dll» kept the previous helper after a re-link.
        "$src = Get-Content (Join-Path $dir 'helper.cs') -Raw -Encoding UTF8",
        "$h = [System.Security.Cryptography.SHA256]::Create(); $hash = [BitConverter]::ToString($h.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($src))).Replace('-', '').Substring(0, 12).ToLower()",
        "$dll = Join-Path $dir ('JoeDesktop-' + $hash + '.dll')",
        "if (-not (Test-Path $dll)) { Add-Type -TypeDefinition $src -ReferencedAssemblies System.Windows.Forms, System.Drawing, Accessibility, System.Core -OutputAssembly $dll -OutputType Library }",
        "$state = [hashtable]::Synchronized(@{ stop = $false; gone = $false; status = 'connecting' })",
        '$rs = [runspacefactory]::CreateRunspace(); $rs.Open()',
        "$rs.SessionStateProxy.SetVariable('state', $state); $rs.SessionStateProxy.SetVariable('cfg', $cfg); $rs.SessionStateProxy.SetVariable('dll', $dll); $rs.SessionStateProxy.SetVariable('dir', $dir)",
        '$ps = [powershell]::Create(); $ps.Runspace = $rs',
        '[void]$ps.AddScript({',
        '  Add-Type -AssemblyName System.Windows.Forms, System.Drawing',
        '  Add-Type -Path $dll',
        '  [JoeDesktop]::Init()',
        "  $os = 'Windows'; try { $os = (Get-CimInstance Win32_OperatingSystem).Caption } catch {}",
        '  while (-not $state.stop) {',
        '    $v = [System.Windows.Forms.SystemInformation]::VirtualScreen',
        '    $hello = @{ key = $cfg.key; user = $env:USERNAME; os = $os; screen = "$($v.Width)x$($v.Height)" } | ConvertTo-Json -Compress',
        "    $state.status = 'connecting'",
        "    $why = [JoeDesktop]::Link(($cfg.url + '?device=' + $cfg.id), $hello)",
        '    $state.last = $why',
        //  Why each line ended, for whoever asks why this computer is off (kept small).
        "    try { $log = Join-Path $dir 'agent.log'; if ((Test-Path $log) -and (Get-Item $log).Length -gt 102400) { Remove-Item $log -Force }; Add-Content -LiteralPath $log -Value ((Get-Date -Format s) + '  ' + $why) -Encoding UTF8 } catch {}",
        //  Joe says «forget»: the owner unlinked it for good. (A refused connection is told in
        //  Windows' own language — «تعذر الاتصال بالملقم البعيد» — so no number can be read from it.)
        "    if ($why -eq 'FORGOTTEN') { $state.gone = $true; break }",
        "    $state.status = 'waiting'",
        '    Start-Sleep -Seconds 15',
        '  }',
        '})',
        '$null = $ps.BeginInvoke()',
        //  Unlinked: the key goes first, then the folder — after this process has
        //  ended and let go of its helper (a real run left the helper and the
        //  settings behind when the folder went while the agent still held them).
        'function Remove-JoeLink {',
        '  $icon.Visible = $false',
        //  Remove only what THIS link owns. Re-linking the same computer (a new id and key) rewrites
        //  link.json, the Run value and shares this one folder; forgetting the OLD link must not delete
        //  the newer link's files out from under it (the owner's case, 2026-11-08).
        '  $mine = $true',
        "  try { $cur = Get-Content (Join-Path $dir 'link.json') -Raw -Encoding UTF8 | ConvertFrom-Json; if ($cur.id -and $cur.id -ne $cfg.id) { $mine = $false } } catch {}",
        '  if (-not $mine) { [Environment]::Exit(0) }',
        //  The sign-in entry: drop it only while it still points at THIS agent's folder.
        "  try { $run = (Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name 'JoeLink' -ErrorAction SilentlyContinue).JoeLink; if ($run -and $run.ToLower().Contains((Join-Path $dir 'agent.ps1').ToLower())) { Remove-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name 'JoeLink' -ErrorAction SilentlyContinue } } catch {}",
        "  try { Remove-Item -LiteralPath (Join-Path $dir 'link.json') -Force -ErrorAction SilentlyContinue } catch {}",
        '  $me = $PID',
        //  Escape any apostrophe in the profile path (a user like «O'Brien») by doubling it, or the
        //  single-quoted path below breaks the cleanup and the folder is never removed (2026-11-08).
        "  $clean = \"Wait-Process -Id $me -Timeout 30 -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1; Remove-Item -LiteralPath '\" + ($dir -replace \"['‘’‚‛]\", \"''\") + \"' -Recurse -Force -ErrorAction SilentlyContinue\"",
        "  Start-Process -WindowStyle Hidden -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-WindowStyle', 'Hidden', '-Command', $clean)",
        '  [Environment]::Exit(0)',
        '}',
        '$icon = New-Object System.Windows.Forms.NotifyIcon',
        '$icon.Icon = [System.Drawing.SystemIcons]::Shield',
        "$tip = 'Joe · ' + $cfg.name; if ($tip.Length -gt 63) { $tip = $tip.Substring(0, 63) }",
        '$icon.Text = $tip',
        '$menu = New-Object System.Windows.Forms.ContextMenuStrip',
        "$title = $menu.Items.Add('جو مربوط بهذا الكمبيوتر: ' + $cfg.name); $title.Enabled = $false",
        "$pause = $menu.Items.Add('إيقاف الربط حتى إعادة التشغيل')",
        '$pause.add_Click({ $state.stop = $true; $icon.Visible = $false; [Environment]::Exit(0) })',
        "$forget = $menu.Items.Add('فصل هذا الكمبيوتر عن جو نهائياً')",
        '$forget.add_Click({ Remove-JoeLink })',
        '$icon.ContextMenuStrip = $menu',
        '$icon.Visible = $true',
        "$icon.ShowBalloonTip(4000, 'Joe', ('جو مربوط بهذا الكمبيوتر باسم «' + $cfg.name + '». أيقونته هنا قرب الساعة.'), [System.Windows.Forms.ToolTipIcon]::Info)",
        '$timer = New-Object System.Windows.Forms.Timer',
        '$timer.Interval = 3000',
        '$timer.add_Tick({ if ($state.gone) { Remove-JoeLink } })',
        '$timer.Start()',
        '[System.Windows.Forms.Application]::Run()',
    ].join('\r\n');
}

/**
 * The installer the owner runs ONCE on the computer he links for good: it
 * writes the helper's source, the agent and the link's settings to
 * %LOCALAPPDATA%\Joe\link (his own profile; no administrator needed), adds
 * the agent to his Windows sign-in, and starts it now. The files travel as
 * base64, so no quoting can break them, and are written in UTF-8 with a BOM
 * so Windows PowerShell reads their Arabic.
 */
export function keepInstallScript(wsUrl: string, id: string, key: string, name: string): string {
    const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
    const settings = JSON.stringify({ url: wsUrl, id, key, name });
    return [
        "$ErrorActionPreference = 'Stop'",
        'try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}',
        "$dir = Join-Path $env:LOCALAPPDATA 'Joe\\link'",
        'New-Item -ItemType Directory -Force -Path $dir | Out-Null',
        //  Stop any Joe link agent already running from THIS folder before replacing its files: a
        //  running agent holds its helper DLL locked, and re-linking while it ran left the previous
        //  helper in place (the owner's case, 2026-11-08). Matched by the agent.ps1 path in its
        //  command line, so the installer's own process (a different command line) is left alone.
        "$agent = Join-Path $dir 'agent.ps1'",
        "try { Get-CimInstance Win32_Process -Filter \"Name = 'powershell.exe'\" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -and $_.CommandLine.ToLower().Contains($agent.ToLower()) } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {} } } catch {}",
        'Start-Sleep -Milliseconds 300',
        '$bom = New-Object System.Text.UTF8Encoding $true',
        `function Put($file, $b64) { [IO.File]::WriteAllText((Join-Path $dir $file), [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)), $bom) }`,
        `Put 'helper.cs' '${b64(helperSource())}'`,
        `Put 'agent.ps1' '${b64(keptAgentScript())}'`,
        `Put 'link.json' '${b64(settings)}'`,
        //  Clear stale compiled helpers (now named by the hash of helper.cs): the new agent compiles
        //  the current source on its first run. The old agent was stopped just above, so none is locked.
        "Remove-Item (Join-Path $dir 'JoeDesktop*.dll') -Force -ErrorAction SilentlyContinue",
        "$run = 'powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \"' + (Join-Path $dir 'agent.ps1') + '\"'",
        "New-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name 'JoeLink' -Value $run -PropertyType String -Force | Out-Null",
        "Start-Process -WindowStyle Hidden -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $dir 'agent.ps1'))",
        "Write-Host ''",
        `Write-Host ${psQuote(`  تم. هذا الكمبيوتر مربوط بجو دائماً باسم «${name}».`)} -ForegroundColor Green`,
        `Write-Host ${psQuote('  يتصل بجو وحده كلما شُغّل ويندوز. أيقونة جو قرب الساعة: منها توقفه أو تفصله نهائياً.')} -ForegroundColor Green`,
        `Write-Host ${psQuote(`  Done. This computer is linked to Joe for good, as «${name}». Joe's icon by the clock stops or unlinks it.`)}`,
        "Write-Host ''",
    ].join('\r\n');
}

/** The one line that installs the permanent link (served by routes/devices.ts install.ps1). */
export function keepCommand(scriptUrl: string): string { return linkCommand(scriptUrl); }

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
