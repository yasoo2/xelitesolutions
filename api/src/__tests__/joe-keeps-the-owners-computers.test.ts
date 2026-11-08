/**
 *  JOE KEEPS THE OWNER'S COMPUTERS: A PERMANENT LINK.
 *
 *  The owner, 2026-11-08: «I have a computer in another city. How would Joe
 *  know there is a computer there? How would I know its address, its name?
 *  That does not work.» Then: «OK, do it.» A computer is linked ONCE under the
 *  name he gives it, its agent calls Joe at every Windows start, and «اشبك على
 *  كمبيوتر المكتب» works by that name — and Joe says plainly when it is off.
 *
 *  These tests run the real socket (a server on a free port, a client that
 *  plays the remote agent), the real store on a temporary file, the installer's
 *  real text, and the engine's tools against the real gateway definitions.
 */
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import WebSocket from 'ws';

const STORE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'joe-kept-')), 'data', 'linked-computers.json');
process.env.JOE_LINKED_COMPUTERS_FILE = STORE;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const kept = require('../core/devices/linked-computers');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DeviceLinks, deviceLinks, keepInstallScript, keptAgentScript } = require('../core/devices/device-link');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { acceptDeviceLink } = require('../api/device-link-socket');

afterAll(() => { delete process.env.JOE_LINKED_COMPUTERS_FILE; });

describe('the store keeps a computer under the owner\'s name, and never its key', () => {
    test('kept, named uniquely per owner, verified by key, forgotten for good, and read back after a restart', () => {
        kept.reloadKeptComputers();
        const a = kept.keepComputer('owner-1', 'كمبيوتر المكتب');
        const b = kept.keepComputer('owner-1', 'كمبيوتر المكتب');
        const c = kept.keepComputer('owner-2', 'كمبيوتر المكتب');
        expect(a.name).toBe('كمبيوتر المكتب');
        expect(b.name).toBe('كمبيوتر المكتب 2');
        expect(c.name).toBe('كمبيوتر المكتب');
        expect(a.key).toMatch(/^[0-9a-f]{64}$/u);
        const onDisk = fs.readFileSync(STORE, 'utf8');
        expect(onDisk).not.toContain(a.key);
        expect(kept.verifyComputer(a.id, a.key)?.name).toBe('كمبيوتر المكتب');
        expect(kept.verifyComputer(a.id, b.key)).toBeNull();
        expect(kept.verifyComputer(a.id, '')).toBeNull();
        expect(kept.findKeptComputer('owner-1', 'المكتب')?.id).toBe(a.id);
        expect(kept.findKeptComputer('owner-2', a.id)).toBeNull();
        //  A restart: the process forgets, the file remembers.
        kept.reloadKeptComputers();
        expect(kept.keptComputers('owner-1').map((k: any) => k.name)).toEqual(['كمبيوتر المكتب', 'كمبيوتر المكتب 2']);
        expect(kept.forgetComputer('owner-1', 'كمبيوتر المكتب 2')?.id).toBe(b.id);
        expect(kept.verifyComputer(b.id, b.key)).toBeNull();
        expect(kept.verifyComputerId(b.id)).toBe(false);
        kept.forgetComputer('owner-1', a.id);
        kept.forgetComputer('owner-2', c.id);
    });

    //  Defect 1: an id merely NOT FOUND must keep its link; only an id the owner FORGOT is told to
    //  remove itself. forgetComputer records the forgotten id; a read failure keeps the last store.
    test('isForgotten is true only for an id that was forgotten, and false for one never kept', () => {
        kept.reloadKeptComputers();
        const a = kept.keepComputer('owner-f', 'كمبيوتر المكتب');
        expect(kept.isForgotten(a.id)).toBe(false);          // linked, not forgotten
        expect(kept.isForgotten('deadbeefdeadbeef')).toBe(false); // never linked at all
        expect(kept.isForgotten('')).toBe(false);
        kept.forgetComputer('owner-f', a.id);
        expect(kept.isForgotten(a.id)).toBe(true);           // now forgotten for good
        //  Survives a restart: the forgotten list is on disk.
        kept.reloadKeptComputers();
        expect(kept.isForgotten(a.id)).toBe(true);
        expect(kept.verifyComputerId(a.id)).toBe(false);
    });

    test('load keeps the last good store when the file cannot be read, instead of treating it as empty', () => {
        kept.reloadKeptComputers();
        const a = kept.keepComputer('owner-read', 'كمبيوتر المكتب');
        expect(kept.verifyComputerId(a.id)).toBe(true);
        //  The store is there but a read of it fails this moment (its bytes are unreadable): the
        //  kept computer must NOT vanish, or the socket would forget a still-linked computer.
        kept.reloadKeptComputers();
        const bad = fs.readFileSync.bind(fs);
        const spy = jest.spyOn(fs, 'readFileSync').mockImplementation(((p: any, enc: any) => {
            if (String(p) === STORE) throw new Error('EIO: transient read failure');
            return bad(p, enc);
        }) as any);
        try {
            expect(kept.verifyComputerId(a.id)).toBe(false);   // not found right now…
            expect(kept.isForgotten(a.id)).toBe(false);        // …but NOT treated as forgotten
        } finally { spy.mockRestore(); }
        //  Once the read works again, the computer is back (the failure cached no false «empty»).
        expect(kept.verifyComputerId(a.id)).toBe(true);
        kept.forgetComputer('owner-read', a.id);
    });
});

describe('forget resolves the target once, over online AND kept, and refuses an ambiguous name', () => {
    //  Defect 3: forget used to search the online computers first and the kept ones separately, each
    //  by a loose substring — so a loose name could DISCONNECT one computer while FORGETTING another.
    const fakeSocket = () => {
        const s: any = { sent: [] as string[], closed: false };
        s.send = (d: string) => s.sent.push(d);
        s.close = () => { s.closed = true; };
        s.on = () => s;
        return s;
    };

    test('an exact kept name forgets only that computer; a superset computer online now is left alone', () => {
        kept.reloadKeptComputers();
        const links = new DeviceLinks();
        const kp = links.claimForKeeping(links.newPairingCode('owner-r3', Date.now(), 'laptop').code); // kept «laptop», off
        const sock = fakeSocket();
        links.attach(sock, 'owner-r3', { name: 'laptop-2', os: 'Windows' });   // a different computer online now
        const gone = links.forget('owner-r3', 'laptop');                       // the EXACT kept name
        expect(gone?.name).toBe('laptop');
        expect(sock.closed).toBe(false);                                       // «laptop-2» was NOT disconnected
        expect(kept.isForgotten(kp.id)).toBe(true);
        kept.reloadKeptComputers();
    });

    test('an ambiguous name forgets nothing and names the matches so the owner can choose', () => {
        kept.reloadKeptComputers();
        const links = new DeviceLinks();
        links.claimForKeeping(links.newPairingCode('owner-r3b', Date.now(), 'كمبيوتر المكتب').code);
        links.claimForKeeping(links.newPairingCode('owner-r3b', Date.now(), 'كمبيوتر البيت').code);
        expect(links.forget('owner-r3b', 'كمبيوتر')).toBeNull();              // ambiguous → nothing forgotten
        expect(kept.keptComputers('owner-r3b')).toHaveLength(2);             // both still kept
        expect((links.forgetMatches('owner-r3b', 'كمبيوتر').ambiguous || []).slice().sort())
            .toEqual(['كمبيوتر البيت', 'كمبيوتر المكتب'].slice().sort());
        //  A unique fuzzy still resolves: «المكتب» points at one computer.
        expect(links.forgetMatches('owner-r3b', 'المكتب').one?.name).toBe('كمبيوتر المكتب');
        kept.reloadKeptComputers();
    });
});

describe('a permanent-link code installs, once; a session code never does', () => {
    test('claimForKeeping keeps the computer under the chosen name; claim refuses that code', () => {
        const links = new DeviceLinks();
        const { code } = links.newPairingCode('owner-k', Date.now(), 'Office PC');
        expect(links.isWaitingToKeep(code)).toBe(true);
        expect(links.claim(code)).toBeNull();
        const k = links.claimForKeeping(code);
        expect(k).toEqual(expect.objectContaining({ ownerId: 'owner-k', name: 'Office PC' }));
        expect(links.claimForKeeping(code)).toBeNull();
        const session = links.newPairingCode('owner-k').code;
        expect(links.isWaitingToKeep(session)).toBe(false);
        expect(links.claimForKeeping(session)).toBeNull();
        //  Off until it calls: listed, not online.
        expect(links.list('owner-k')).toEqual([expect.objectContaining({ name: 'Office PC', kept: true, online: false })]);
        kept.forgetComputer('owner-k', k.id);
    });
});

describe('the installer and the agent', () => {
    test('the installer carries the helper, the agent and the settings as base64, adds the sign-in entry, and starts the agent hidden', () => {
        const script: string = keepInstallScript('ws://joe.example:5000/ws/device-link', 'abc123', 'k'.repeat(64), 'كمبيوتر المكتب');
        const parts = [...script.matchAll(/^Put '([\w.]+)' '([A-Za-z0-9+/=]+)'$/gmu)].map(m => [m[1], Buffer.from(m[2], 'base64').toString('utf8')]);
        expect(parts.map(p => p[0])).toEqual(['helper.cs', 'agent.ps1', 'link.json']);
        expect(JSON.parse(parts[2][1])).toEqual({ url: 'ws://joe.example:5000/ws/device-link', id: 'abc123', key: 'k'.repeat(64), name: 'كمبيوتر المكتب' });
        expect(parts[1][1]).toBe(keptAgentScript());
        expect(script).toContain("'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name 'JoeLink'");
        expect(script).toContain("-WindowStyle', 'Hidden'");
        expect(script).toContain('مربوط بجو دائماً باسم «كمبيوتر المكتب»');
        //  The key never rides in an address.
        expect(script).not.toMatch(/key=/u);
    });

    test('the agent: one per computer, its key in the first message, calls again after a break, and removes itself when Joe forgets it', () => {
        const agent: string = keptAgentScript();
        expect(agent).toContain("New-Object System.Threading.Mutex($false, ('Local\\JoeLink-' + $cfg.id))");
        expect(agent).toContain("$hello = @{ key = $cfg.key;");
        expect(agent).toContain("[JoeDesktop]::Link(($cfg.url + '?device=' + $cfg.id), $hello)");
        expect(agent).toContain('Start-Sleep -Seconds 15');
        //  A word in no language: a refusal reached the agent as «تعذر الاتصال بالملقم البعيد» on an Arabic Windows (2026-11-08).
        expect(agent).toContain("if ($why -eq 'FORGOTTEN') { $state.gone = $true; break }");
        const { helperSource } = require('../core/devices/windows-desktop');
        expect(helperSource()).toContain('if (line == "forget") return "FORGOTTEN";');
        //  The key goes first, then the folder after the agent has let go of its helper.
        expect(agent).toContain("Remove-Item -LiteralPath (Join-Path $dir 'link.json') -Force");
        expect(agent).toContain('Wait-Process -Id $me -Timeout 30');
        expect(agent).toContain('function Remove-JoeLink');
        expect(agent).toContain("Remove-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -Name 'JoeLink'");
        expect(agent).toContain('فصل هذا الكمبيوتر عن جو نهائياً');
        expect(agent).toContain('إيقاف الربط حتى إعادة التشغيل');
    });

    test('a new build recompiles the helper, the installer stops the old agent, and forget removes only this link', () => {
        const agent: string = keptAgentScript();
        const install: string = keepInstallScript('ws://joe.example:5000/ws/device-link', 'abc123', 'k'.repeat(64), 'كمبيوتر المكتب');
        //  Defect 4a: the compiled helper is named by the hash of helper.cs, so a changed helper is
        //  recompiled instead of loading the old DLL a still-running agent holds locked.
        expect(agent).toContain('$hash = [BitConverter]::ToString($h.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($src)))');
        expect(agent).toContain("$dll = Join-Path $dir ('JoeDesktop-' + $hash + '.dll')");
        expect(agent).not.toContain("Join-Path $dir 'JoeDesktop.dll'");
        //  Defect 4b: the installer stops any agent running from THIS folder before replacing files.
        expect(install).toContain("Get-CimInstance Win32_Process -Filter \"Name = 'powershell.exe'\"");
        expect(install).toContain('Stop-Process -Id $_.ProcessId -Force');
        expect(install).toContain("Remove-Item (Join-Path $dir 'JoeDesktop*.dll')");
        //  Defect 4c: the helper reads close code 4404 as «forgotten», even with no «forget» word.
        const { helperSource } = require('../core/devices/windows-desktop');
        expect(helperSource()).toContain('if (closeCode == 4404) return "FORGOTTEN";');
        //  Defect 5: Remove-JoeLink deletes only while link.json still names THIS link's id, and
        //  removes the Run value only while it points at THIS agent — never a newer link's files.
        expect(agent).toContain('if ($cur.id -and $cur.id -ne $cfg.id) { $mine = $false }');
        expect(agent).toContain('if (-not $mine) { [Environment]::Exit(0) }');
        expect(agent).toContain("$run.ToLower().Contains((Join-Path $dir 'agent.ps1').ToLower())");
        //  Defect 6: an apostrophe in the profile path (e.g. «O'Brien») is doubled so the single-
        //  quoted cleanup path survives it.
        expect(agent).toContain("-replace \"['‘’‚‛]\", \"''\"");
    });
});

describe('a kept computer calls in over the real socket, by its id and key', () => {
    let server: http.Server;
    let port = 0;
    beforeAll(async () => {
        server = http.createServer();
        server.on('upgrade', (req, socket, head) => acceptDeviceLink(req, socket, head, (status: number, message: string) => {
            socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\n\r\n`); socket.destroy();
        }));
        await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
        port = (server.address() as any).port;
    });
    afterAll(() => new Promise<void>(r => server.close(() => r())));

    /** Plays the remote agent: connects with ?device=, says HELLO with its key, answers each line with OK. */
    const agent = (id: string, key: string) => new Promise<{ ws?: WebSocket; status: number | 'open'; closed: Promise<number>; heard: string[] }>(resolve => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/device-link?device=${id}`);
        let closedResolve: (n: number) => void = () => { };
        const closed = new Promise<number>(r => { closedResolve = r; });
        const heard: string[] = [];
        ws.on('close', code => closedResolve(code));
        ws.on('message', data => {
            const text = String(data);
            heard.push(text);
            const tab = text.indexOf('\t');
            if (tab > 0 && text.slice(0, tab) !== '0') ws.send(`${text.slice(0, tab)}\tOK\t${Buffer.from('fine').toString('base64')}`);
        });
        ws.on('open', () => {
            const hello = Buffer.from(JSON.stringify({ key, os: 'Windows 11 Pro', user: 'younes', screen: '1920x1080' }), 'utf8').toString('base64');
            ws.send(`HELLO\t${hello}`);
            resolve({ ws, status: 'open', closed, heard });
        });
        ws.on('unexpected-response', (_req, res) => resolve({ status: res.statusCode || 0, closed, heard }));
        ws.on('error', () => resolve({ status: 0, closed, heard }));
    });
    const settle = () => new Promise(r => setTimeout(r, 150));

    test('online under its kept name; a second call replaces the first; the wrong key is shut; a forgotten one gets 401', async () => {
        const owner = 'owner-socket';
        const { code } = deviceLinks.newPairingCode(owner, Date.now(), 'كمبيوتر المكتب');
        const k = deviceLinks.claimForKeeping(code);
        expect(deviceLinks.list(owner)).toEqual([expect.objectContaining({ name: 'كمبيوتر المكتب', online: false })]);

        const first = await agent(k.id, k.key);
        expect(first.status).toBe('open');
        await settle();
        expect(deviceLinks.list(owner)).toEqual([expect.objectContaining({ id: k.id, name: 'كمبيوتر المكتب', kept: true, online: true, os: 'Windows 11 Pro' })]);
        //  A line sent by name reaches it.
        const r = await deviceLinks.send(owner, 'المكتب', { op: 'windows' }, 5_000);
        expect(r.ok).toBe(true);

        //  It calls again (a reboot, a lost line): one line stays, the new one.
        const second = await agent(k.id, k.key);
        expect(second.status).toBe('open');
        await settle();
        expect(deviceLinks.list(owner).filter((d: any) => d.online)).toHaveLength(1);
        expect(await deviceLinks.send(owner, 'كمبيوتر المكتب', { op: 'windows' }, 5_000)).toEqual(expect.objectContaining({ ok: true }));

        //  Someone with the id and not the key: the line is shut, nothing attached.
        const thief = await agent(k.id, 'f'.repeat(64));
        expect(await thief.closed).toBe(4401);
        expect(deviceLinks.list(owner).filter((d: any) => d.online)).toHaveLength(1);

        //  Forgotten for good: the live line is told «forget» and ends; the next call is told
        //  «forget» too, in words any Windows reads, and closed (4404).
        const gone = deviceLinks.forget(owner, 'كمبيوتر المكتب');
        expect(gone?.name).toBe('كمبيوتر المكتب');
        await second.closed;
        expect(second.heard).toContain('0\tforget');
        expect(deviceLinks.list(owner)).toEqual([]);
        const after = await agent(k.id, k.key);
        expect(await after.closed).toBe(4404);
        expect(after.heard).toEqual(['0\tforget']);
        expect(deviceLinks.list(owner)).toEqual([]);
    });

    test('an id that is neither kept nor forgotten is closed 4403 with no «forget», so it keeps calling', async () => {
        //  Defect 1 (socket side): an id merely not found — never linked, or the store unreadable this
        //  moment — must NOT be told to forget itself, or a transient failure erases a good link.
        const unknown = await agent('a'.repeat(16), 'x'.repeat(64));
        expect(await unknown.closed).toBe(4403);
        expect(unknown.heard).toEqual([]);     // never told «forget»
    });

    test('a frame larger than the tiny reply cap does not crash Joe', async () => {
        //  Defect 2: the reply path once upgraded with a 64 MB cap and no 'error' listener, so one
        //  oversized/malformed frame crashed Joe. Now it caps at 1 KB and terminates on error.
        const owner = 'owner-badframe';
        const g = deviceLinks.claimForKeeping(deviceLinks.newPairingCode(owner, Date.now(), 'جهاز').code);
        deviceLinks.forget(owner, g.id);       // g.id is forgotten → the reply path
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/device-link?device=${g.id}`);
        const closed = new Promise<number>(r => ws.on('close', c => r(c)));
        ws.on('error', () => { /* the client may see the socket dropped; that is fine */ });
        await new Promise<void>(r => ws.on('open', () => r()));
        try { ws.send(Buffer.alloc(4096, 0x41)); } catch { /* the line may already be closing */ }
        await closed;
        //  The server is still up: a fresh id is still answered (a crash would hang this).
        const again = await agent('c'.repeat(16), 'x'.repeat(64));
        expect(await again.closed).toBe(4403);
    });
});

describe('the chat: list on and off by name, link by name, refuse an off computer plainly, forget for good', () => {
    test('computersText says which are online and which are off, and when they were seen', () => {
        const { computersText } = require('../modules/tools/definitions/EngineDeviceTools');
        const owner = 'owner-text';
        const { code } = deviceLinks.newPairingCode(owner, Date.now(), 'كمبيوتر البيت');
        const k = deviceLinks.claimForKeeping(code);
        const text: string = computersText(owner);
        expect(text).toContain('- «كمبيوتر البيت» (linked for good)');
        expect(text).toContain('OFF or without internet (never seen yet)');
        deviceLinks.forget(owner, k.id);
        expect(computersText(owner)).toContain('device_link_new with the name the owner gives it');
    });

    test('pair with a name makes an installer line; without one, a session line', async () => {
        const { EngineDeviceTool } = require('../modules/tools/definitions/EngineDeviceTools');
        const tool = new EngineDeviceTool();
        const permanent = await tool.execute({ op: 'pair', name: 'كمبيوتر المكتب' }, { userId: 'owner-pair' });
        expect(permanent.ok).toBe(true);
        expect(permanent.output.command).toMatch(/\/api\/devices\/install\.ps1\?code=[0-9a-f]{24}/u);
        expect(permanent.output.keep).toBe(true);
        const session = await tool.execute({ op: 'pair' }, { userId: 'owner-pair' });
        expect(session.output.command).toMatch(/\/api\/devices\/link\.ps1\?code=[0-9a-f]{24}/u);
        const forgotten = await tool.execute({ op: 'forget', computer: 'nothing-like-it' }, { userId: 'owner-pair' });
        expect(forgotten.ok).toBe(false);
    });

    test('the engine tools: device_link_new takes the name, device_forget exists, the words say «once» and the name', () => {
        const { deviceLinkNewTool, deviceTools } = require('../core/engine/tools/devices');
        expect(deviceLinkNewTool.parse({ name: '  كمبيوتر   المكتب ' })).toEqual({ ok: true, value: { name: 'كمبيوتر المكتب' } });
        expect(deviceLinkNewTool.parse({})).toEqual({ ok: true, value: {} });
        expect(deviceTools.map((t: any) => t.name)).toContain('device_forget');
        const src = fs.readFileSync(path.join(__dirname, '..', 'core', 'engine', 'tools', 'devices.ts'), 'utf8');
        expect(src).toContain('مرة واحدة فقط في العمر');
        expect(src).toContain('is linked for good but is OFF or without internet now');
    });

    test('«افصل كمبيوتر المكتب نهائياً» and «اشبك على كمبيوتر المكتب» are about the devices', () => {
        const op = require('../core/engine/operate');
        expect(op.isDeviceRequest('افصل كمبيوتر المكتب نهائياً')).toBe(true);
        expect(op.isDeviceRequest('اشبك على كمبيوتر المكتب')).toBe(true);
        expect(op.isDeviceRequest('unlink my office computer')).toBe(true);
        expect(op.operatorSystemPrompt({ platform: 'win32', shell: 'powershell' } as any)).toContain('device_link_new WITH the name he calls it');
    });
});
