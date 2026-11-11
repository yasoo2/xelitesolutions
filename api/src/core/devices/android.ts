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
import crypto from 'crypto';

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

/** A PNG that ends where a PNG ends: its last chunk is IEND. A cut-short file is not. */
export function pngComplete(png: Buffer): boolean {
    return png.length > 20 && png.subarray(1, 4).toString('latin1') === 'PNG'
        && png.subarray(png.length - 8, png.length - 4).toString('latin1') === 'IEND';
}

export class AndroidPhone {
    /** pause: injectable, so a test does not wait for the keyboard to bind. */
    constructor(private readonly adb: AdbRunner, readonly serial: string, private readonly pause: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms))) { }

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

    /**
     * Opens the quick settings or the notifications, or closes them.
     *
     * ON A LOCKED PHONE THE PIN PAD IS CLOSED FIRST. The owner's TECNO, 2026-11-08:
     * the lock screen showed its PIN pad, and over it the panel never opened —
     * while this said it had: «شغل الكشاف» read the PIN pad twice, found no
     * flashlight and asked him to unlock. One «back» on a locked phone closes the
     * pad and only the pad (the phone stays locked; nothing opens); the panel
     * then opens over the lock screen. Measured on the TECNO: Wi-Fi, Bluetooth
     * and the flashlight tiles shown, the phone still locked.
     */
    async panel(which: string): Promise<{ ok: boolean; error?: string }> {
        const name = String(which || '').trim().toLowerCase().replace(/[\s-]/gu, '_');
        const args = PANELS[name];
        if (!args) return { ok: false, error: `«${which}» is not a panel: ${Object.keys(PANELS).join(', ')}` };
        if (name !== 'close' && (await this.screen().catch(() => null))?.locked === true) {
            await this.run(['shell', 'input', 'keyevent', 'KEYCODE_BACK']);
            await this.pause(700);
        }
        const r = await this.run(['shell', ...args]);
        return r.code === 0 && !/Unknown command|Exception|not allowed/iu.test(`${r.stdout}${r.stderr}`) ? { ok: true } : { ok: false, error: (r.stderr || r.stdout || 'the panel did not open').trim() };
    }

    async read(): Promise<{ ok: true; controls: AndroidControl[] } | { ok: false; error: string }> {
        //  Its own file on the phone, like look(): two readers at once never share one.
        const remote = `/sdcard/joe-ui-${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}.xml`;
        const dump = await this.run(['shell', 'uiautomator', 'dump', remote], { timeoutMs: 30_000 });
        //  «UI hierchary dumped to: …» is a success even when the exit code is not 0: the owner's
        //  Gmail run (2026-11-08) was refused a read that had worked, and tapped by guess after it.
        if (dump.code !== 0 && !/dumped to/iu.test(`${dump.stdout}${dump.stderr}`)) return { ok: false, error: (dump.stderr || dump.stdout || 'uiautomator dump failed').trim() };
        const cat = await this.run(['exec-out', 'cat', remote], { timeoutMs: 20_000 });
        await this.run(['shell', 'rm', '-f', remote], { timeoutMs: 10_000 }).catch(() => null);
        if (cat.code !== 0 || !/<hierarchy/u.test(cat.stdout)) return { ok: false, error: (cat.stderr || 'the screen could not be read').trim() };
        return { ok: true, controls: parseUiDump(cat.stdout) };
    }

    /**
     * A picture of the phone's screen, kept in `file` on this computer. Taken
     * on the phone and pulled as a file, so no binary ever travels through a
     * text pipe (a runner that reads output as text would break the PNG).
     */
    async look(file: string, readFile: (f: string) => Buffer): Promise<{ ok: true; png: Buffer } | { ok: false; error: string }> {
        /*
         * ONE FILE ON THE PHONE PER PICTURE, AND A PICTURE IS WHOLE OR NOTHING.
         *
         * The owner's phone, 2026-11-08: the live preview and Joe's own look
         * took a picture into the same /sdcard file at the same moment; Joe
         * pulled a half-written PNG, the model refused it («Could not process
         * image») three times, and a run that had done all it was asked
         * failed. Each picture now has its own file on the phone (removed
         * after), and a PNG without its end (IEND) is taken again, once.
         */
        let last = 'the phone took no picture';
        for (let attempt = 0; attempt < 2; attempt++) {
            const remote = `/sdcard/joe-shot-${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}.png`;
            const shot = await this.run(['shell', 'screencap', '-p', remote], { timeoutMs: 30_000 });
            if (shot.code !== 0) return { ok: false, error: (shot.stderr || 'the phone took no picture').trim() };
            const pull = await this.run(['pull', remote, file], { timeoutMs: 60_000 });
            await this.run(['shell', 'rm', '-f', remote], { timeoutMs: 10_000 }).catch(() => null);
            if (pull.code !== 0) return { ok: false, error: (pull.stderr || 'the picture did not come over').trim() };
            let png: Buffer;
            try { png = readFile(file); } catch { last = 'the picture did not come over'; continue; }
            if (png.subarray(1, 4).toString() !== 'PNG') { last = 'what came over is not a picture'; continue; }
            if (!pngComplete(png)) { last = 'the picture came over cut short'; continue; }
            return { ok: true, png };
        }
        return { ok: false, error: last };
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
            /*
             * Installed is not enabled: Android lists a keyboard app among the
             * enabled ones only once it is turned on (the owner's phone,
             * 2026-11-08, right after the install). Joe turns it on himself;
             * the owner's own keyboard stays his default.
             */
            const all = await this.run(['shell', 'ime', 'list', '-a', '-s']);
            if (!all.stdout.includes(ADB_KEYBOARD)) {
                return { ok: false, error: 'This text is not plain ASCII, and Android types that only through a keyboard app: install «ADB Keyboard» (com.android.adbkeyboard) on the phone once, and Joe types Arabic and every other script.' };
            }
            const on = await this.run(['shell', 'ime', 'enable', ADB_KEYBOARD]);
            if (on.code !== 0) return { ok: false, error: `the ADB Keyboard is installed but could not be turned on: ${(on.stderr || on.stdout).trim()}` };
        }
        let current = (await this.run(['shell', 'settings', 'get', 'secure', 'default_input_method'])).stdout.trim();
        if (current === ADB_KEYBOARD) {
            //  Left on the ADB Keyboard by a run cut in the middle of typing (a restart):
            //  the owner's keyboard is the first other enabled one, and it comes back after.
            const enabled = (await this.run(['shell', 'ime', 'list', '-s'])).stdout.split(/\r?\n/u).map(l => l.trim()).filter(Boolean);
            current = enabled.find(k => k !== ADB_KEYBOARD && !/voice|tts|autofill/iu.test(k)) || '';
        }
        if (current !== ADB_KEYBOARD) {
            await this.run(['shell', 'ime', 'set', ADB_KEYBOARD]);
            //  The keyboard binds to the field it is set on before it can type there.
            await this.pause(500);
        }
        const r = await this.run(['shell', 'am', 'broadcast', '-a', 'ADB_INPUT_B64', '--es', 'msg', Buffer.from(text, 'utf8').toString('base64')]);
        //  The owner's own keyboard comes back, once the text is in.
        if (current && current !== ADB_KEYBOARD) { await this.pause(300); await this.run(['shell', 'ime', 'set', current]); }
        return r.code === 0 && /result=0|Broadcast completed/u.test(r.stdout) ? { ok: true } : { ok: false, error: (r.stderr || r.stdout || 'typing failed').trim() };
    }

    /*
     * EMPTY THE FIELD THE CURSOR IS IN.
     *
     * The owner, 2026-11-08: Joe typed «تجربة جو» into Gmail's «To» field with
     * the address, then could not take it out — deleting characters and a long
     * press changed nothing — and spent three minutes before asking him. The
     * ADB Keyboard empties the focused field in one go (ADB_CLEAR_TEXT); then,
     * for a field it cannot reach (a recipient's chips), the cursor goes to the
     * end and the text is deleted backwards, chips included.
     */
    async clearField(): Promise<{ ok: boolean; error?: string }> {
        const viaKeyboard = await this.withAdbKeyboard(() => this.run(['shell', 'am', 'broadcast', '-a', 'ADB_CLEAR_TEXT']));
        const end = 123; // KEYCODE_MOVE_END
        const del = 67;  // KEYCODE_DEL
        const r = await this.run(['shell', 'input', 'keyevent', String(end), ...Array.from({ length: 80 }, () => String(del))]);
        if (r.code === 0 || viaKeyboard.ok) return { ok: true };
        return { ok: false, error: (r.stderr || viaKeyboard.error || 'the field could not be emptied').trim() };
    }

    /** Runs fn with the ADB Keyboard as the phone's keyboard, and gives the owner's own back after. */
    private async withAdbKeyboard(fn: () => Promise<{ code: number | null; stdout: string; stderr: string }>): Promise<{ ok: boolean; error?: string }> {
        const ime = await this.run(['shell', 'ime', 'list', '-a', '-s']);
        if (!ime.stdout.includes(ADB_KEYBOARD)) return { ok: false, error: 'the ADB Keyboard is not installed' };
        const enabled = await this.run(['shell', 'ime', 'list', '-s']);
        if (!enabled.stdout.includes(ADB_KEYBOARD)) await this.run(['shell', 'ime', 'enable', ADB_KEYBOARD]);
        let current = (await this.run(['shell', 'settings', 'get', 'secure', 'default_input_method'])).stdout.trim();
        if (current === ADB_KEYBOARD) {
            const list = (await this.run(['shell', 'ime', 'list', '-s'])).stdout.split(/\r?\n/u).map(l => l.trim()).filter(Boolean);
            current = list.find(k => k !== ADB_KEYBOARD && !/voice|tts|autofill/iu.test(k)) || '';
        }
        if (current !== ADB_KEYBOARD) { await this.run(['shell', 'ime', 'set', ADB_KEYBOARD]); await this.pause(500); }
        const r = await fn();
        if (current && current !== ADB_KEYBOARD) { await this.pause(300); await this.run(['shell', 'ime', 'set', current]); }
        return r.code === 0 ? { ok: true } : { ok: false, error: (r.stderr || r.stdout).trim() };
    }

    /*
     * A NEW EMAIL, ALREADY FILLED: TO, SUBJECT AND TEXT IN ONE STEP.
     *
     * The same day: writing an email by tapping and typing went wrong in the
     * recipient field. Android opens a mail app's new message with every field
     * filled from one «mailto:» address (the way a link on a page does): Joe
     * then only reads it, checks it and presses Send. Every part is
     * percent-encoded, so Arabic, spaces and «&» arrive as written, and the
     * whole address is one quoted word for the phone's shell.
     */
    async composeEmail(m: { to: string[]; cc?: string[]; subject?: string; body?: string; app?: string }): Promise<{ ok: boolean; error?: string }> {
        const enc = (s: string) => encodeURIComponent(s).replace(/'/gu, '%27');
        const to = m.to.map(a => a.trim()).filter(a => /^[^@\s'"]+@[^@\s'"]+\.[^@\s'"]+$/u.test(a));
        if (!to.length) return { ok: false, error: 'no valid recipient address' };
        const query = [
            ...(m.cc && m.cc.length ? [`cc=${enc(m.cc.join(','))}`] : []),
            ...(m.subject ? [`subject=${enc(m.subject)}`] : []),
            ...(m.body ? [`body=${enc(m.body)}`] : []),
        ].join('&');
        const uri = `mailto:${to.map(enc).join(',')}${query ? `?${query}` : ''}`;
        const pkg = m.app && /^[A-Za-z][\w]*(\.[A-Za-z_][\w]*)+$/u.test(m.app) ? m.app : '';
        const start = async (withPkg: boolean) => this.run(['shell', 'am', 'start', '-W', '-a', 'android.intent.action.SENDTO', '-d', `'${uri}'`, ...(withPkg && pkg ? ['-p', pkg] : [])]);
        let r = await start(true);
        if (pkg && (r.code !== 0 || /Error|unable to resolve|No Activity/iu.test(r.stdout + r.stderr))) r = await start(false);
        return r.code === 0 && !/Error|unable to resolve|No Activity/iu.test(r.stdout + r.stderr) ? { ok: true } : { ok: false, error: (r.stderr || r.stdout || 'no mail app opened').trim() };
    }

    /** Opens an address in the app that handles it: https://…, tel:, geo:, https://wa.me/… */
    async openUri(uri: string, pkg?: string): Promise<{ ok: boolean; error?: string }> {
        const u = String(uri || '').trim();
        if (!/^(?:https?:\/\/|tel:|sms:|smsto:|geo:|mailto:|whatsapp:|market:)/iu.test(u) || /['"\s]/u.test(u)) return { ok: false, error: 'not an address Joe opens (https://, tel:, sms:, geo:, mailto:, whatsapp:, market:), or it has quotes or spaces (encode them)' };
        const r = await this.run(['shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', `'${u}'`, ...(pkg && /^[A-Za-z][\w]*(\.[A-Za-z_][\w]*)+$/u.test(pkg) ? ['-p', pkg] : [])]);
        return r.code === 0 && !/Error|unable to resolve/iu.test(r.stdout + r.stderr) ? { ok: true } : { ok: false, error: (r.stderr || r.stdout || 'nothing opened it').trim() };
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

    /**
     * A sound's level through Android's own volume command (cmd media_session
     * volume, «media volume» on older phones): stream media | ring | alarm |
     * notification | call; level 0–100, or change up | down | mute.
     */
    async volume(stream: string, want: { level?: number; change?: string }): Promise<{ ok: boolean; text?: string; error?: string }> {
        const n = VOLUME_STREAMS[String(stream || 'media').toLowerCase()] ?? 3;
        const vol = async (args: string[]) => {
            let r = await this.run(['shell', 'cmd', 'media_session', 'volume', '--stream', String(n), ...args], { timeoutMs: 15_000 });
            if (/Unknown command|Can't find service|not found/iu.test(r.stdout + r.stderr)) r = await this.run(['shell', 'media', 'volume', '--stream', String(n), ...args], { timeoutMs: 15_000 });
            return r;
        };
        const read = async () => {
            const m = /volume is (\d+) in range \[(\d+)\.\.(\d+)\]/u.exec((await vol(['--get'])).stdout);
            return m ? { now: Number(m[1]), min: Number(m[2]), max: Number(m[3]) } : null;
        };
        const change = String(want.change || '').toLowerCase();
        if (typeof want.level === 'number' && Number.isFinite(want.level)) {
            const r0 = await read();
            if (!r0) return { ok: false, error: 'this phone did not say its volume range' };
            const pct = Math.max(0, Math.min(100, want.level));
            await vol(['--show', '--set', String(Math.round(r0.min + (r0.max - r0.min) * pct / 100))]);
        } else if (change === 'up' || change === 'down') {
            await vol(['--show', '--adj', change === 'up' ? 'raise' : 'lower']);
        } else if (change === 'mute') {
            const r0 = await read();
            await vol(['--show', '--set', String(r0?.min ?? 0)]);
        } else if (change) return { ok: false, error: 'change is up, down or mute' };
        const r1 = await read();
        if (!r1) return { ok: false, error: 'this phone did not say its volume' };
        const name = Object.keys(VOLUME_STREAMS).find(k => VOLUME_STREAMS[k] === n) || 'media';
        return { ok: true, text: `The ${name} volume is ${Math.round((r1.now - r1.min) * 100 / Math.max(1, r1.max - r1.min))}% (${r1.now} of ${r1.max}).` };
    }

    /* ───────────── the Joe app, put on a phone Joe already reaches (EngineAndroidTool installJoeAppOverAdb) ───────────── */

    /** Whether an app is on the phone. */
    async hasPackage(pkg: string): Promise<boolean> {
        const r = await this.run(['shell', 'pm', 'path', pkg], { timeoutMs: 15_000 });
        return r.code === 0 && /^package:/mu.test(r.stdout);
    }

    /** The phone's own serial number: the same on the cable and on Wi-Fi, whatever address adb gives it. */
    async hardwareSerial(): Promise<string> {
        for (const prop of ['ro.serialno', 'ro.boot.serialno']) {
            const r = await this.run(['shell', 'getprop', prop], { timeoutMs: 15_000 });
            const s = r.code === 0 ? r.stdout.trim() : '';
            if (/^[\w.-]{4,64}$/u.test(s) && !/^unknown$/iu.test(s)) return s;
        }
        return '';
    }

    /** Installs (or updates) an app from a file on this computer; its runtime permissions granted (-g). */
    async installApk(file: string): Promise<{ ok: boolean; error?: string }> {
        const r = await this.run(['install', '-r', '-g', file], { timeoutMs: 240_000 });
        return /\bSuccess\b/u.test(r.stdout) ? { ok: true } : { ok: false, error: (r.stderr || r.stdout || 'the install did not finish').trim().slice(-400) };
    }

    /** The phone's own 127.0.0.1:port reaches this computer's port, through adb alone: nothing opens on the network. */
    async tunnel(port: number): Promise<{ ok: boolean; error?: string }> {
        if (!Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, error: `no port ${port}` };
        const r = await this.run(['reverse', `tcp:${port}`, `tcp:${port}`], { timeoutMs: 15_000 });
        return r.code === 0 ? { ok: true } : { ok: false, error: (r.stderr || r.stdout || 'no tunnel').trim() };
    }

    async hasTunnel(port: number): Promise<boolean> {
        const r = await this.run(['reverse', '--list'], { timeoutMs: 15_000 });
        return r.code === 0 && r.stdout.includes(`tcp:${port} tcp:${port}`);
    }

    /** Opens the Joe app with Joe's address and a link code filled in (joe://link); the owner taps «Link» himself. */
    async openJoeLink(server: string, code: string): Promise<{ ok: boolean; error?: string }> {
        if (!/^https?:\/\/[\w.:[\]-]+$/u.test(server) || !/^\d{6}$/u.test(code)) return { ok: false, error: 'not an address and code the Joe app takes' };
        const uri = `joe://link?server=${encodeURIComponent(server)}&code=${code}`;
        const r = await this.run(['shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', `'${uri}'`, '-p', JOE_APP_PACKAGE]);
        return r.code === 0 && !/Error|unable to resolve/iu.test(r.stdout + r.stderr) ? { ok: true } : { ok: false, error: (r.stderr || r.stdout || 'the Joe app did not open').trim() };
    }
}

/** The Joe app's package (mobile/android). */
export const JOE_APP_PACKAGE = 'ai.joe.phone';

/** Android's audio streams by the names Joe uses. */
export const VOLUME_STREAMS: Record<string, number> = { call: 0, ring: 2, media: 3, alarm: 4, notification: 5 };
