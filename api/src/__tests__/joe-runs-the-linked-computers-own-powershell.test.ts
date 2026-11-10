/**
 *  THE LINKED COMPUTER'S OWN POWERSHELL, RUN FOR REAL.
 *
 *  Three things the verifiers of 2026-11-08 found only by running them:
 *   - the kept agent's cleanup turned a typographic quote in the profile path
 *     (O’Brien) into two ASCII apostrophes, so the path changed and
 *     Remove-Item missed the folder of an unlinked computer;
 *   - the installer started the agent with Start-Process -ArgumentList @(…,
 *     '-File', path): Windows PowerShell 5.1 quotes no array element, so a
 *     profile path with a space did not start the agent until the next sign-in;
 *   - «scan the Wi-Fi of the office computer» could only scan Joe's own
 *     network: the link agent had no action that runs a script there and
 *     brings its output back.
 *
 *  So the lines Joe generates are run here in Windows PowerShell on folders
 *  made for the test in %TEMP% (and removed), and a real link agent — the
 *  helper compiled from its source, joined to Joe's real socket with a
 *  pairing code — answers a network scan sent through the real engine tool.
 *  Nothing here touches the screen, the registry or any real link: every
 *  window is hidden, every path is a temporary one. Windows only.
 */
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { spawn, spawnSync, type ChildProcess } from 'child_process';

const WIN = process.platform === 'win32';
const onWindows = WIN ? test : test.skip;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { keepInstallScript, keptAgentScript, linkScript, deviceLinks } = require('../core/devices/device-link');

const encoded = (script: string) => Buffer.from(script, 'utf16le').toString('base64');

/**
 * One Windows PowerShell, hidden, the script as -EncodedCommand (no quoting can bend it).
 * Progress is silenced: «Preparing modules for first use» comes back on stderr as a CLIXML
 * progress record, which is no error.
 */
function powershell(script: string, env: Record<string, string> = {}): { status: number | null; stdout: string; stderr: string } {
    const r = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded(`$ProgressPreference = 'SilentlyContinue'\n${script}`)], {
        env: { ...process.env, ...env }, windowsHide: true, encoding: 'utf8', timeout: 90_000,
    });
    return { status: r.status, stdout: String(r.stdout || ''), stderr: String(r.stderr || '') };
}

/** No error record on stderr (an error there is a CLIXML <S S="Error"> line, or plain text without CLIXML). */
function noError(stderr: string): void {
    expect(stderr).not.toMatch(/S="Error"/u);
    expect(stderr.replace(/#< CLIXML[\s\S]*$/u, '').trim()).toBe('');
}

async function until(what: () => boolean, ms: number): Promise<boolean> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        if (what()) return true;
        await new Promise(r => setTimeout(r, 250));
    }
    return what();
}

/** The lines of a generated script from the one that starts with `first` through the one that starts with `last`. */
function span(script: string, first: string, last: string): string[] {
    const lines = script.split(/\r?\n/u).map(l => l.trim());
    const a = lines.findIndex(l => l.startsWith(first));
    const b = lines.findIndex((l, i) => i >= a && l.startsWith(last));
    if (a < 0 || b < 0) throw new Error(`the generated script has no «${first}» … «${last}» block any more`);
    return lines.slice(a, b + 1);
}

/** A folder for one test in %TEMP%, its name as hard as a real profile path gets: two kinds of quote, two spaces. */
function hardFolder(tag: string): string {
    const dir = path.join(os.tmpdir(), `joe-link-test O’Brien's  ${tag}-${process.pid}-${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'link.json'), '{}');
    return dir;
}

describe('the kept agent removes its own folder, whatever quotes the profile path holds', () => {
    onWindows('the cleanup Joe generates removes a folder named with ’ and \' and two spaces in a row', async () => {
        const lines = span(keptAgentScript(), '$me = $PID', "Start-Process -WindowStyle Hidden -FilePath 'powershell.exe' -ArgumentList ('-NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand ' + $cleanEncoded)");
        expect(lines).toHaveLength(4);
        const dir = hardFolder('cleanup');
        try {
            //  Exactly the agent's lines; $dir is the folder, as Split-Path gives it in the agent.
            const r = powershell(["$ErrorActionPreference = 'Stop'", '$dir = $env:JOE_TEST_DIR', ...lines, "'STARTED'"].join('\n'), { JOE_TEST_DIR: dir });
            noError(r.stderr);
            expect(r.status).toBe(0);
            expect(r.stdout).toContain('STARTED');
            //  The cleanup waits for the agent (here: that PowerShell) to end, then removes the folder.
            expect(await until(() => !fs.existsSync(dir), 45_000)).toBe(true);
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }, 120_000);

    onWindows('the line it replaces left that folder behind (the control: the test can tell the two apart)', () => {
        const dir = hardFolder('old-cleanup');
        try {
            //  The 46890fbe3 line, made to wait (-Wait) and to wait for no one (a PowerShell that has ended).
            const old = [
                "$ErrorActionPreference = 'Stop'", '$dir = $env:JOE_TEST_DIR',
                "$p = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c exit' -WindowStyle Hidden -PassThru; $p.WaitForExit(); $me = $p.Id",
                "$clean = \"Wait-Process -Id $me -Timeout 30 -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1; Remove-Item -LiteralPath '\" + ($dir -replace \"['‘’‚‛]\", \"''\") + \"' -Recurse -Force -ErrorAction SilentlyContinue\"",
                "Start-Process -Wait -WindowStyle Hidden -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-WindowStyle', 'Hidden', '-Command', $clean)",
                "'DONE'",
            ].join('\n');
            const r = powershell(old, { JOE_TEST_DIR: dir });
            expect(r.stdout).toContain('DONE');
            expect(fs.existsSync(dir)).toBe(true);
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }, 120_000);
});

describe('the installer starts the agent at once, from a profile path with a space', () => {
    /** A stand-in agent.ps1 that only says it started, and from where. */
    const standIn = "Set-Content -LiteralPath (Join-Path $PSScriptRoot 'started.txt') -Value $PSCommandPath -Encoding UTF8\r\n";
    const started = (dir: string) => path.join(dir, 'started.txt');
    const said = (dir: string) => fs.readFileSync(started(dir), 'utf8').replace(/^﻿/u, '').trim();

    onWindows('the start line Joe generates runs agent.ps1 at its real path', async () => {
        const install = keepInstallScript('ws://joe.example:5000/ws/device-link', 'abc123', 'k'.repeat(64), 'كمبيوتر المكتب');
        const lines = span(install, "$agent = Join-Path $dir 'agent.ps1'", "Start-Process -WindowStyle Hidden -FilePath 'powershell.exe' -ArgumentList $agentArgs")
            //  Only the three lines that start it: the ones between stop an old agent, write the files and the sign-in entry.
            .filter(l => /^\$agent = |^\$agentArgs = |^Start-Process .*\$agentArgs$/u.test(l));
        expect(lines).toHaveLength(3);
        const dir = hardFolder('start');
        fs.writeFileSync(path.join(dir, 'agent.ps1'), standIn);
        try {
            const r = powershell(["$ErrorActionPreference = 'Stop'", '$dir = $env:JOE_TEST_DIR', ...lines, "'STARTED'"].join('\n'), { JOE_TEST_DIR: dir });
            noError(r.stderr);
            expect(r.status).toBe(0);
            expect(r.stdout).toContain('STARTED');
            expect(await until(() => fs.existsSync(started(dir)), 45_000)).toBe(true);
            expect(said(dir)).toBe(path.join(dir, 'agent.ps1'));
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }, 120_000);

    onWindows('the array form it replaces did not start it (the control)', () => {
        const dir = hardFolder('old-start');
        fs.writeFileSync(path.join(dir, 'agent.ps1'), standIn);
        try {
            const old = [
                "$ErrorActionPreference = 'Stop'", '$dir = $env:JOE_TEST_DIR',
                "Start-Process -Wait -WindowStyle Hidden -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $dir 'agent.ps1'))",
                "'DONE'",
            ].join('\n');
            expect(powershell(old, { JOE_TEST_DIR: dir }).stdout).toContain('DONE');
            expect(fs.existsSync(started(dir))).toBe(false);
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }, 120_000);
});

describe('network_devices on a linked computer scans THAT computer, through its own agent', () => {
    /** What a scan prints, in the scan's own line format, with an Arabic network name and an «exit» at the end. */
    const FAKE_SCAN = [
        'try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}',
        "'PID' + [char]9 + [System.Diagnostics.Process]::GetCurrentProcess().Id",
        "'NET' + [char]9 + '10.20.30.40' + [char]9 + '10.20.30.1' + [char]9 + 'Ethernet' + [char]9 + 'شبكة المكتب' + [char]9 + '24' + [char]9 + '10.20.30.1-10.20.30.254'",
        "'DEV' + [char]9 + '10.20.30.40' + [char]9 + '50-76-AF-48-1B-29' + [char]9 + 'OFFICE-PC' + [char]9 + 'True'",
        "'DEV' + [char]9 + '10.20.30.1' + [char]9 + '24-58-6E-A9-64-C8' + [char]9 + 'router.office' + [char]9 + 'True'",
        "'DEV' + [char]9 + '10.20.30.77' + [char]9 + '00-26-AB-11-22-33' + [char]9 + 'EPSON-OFFICE' + [char]9 + 'True'",
        'exit',
        "'NEVER PRINTED'",
    ].join('\r\n');

    /** A fake link agent: answers each numbered line the way a helper answers it. */
    function fakeAgent(answer: (line: string) => string) {
        let onMessage: (data: unknown) => void = () => undefined;
        const s: any = { sent: [] as string[], closed: false };
        s.on = (event: string, fn: any) => { if (event === 'message') onMessage = fn; return s; };
        s.close = () => { s.closed = true; };
        s.send = (data: string) => {
            s.sent.push(data);
            const tab = data.indexOf('\t');
            const id = data.slice(0, tab);
            if (id === '0') return;
            setTimeout(() => onMessage(`${id}\t${answer(data.slice(tab + 1))}`), 5);
        };
        return s;
    }
    const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

    onWindows('a real link agent runs the scan in its own process and the answer is its network, by name', async () => {
        const { acceptDeviceLink } = require('../api/device-link-socket');
        const networkScan = require('../core/devices/network-scan');
        const { ExecutionGateway } = require('../kernel/ExecutionGateway');
        const { EngineDeviceTool } = require('../modules/tools/definitions/EngineDeviceTools');
        const server = http.createServer();
        server.on('upgrade', (req, socket, head) => acceptDeviceLink(req, socket, head, (status: number, message: string) => {
            socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\n\r\n`); socket.destroy();
        }));
        await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
        const port = (server.address() as any).port;
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-link-agent-'));
        const owner = 'owner-linked-scan';
        const { code } = deviceLinks.newPairingCode(owner);
        //  The very script the other computer runs (irm | iex), saved with a BOM so its Arabic reads.
        const file = path.join(dir, 'link.ps1');
        fs.writeFileSync(file, '﻿' + linkScript(`ws://127.0.0.1:${port}/ws/device-link?code=${code}`), 'utf8');
        let out = '';
        //  TEMP is this test's folder, so the helper is compiled there, never into the real %TEMP%.
        const agent: ChildProcess = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file], {
            env: { ...process.env, TEMP: dir, TMP: dir }, windowsHide: true,
        });
        agent.stdout?.on('data', d => { out += String(d); });
        agent.stderr?.on('data', d => { out += String(d); });
        const ended = new Promise<void>(r => agent.on('exit', () => r()));
        const gateway = jest.spyOn(ExecutionGateway, 'execute');
        const scanScript = jest.spyOn(networkScan, 'networkScanScript').mockReturnValue(FAKE_SCAN);
        try {
            const joined = await until(() => deviceLinks.list(owner).some((d: any) => d.online), 150_000);
            if (!joined) throw new Error(`the link agent never joined:\n${out}`);
            const name: string = deviceLinks.list(owner)[0].name;

            //  The raw answer: printed by the agent's own process, and «exit» ended the scan, not the agent.
            const raw = await deviceLinks.scanNetwork(owner, name, FAKE_SCAN, 60_000);
            expect(raw).toEqual(expect.objectContaining({ ok: true, name }));
            expect(raw.out).toContain(`PID\t${agent.pid}`);
            expect(raw.out).toContain('شبكة المكتب');
            expect(raw.out).not.toContain('NEVER PRINTED');

            //  Through the engine tool, as network_devices calls it after device_use.
            const tool = new EngineDeviceTool();
            const r = await tool.execute({ op: 'network', computer: name }, { userId: owner });
            expect(r.ok).toBe(true);
            const lines: string[] = r.output.text.split('\n');
            expect(lines[0]).toBe(`Scanned ON «${name}», the owner's linked computer: this is ITS network, not the network of Joe's own computer «${os.hostname()}».`);
            expect(r.output.text).toContain(`«${name}» is on «شبكة المكتب» at 10.20.30.40; the router is 10.20.30.1.`);
            expect(r.output.text).toContain(`«${name}» itself (the linked computer that scanned)`);
            expect(r.output.text).toMatch(/10\.20\.30\.77 — «EPSON-OFFICE», Epson — a printer/u);
            expect(r.output).toEqual(expect.objectContaining({ scannedFrom: name, scannedOn: 'linked', network: 'شبكة المكتب', gateway: '10.20.30.1' }));
            expect(scanScript).toHaveBeenCalled();
            //  Joe's own computer scanned nothing.
            expect(gateway).not.toHaveBeenCalled();
        } finally {
            scanScript.mockRestore(); gateway.mockRestore();
            deviceLinks.disconnect(owner, deviceLinks.list(owner)[0]?.name || 'none');
            let timer: NodeJS.Timeout | undefined;
            const done = await Promise.race([ended.then(() => true), new Promise<boolean>(r => { timer = setTimeout(() => r(false), 20_000); })]);
            clearTimeout(timer);
            if (!done) agent.kill();
            await new Promise<void>(r => server.close(() => r()));
            await until(() => { try { fs.rmSync(dir, { recursive: true, force: true }); return true; } catch { return false; } }, 10_000);
        }
        expect(out).toContain('the owner disconnected this computer');
        expect(out).toMatch(/network/u);              // the window there shows what Joe did
    }, 240_000);

    test('a computer linked before this change answers «unknown action network»: relink it once, and nothing else is scanned', async () => {
        const { ExecutionGateway } = require('../kernel/ExecutionGateway');
        const { EngineDeviceTool } = require('../modules/tools/definitions/EngineDeviceTools');
        const owner = 'owner-old-agent';
        //  What the old helper's Dispatch answers a line it does not know (the real C# says exactly this).
        const sock = fakeAgent(line => line.startsWith('network\t') ? `ERR\t${b64('unknown action network')}` : `OK\t${b64('pong')}`);
        const d = deviceLinks.attach(sock, owner, { name: 'كمبيوتر المكتب', os: 'Windows 10' });
        const gateway = jest.spyOn(ExecutionGateway, 'execute');
        try {
            const r = await new EngineDeviceTool().execute({ op: 'network', computer: 'كمبيوتر المكتب' }, { userId: owner });
            expect(r.ok).toBe(false);
            expect(r.output.text).toContain('The owner must relink «كمبيوتر المكتب» once');
            expect(r.output.text).toContain('Nothing else was scanned in its place');
            expect(r.output.relink).toBe(true);
            expect(r.error).toBe('«كمبيوتر المكتب» must be relinked once to scan its network');
            //  The line it got was the scan script, base64 of UTF-8.
            const sent = sock.sent.find((s: string) => s.includes('\tnetwork\t'));
            expect(Buffer.from(sent.split('\t')[2], 'base64').toString('utf8')).toContain('Get-NetNeighbor');
            expect(gateway).not.toHaveBeenCalled();
        } finally { gateway.mockRestore(); deviceLinks.detach(d.id); }
    });

    test('a kept computer that is off is said to be off; nothing else is scanned', async () => {
        const { ExecutionGateway } = require('../kernel/ExecutionGateway');
        const { EngineDeviceTool } = require('../modules/tools/definitions/EngineDeviceTools');
        const owner = 'owner-off-scan';
        const k = deviceLinks.claimForKeeping(deviceLinks.newPairingCode(owner, Date.now(), 'كمبيوتر المكتب').code);
        const gateway = jest.spyOn(ExecutionGateway, 'execute');
        try {
            const r = await new EngineDeviceTool().execute({ op: 'network', computer: 'كمبيوتر المكتب' }, { userId: owner });
            expect(r.ok).toBe(false);
            expect(r.output.text).toContain('«كمبيوتر المكتب» is linked for good but is OFF or without internet now');
            expect(r.output.text).toContain('Nothing else was scanned in its place');
            expect(gateway).not.toHaveBeenCalled();
        } finally { gateway.mockRestore(); deviceLinks.forget(owner, k.id); }
    });

    test('Joe on a computer that is not Windows still scans a linked Windows computer', async () => {
        const real = Object.getOwnPropertyDescriptor(process, 'platform')!;
        Object.defineProperty(process, 'platform', { value: 'linux' });
        try {
            let run!: Promise<void>;
            jest.isolateModules(() => {
                const links = require('../core/devices/device-link').deviceLinks;
                const { EngineDeviceTool } = require('../modules/tools/definitions/EngineDeviceTools');
                const out = 'NET\t10.0.0.9\t10.0.0.1\tWi-Fi\tOffice\t24\t10.0.0.1-10.0.0.254\nDEV\t10.0.0.9\t50-76-AF-48-1B-29\tPC\tTrue\nDEV\t10.0.0.1\t24-58-6E-A9-64-C8\trouter\tTrue';
                links.attach(fakeAgent(line => line.startsWith('network\t') ? `OK\t${b64(out)}` : `OK\t${b64('pong')}`), 'owner-linux', { name: 'office' });
                run = (async () => {
                    const r = await new EngineDeviceTool().execute({ op: 'network', computer: 'office' }, { userId: 'owner-linux' });
                    expect(r.ok).toBe(true);
                    expect(r.output.text.split('\n')[0]).toContain('Scanned ON «office»');
                    expect(r.output.text).toContain('«office» is on «Office» at 10.0.0.9');
                    //  And Joe's own network, on that system, is still said plainly not to work.
                    const here = await new EngineDeviceTool().execute({ op: 'network' }, { userId: 'owner-linux' });
                    expect(here.output.text).toBe('This computer runs linux; Joe\'s network scan works on Windows in this version. Say so to the owner.');
                })();
            });
            await run;
        } finally { Object.defineProperty(process, 'platform', real); }
    });
});
