/**
 * A PHONE ON THE CABLE THAT JOE CANNOT REACH, AND WHY.
 *
 * The owner, 2026-11-08: he plugged in his Samsung Galaxy Z Fold 6 and Joe
 * saw «no phone». Windows saw it: «younes's Z Fold 6» (its files) and its
 * debugging part «SAMSUNG_Android» — in Error, because Windows has no driver
 * for Samsung's debugging part (a TECNO announces a standard one Windows
 * knows by itself). Then he asked: «why doesn't Joe work with every phone?».
 *
 * Joe now reads what Windows sees on USB (Get-PnpDevice, read only), groups
 * each phone's parts, and says which of three it is: reachable, its debugging
 * part without a driver, or debugging turned off (only its files or charging).
 * And what to do — first the way that needs nothing installed and works with
 * every Android 11+ phone of every maker: Wireless debugging, paired with a
 * six-digit code; then the maker's driver, only with the owner's yes.
 */

export interface UsbPhone {
    /** What the owner calls it (the name its files show under: «younes's Z Fold 6»), else the maker's word. */
    name: string;
    maker: string;
    vid: string;
    /** reachable: the debugging part has its driver; no_driver: it is there without one; debugging_off: only files or charging. */
    state: 'reachable' | 'no_driver' | 'debugging_off';
}

/** USB vendor ids of the phone makers (the first four hex digits of VID_xxxx). */
const MAKERS: Record<string, string> = {
    '04E8': 'Samsung', '18D1': 'Google', '22B8': 'Motorola', '2717': 'Xiaomi', '12D1': 'Huawei', '0BB4': 'HTC',
    '1004': 'LG', '0FCE': 'Sony', '2A70': 'OnePlus', '05C6': 'Qualcomm-based', '0E8D': 'MediaTek-based (TECNO, Infinix, itel…)',
    '1782': 'Unisoc-based', '22D9': 'OPPO / realme', '2D95': 'vivo', '19D2': 'ZTE', '17EF': 'Lenovo', '0B05': 'ASUS',
    '2A45': 'Meizu', '1EBF': 'Coolpad', '29A9': 'Nothing', '2E04': 'HMD / Nokia', '1BBB': 'Alcatel / TCL', '091E': 'Garmin',
};

/** Reads every present USB device: status, class, name, instance id — one per line. Reads only. */
export function usbDevicesScript(): string {
    return [
        "$ErrorActionPreference = 'SilentlyContinue'",
        'try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}',
        "Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -like 'USB\\*' } | ForEach-Object { \"USB`t$($_.Status)`t$($_.Class)`t$($_.FriendlyName)`t$($_.InstanceId)\" }",
    ].join('\n');
}

/** The phones among the USB devices, each phone's parts grouped by its vendor, product and port. */
export function parseUsbPhones(stdout: string): UsbPhone[] {
    const groups = new Map<string, Array<{ status: string; cls: string; name: string; id: string }>>();
    for (const line of String(stdout || '').split(/\r?\n/u)) {
        const [tag, status, cls, name, id] = line.split('\t');
        if (tag !== 'USB' || !id) continue;
        const m = /^USB\\VID_([0-9A-F]{4})&PID_([0-9A-F]{4})(?:&MI_[0-9A-F]{2})?\\(.+)$/iu.exec(id.trim());
        if (!m) continue;
        //  The parts of one phone share vendor, product and the port path before their last «&000x».
        const port = m[3].replace(/&[0-9A-F]{4}$/iu, '');
        const key = `${m[1].toUpperCase()}:${m[2].toUpperCase()}:${/&MI_/iu.test(id) ? port : m[3]}`;
        (groups.get(key) || groups.set(key, []).get(key)!).push({ status: (status || '').trim(), cls: (cls || '').trim(), name: (name || '').trim(), id: id.trim() });
    }
    //  A composite parent («USB Composite Device», no interface) joins its interfaces by vendor and product.
    const phones: UsbPhone[] = [];
    const seen = new Set<string>();
    for (const [key, parts] of groups) {
        const [vid, pid] = key.split(':');
        const all = [...groups.entries()].filter(([k]) => k.startsWith(`${vid}:${pid}:`)).flatMap(([, p]) => p);
        if (seen.has(`${vid}:${pid}`)) continue;
        const adb = all.filter(p => /\badb\b|android/iu.test(p.name) && !/composite device/iu.test(p.name));
        const files = all.find(p => /^(?:WPD|Portable ?Devices)$/iu.test(p.cls) || /\bMTP\b/iu.test(p.name));
        if (!adb.length && !files) continue;
        seen.add(`${vid}:${pid}`);
        const reachable = adb.some(p => /^OK$/iu.test(p.status) && /\badb\b/iu.test(p.name));
        const state: UsbPhone['state'] = reachable ? 'reachable' : adb.length ? 'no_driver' : 'debugging_off';
        const maker = MAKERS[vid] || `maker ${vid}`;
        const name = (files && !/^(?:MTP USB Device|SAMSUNG_Android)$/iu.test(files.name) ? files.name : '') || `${maker} phone`;
        void parts;
        phones.push({ name, maker, vid, state });
    }
    return phones;
}

/** For the run and the owner: each phone on the cable that Joe cannot reach, why, and what to do. */
export function describeUnreachablePhones(phones: UsbPhone[]): string {
    const blocked = phones.filter(p => p.state !== 'reachable');
    if (!blocked.length) return '';
    const lines = blocked.map(p => p.state === 'no_driver'
        ? `- «${p.name}» (${p.maker}) is on the cable with USB debugging ON, but Windows has no driver for its debugging part (it shows as an error), so Joe cannot reach it by cable. This is Windows, not the phone: ${p.maker === 'Samsung' ? 'Samsung uses its own driver' : 'this maker uses its own driver'}, while some makers (TECNO…) use one Windows knows by itself.`
        : `- «${p.name}» (${p.maker}) is on the cable, but only its files or charging show: USB debugging is OFF on it, or it was not allowed on this computer.`);
    return [
        'PHONES ON THE CABLE THAT JOE CANNOT REACH (read off Windows; say this to the owner plainly, in his language):',
        ...lines,
        'The way that needs nothing installed and works with every Android 11+ phone of every maker: Wireless debugging. On the phone: Settings › Developer options › Wireless debugging › turn it on › «Pair device with pairing code»; the phone and this computer on the same Wi-Fi. He tells Joe the six digits, and android_pair then android_connect do the rest (android_devices shows the pairing address). If Developer options is hidden: Settings › About phone › Software information › tap «Build number» seven times.',
        'The other way, for the cable: the maker\'s USB driver installed on this computer (Samsung: «Samsung Android USB Driver»; others: «Google USB Driver») — a download and an install on his computer, done only with his clear yes.',
        'With debugging off: Settings › Developer options › USB debugging › on, then «Allow» on the phone when it asks about this computer.',
    ].join('\n');
}
