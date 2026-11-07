/**
 * ANDROID: THE OWNER'S PHONE, WORKED THE WAY JOE WORKS A WINDOW.
 *
 * Through adb, Google's own bridge (platform-tools). The phone is plugged in
 * by cable, or paired over Wi-Fi (Android 11+, «Wireless debugging»), and the
 * owner allowed this computer on the phone's own prompt: nothing here goes
 * around that consent.
 *
 *   - devices:  `adb devices -l`
 *   - read:     `uiautomator dump` → every node with its text, description,
 *               id, class, bounds and what it can do, numbered like a
 *               window's controls (windows-desktop.ts UiControl)
 *   - look:     `exec-out screencap -p` → a PNG of the screen
 *   - act:      tap the centre of a numbered control or a point, swipe,
 *               key events (back, home, enter…), open an app by package
 *   - type:     ASCII through `input text`; any other script (Arabic) through
 *               the ADB Keyboard app when it is installed, else said plainly
 *
 * Every command runs through the runner the caller gives (Joe's gateway), as
 * an argv, never a shell string.
 */
export type AdbRunner = (args: string[], opts?: { timeoutMs?: number }) => Promise<{ code: number | null; stdout: string; stderr: string }>;

export interface AndroidDevice { serial: string; state: string; model: string; product: string; transport: string }

export interface AndroidControl {
    index: number;
    kind: string;
    text: string;
    description: string;
    id: string;
    packageName: string;
    x: number; y: number; width: number; height: number;
    clickable: boolean; scrollable: boolean; editable: boolean; checked: boolean | null; enabled: boolean; focused: boolean;
}

/** `adb devices -l` → the phones, with their state (device | unauthorized | offline). */
export function parseDevices(out: string): AndroidDevice[] {
    const devices: AndroidDevice[] = [];
    for (const raw of String(out || '').split(/\r?\n/u)) {
        const line = raw.trim();
        if (!line || /^List of devices/u.test(line) || /^\*/u.test(line)) continue;
        const [serial, state, ...rest] = line.split(/\s+/u);
        if (!serial || !state) continue;
        const field = (k: string) => (rest.find(r => r.startsWith(`${k}:`)) || '').slice(k.length + 1);
        devices.push({ serial, state, model: field('model').replace(/_/gu, ' '), product: field('product'), transport: field('transport_id') });
    }
    return devices;
}

const ATTR = /([\w-]+)="([^"]*)"/gu;
const unescapeXml = (s: string) => s.replace(/&lt;/gu, '<').replace(/&gt;/gu, '>').replace(/&quot;/gu, '"').replace(/&apos;/gu, "'").replace(/&#(\d+);/gu, (_m, d) => String.fromCodePoint(Number(d))).replace(/&amp;/gu, '&');

/**
 * A uiautomator dump → the controls worth naming: those with text, a
 * description, or something they can do. Numbered in screen order from 1.
 */
export function parseUiDump(xml: string): AndroidControl[] {
    const controls: AndroidControl[] = [];
    for (const m of String(xml || '').matchAll(/<node\b([^>]*)\/?>/gu)) {
        const a: Record<string, string> = {};
        for (const [, k, v] of m[1].matchAll(ATTR)) a[k] = unescapeXml(v);
        const b = (a.bounds || '').match(/\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/u);
        if (!b) continue;
        const [x1, y1, x2, y2] = b.slice(1).map(Number);
        if (x2 <= x1 || y2 <= y1) continue;
        const kind = String(a.class || '').split('.').pop() || 'View';
        const clickable = a.clickable === 'true' || a['long-clickable'] === 'true';
        const editable = /EditText|AutoCompleteTextView/u.test(a.class || '');
        const scrollable = a.scrollable === 'true';
        const checkable = a.checkable === 'true';
        const text = a.text || '', description = a['content-desc'] || '';
        if (!text && !description && !clickable && !editable && !scrollable && !checkable) continue;
        controls.push({
            index: controls.length + 1, kind, text, description,
            id: (a['resource-id'] || '').replace(/^.*:id\//u, ''), packageName: a.package || '',
            x: x1, y: y1, width: x2 - x1, height: y2 - y1,
            clickable, scrollable, editable, checked: checkable ? a.checked === 'true' : null,
            enabled: a.enabled !== 'false', focused: a.focused === 'true',
        });
    }
    return controls;
}

/** The controls as the model reads them: one line each, with what it can do. */
export function describeAndroid(controls: AndroidControl[]): string {
    if (!controls.length) return 'The screen shows no control uiautomator can name (a game or a video?): use android_look and tap a point.';
    return controls.map(c => {
        const name = c.text || c.description;
        const can = [c.clickable ? 'tap' : '', c.editable ? 'type' : '', c.scrollable ? 'scroll' : '', c.checked !== null ? (c.checked ? 'checked' : 'unchecked') : ''].filter(Boolean).join(', ');
        return `[${c.index}] ${c.kind} «${name}»${c.id ? ` #${c.id}` : ''}${can ? ` (${can})` : ''}${c.enabled ? '' : ' (disabled)'} at ${Math.round(c.x + c.width / 2)},${Math.round(c.y + c.height / 2)}`;
    }).join('\n');
}

const KEYS: Record<string, number> = {
    home: 3, back: 4, call: 5, endcall: 6, up: 19, down: 20, left: 21, right: 22, center: 23, volumeup: 24, volumedown: 25,
    power: 26, camera: 27, tab: 61, space: 62, enter: 66, delete: 67, backspace: 67, menu: 82, search: 84, recent: 187, apps: 187,
    //  The owner's phone, 2026-11-07: its screen had gone to sleep, and power
    //  toggles — a second press puts it back to sleep. wakeup only wakes.
    wakeup: 224, wake: 224, sleep: 223,
};

/**
 * WHETHER THE SCREEN IS ON, AND WHETHER THE PHONE IS LOCKED.
 *
 * The owner's phone, 2026-11-07: «what is on my screen?» came back as an
 * all-black picture, because the screen had gone to sleep, and the run could
 * only say «the picture is black». Read from `dumpsys power` (mWakefulness)
 * and `dumpsys window` (isKeyguardShowing); null when the phone did not say.
 */
export interface ScreenState { awake: boolean | null; locked: boolean | null; secure: boolean | null }

export function parseScreenState(power: string, window: string): ScreenState {
    const w = String(power || '').match(/mWakefulness=(\w+)/u)?.[1];
    const win = String(window || '');
    //  `dumpsys window policy` says it under KeyguardServiceDelegate; the full dump as isKeyguardShowing.
    const delegate = win.split(/KeyguardServiceDelegate/u)[1] || '';
    const k = win.match(/isKeyguardShowing=(true|false)/u)?.[1] ?? delegate.match(/^\s*showing=(true|false)/mu)?.[1];
    const sec = delegate.match(/^\s*secure=(true|false)/mu)?.[1];
    return { awake: w ? w === 'Awake' : null, locked: k ? k === 'true' : null, secure: sec ? sec === 'true' : null };
}

/** What the run is told about the screen before the controls or the picture. */
export function describeScreen(s: ScreenState): string {
    const lines: string[] = [];
    if (s.awake === false) lines.push('The phone\'s screen is OFF (asleep), so a picture of it is black: android_key "wakeup" turns it on (never "power", which turns it off again).');
    if (s.locked === true) {
        lines.push(s.secure === false
            ? 'The phone is on its lock screen with no PIN: a swipe up (android_scroll "down") opens it.'
            : 'The phone is LOCKED with a PIN, pattern or password. The quick settings (android_panel "quick_settings": flashlight, Wi-Fi, Bluetooth, airplane mode…) and the notifications work on the lock screen; anything else needs the owner to unlock the phone himself. Never type a PIN, pattern or password.');
    }
    return lines.join('\n');
}

/** The phone's pull-down panels, opened the way the status bar opens them. */
export const PANELS: Record<string, string[]> = {
    quick_settings: ['cmd', 'statusbar', 'expand-settings'],
    notifications: ['cmd', 'statusbar', 'expand-notifications'],
    close: ['cmd', 'statusbar', 'collapse'],
};

/** A key name → its Android key code, or null. */
export function androidKey(name: string): number | null {
    const k = String(name || '').trim().toLowerCase().replace(/[\s_-]/gu, '');
    return KEYS[k] ?? null;
}

/**
 * Text `input text` can carry: printable ASCII, with a space as %s and the
 * shell's own characters escaped (adb passes it through `sh -c` on the phone).
 * Null for anything else, which goes through the ADB Keyboard instead.
 */
export function inputTextArg(text: string): string | null {
    if (!/^[\x20-\x7e]*$/u.test(text)) return null;
    return text.replace(/([\\'"`$&|;<>()*?!#~\[\]{}])/gu, '\\$1').replace(/ /gu, '%s');
}

export const ADB_KEYBOARD = 'com.android.adbkeyboard/.AdbIME';

/* ───────────── phones on Wi-Fi (Android 11+, «Wireless debugging») ───────────── */

export interface WifiPhone { name: string; kind: 'pair' | 'connect'; address: string }

/**
 * `adb mdns services` → the phones on this network that announce Wireless
 * debugging: «pair» while the phone shows its pairing code, «connect» once
 * this computer is allowed.
 */
export function parseMdns(out: string): WifiPhone[] {
    const phones: WifiPhone[] = [];
    for (const raw of String(out || '').split(/\r?\n/u)) {
        const m = raw.trim().match(/^(\S+)\s+_adb-tls-(pairing|connect)\._tcp\.?\s+(\d{1,3}(?:\.\d{1,3}){3}:\d{2,5})$/u);
        if (m) phones.push({ name: m[1], kind: m[2] === 'pairing' ? 'pair' : 'connect', address: m[3] });
    }
    return phones;
}

const ADDRESS = /^\d{1,3}(?:\.\d{1,3}){3}:\d{2,5}$/u;

/** Pairs this computer with a phone, by the six digits the phone shows under «Pair device with pairing code». */
export async function pairPhone(adb: AdbRunner, address: string, code: string): Promise<{ ok: boolean; error?: string }> {
    if (!ADDRESS.test(address)) return { ok: false, error: `«${address}» is not the address the phone shows (like 192.168.1.40:41235)` };
    if (!/^\d{6}$/u.test(code)) return { ok: false, error: 'the pairing code is the six digits the phone shows' };
    const r = await adb(['pair', address, code], { timeoutMs: 30_000 });
    return /Successfully paired/iu.test(r.stdout) ? { ok: true } : { ok: false, error: (r.stdout || r.stderr || 'pairing failed').trim() };
}

/** Connects to a phone this computer is paired with, at the address its Wireless debugging screen shows. */
export async function connectPhone(adb: AdbRunner, address: string): Promise<{ ok: boolean; error?: string }> {
    if (!ADDRESS.test(address)) return { ok: false, error: `«${address}» is not the address the phone shows (like 192.168.1.40:37011)` };
    const r = await adb(['connect', address], { timeoutMs: 30_000 });
    return /connected to|already connected/iu.test(r.stdout) && !/failed|cannot|unable/iu.test(r.stdout) ? { ok: true } : { ok: false, error: (r.stdout || r.stderr || 'the phone did not answer').trim() };
}

export class AndroidPhone {
    constructor(private readonly adb: AdbRunner, readonly serial: string) { }

    private run(args: string[], opts?: { timeoutMs?: number }) {
        return this.adb(['-s', this.serial, ...args], opts);
    }

    /** Whether the screen is on (one light question), or null when the phone did not say. */
    async awake(): Promise<boolean | null> {
        const power = await this.run(['shell', 'dumpsys', 'power'], { timeoutMs: 15_000 });
        return parseScreenState(power.stdout, '').awake;
    }

    /** Whether the screen is on and the phone locked. */
    async screen(): Promise<ScreenState> {
        const power = await this.run(['shell', 'dumpsys', 'power'], { timeoutMs: 15_000 });
        const window = await this.run(['shell', 'dumpsys', 'window', 'policy'], { timeoutMs: 15_000 });
        let state = parseScreenState(power.stdout, window.stdout);
        if (state.locked === null) {
            //  Some builds keep the keyguard out of «policy».
            const all = parseScreenState('', (await this.run(['shell', 'dumpsys', 'window'], { timeoutMs: 20_000 })).stdout);
            state = { ...state, locked: all.locked, secure: state.secure ?? all.secure };
        }
        return state;
    }

    /** Opens the quick settings or the notifications, or closes them. */
    async panel(which: string): Promise<{ ok: boolean; error?: string }> {
        const args = PANELS[String(which || '').trim().toLowerCase().replace(/[\s-]/gu, '_')];
        if (!args) return { ok: false, error: `«${which}» is not a panel: ${Object.keys(PANELS).join(', ')}` };
        const r = await this.run(['shell', ...args]);
        return r.code === 0 && !/Unknown command|Exception|not allowed/iu.test(`${r.stdout}${r.stderr}`) ? { ok: true } : { ok: false, error: (r.stderr || r.stdout || 'the panel did not open').trim() };
    }

    async read(): Promise<{ ok: true; controls: AndroidControl[] } | { ok: false; error: string }> {
        const dump = await this.run(['shell', 'uiautomator', 'dump', '/sdcard/joe-ui.xml'], { timeoutMs: 30_000 });
        if (dump.code !== 0) return { ok: false, error: (dump.stderr || dump.stdout || 'uiautomator dump failed').trim() };
        const cat = await this.run(['exec-out', 'cat', '/sdcard/joe-ui.xml'], { timeoutMs: 20_000 });
        if (cat.code !== 0 || !/<hierarchy/u.test(cat.stdout)) return { ok: false, error: (cat.stderr || 'the screen could not be read').trim() };
        return { ok: true, controls: parseUiDump(cat.stdout) };
    }

    /**
     * A picture of the phone's screen, kept in `file` on this computer. Taken
     * on the phone and pulled as a file, so no binary ever travels through a
     * text pipe (a runner that reads output as text would break the PNG).
     */
    async look(file: string, readFile: (f: string) => Buffer): Promise<{ ok: true; png: Buffer } | { ok: false; error: string }> {
        const shot = await this.run(['shell', 'screencap', '-p', '/sdcard/joe-shot.png'], { timeoutMs: 30_000 });
        if (shot.code !== 0) return { ok: false, error: (shot.stderr || 'the phone took no picture').trim() };
        const pull = await this.run(['pull', '/sdcard/joe-shot.png', file], { timeoutMs: 60_000 });
        if (pull.code !== 0) return { ok: false, error: (pull.stderr || 'the picture did not come over').trim() };
        let png: Buffer;
        try { png = readFile(file); } catch { return { ok: false, error: 'the picture did not come over' }; }
        if (png.subarray(1, 4).toString() !== 'PNG') return { ok: false, error: 'what came over is not a picture' };
        return { ok: true, png };
    }

    async tap(x: number, y: number): Promise<{ ok: boolean; error?: string }> {
        const r = await this.run(['shell', 'input', 'tap', String(Math.round(x)), String(Math.round(y))]);
        return r.code === 0 ? { ok: true } : { ok: false, error: (r.stderr || 'the tap failed').trim() };
    }

    async swipe(x1: number, y1: number, x2: number, y2: number, ms = 300): Promise<{ ok: boolean; error?: string }> {
        const r = await this.run(['shell', 'input', 'swipe', ...[x1, y1, x2, y2, ms].map(n => String(Math.round(n)))]);
        return r.code === 0 ? { ok: true } : { ok: false, error: (r.stderr || 'the swipe failed').trim() };
    }

    async key(name: string): Promise<{ ok: boolean; error?: string }> {
        const code = androidKey(name);
        if (code === null) return { ok: false, error: `«${name}» is not a key Joe knows on Android: ${Object.keys(KEYS).join(', ')}` };
        const r = await this.run(['shell', 'input', 'keyevent', String(code)]);
        return r.code === 0 ? { ok: true } : { ok: false, error: (r.stderr || 'the key failed').trim() };
    }

    /** Types where the phone's cursor is. Arabic and other scripts need the ADB Keyboard. */
    async type(text: string): Promise<{ ok: boolean; error?: string }> {
        const ascii = inputTextArg(text);
        if (ascii !== null) {
            const r = await this.run(['shell', 'input', 'text', ascii]);
            return r.code === 0 ? { ok: true } : { ok: false, error: (r.stderr || 'typing failed').trim() };
        }
        const ime = await this.run(['shell', 'ime', 'list', '-s']);
        if (!ime.stdout.includes(ADB_KEYBOARD)) {
            return { ok: false, error: 'This text is not plain ASCII, and Android types that only through a keyboard app: install «ADB Keyboard» (com.android.adbkeyboard) on the phone once, and Joe types Arabic and every other script.' };
        }
        const current = (await this.run(['shell', 'settings', 'get', 'secure', 'default_input_method'])).stdout.trim();
        if (current !== ADB_KEYBOARD) await this.run(['shell', 'ime', 'set', ADB_KEYBOARD]);
        const r = await this.run(['shell', 'am', 'broadcast', '-a', 'ADB_INPUT_B64', '--es', 'msg', Buffer.from(text, 'utf8').toString('base64')]);
        //  The owner's own keyboard comes back.
        if (current && current !== ADB_KEYBOARD) await this.run(['shell', 'ime', 'set', current]);
        return r.code === 0 && /result=0|Broadcast completed/u.test(r.stdout) ? { ok: true } : { ok: false, error: (r.stderr || r.stdout || 'typing failed').trim() };
    }

    /** Opens an app by its package name (com.whatsapp, com.android.chrome…). */
    async open(pkg: string): Promise<{ ok: boolean; error?: string }> {
        if (!/^[A-Za-z][\w]*(\.[A-Za-z_][\w]*)+$/u.test(pkg)) return { ok: false, error: `«${pkg}» is not an Android package name (like com.android.chrome): android_apps lists them.` };
        const r = await this.run(['shell', 'monkey', '-p', pkg, '-c', 'android.intent.category.LAUNCHER', '1']);
        return r.code === 0 && !/No activities found/u.test(r.stdout) ? { ok: true } : { ok: false, error: (r.stderr || r.stdout || 'the app did not open').trim() };
    }

    /** The apps the owner installed (third-party packages). */
    async apps(): Promise<string[]> {
        const r = await this.run(['shell', 'pm', 'list', 'packages', '-3']);
        return r.stdout.split(/\r?\n/u).map(l => l.replace(/^package:/u, '').trim()).filter(Boolean).sort();
    }
}
