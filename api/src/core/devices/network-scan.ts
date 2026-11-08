/**
 * THE DEVICES ON THE OWNER'S WI-FI, SEEN FROM THIS COMPUTER.
 *
 * The owner, 2026-11-08: «are there devices on the same Wi-Fi?» was answered
 * with instructions to type `arp -a` himself, and «check how many devices are
 * on the Wi-Fi» counted the one robot vacuum in a smart-home app on his
 * phone. Joe runs on a computer on that Wi-Fi: it can look itself.
 *
 * One PowerShell run (through Joe's gateway, like every desktop action):
 * the network this computer is on, a quick ping of every address in its
 * /24 (so the neighbour table fills), then the neighbour table itself — each
 * address with its hardware address — and the names the network gives them.
 * The hardware address says the maker (a short table of the common ones), or
 * that the device hides it (a phone or laptop with a private address); the
 * name and the maker together guess what it is. Nothing is sent to any
 * device beyond a ping.
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

/** The PowerShell that looks: one line per device, tab-separated. */
export function networkScanScript(): string {
    return [
        "$ErrorActionPreference = 'SilentlyContinue'",
        //  The interface with a default gateway, read from .NET directly: Get-NetIPConfiguration
        //  took 32 of the scan's 40 seconds on the owner's laptop (it resolves names on the way).
        '$nic = $null; $gw = $null',
        'foreach ($n in [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {',
        "  if ($n.OperationalStatus -ne 'Up') { continue }",
        "  $g = @($n.GetIPProperties().GatewayAddresses | Where-Object { $_.Address.AddressFamily -eq 'InterNetwork' -and $_.Address.ToString() -ne '0.0.0.0' })",
        '  if ($g.Count) { $nic = $n; $gw = $g[0].Address.ToString(); break }',
        '}',
        "if (-not $nic) { 'NONET'; exit }",
        "$ip = @($nic.GetIPProperties().UnicastAddresses | Where-Object { $_.Address.AddressFamily -eq 'InterNetwork' })[0].Address.ToString()",
        '$if = $nic.GetIPProperties().GetIPv4Properties().Index',
        "$base = ($ip -split '\\.')[0..2] -join '.'",
        "'NET' + [char]9 + $ip + [char]9 + $gw + [char]9 + $nic.Name + [char]9 + $(try { (Get-NetConnectionProfile -InterfaceIndex $if).Name } catch { '' })",
        '$tasks = @(1..254 | ForEach-Object { try { (New-Object System.Net.NetworkInformation.Ping).SendPingAsync("$base.$_", 500) } catch { $null } })',
        'try { [System.Threading.Tasks.Task]::WaitAll(@($tasks | Where-Object { $_ }), 4000) | Out-Null } catch {}',
        '$alive = @{}',
        'for ($i = 0; $i -lt $tasks.Count; $i++) { $t = $tasks[$i]; if ($t -and $t.Status -eq "RanToCompletion" -and $t.Result.Status -eq "Success") { $alive["$base.$($i + 1)"] = $true } }',
        '$seen = @{}',
        'Get-NetNeighbor -AddressFamily IPv4 -InterfaceIndex $if | Where-Object { $_.IPAddress -like "$base.*" -and $_.State -ne "Unreachable" -and $_.LinkLayerAddress -and $_.LinkLayerAddress -notmatch "^(00-00-00-00-00-00|FF-FF-FF-FF-FF-FF|01-00-5E)" } | ForEach-Object { $seen[$_.IPAddress] = $_.LinkLayerAddress }',
        "$seen[$ip] = (($nic.GetPhysicalAddress().ToString() -split '(..)' | Where-Object { $_ }) -join '-')",
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

/** The script's lines, read. */
export function parseNetworkScan(out: string): { ok: true; ip: string; gateway: string; adapter: string; network: string; devices: NetDevice[] } | { ok: false; error: string } {
    const lines = String(out || '').split(/\r?\n/u).map(l => l.replace(/\r$/u, ''));
    if (lines.some(l => l.trim() === 'NONET')) return { ok: false, error: 'This computer is not on a network with a router right now.' };
    const net = lines.find(l => l.startsWith('NET\t'));
    if (!net) return { ok: false, error: 'The network could not be read.' };
    const [, ip, gateway, adapter, network] = net.split('\t');
    const devices: NetDevice[] = [];
    for (const l of lines.filter(x => x.startsWith('DEV\t'))) {
        const [, addr, mac, name, alive] = l.split('\t');
        if (!addr) continue;
        //  A name that is only the address again (no name on the network) is no name.
        const said = String(name || '').trim();
        const d = {
            ip: addr, mac: norm(mac), name: said === addr ? '' : said, alive: /true/iu.test(String(alive)),
            self: addr === ip, gateway: addr === gateway, maker: makerOf(mac), privateMac: isPrivateMac(mac), kind: '',
        };
        d.kind = kindOf(d);
        devices.push(d);
    }
    const key = (s: string) => s.split('.').map(n => n.padStart(3, '0')).join('.');
    devices.sort((a, b) => (a.gateway ? -1 : b.gateway ? 1 : a.self ? -1 : b.self ? 1 : key(a.ip).localeCompare(key(b.ip))));
    return { ok: true, ip, gateway, adapter: adapter || '', network: network || '', devices };
}

/** What the run reads: how many, then each device with what it most likely is. */
export function describeNetwork(scan: { ip: string; gateway: string; network: string; devices: NetDevice[] }): string {
    const others = scan.devices.filter(d => !d.self);
    const lines = scan.devices.map(d => {
        const who = [d.name ? `«${d.name}»` : '', d.maker].filter(Boolean).join(', ');
        return `- ${d.ip}${who ? ` — ${who}` : ''} — ${d.kind}${d.alive ? '' : ' (seen recently, did not answer the ping now)'}`;
    });
    return [
        `This computer is on «${scan.network || 'its network'}» at ${scan.ip}; the router is ${scan.gateway}.`,
        `${others.length} other device(s) on this network now (a device asleep or set not to answer may be missing):`,
        ...lines,
        'Joe can control, of these: computers the owner links (device_link_new, one line run once on each), and Android phones or TVs with Wireless debugging turned on (android_devices finds them). The others (printers, smart devices, the router) are listed only.',
    ].join('\n');
}
