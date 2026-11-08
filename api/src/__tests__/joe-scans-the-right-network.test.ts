/**
 *  JOE SCANS THE RIGHT NETWORK, ALL OF IT HE SAYS HE SCANNED, AND SAYS WHOSE IT IS.
 *
 *  Four faults reviewers found in the Wi-Fi scan of 2026-11-08 and traced
 *  through the code:
 *   - it took a /24 from the first three numbers of the address, so on a /22 or
 *     /16 office network it swept the wrong block and dropped every neighbour
 *     outside it;
 *   - it scanned the first interface with a gateway, not the one Windows sends
 *     to the internet through (a Hyper-V switch or a second adapter listed first);
 *   - an Arabic network name came back as «????» (PowerShell wrote to the pipe
 *     in the console's old code page);
 *   - after device_use of another computer, the scan still ran on Joe's own and
 *     answered as if it were the chosen computer's network.
 *  The script was also run for real on the owner's laptop (7.6 s, the router
 *  192.168.1.1 and twelve others listed); jest cannot start PowerShell here.
 */
import os from 'os';

jest.mock('../modules/services/ToolService', () => ({ executeTool: jest.fn() }));

describe('the script: the network by its mask, the interface of the best default route, UTF-8 out', () => {
    const { networkScanScript, SWEEP_CAP } = require('../core/devices/network-scan');
    const s: string = networkScanScript();
    const lines = s.split('\r\n');

    test('UTF-8 is set first, as windows-desktop.ts and device-link.ts set it', () => {
        expect(lines[0]).toBe('try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}');
    });

    test('the prefix comes from the address itself (PrefixLength, else the mask); no /24 guessed from the text', () => {
        expect(s).toContain('$p = [int]$u.PrefixLength');
        expect(s).toContain('$u.IPv4Mask.GetAddressBytes()');
        expect(s).toContain('$net = $ipn - ($ipn % $size); $bc = $net + $size - 1');
        expect(s).not.toContain('$base');
        expect(s).not.toContain('-like');
    });

    test('the interface is the one of the best default route; tunnels, dial-up and loopback are never it; no 32-second cmdlet', () => {
        expect(s).toContain("Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0'");
        expect(s).toContain('Sort-Object { [int]$_.RouteMetric + [int]$_.InterfaceMetric }');
        expect(s).toContain('$byIndex[[int]$v4.Index] = $n');
        expect(s).toContain("@('Tunnel', 'Ppp', 'Loopback') -contains [string]$n.NetworkInterfaceType");
        //  Without a route table, the first interface with a gateway, as before.
        expect(s).toContain('if (-not $nic) { foreach ($n in $up)');
        expect(s).not.toContain('Get-NetIPConfiguration');
    });

    test('the sweep: this computer\'s block and the router\'s, kept inside the network, capped', () => {
        expect(SWEEP_CAP).toBe(512);
        expect(s).toContain('if ($blocks -notcontains $g24) { $blocks += $g24 }');
        expect(s).toContain('$lo = [math]::Max([int64]$s, $net + 1); $hi = [math]::Min([int64]$s + 255, $bc - 1)');
        expect(s).toContain(`$targets.Count -lt ${SWEEP_CAP}`);
        expect(s).toContain('if (-not $targets.Contains($gw)) { $targets.Add($gw) }');
    });

    test('neighbours by the mask, the router\'s entry always; the NET line carries the prefix and what was swept', () => {
        const gw = lines.findIndex(l => l.includes('if ($a -eq $gw) { $seen[$a] = $mac; continue }'));
        const mask = lines.findIndex(l => l.includes('$n -gt $net -and $n -lt $bc'));
        expect(gw).toBeGreaterThan(0);
        expect(mask).toBeGreaterThan(gw);
        expect(s).toContain("if (-not $seen.ContainsKey($gw)) { $seen[$gw] = '' }");
        expect(s).toContain("+ [char]9 + $prefix + [char]9 + ($swept -join ',')");
        expect(s).toContain('$alive[$ip] = $true');
    });
});

describe('the scan, read and said', () => {
    const { parseNetworkScan, describeNetwork, networkSize } = require('../core/devices/network-scan');

    test('an Arabic network name is read as it is; a /22 says it was swept only in part', () => {
        const scan = parseNetworkScan([
            'NET\t10.0.3.57\t10.0.0.1\tWi-Fi\tبيت العائلة\t22\t10.0.3.0-10.0.3.254,10.0.0.1-10.0.0.255',
            'DEV\t10.0.3.57\t50-76-AF-48-1B-29\tAyla\tTrue',
            'DEV\t10.0.0.1\t24-58-6E-A9-64-C8\tmesh.local\tFalse',
            //  In the network, outside both swept blocks: it talked to this computer recently.
            'DEV\t10.0.1.20\t8A-ED-64-71-ED-7B\t10.0.1.20\tFalse',
        ].join('\r\n'));
        expect(scan.ok).toBe(true);
        expect(scan.network).toBe('بيت العائلة');
        expect(scan.prefix).toBe(22);
        expect(scan.swept).toEqual(['10.0.3.0-10.0.3.254', '10.0.0.1-10.0.0.255']);
        expect(scan.devices.map((d: any) => d.ip)).toEqual(['10.0.0.1', '10.0.3.57', '10.0.1.20']);
        const text: string = describeNetwork(scan);
        expect(text).toContain('This computer is on «بيت العائلة» at 10.0.3.57; the router is 10.0.0.1.');
        expect(text).toContain('This network is a /22 (1,022 addresses); Joe pinged only 10.0.3.0-10.0.3.254 and 10.0.0.1-10.0.0.255');
        expect(text).toContain('there may be more');
        expect(text).toContain('2 other device(s)');
    });

    test('a /24 or smaller says nothing of a part; an older NET line (no prefix) reads as a /24', () => {
        const home = parseNetworkScan('NET\t192.168.1.89\t192.168.1.1\tWi-Fi\tAyla 2 home\t24\t192.168.1.1-192.168.1.254\r\nDEV\t192.168.1.1\t24-58-6E-A9-64-C8\tmesh.local\tTrue');
        expect(describeNetwork(home)).not.toContain('swept only');
        expect(describeNetwork(home)).not.toContain('Joe pinged only');
        const old = parseNetworkScan('NET\t192.168.1.89\t192.168.1.1\tWi-Fi\tAyla 2 home');
        expect([old.prefix, old.swept]).toEqual([24, []]);
        const small = parseNetworkScan('NET\t192.168.5.70\t192.168.5.65\tEthernet\toffice\t26\t192.168.5.65-192.168.5.126');
        expect(describeNetwork(small)).not.toContain('Joe pinged only');
        expect([networkSize(24), networkSize(22), networkSize(16), networkSize(32)]).toEqual([254, 1022, 65534, 1]);
    });

    test('this computer is up even though it does not ping itself', () => {
        const scan = parseNetworkScan('NET\t192.168.1.89\t192.168.1.1\tWi-Fi\tx\t24\t192.168.1.1-192.168.1.254\r\nDEV\t192.168.1.89\t50-76-AF-48-1B-29\tAyla\tFalse');
        expect(scan.devices[0]).toEqual(expect.objectContaining({ self: true, alive: true }));
        expect(describeNetwork(scan)).not.toContain('did not answer');
    });

    test('whose network: Joe\'s computer by name; a linked computer chosen is told plainly it is not its scan', () => {
        const scan = parseNetworkScan('NET\t192.168.1.89\t192.168.1.1\tWi-Fi\tAyla 2 home\t24\t192.168.1.1-192.168.1.254');
        expect(describeNetwork(scan, { from: 'AYLA-LAPTOP' }).split('\n')[0]).toBe('Scanned from «AYLA-LAPTOP», Joe\'s own computer.');
        const other: string = describeNetwork(scan, { from: 'AYLA-LAPTOP', insteadOf: 'كمبيوتر المكتب' });
        expect(other.split('\n')[0]).toContain('This scan is from Joe\'s computer «AYLA-LAPTOP», not from «كمبيوتر المكتب»');
        expect(other).toContain('Joe cannot scan the network of a linked computer in this version');
    });
});

describe('network_devices goes where device_use points, and engine_device says whose network it saw', () => {
    const OUT = [
        'NET\t192.168.1.89\t192.168.1.1\tWi-Fi\tAyla 2 home\t24\t192.168.1.1-192.168.1.254',
        'DEV\t192.168.1.89\t50-76-AF-48-1B-29\tAyla\tTrue',
        'DEV\t192.168.1.1\t24-58-6E-A9-64-C8\tmesh.local\tTrue',
    ].join('\r\n');
    const ctx = (runId: string) => ({ runId, signal: new AbortController().signal, cancelled: new Promise(() => undefined) } as any);

    test('the chosen computer travels with the scan, as with every other device_ tool', async () => {
        const { executeTool } = require('../modules/services/ToolService');
        const { networkDevicesTool, deviceRecordFor, forgetDeviceRecord } = require('../core/engine/tools/devices');
        executeTool.mockReset();
        executeTool.mockResolvedValue({ ok: true, output: { text: 'This scan is from Joe\'s computer «X», not from «كمبيوتر المكتب»…' } });
        const run = 'net-linked-' + Date.now();
        deviceRecordFor(run).computer = 'كمبيوتر المكتب';
        const r = await networkDevicesTool.run({}, ctx(run));
        expect(executeTool).toHaveBeenCalledWith('engine_device', { op: 'network', computer: 'كمبيوتر المكتب' }, expect.anything());
        expect(r).toEqual({ ok: true, output: expect.stringContaining('not from «كمبيوتر المكتب»') });
        expect(deviceRecordFor(run).looks.map((l: any) => l.kind)).toEqual(['devices']);
        forgetDeviceRecord(run);

        const here = 'net-here-' + Date.now();
        await networkDevicesTool.run({}, ctx(here));
        expect(executeTool).toHaveBeenLastCalledWith('engine_device', { op: 'network' }, expect.anything());
        forgetDeviceRecord(here);

        executeTool.mockResolvedValue({ ok: false, error: 'This computer is not on a network with a router right now.' });
        expect(await networkDevicesTool.run({}, ctx('net-fail-' + Date.now()))).toEqual({ ok: false, output: 'This computer is not on a network with a router right now.' });
        executeTool.mockResolvedValue({ ok: false });
        expect(await networkDevicesTool.run({}, ctx('net-none-' + Date.now()))).toEqual({ ok: false, output: 'the network could not be read' });
    });

    //  EngineDeviceTools reads the platform when it loads (and again in its words), so it is
    //  loaded afresh with the platform set, and the platform stays set until the body is done.
    async function withPlatform<T>(platform: string, body: () => Promise<T>): Promise<T> {
        const real = Object.getOwnPropertyDescriptor(process, 'platform')!;
        Object.defineProperty(process, 'platform', { value: platform });
        try {
            let p!: Promise<T>;
            jest.isolateModules(() => { p = body(); });
            return await p;
        } finally { Object.defineProperty(process, 'platform', real); }
    }

    test('a linked computer chosen: the scan runs on Joe\'s computer and the answer names both; the link is not asked', async () => {
        await withPlatform('win32', async () => {
            const { ExecutionGateway } = require('../kernel/ExecutionGateway');
            const { deviceLinks } = require('../core/devices/device-link');
            const run = jest.spyOn(ExecutionGateway, 'execute').mockResolvedValue({ success: true, data: { exitCode: 0, output: OUT } } as any);
            const send = jest.spyOn(deviceLinks, 'send');
            const { EngineDeviceTool } = require('../modules/tools/definitions/EngineDeviceTools');
            const tool = new EngineDeviceTool();
            const linked = await tool.execute({ op: 'network', computer: 'كمبيوتر المكتب' }, { userId: 'owner-net' });
            expect(linked.ok).toBe(true);
            expect(linked.output.text.split('\n')[0]).toContain(`This scan is from Joe's computer «${os.hostname()}», not from «كمبيوتر المكتب»`);
            expect(linked.output).toEqual(expect.objectContaining({ scannedFrom: os.hostname(), notFrom: 'كمبيوتر المكتب', prefix: 24, gateway: '192.168.1.1' }));
            expect(run).toHaveBeenCalledWith('powershell.exe', expect.arrayContaining(['-EncodedCommand']), expect.anything());
            expect(send).not.toHaveBeenCalled();

            const here = await tool.execute({ op: 'network' }, { userId: 'owner-net' });
            expect(here.output.text.split('\n')[0]).toBe(`Scanned from «${os.hostname()}», Joe's own computer.`);
            expect(here.output.notFrom).toBeUndefined();
            run.mockRestore(); send.mockRestore();
        });
    });

    test('on a computer that is not Windows, a linked computer chosen is told it cannot be scanned either', async () => {
        await withPlatform('linux', async () => {
            const { EngineDeviceTool } = require('../modules/tools/definitions/EngineDeviceTools');
            const tool = new EngineDeviceTool();
            const linked = await tool.execute({ op: 'network', computer: 'كمبيوتر المكتب' }, { userId: 'owner-net' });
            expect(linked.ok).toBe(false);
            expect(linked.output.text).toContain('Joe cannot scan the network of «كمبيوتر المكتب» in this version');
            const here = await tool.execute({ op: 'network' }, { userId: 'owner-net' });
            expect(here.output.text).toBe('This computer runs linux; Joe\'s network scan works on Windows in this version. Say so to the owner.');
        });
    });
});
