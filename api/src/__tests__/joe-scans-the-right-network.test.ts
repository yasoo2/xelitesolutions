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
 *  A second review the same day found three more:
 *   - a /23 whose computer and router sit in different halves was swept whole
 *     and still told «there may be more»: the note followed the prefix, not
 *     what was swept;
 *   - a range was recorded before its ping loop, so a cap that stopped a block
 *     in the middle would have had the NET line claim the whole block;
 *   - the address arithmetic was checked only by reading the script's text.
 *  So the arithmetic runs here for real, in Windows PowerShell, from the very
 *  lines the scan is built on (sweepMathScript). Those lines read nothing and
 *  change nothing; on a computer without Windows PowerShell they are skipped.
 *  The whole scan was also run for real on the owner's laptop, 2026-11-08,
 *  after this change (powershell -NoProfile -File, twice: 5.0 s and 5.4 s; the
 *  router 192.168.1.1 first, «Ayla 2 home», a /24 swept 192.168.1.1-254 and
 *  read back with no «there may be more»). It is not run here: it pings the
 *  owner's real network.
 */
import os from 'os';
import { spawnSync } from 'child_process';

jest.mock('../modules/services/ToolService', () => ({ executeTool: jest.fn() }));

const ON_WINDOWS = process.platform === 'win32';
const onWindows = ON_WINDOWS ? test : test.skip;

/**
 * PowerShell lines run after the scan's own arithmetic (the same text the scan
 * is built on), with every error made loud instead of silent.
 */
function powershellMath(body: string[]): string[] {
    const { sweepMathScript } = require('../core/devices/network-scan');
    const script = ["$ErrorActionPreference = 'Stop'", sweepMathScript(), ...body].join('\r\n');
    const r = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
        { encoding: 'utf8', timeout: 50_000, windowsHide: true });
    if (r.status !== 0) throw new Error(`PowerShell ended with ${r.status}: ${r.stderr || r.error}`);
    return String(r.stdout).split(/\r?\n/u).map(l => l.trim()).filter(Boolean);
}

describe('the script: the network by its mask, the interface of the best default route, UTF-8 out', () => {
    const { networkScanScript, sweepMathScript, SWEEP_CAP } = require('../core/devices/network-scan');
    const s: string = networkScanScript();
    const lines = s.split('\r\n');

    test('UTF-8 is set first, as windows-desktop.ts and device-link.ts set it', () => {
        expect(lines[0]).toBe('try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}');
    });

    test('the prefix comes from the address itself (PrefixLength, else the mask); no /24 guessed from the text', () => {
        expect(s).toContain('$p = [int]$u.PrefixLength');
        expect(s).toContain('$u.IPv4Mask.GetAddressBytes()');
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

    //  The numbers the scan pings and filters by come from the arithmetic the next block runs
    //  for real: the script is built on those very lines, once, and keeps no second copy inline.
    test('the scan is built on the arithmetic that is run below, and keeps no arithmetic of its own', () => {
        const math: string = sweepMathScript();
        expect(s).toContain(math);
        expect(s.split('function SweepPlan(').length).toBe(2);
        expect(lines.indexOf(math.split('\r\n')[0])).toBeGreaterThan(1);
        expect(s).toContain(`$plan = SweepPlan $ip $prefix $gw ${SWEEP_CAP}; $first = $plan.First; $last = $plan.Last; $targets = $plan.Targets; $swept = @($plan.Swept)`);
        expect(s).toContain('  if (SameNet $an $gn $p) { $ip = $a; $prefix = $p; break }');
        expect(s).toContain('  if (InNet (IpNum $a) $first $last) { $seen[$a] = $mac }');
        //  The old inline sweep, which recorded each block before pinging it, is gone.
        expect(s).not.toContain("$swept += (IpText $lo) + '-' + (IpText $hi)");
        expect(s).not.toContain('$n -gt $net -and $n -lt $bc');
        expect(SWEEP_CAP).toBe(512);
    });

    test('neighbours by the mask, the router\'s entry always; the NET line carries the prefix and what was swept', () => {
        const gw = lines.findIndex(l => l.includes('if ($a -eq $gw) { $seen[$a] = $mac; continue }'));
        const mask = lines.findIndex(l => l.includes('InNet (IpNum $a) $first $last'));
        expect(gw).toBeGreaterThan(0);
        expect(mask).toBeGreaterThan(gw);
        expect(s).toContain("if (-not $seen.ContainsKey($gw)) { $seen[$gw] = '' }");
        expect(s).toContain("+ [char]9 + $prefix + [char]9 + ($swept -join ',')");
        expect(s).toContain('$alive[$ip] = $true');
    });
});

/** One sweep, as SweepPlan gives it. */
interface Plan { net: string; bc: string; first: string; last: string; swept: string[]; count: number; firstTarget: string; lastTarget: string; router: boolean; self: boolean; unique: number }

describe('the arithmetic, run for real in Windows PowerShell', () => {
    const { SWEEP_CAP, ipNumber, sweptCount, parseNetworkScan, describeNetwork } = require('../core/devices/network-scan');

    //  [this computer, prefix, router, cap]
    const CASES: Record<string, [string, number, string, number]> = {
        '/24 home': ['192.168.1.89', 24, '192.168.1.1', SWEEP_CAP],
        '/23 split': ['192.168.1.89', 23, '192.168.0.1', SWEEP_CAP],
        '/23 one half': ['192.168.0.89', 23, '192.168.0.1', SWEEP_CAP],
        '/22 office': ['10.0.3.57', 22, '10.0.0.1', SWEEP_CAP],
        '/16': ['172.16.5.20', 16, '172.16.0.1', SWEEP_CAP],
        '/16 cap 300': ['172.16.5.20', 16, '172.16.0.1', 300],
        '/16 cap 100': ['172.16.5.20', 16, '172.16.0.1', 100],
        '/26': ['192.168.5.70', 26, '192.168.5.65', SWEEP_CAP],
        '/31': ['10.9.8.7', 31, '10.9.8.6', SWEEP_CAP],
        '/32': ['10.20.30.40', 32, '10.20.30.1', SWEEP_CAP],
        'router outside': ['192.168.1.89', 24, '10.0.0.1', SWEEP_CAP],
    };
    //  [this computer, prefix, addresses → on this network?]
    const MASKS: [string, number, Record<string, boolean>][] = [
        ['192.168.1.89', 23, { '192.168.0.0': false, '192.168.0.1': true, '192.168.0.200': true, '192.168.1.254': true, '192.168.1.255': false, '192.168.2.1': false, '10.0.0.1': false }],
        ['10.0.3.57', 22, { '10.0.0.0': false, '10.0.1.20': true, '10.0.3.255': false, '10.0.4.1': false, '9.255.255.255': false }],
        ['10.9.8.7', 31, { '10.9.8.5': false, '10.9.8.6': true, '10.9.8.7': true, '10.9.8.8': false }],
        ['10.20.30.40', 32, { '10.20.30.40': true, '10.20.30.41': false, '10.20.30.1': false }],
    ];
    const NUMBERS = ['0.0.0.1', '127.255.255.255', '128.0.0.0', '192.168.1.89', '200.1.2.3', '255.255.255.254'];

    const plans: Record<string, Plan> = {};
    const inNet: Record<string, boolean> = {};
    const prefixes: Record<string, number> = {};
    const same: Record<string, boolean> = {};
    const numbers: Record<string, [number, string]> = {};

    beforeAll(() => {
        if (!ON_WINDOWS) return;
        const q = (a: string) => `'${a}'`;
        const out = powershellMath([
            ...Object.entries(CASES).map(([name, [ip, prefix, gw, cap]]) =>
                `$r = SweepPlan ${q(ip)} ${prefix} ${q(gw)} ${cap}; 'PLAN|${name}|' + (IpText $r.Net) + '|' + (IpText $r.Bc) + '|' + (IpText $r.First) + '|' + (IpText $r.Last) + '|' + (@($r.Swept) -join ',') + '|' + $r.Targets.Count + '|' + $r.Targets[0] + '|' + $r.Targets[$r.Targets.Count - 1] + '|' + $r.Targets.Contains(${q(gw)}) + '|' + $r.Targets.Contains(${q(ip)}) + '|' + @($r.Targets | Select-Object -Unique).Count`),
            ...MASKS.map(([ip, prefix, addresses]) =>
                `$n = NetOf (IpNum ${q(ip)}) ${prefix}; foreach ($a in @(${Object.keys(addresses).map(q).join(', ')})) { 'IN|${ip}/${prefix}|' + $a + '|' + (InNet (IpNum $a) $n[2] $n[3]) }`),
            "'PREFIX|given|' + (PrefixOf ([pscustomobject]@{ PrefixLength = 23 }))",
            "'PREFIX|mask|' + (PrefixOf ([pscustomobject]@{ PrefixLength = 0; IPv4Mask = [System.Net.IPAddress]::Parse('255.255.252.0') }))",
            "'PREFIX|bad length, mask|' + (PrefixOf ([pscustomobject]@{ PrefixLength = 64; IPv4Mask = [System.Net.IPAddress]::Parse('255.255.255.255') }))",
            "'PREFIX|nothing|' + (PrefixOf ([pscustomobject]@{}))",
            "'SAME|23|' + (SameNet (IpNum '192.168.1.89') (IpNum '192.168.0.1') 23)",
            "'SAME|24|' + (SameNet (IpNum '192.168.1.89') (IpNum '192.168.0.1') 24)",
            `foreach ($a in @(${NUMBERS.map(q).join(', ')})) { 'NUM|' + $a + '|' + (IpNum $a) + '|' + (IpText (IpNum $a)) }`,
        ]);
        for (const l of out) {
            const f = l.split('|');
            if (f[0] === 'PLAN') {
                plans[f[1]] = {
                    net: f[2], bc: f[3], first: f[4], last: f[5], swept: f[6] ? f[6].split(',') : [], count: Number(f[7]),
                    firstTarget: f[8], lastTarget: f[9], router: f[10] === 'True', self: f[11] === 'True', unique: Number(f[12]),
                };
            } else if (f[0] === 'IN') inNet[`${f[1]} ${f[2]}`] = f[3] === 'True';
            else if (f[0] === 'PREFIX') prefixes[f[1]] = Number(f[2]);
            else if (f[0] === 'SAME') same[f[1]] = f[2] === 'True';
            else if (f[0] === 'NUM') numbers[f[1]] = [Number(f[2]), f[3]];
        }
    }, 60_000);

    const plan = (name: string, p: Omit<Plan, 'unique' | 'router' | 'self'>) => {
        expect(plans[name]).toEqual({ ...p, router: true, self: false, unique: p.count });
    };

    onWindows('a /24 home: its 254 device addresses, this computer not pinged, the router in its block', () => {
        plan('/24 home', { net: '192.168.1.0', bc: '192.168.1.255', first: '192.168.1.1', last: '192.168.1.254', swept: ['192.168.1.1-192.168.1.254'], count: 253, firstTarget: '192.168.1.1', lastTarget: '192.168.1.254' });
    });

    onWindows('a /23 with the computer and the router in different halves: both blocks, which together are the whole /23', () => {
        plan('/23 split', { net: '192.168.0.0', bc: '192.168.1.255', first: '192.168.0.1', last: '192.168.1.254', swept: ['192.168.1.0-192.168.1.254', '192.168.0.1-192.168.0.255'], count: 509, firstTarget: '192.168.1.0', lastTarget: '192.168.0.255' });
        plan('/23 one half', { net: '192.168.0.0', bc: '192.168.1.255', first: '192.168.0.1', last: '192.168.1.254', swept: ['192.168.0.1-192.168.0.255'], count: 254, firstTarget: '192.168.0.1', lastTarget: '192.168.0.255' });
    });

    onWindows('a /22 office: the block of this computer and the router\'s, each inside the network', () => {
        plan('/22 office', { net: '10.0.0.0', bc: '10.0.3.255', first: '10.0.0.1', last: '10.0.3.254', swept: ['10.0.3.0-10.0.3.254', '10.0.0.1-10.0.0.255'], count: 509, firstTarget: '10.0.3.0', lastTarget: '10.0.0.255' });
    });

    onWindows('a /16 is swept in two blocks only, under the cap; a smaller cap records only what it really pinged', () => {
        plan('/16', { net: '172.16.0.0', bc: '172.16.255.255', first: '172.16.0.1', last: '172.16.255.254', swept: ['172.16.5.0-172.16.5.255', '172.16.0.1-172.16.0.255'], count: 510, firstTarget: '172.16.5.0', lastTarget: '172.16.0.255' });
        expect(plans['/16'].count).toBeLessThanOrEqual(SWEEP_CAP);
        //  The cap stops the router's block in the middle: the range says where it stopped.
        plan('/16 cap 300', { net: '172.16.0.0', bc: '172.16.255.255', first: '172.16.0.1', last: '172.16.255.254', swept: ['172.16.5.0-172.16.5.255', '172.16.0.1-172.16.0.45'], count: 300, firstTarget: '172.16.5.0', lastTarget: '172.16.0.45' });
        //  The cap stops this computer's own block: the router's block, never reached, is not
        //  claimed at all, and the router itself is still pinged (one past the cap).
        plan('/16 cap 100', { net: '172.16.0.0', bc: '172.16.255.255', first: '172.16.0.1', last: '172.16.255.254', swept: ['172.16.5.0-172.16.5.100'], count: 101, firstTarget: '172.16.5.0', lastTarget: '172.16.0.1' });
    });

    onWindows('a /26 is pinged as the /26 it is; a /31 is its two ends; a /32 is this computer alone, the router pinged anyway', () => {
        plan('/26', { net: '192.168.5.64', bc: '192.168.5.127', first: '192.168.5.65', last: '192.168.5.126', swept: ['192.168.5.65-192.168.5.126'], count: 61, firstTarget: '192.168.5.65', lastTarget: '192.168.5.126' });
        plan('/31', { net: '10.9.8.6', bc: '10.9.8.7', first: '10.9.8.6', last: '10.9.8.7', swept: ['10.9.8.6-10.9.8.7'], count: 1, firstTarget: '10.9.8.6', lastTarget: '10.9.8.6' });
        plan('/32', { net: '10.20.30.40', bc: '10.20.30.40', first: '10.20.30.40', last: '10.20.30.40', swept: ['10.20.30.40-10.20.30.40'], count: 1, firstTarget: '10.20.30.1', lastTarget: '10.20.30.1' });
    });

    onWindows('a router outside the network: its block is not swept and not claimed, the router itself is pinged', () => {
        plan('router outside', { net: '192.168.1.0', bc: '192.168.1.255', first: '192.168.1.1', last: '192.168.1.254', swept: ['192.168.1.1-192.168.1.254'], count: 254, firstTarget: '192.168.1.1', lastTarget: '10.0.0.1' });
    });

    onWindows('the mask filter keeps a neighbour only between the network\'s first and last device address', () => {
        const expected: Record<string, boolean> = {};
        for (const [ip, prefix, addresses] of MASKS) for (const [a, yes] of Object.entries(addresses)) expected[`${ip}/${prefix} ${a}`] = yes;
        expect(inNet).toEqual(expected);
    });

    onWindows('the prefix: as Windows gives it, else from the mask, else a /24; the router\'s network by the prefix', () => {
        expect(prefixes).toEqual({ given: 23, mask: 22, 'bad length, mask': 32, nothing: 24 });
        expect(same).toEqual({ 23: true, 24: false });
    });

    onWindows('addresses as whole numbers and back, past 128 too (no signed 32-bit), the same numbers as ipNumber', () => {
        const expected: Record<string, [number, string]> = {};
        for (const a of NUMBERS) expected[a] = [ipNumber(a), a];
        expect(numbers).toEqual(expected);
        expect(numbers['200.1.2.3']).toEqual([3355509251, '200.1.2.3']);
    });

    //  The whole chain: what PowerShell recorded, read back as the NET line, said to the run.
    onWindows('what the sweep recorded decides the note: a whole /23 has none, a part of a network says how much', () => {
        const said = (name: string) => {
            const [ip, prefix, gw] = CASES[name];
            const scan = parseNetworkScan(`NET\t${ip}\t${gw}\tWi-Fi\thome\t${prefix}\t${plans[name].swept.join(',')}`);
            expect(scan.swept).toEqual(plans[name].swept);
            return describeNetwork(scan) as string;
        };
        for (const whole of ['/24 home', '/23 split', '/26', '/31', '/32', 'router outside']) expect([whole, said(whole)]).toEqual([whole, expect.not.stringContaining('Joe swept only')]);
        expect(said('/23 one half')).toContain('This network is a /23 (510 addresses); Joe swept only the 255 around this computer and the router (192.168.0.1-192.168.0.255)');
        expect(said('/22 office')).toContain('This network is a /22 (1,022 addresses); Joe swept only the 510 around');
        expect(said('/16')).toContain('This network is a /16 (65,534 addresses); Joe swept only the 511 around');
        expect(said('/16 cap 300')).toContain('Joe swept only the 301 around this computer and the router (172.16.5.0-172.16.5.255 and 172.16.0.1-172.16.0.45)');
        expect(said('/16 cap 100')).toContain('Joe swept only the 101 around this computer and the router (172.16.5.0-172.16.5.100)');
        expect(sweptCount('172.16.5.20', 16, plans['/16 cap 100'].swept)).toBe(101);
    });
});

describe('the scan, read and said', () => {
    const { parseNetworkScan, describeNetwork, networkSize, sweptCount, ipNumber } = require('../core/devices/network-scan');

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
        expect(text).toContain('This network is a /22 (1,022 addresses); Joe swept only the 510 around this computer and the router (10.0.3.0-10.0.3.254 and 10.0.0.1-10.0.0.255)');
        expect(text).toContain('there may be more');
        expect(text).toContain('2 other device(s)');
    });

    //  Reviewers, 2026-11-08: a /23 swept whole (the computer in one half, the router in the
    //  other) was still told «there may be more», because the note followed the prefix alone.
    test('a /23 swept whole says nothing of a part; the same /23 with one half swept says so', () => {
        const whole = parseNetworkScan('NET\t192.168.1.89\t192.168.0.1\tWi-Fi\thome\t23\t192.168.1.0-192.168.1.254,192.168.0.1-192.168.0.255');
        expect(sweptCount(whole.ip, 23, whole.swept)).toBe(networkSize(23));
        expect(describeNetwork(whole)).not.toContain('Joe swept only');
        expect(describeNetwork(whole)).not.toContain('there may be more');
        const half = parseNetworkScan('NET\t192.168.0.89\t192.168.0.1\tWi-Fi\thome\t23\t192.168.0.1-192.168.0.255');
        expect(describeNetwork(half)).toContain('This network is a /23 (510 addresses); Joe swept only the 255 around this computer and the router (192.168.0.1-192.168.0.255), so a device elsewhere on it is listed only if it talked to this computer recently: there may be more.');
    });

    test('what was swept is counted inside the network and once: the ends, an overlap and a block elsewhere add nothing', () => {
        expect(sweptCount('192.168.1.89', 24, ['192.168.1.0-192.168.1.255'])).toBe(254);
        expect(sweptCount('192.168.1.89', 24, ['192.168.1.1-192.168.1.254', '192.168.1.100-192.168.1.200', '10.0.0.1-10.0.0.255'])).toBe(254);
        expect(sweptCount('192.168.1.89', 24, ['192.168.1.1-192.168.1.100', '192.168.1.50-192.168.1.150'])).toBe(150);
        expect(sweptCount('10.9.8.7', 31, ['10.9.8.6-10.9.8.7'])).toBe(2);
        expect(sweptCount('10.20.30.40', 32, ['10.20.30.40-10.20.30.40'])).toBe(1);
        expect(sweptCount('not an address', 24, ['192.168.1.1-192.168.1.254'])).toBe(0);
        expect(sweptCount('192.168.1.89', 24, ['192.168.1.254-192.168.1.1', 'junk'])).toBe(0);
        expect([ipNumber('200.1.2.3'), ipNumber('256.1.1.1'), ipNumber('1.2.3'), ipNumber('')]).toEqual([3355509251, NaN, NaN, NaN]);
    });

    test('a /24 or smaller says nothing of a part; an older NET line (no prefix, no ranges) keeps the old rule', () => {
        const home = parseNetworkScan('NET\t192.168.1.89\t192.168.1.1\tWi-Fi\tAyla 2 home\t24\t192.168.1.1-192.168.1.254\r\nDEV\t192.168.1.1\t24-58-6E-A9-64-C8\tmesh.local\tTrue');
        expect(describeNetwork(home)).not.toContain('swept only');
        expect(describeNetwork(home)).not.toContain('Joe swept only');
        const old = parseNetworkScan('NET\t192.168.1.89\t192.168.1.1\tWi-Fi\tAyla 2 home');
        expect([old.prefix, old.swept]).toEqual([24, []]);
        expect(describeNetwork(old)).not.toContain('Joe swept only');
        //  A larger network that did not say what it swept: the part is said, without numbers.
        const unsaid = parseNetworkScan('NET\t10.0.3.57\t10.0.0.1\tWi-Fi\toffice\t22');
        expect(describeNetwork(unsaid)).toContain('Joe swept only the addresses around this computer and the router, so');
        const small = parseNetworkScan('NET\t192.168.5.70\t192.168.5.65\tEthernet\toffice\t26\t192.168.5.65-192.168.5.126');
        expect(describeNetwork(small)).not.toContain('Joe swept only');
        expect([networkSize(24), networkSize(22), networkSize(16), networkSize(31), networkSize(32)]).toEqual([254, 1022, 65534, 2, 1]);
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
        expect(other).toContain('did not scan its own network (its link may be too old: relink it once)');
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

    //  Since 2026-11-08 a linked computer chosen is scanned ON that computer, through its own
    //  agent (device-link.ts scanNetwork), with this very script: the arithmetic run for real
    //  above is the one that computer runs too. Joe's own PowerShell is not used for it, and the
    //  answer is that computer's network, never Joe's passed off as its.
    test('a linked computer chosen: the same scan script runs ON it and the answer is its network; Joe\'s own is not scanned for it', async () => {
        await withPlatform('win32', async () => {
            const { ExecutionGateway } = require('../kernel/ExecutionGateway');
            const { deviceLinks } = require('../core/devices/device-link');
            const { networkScanScript } = require('../core/devices/network-scan');
            const run = jest.spyOn(ExecutionGateway, 'execute').mockResolvedValue({ success: true, data: { exitCode: 0, output: OUT } } as any);
            const scanThere = jest.spyOn(deviceLinks, 'scanNetwork').mockResolvedValue({ ok: true, name: 'كمبيوتر المكتب', out: OUT } as any);
            const { EngineDeviceTool } = require('../modules/tools/definitions/EngineDeviceTools');
            const tool = new EngineDeviceTool();
            const linked = await tool.execute({ op: 'network', computer: 'كمبيوتر المكتب' }, { userId: 'owner-net' });
            expect(linked.ok).toBe(true);
            expect(scanThere).toHaveBeenCalledWith('owner-net', 'كمبيوتر المكتب', networkScanScript(), expect.any(Number));
            expect(run).not.toHaveBeenCalled();
            expect(linked.output.text.split('\n')[0]).toContain('Scanned ON «كمبيوتر المكتب»');
            expect(linked.output.text).not.toContain(`Scanned from «${os.hostname()}», Joe's own computer.`);
            expect(linked.output).toEqual(expect.objectContaining({ scannedFrom: 'كمبيوتر المكتب', prefix: 24, gateway: '192.168.1.1' }));

            const here = await tool.execute({ op: 'network' }, { userId: 'owner-net' });
            expect(run).toHaveBeenCalledWith('powershell.exe', expect.arrayContaining(['-EncodedCommand']), expect.anything());
            expect(scanThere).toHaveBeenCalledTimes(1);
            expect(here.output.text.split('\n')[0]).toBe(`Scanned from «${os.hostname()}», Joe's own computer.`);
            expect(here.output.notFrom).toBeUndefined();
            run.mockRestore(); scanThere.mockRestore();
        });
    });

    test('a linked computer that cannot be reached is told so, and nothing else is scanned in its place; not Windows here is said plainly', async () => {
        await withPlatform('linux', async () => {
            const { EngineDeviceTool } = require('../modules/tools/definitions/EngineDeviceTools');
            const tool = new EngineDeviceTool();
            const linked = await tool.execute({ op: 'network', computer: 'كمبيوتر المكتب' }, { userId: 'owner-net' });
            expect(linked.ok).toBe(false);
            expect(linked.output.text).toContain('«كمبيوتر المكتب»');
            expect(linked.output.text).toContain('Nothing else was scanned in its place');
            const here = await tool.execute({ op: 'network' }, { userId: 'owner-net' });
            expect(here.output.text).toBe('This computer runs linux; Joe\'s network scan works on Windows in this version. Say so to the owner.');
        });
    });
});
