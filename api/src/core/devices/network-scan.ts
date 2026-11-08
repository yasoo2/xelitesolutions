/**
 * THE DEVICES ON THE OWNER'S WI-FI, SEEN FROM THIS COMPUTER.
 *
 * The owner, 2026-11-08: «are there devices on the same Wi-Fi?» was answered
 * with instructions to type `arp -a` himself, and «check how many devices are
 * on the Wi-Fi» counted the one robot vacuum in a smart-home app on his
 * phone. Joe runs on a computer on that Wi-Fi: it can look itself.
 *
 * One PowerShell run (through Joe's gateway, like every desktop action):
 * the network this computer is on, a quick ping of the addresses around it
 * and around the router (so the neighbour table fills), then the neighbour
 * table itself — each address with its hardware address — and the names the
 * network gives them. The hardware address says the maker (a short table of
 * the common ones), or that the device hides it (a phone or laptop with a
 * private address); the name and the maker together guess what it is.
 * Nothing is sent to any device beyond a ping.
 *
 * The scan runs on Joe's own computer. A computer the owner linked answers
 * only the desktop actions of its helper (windows-desktop.ts Dispatch), none
 * of which runs a script and brings its output back, so a scan asked for
 * another computer says plainly whose network it saw (describeNetwork).
 */

export interface NetDevice {
    ip: string;
    mac: string;
    name: string;
    alive: boolean;
    self: boolean;
    gateway: boolean;
    maker: string;
    kind: string;
    privateMac: boolean;
}

/**
 * The most addresses one scan pings: the computer's own block of 256 and the
 * router's when it is another one. A guard, so a mistaken mask can never turn
 * the scan into a sweep of thousands.
 */
export const SWEEP_CAP = 512;

/** The PowerShell that looks: one line per device, tab-separated. */
export function networkScanScript(): string {
    return [
        //  Arabic network names (an SSID like «بيت العائلة») came back as «????»: Windows
        //  PowerShell writes to a pipe in the console's old code page unless told UTF-8,
        //  as windows-desktop.ts and device-link.ts already tell it (2026-11-08).
        'try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}',
        "$ErrorActionPreference = 'SilentlyContinue'",
        //  Addresses as whole numbers, so a network of any size is a range: the scan assumed a
        //  /24 (the first three numbers of the address), which on a /22 or /16 office network
        //  swept the wrong block and dropped every neighbour outside it (2026-11-08). Plain
        //  int64 arithmetic, not -band on [uint32], which Windows PowerShell widens to signed.
        'function IpNum([string]$a) { $b = [System.Net.IPAddress]::Parse($a).GetAddressBytes(); ([int64]$b[0] -shl 24) + ([int64]$b[1] -shl 16) + ([int64]$b[2] -shl 8) + [int64]$b[3] }',
        "function IpText([int64]$n) { '' + (($n -shr 24) -band 255) + '.' + (($n -shr 16) -band 255) + '.' + (($n -shr 8) -band 255) + '.' + ($n -band 255) }",
        //  The prefix length as Windows gives it; from the mask when it does not; a /24 only as the last guess.
        'function PrefixOf($u) { $p = 0; try { $p = [int]$u.PrefixLength } catch {}; if ($p -lt 1 -or $p -gt 32) { $p = 0; try { foreach ($b in $u.IPv4Mask.GetAddressBytes()) { for ($x = [int]$b; $x -gt 0; $x = $x -shr 1) { $p += $x -band 1 } } } catch {} }; if ($p -lt 1 -or $p -gt 32) { $p = 24 }; $p }',
        //  The interfaces that can carry the owner's Wi-Fi or cable: a VPN tunnel, a dial-up
        //  link or the loopback is never the home network, even when it has a gateway.
        '$up = New-Object System.Collections.Generic.List[object]; $byIndex = @{}',
        'foreach ($n in [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {',
        "  if ($n.OperationalStatus -ne 'Up' -or @('Tunnel', 'Ppp', 'Loopback') -contains [string]$n.NetworkInterfaceType) { continue }",
        '  try { $v4 = $n.GetIPProperties().GetIPv4Properties(); if ($v4) { $byIndex[[int]$v4.Index] = $n; $up.Add($n) } } catch {}',
        '}',
        //  The interface Windows itself sends to the internet through: the default route with the
        //  lowest route + interface metric. The first interface with a gateway was taken before, so
        //  a Hyper-V switch or a second adapter listed first was scanned instead of the Wi-Fi
        //  (2026-11-08). Get-NetRoute costs about 3 s in a fresh PowerShell, mostly the module
        //  Get-NetNeighbor loads anyway; Get-NetIPConfiguration took 32 s of a 40 s scan, never it.
        '$nic = $null; $gw = $null',
        "try { $best = @(Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' | Where-Object { $byIndex.ContainsKey([int]$_.InterfaceIndex) -and $_.NextHop -and $_.NextHop -ne '0.0.0.0' } | Sort-Object { [int]$_.RouteMetric + [int]$_.InterfaceMetric }) | Select-Object -First 1; if ($best) { $nic = $byIndex[[int]$best.InterfaceIndex]; $gw = [string]$best.NextHop } } catch {}",
        //  No route table to read (an old or trimmed Windows): the first interface with a gateway, as before.
        "if (-not $nic) { foreach ($n in $up) { $g = @($n.GetIPProperties().GatewayAddresses | Where-Object { $_.Address.AddressFamily -eq 'InterNetwork' -and $_.Address.ToString() -ne '0.0.0.0' }); if ($g.Count) { $nic = $n; $gw = $g[0].Address.ToString(); break } } }",
        "if (-not $nic) { 'NONET'; exit }",
        '$idx = [int]$nic.GetIPProperties().GetIPv4Properties().Index; $gn = IpNum $gw',
        //  The address on the router's network (an adapter can also carry a 169.254 one).
        '$ip = $null; $prefix = 24',
        "$addrs = @($nic.GetIPProperties().UnicastAddresses | Where-Object { $_.Address.AddressFamily -eq 'InterNetwork' })",
        'foreach ($u in $addrs) {',
        '  $p = PrefixOf $u; $size = [int64][math]::Pow(2, 32 - $p); $a = $u.Address.ToString(); $an = IpNum $a',
        '  if (($an - ($an % $size)) -eq ($gn - ($gn % $size))) { $ip = $a; $prefix = $p; break }',
        "  if (-not $ip -and -not $a.StartsWith('169.254.')) { $ip = $a; $prefix = $p }",
        '}',
        'if (-not $ip -and $addrs.Count) { $ip = $addrs[0].Address.ToString(); $prefix = PrefixOf $addrs[0] }',
        "if (-not $ip) { 'NONET'; exit }",
        '$ipn = IpNum $ip; $size = [int64][math]::Pow(2, 32 - $prefix); $net = $ipn - ($ipn % $size); $bc = $net + $size - 1',
        //  What is pinged: the block of 256 around this computer, and the router's block when it
        //  is another one, each kept inside the network (a /26 is pinged as the /26 it is). A
        //  larger network is swept only in part, and the NET line says which part.
        '$blocks = @($ipn - ($ipn % 256)); $g24 = $gn - ($gn % 256); if ($blocks -notcontains $g24) { $blocks += $g24 }',
        '$targets = New-Object System.Collections.Generic.List[string]; $swept = @()',
        `foreach ($s in $blocks) { $lo = [math]::Max([int64]$s, $net + 1); $hi = [math]::Min([int64]$s + 255, $bc - 1); if ($lo -gt $hi) { continue }; $swept += (IpText $lo) + '-' + (IpText $hi); for ($k = [int64]$lo; $k -le $hi -and $targets.Count -lt ${SWEEP_CAP}; $k++) { if ($k -ne $ipn) { $targets.Add((IpText $k)) } } }`,
        'if (-not $targets.Contains($gw)) { $targets.Add($gw) }',
        "'NET' + [char]9 + $ip + [char]9 + $gw + [char]9 + $nic.Name + [char]9 + $(try { (Get-NetConnectionProfile -InterfaceIndex $idx).Name } catch { '' }) + [char]9 + $prefix + [char]9 + ($swept -join ',')",
        '$tasks = New-Object System.Collections.Generic.List[object]',
        'foreach ($a in $targets) { $t = $null; try { $t = (New-Object System.Net.NetworkInformation.Ping).SendPingAsync($a, 500) } catch {}; $tasks.Add($t) }',
        'try { [System.Threading.Tasks.Task]::WaitAll([System.Threading.Tasks.Task[]]@($tasks | Where-Object { $_ }), 4000) | Out-Null } catch {}',
        '$alive = @{}',
        "for ($i = 0; $i -lt $tasks.Count; $i++) { $t = $tasks[$i]; if ($t -and $t.Status -eq 'RanToCompletion' -and $t.Result.Status -eq 'Success') { $alive[$targets[$i]] = $true } }",
        //  This computer is not pinged (it is the one asking), and it is up.
        '$alive[$ip] = $true',
        //  The neighbour table, kept to this network by its mask, and the router's entry always:
        //  the router is the one device every answer about the Wi-Fi starts with.
        '$seen = @{}',
        'foreach ($e in @(Get-NetNeighbor -AddressFamily IPv4 -InterfaceIndex $idx)) {',
        '  $a = [string]$e.IPAddress; $mac = [string]$e.LinkLayerAddress',
        "  if (-not $mac -or $mac -match '^(00-00-00-00-00-00|FF-FF-FF-FF-FF-FF|01-00-5E)') { continue }",
        '  if ($a -eq $gw) { $seen[$a] = $mac; continue }',
        "  if ([string]$e.State -eq 'Unreachable') { continue }",
        '  $n = IpNum $a; if ($n -gt $net -and $n -lt $bc) { $seen[$a] = $mac }',
        '}',
        "$seen[$ip] = (($nic.GetPhysicalAddress().ToString() -split '(..)' | Where-Object { $_ }) -join '-')",
        "if (-not $seen.ContainsKey($gw)) { $seen[$gw] = '' }",
        'foreach ($a in $alive.Keys) { if (-not $seen.ContainsKey($a)) { $seen[$a] = "" } }',
        '$names = @{}',
        '$lookups = @{}',
        'foreach ($a in $seen.Keys) { try { $lookups[$a] = [System.Net.Dns]::GetHostEntryAsync($a) } catch {} }',
        'try { [System.Threading.Tasks.Task]::WaitAll(@($lookups.Values), 2500) | Out-Null } catch {}',
        'foreach ($a in $lookups.Keys) { $t = $lookups[$a]; if ($t.Status -eq "RanToCompletion") { $names[$a] = $t.Result.HostName } }',
        "foreach ($a in $seen.Keys) { 'DEV' + [char]9 + $a + [char]9 + $seen[$a] + [char]9 + [string]$names[$a] + [char]9 + [string]([bool]$alive[$a]) }",
    ].join('\r\n');
}

/**
 * Makers by the first three bytes of the hardware address: the common ones in
 * a home (routers, phones, TVs, printers, smart devices). Not every maker —
 * an unknown one is said as unknown, never guessed.
 */
const MAKERS: Record<string, string> = {
    '00:1A:11': 'Google', 'F4:F5:D8': 'Google', '3C:5A:B4': 'Google', 'D8:6C:63': 'Google',
    'F0:18:98': 'Apple', '3C:22:FB': 'Apple', 'A4:83:E7': 'Apple', 'AC:BC:32': 'Apple', 'BC:D0:74': 'Apple', 'F4:0F:24': 'Apple',
    '8C:F5:A3': 'Samsung', 'FC:A1:3E': 'Samsung', 'CC:07:AB': 'Samsung', '5C:49:7D': 'Samsung', 'E4:7D:BD': 'Samsung', '64:1C:AE': 'Samsung', 'BC:72:B1': 'Samsung',
    '50:C7:BF': 'TP-Link', 'F4:F2:6D': 'TP-Link', '98:DA:C4': 'TP-Link', 'A4:2B:B0': 'TP-Link', 'C0:06:C3': 'TP-Link', '60:32:B1': 'TP-Link',
    '28:6C:07': 'Xiaomi', '64:09:80': 'Xiaomi', '78:11:DC': 'Xiaomi', '7C:49:EB': 'Xiaomi', '50:EC:50': 'Xiaomi',
    '00:E0:FC': 'Huawei', '48:46:FB': 'Huawei', 'E0:24:7F': 'Huawei', '88:28:B3': 'Huawei', 'AC:E2:D3': 'Huawei',
    '24:0A:C4': 'Espressif (smart device)', '84:F3:EB': 'Espressif (smart device)', 'EC:FA:BC': 'Espressif (smart device)', 'A4:CF:12': 'Espressif (smart device)', '30:AE:A4': 'Espressif (smart device)', '68:57:2D': 'Tuya (smart device)',
    '44:65:0D': 'Amazon', 'F0:27:2D': 'Amazon', '74:C2:46': 'Amazon',
    '00:21:5A': 'HP', '3C:D9:2B': 'HP', '9C:B6:54': 'HP', 'A0:D3:C1': 'HP', '00:26:AB': 'Epson', '64:EB:8C': 'Epson', '00:80:77': 'Brother', '30:05:5C': 'Brother', '00:00:48': 'Epson', '00:1E:8F': 'Canon',
    'A8:23:FE': 'LG', 'CC:2D:8C': 'LG', '10:F9:6F': 'LG', 'B0:72:BF': 'Sony', '00:1D:BA': 'Sony',
    '3C:A0:67': 'TECNO / Transsion', 'C8:94:02': 'TECNO / Transsion', '04:E4:B6': 'TECNO / Transsion',
    '00:15:5D': 'Microsoft (virtual)', 'B8:27:EB': 'Raspberry Pi', 'DC:A6:32': 'Raspberry Pi', '00:1B:21': 'Intel', '3C:A9:F4': 'Intel', 'A4:C3:F0': 'Intel', '8C:16:45': 'Lenovo', '54:E1:AD': 'Lenovo',
    '00:1F:1F': 'Edimax', 'E4:8D:8C': 'MikroTik', '00:0C:42': 'MikroTik', '00:18:0A': 'Cisco Meraki', '74:83:C2': 'Ubiquiti', 'F0:9F:C2': 'Ubiquiti', '1C:3B:F3': 'ZTE', 'C8:64:C7': 'ZTE',
};

const norm = (mac: string) => String(mac || '').trim().toUpperCase().replace(/-/gu, ':');

/** A hardware address the device made up for this network (its second-lowest bit of the first byte set). */
export function isPrivateMac(mac: string): boolean {
    const m = norm(mac);
    if (!/^[0-9A-F]{2}:/u.test(m)) return false;
    return (parseInt(m.slice(0, 2), 16) & 0x02) === 0x02;
}

export function makerOf(mac: string): string {
    return MAKERS[norm(mac).slice(0, 8)] || '';
}

/** What it most likely is, from its name, its maker, and whether it is the router or this computer. */
export function kindOf(d: { name: string; maker: string; gateway: boolean; self: boolean; privateMac: boolean }): string {
    const n = d.name.toLowerCase();
    if (d.self) return 'this computer';
    if (d.gateway) return 'the router (the Wi-Fi itself)';
    if (/printer|epson|canon|brother|hp[-_ ]?(?:laser|office|deskjet|envy)|laserjet|officejet/u.test(n) || /^(?:Epson|Canon|Brother)$/u.test(d.maker)) return 'a printer';
    if (/tv|bravia|webos|tizen|android[-_ ]?tv|chromecast|firetv|fire-tv|roku|shield/u.test(n)) return 'a TV or streaming box';
    if (/iphone|ipad|android|galaxy|redmi|xiaomi|huawei|pixel|tecno|oppo|vivo|realme|oneplus|phone/u.test(n)) return 'a phone or tablet';
    if (/desktop|laptop|pc|macbook|imac|notebook|surface/u.test(n)) return 'a computer';
    if (/esp|tuya|smart|plug|bulb|cam|vacuum|robot|alexa|echo|nest|sonoff/u.test(n) || /smart device|Amazon/u.test(d.maker)) return 'a smart-home device';
    if (d.privateMac) return 'a phone, tablet or laptop (it hides its hardware address)';
    if (/Samsung|Apple|Xiaomi|Huawei|TECNO|Google/u.test(d.maker)) return 'probably a phone, tablet or TV';
    if (/TP-Link|MikroTik|Ubiquiti|ZTE|Edimax|Cisco/u.test(d.maker)) return 'network equipment (a repeater or access point)';
    if (/Intel|Lenovo|Microsoft/u.test(d.maker)) return 'probably a computer';
    return 'unknown';
}

export interface NetworkScan {
    ok: true;
    ip: string;
    gateway: string;
    adapter: string;
    network: string;
    /** The network's prefix length (24 for 255.255.255.0); 24 when an older scan did not say. */
    prefix: number;
    /** The address ranges that were pinged, «first-last». */
    swept: string[];
    devices: NetDevice[];
}

/** The script's lines, read. */
export function parseNetworkScan(out: string): NetworkScan | { ok: false; error: string } {
    const lines = String(out || '').split(/\r?\n/u).map(l => l.replace(/\r$/u, ''));
    if (lines.some(l => l.trim() === 'NONET')) return { ok: false, error: 'This computer is not on a network with a router right now.' };
    const net = lines.find(l => l.startsWith('NET\t'));
    if (!net) return { ok: false, error: 'The network could not be read.' };
    const [, ip, gateway, adapter, network, prefixText, sweptText] = net.split('\t');
    const p = Number(prefixText);
    const prefix = Number.isInteger(p) && p >= 1 && p <= 32 ? p : 24;
    const swept = String(sweptText || '').split(',').map(s => s.trim()).filter(s => /^\d+\.\d+\.\d+\.\d+-\d+\.\d+\.\d+\.\d+$/u.test(s));
    const devices: NetDevice[] = [];
    for (const l of lines.filter(x => x.startsWith('DEV\t'))) {
        const [, addr, mac, name, alive] = l.split('\t');
        if (!addr) continue;
        //  A name that is only the address again (no name on the network) is no name.
        const said = String(name || '').trim();
        const d = {
            ip: addr, mac: norm(mac), name: said === addr ? '' : said, alive: addr === ip || /true/iu.test(String(alive)),
            self: addr === ip, gateway: addr === gateway, maker: makerOf(mac), privateMac: isPrivateMac(mac), kind: '',
        };
        d.kind = kindOf(d);
        devices.push(d);
    }
    const key = (s: string) => s.split('.').map(n => n.padStart(3, '0')).join('.');
    devices.sort((a, b) => (a.gateway ? -1 : b.gateway ? 1 : a.self ? -1 : b.self ? 1 : key(a.ip).localeCompare(key(b.ip))));
    return { ok: true, ip, gateway, adapter: adapter || '', network: network || '', prefix, swept, devices };
}

/** How many device addresses a network of this prefix holds (its first and last are not devices). */
export function networkSize(prefix: number): number {
    return prefix >= 31 ? 2 ** (32 - prefix) : 2 ** (32 - prefix) - 2;
}

/**
 * Whose scan it is. «from»: the computer the scan ran on (Joe's own). «insteadOf»:
 * the linked computer the run had chosen with device_use, when it had one.
 */
export interface ScanSource { from?: string; insteadOf?: string }

/** What the run reads: whose network, how many, then each device with what it most likely is. */
export function describeNetwork(scan: { ip: string; gateway: string; network: string; devices: NetDevice[]; prefix?: number; swept?: string[] }, source: ScanSource = {}): string {
    const others = scan.devices.filter(d => !d.self);
    const lines = scan.devices.map(d => {
        const who = [d.name ? `«${d.name}»` : '', d.maker].filter(Boolean).join(', ');
        return `- ${d.ip}${who ? ` — ${who}` : ''} — ${d.kind}${d.alive ? '' : ' (seen recently, did not answer the ping now)'}`;
    });
    const from = String(source.from || '').trim();
    const insteadOf = String(source.insteadOf || '').trim();
    //  The owner chose another computer and asked for its Wi-Fi (2026-11-08): the scan ran on
    //  Joe's computer, so the answer says whose network it is, never passes it off as the other's.
    const whose = insteadOf
        ? `This scan is from Joe's computer${from ? ` «${from}»` : ''}, not from «${insteadOf}»: Joe cannot scan the network of a linked computer in this version. If «${insteadOf}» is on the same Wi-Fi, these are its neighbours too; if it is somewhere else, its network is not seen here. Say so to the owner.`
        : from ? `Scanned from «${from}», Joe's own computer.` : '';
    //  A network larger than a /24 (an office /22, a /16) is swept only around this computer and
    //  the router: a device elsewhere on it shows only when it talked to this computer recently.
    const prefix = Number(scan.prefix) || 24;
    const part = prefix < 24
        ? `This network is a /${prefix} (${networkSize(prefix).toLocaleString('en-US')} addresses); Joe pinged only ${scan.swept && scan.swept.length ? scan.swept.join(' and ') : 'the addresses around this computer and the router'}, so a device elsewhere on it is listed only if it talked to this computer recently: there may be more.`
        : '';
    return [
        ...(whose ? [whose] : []),
        `This computer is on «${scan.network || 'its network'}» at ${scan.ip}; the router is ${scan.gateway}.`,
        ...(part ? [part] : []),
        `${others.length} other device(s) on this network now (a device asleep or set not to answer may be missing):`,
        ...lines,
        'Joe can control, of these: computers the owner links (device_link_new, one line run once on each), and Android phones or TVs with Wireless debugging turned on (android_devices finds them). The others (printers, smart devices, the router) are listed only.',
    ].join('\n');
}
