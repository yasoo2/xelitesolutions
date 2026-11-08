/**
 * engine_android: Joe's hands on the owner's Android phone, through his tool gateway.
 *
 * One registered tool carries every phone action of the agent engine
 * (core/engine/tools/android.ts), so the firewall, the session owner, the
 * audit, the rate limit and the run's Stop button apply to each tap exactly
 * as to a shell command. adb runs through ExecutionGateway as an argv.
 *
 * adb is Google's platform-tools. When this computer has none, the tool says
 * where it is looked for and what the owner can do, instead of pretending.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { ToolDefinition, ToolExecutionResult, ToolPermission } from '../types';
import { ExecutionGateway } from '../../../kernel/ExecutionGateway';
import { AndroidPhone, connectPhone, describeAndroid, describeScreen, JOE_APP_PACKAGE, pairPhone, parseDevices, parseMdns, type AdbRunner } from '../../../core/devices/android';

const EXE = process.platform === 'win32' ? 'adb.exe' : 'adb';

/** Where adb is looked for: JOE_ADB, the Android SDK's platform-tools, Joe's own tools folder. */
export function adbCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
    const sdk = [env.ANDROID_HOME, env.ANDROID_SDK_ROOT, env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'Android', 'Sdk') : '', path.join(os.homedir(), 'Library', 'Android', 'sdk'), path.join(os.homedir(), 'Android', 'Sdk')]
        .filter(Boolean).map(d => path.join(String(d), 'platform-tools', EXE));
    return [env.JOE_ADB || '', ...sdk, path.join(process.cwd(), '..', 'tools', 'platform-tools', EXE)].filter(Boolean);
}

export function findAdb(env: NodeJS.ProcessEnv = process.env, exists: (f: string) => boolean = fs.existsSync): string | null {
    return adbCandidates(env).find(f => { try { return exists(f); } catch { return false; } }) || null;
}

const NO_ADB = 'adb (Google\'s Android platform-tools) is not installed on this computer, so Joe cannot reach a phone yet. Tell the owner: install «Android SDK Platform-Tools» from developer.android.com (or let Joe download it with his OK), then turn on USB debugging or Wireless debugging on the phone and allow this computer when the phone asks.';

const gatewayAdb = (adb: string): AdbRunner => async (args, opts) => {
    const r: any = await ExecutionGateway.execute(adb, args, { timeout: opts?.timeoutMs ?? 30_000, windowsHide: true, shell: false });
    const data = r?.data || {};
    return {
        code: typeof data.exitCode === 'number' ? data.exitCode : (r?.success ? 0 : null),
        stdout: String(data.output || ''),
        stderr: String(data.error || r?.error || ''),
    };
};

/** What Windows sees on USB of phones adb cannot reach, and what to do; '' elsewhere or when none. */
export async function unreachableUsbPhones(): Promise<string> {
    if (process.platform !== 'win32') return '';
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { gatewayPowerShell } = require('./EngineDeviceTools');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const usb = require('../../../core/devices/phone-usb');
        const r = await gatewayPowerShell(usb.usbDevicesScript(), 20_000);
        return usb.describeUnreachablePhones(usb.parseUsbPhones(String(r?.stdout || '')));
    } catch { return ''; }
}

/* ───────────── phones linked through the Joe app (core/devices/phone-link.ts) ───────────── */

type AppPhone = { id: string; name: string; model: string; android: string; since: number; ownerId: string };

/** The owner's phones online through the Joe app (every owner's when no run names one). */
function appPhonesOnline(): AppPhone[] {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { phoneLinks } = require('../../../core/devices/phone-link');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const owner = String(require('../../../orchestration/AgentExecutionFirewall').executionFirewall.currentOwner?.()?.userId || '');
        return phoneLinks.list(owner || undefined);
    } catch { return []; }
}

function describeAppPhones(apps: AppPhone[]): string {
    return apps.map(a => `- app:${a.id} «${a.name}» (${[a.model, a.android ? `Android ${a.android}` : ''].filter(Boolean).join(', ') || 'Android'}): online through the Joe app — every android_ tool works on it, from anywhere, with "serial": "app:${a.id}" (or with no serial when it is the only phone).`).join('\n');
}

/**
 * One operation on a phone through its Joe app: the same answers as a phone
 * on the cable, so every android_ tool reads them the same way.
 */
async function runOnApp(op: string, input: any, apps: AppPhone[]): Promise<ToolExecutionResult> {
    if (op === 'devices') return ok(describeAppPhones(apps));
    if (op === 'pair' || op === 'connect') return fail('pairing by code is for Wireless debugging; a phone with the Joe app is linked already');
    const serial = String(input?.serial || '').trim();
    const want = serial.startsWith('app:') ? serial.slice(4) : '';
    const target = want ? apps.find(a => a.id === want || a.name === want) : apps.length === 1 ? apps[0] : null;
    if (!target) {
        return fail(want ? `The phone «${want}» is not online through the Joe app now: its app is closed, or it has no internet.`
            : `More than one phone is online through the Joe app (${apps.map(a => `app:${a.id} «${a.name}»`).join(', ')}): name one with "serial".`);
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { phoneLinks } = require('../../../core/devices/phone-link');
    const { op: _op, serial: _serial, file: _file, ...args } = input || {};
    const r = await phoneLinks.ask(target.id, op, args, op === 'look' ? 30_000 : 20_000);
    if (!r.ok) return fail(`«${target.name}»: ${r.error || 'the phone refused'}`);
    const d = r.data || {};
    const state = d.screen ? describeScreen(d.screen) : '';
    switch (op) {
        case 'read': {
            const controls = Array.isArray(d.controls) ? d.controls : [];
            return ok([state, describeAndroid(controls)].filter(Boolean).join('\n\n'), { controls });
        }
        case 'look': {
            const file = String(input?.file || '');
            if (!file) return fail('engine_android look needs a file to keep the picture in');
            const png = Buffer.from(String(d.png || ''), 'base64');
            if (png.length < 24 || png.readUInt32BE(0) !== 0x89504e47) return fail(`«${target.name}» sent no picture${d.error ? `: ${d.error}` : ''}`);
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, png);
            return ok(`PICTURE\t${png.readUInt32BE(16)}\t${png.readUInt32BE(20)}${state ? `\n${state}` : ''}`);
        }
        case 'apps': return ok(Array.isArray(d.apps) ? d.apps.join('\n') : String(d.text || ''));
        default: return ok(`${d.woke ? 'The screen was asleep: Joe woke it first. ' : ''}${String(d.text || 'OK')}`);
    }
}

/**
 * A code for the Joe app on a phone: six digits, ten minutes, once. The app
 * is downloaded from this Joe (/api/phones/app.apk) and links with the code.
 */
function linkPhoneApp(name: string, baseIn?: unknown): ToolExecutionResult {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { newPhonePairing } = require('../../../core/devices/linked-phones');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const owner = String(require('../../../orchestration/AgentExecutionFirewall').executionFirewall.currentOwner?.()?.userId || '');
        if (!owner) return fail('Joe does not know whose phone this is: link it from the owner\'s own chat');
        const p = newPhonePairing(owner, name);
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { reachableBase } = require('../../../core/devices/device-link');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { config } = require('../../../shared/config');
        const base = typeof baseIn === 'string' && /^https?:\/\//u.test(baseIn) ? baseIn.replace(/\/+$/u, '') : reachableBase('http', `127.0.0.1:${config.port || 5000}`).http;
        return ok([
            `APP_LINK\t${p.code}\t${p.until}\t${base}`,
            `Tell the owner, in his language, these steps for the phone or tablet (any Android, any maker):`,
            `1. On the phone, open ${base}/api/phones/app.apk in its browser, download the Joe app and install it (Android asks to allow installing from the browser once).`,
            `2. Open the Joe app; type Joe's address ${base} and the code ${p.code} (it works once, for ten minutes).`,
            `3. In the app, turn on the two permissions it asks for: accessibility (so Joe can read and tap the screen) and notification access (so Joe hears replies). If Android says a setting is «restricted»: App info › ⋮ › «Allow restricted settings», then try again.`,
            `Then android_devices lists the phone as app:<id>, online from anywhere.`,
        ].join('\n'), { code: p.code, until: p.until, base });
    } catch (e: any) {
        return fail(`no code could be made: ${e?.message || e}`);
    }
}

/*
 * THE JOE APP OVER THE LINE JOE ALREADY HAS.
 *
 * The owner, 2026-11-08: Joe on his laptop listens on this computer alone,
 * so no phone reaches it over the Wi-Fi — and he chose, for now, the private
 * way: the phone paired once by Wireless debugging (or on the cable). Joe
 * then does it all himself: installs the app (adb install: no «unknown
 * sources», no «restricted settings»), opens a tunnel only this phone uses
 * (adb reverse: the phone's own 127.0.0.1:<port> is this Joe; nothing opens
 * on the network), and opens the app with Joe's address and a fresh code
 * filled in. Tapping «Link» and allowing the two permissions stay the
 * owner's. The tunnel comes back by itself whenever the phone reconnects
 * (keepJoeAppTunnels, modules/services/PhoneTunnelService.ts).
 */
export async function installJoeAppOverAdb(run: AdbRunner, serial: string, name: string, model: string): Promise<ToolExecutionResult> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { phoneApkFile } = require('../../../api/routes/phones');
    const apk = phoneApkFile();
    if (!fs.existsSync(apk)) return fail('The Joe app is not built on this Joe yet (mobile/android/build-joe-phone.ps1 builds it), so there is nothing to install.');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const owner = String(require('../../../orchestration/AgentExecutionFirewall').executionFirewall.currentOwner?.()?.userId || '');
    if (!owner) return fail('Joe does not know whose phone this is: link it from the owner\'s own chat');
    const phone = new AndroidPhone(run, serial);
    const label = model || serial;
    const had = await phone.hasPackage(JOE_APP_PACKAGE);
    const inst = await phone.installApk(apk);
    if (!inst.ok) {
        return fail(`The Joe app did not install on «${label}»: ${inst.error}. If the phone asked something on its screen (Samsung's «Auto Blocker», «Install via USB» or a Play Protect question), the owner answers it there, then ask again.`);
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { config } = require('../../../shared/config');
    const port = Number(config.port || 5000);
    const t = await phone.tunnel(port);
    if (!t.ok) return fail(`The Joe app is on «${label}», but the private tunnel to Joe did not open: ${t.error}`);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const tunnels = require('../../../core/devices/phone-tunnels');
    tunnels.keepTunnelFor(await phone.hardwareSerial() || serial, label);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { newPhonePairing } = require('../../../core/devices/linked-phones');
    const p = newPhonePairing(owner, name || model);
    const server = `http://127.0.0.1:${port}`;
    if (await phone.awake().catch(() => null) === false) {
        await phone.key('wakeup');
        await new Promise(r => setTimeout(r, 400));
    }
    const opened = await phone.openJoeLink(server, p.code);
    return ok([
        `APP_LINK\t${p.code}\t${p.until}\t${server}`,
        `The Joe app is ${had ? 'updated' : 'installed'} on «${label}», and a private tunnel joins it to this Joe (the phone's own ${server}; nothing opens on the network). ${opened.ok
            ? 'It is open on the phone\'s screen with Joe\'s address and the code filled in.'
            : `It did not open by itself (${opened.error}): the owner opens «جو» from his apps and types the address ${server} and the code ${p.code}.`}`,
        `Tell the owner, in his language, what is left for him on the phone: tap «Link» («اربط») in the Joe app, then turn on the two permissions it lists: accessibility (Joe reads and taps the screen) and notification access (Joe hears replies). The code works once, for ten minutes.`,
        'Then android_devices lists the phone as app:<id>, and every android_ tool works on it through the app.',
    ].join('\n'), { code: p.code, until: p.until, base: server, installed: true });
}

/**
 * The tunnel of every phone Joe put his app on comes back when the phone
 * does: adb's line to a phone on Wireless debugging drops with the Wi-Fi or
 * a restart, and the tunnel with it. A phone is looked at when it appears,
 * then every five minutes; only the phones in core/devices/phone-tunnels.ts.
 * Returns the serials a tunnel was opened for.
 */
export async function keepJoeAppTunnels(seen: Map<string, { at: number; phone: string }>, port: number, now = Date.now(), runIn?: AdbRunner): Promise<string[]> {
    const adb = runIn ? 'given' : findAdb();
    if (!adb) { seen.clear(); return []; }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const tunnels = require('../../../core/devices/phone-tunnels');
    if (!tunnels.tunnelPhones().length) return [];
    const run = runIn || gatewayAdb(adb);
    const ready = parseDevices((await run(['devices', '-l'], { timeoutMs: 15_000 })).stdout).filter(d => d.state === 'device');
    for (const s of [...seen.keys()]) if (!ready.some(d => d.serial === s)) seen.delete(s);
    const opened: string[] = [];
    for (const d of ready) {
        const last = seen.get(d.serial);
        if (last && now - last.at < 5 * 60_000) continue;
        const phone = new AndroidPhone(run, d.serial);
        const hw = last?.phone || await phone.hardwareSerial() || d.serial;
        seen.set(d.serial, { at: now, phone: hw });
        if (!tunnels.isTunnelPhone(hw) && !tunnels.isTunnelPhone(d.serial)) continue;
        if (await phone.hasTunnel(port)) continue;
        if (!(await phone.hasPackage(JOE_APP_PACKAGE))) continue;
        if ((await phone.tunnel(port)).ok) opened.push(d.serial);
    }
    return opened;
}

const OPS = new Set(['devices', 'read', 'look', 'tap', 'swipe', 'key', 'type', 'open', 'apps', 'pair', 'connect', 'panel', 'clear', 'email', 'uri', 'torch', 'volume']);
/** What only the Joe app does directly: with a phone online through it, it goes there even when adb also reaches one. */
const APP_FIRST = new Set(['torch']);
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : NaN);
const ok = (text: string, extra: Record<string, unknown> = {}) => ({ ok: true, output: { text, ...extra } }) as any;
const fail = (text: string) => ({ ok: false, error: text, output: { text } }) as any;

export class EngineAndroidTool implements ToolDefinition {
    readonly name = 'engine_android';
    readonly version = '1.0.0';
    readonly description = 'Agent engine only: one action on the owner\'s Android phone through adb (devices, read the screen\'s controls, look, tap, swipe, key, type, open an app, list apps).';
    readonly tags = ['engine', 'device', 'android'];
    readonly inputSchema = {
        type: 'object',
        properties: {
            op: { type: 'string', description: 'devices | read | look | tap | swipe | key | type | open | apps | panel | clear | email | uri | torch | volume | app_link' },
            serial: { type: 'string', description: 'The phone, as devices lists it; absent when only one is connected.' },
        },
        required: ['op'],
    };
    readonly outputSchema = { type: 'object', properties: { text: { type: 'string' } } };
    permissions: ToolPermission[] = ['execute'];
    sideEffects: ToolPermission[] = ['execute'];
    rateLimitPerMinute = 240;
    auditFields = ['op', 'serial', 'package', 'panel'];
    mockSupported = false;

    async execute(input: any): Promise<ToolExecutionResult> {
        const op = String(input?.op || '');
        if (!OPS.has(op) && op !== 'app_link') return fail(`engine_android: unknown action «${op}»`);
        //  A phone linked through the Joe app («app:<id>»), or the only phone the owner has when no
        //  cable phone is there: the same operation goes to the app, from anywhere (phone-link.ts).
        const apps = appPhonesOnline();
        const wantsApp = String(input?.serial || '').trim().startsWith('app:');
        if (op === 'app_link') {
            //  A phone Joe already reaches by adb (the cable, or Wireless debugging): Joe puts the app on it himself.
            const adbHere = wantsApp ? null : findAdb();
            if (adbHere) {
                const run = gatewayAdb(adbHere);
                const ready = parseDevices((await run(['devices', '-l'], { timeoutMs: 20_000 })).stdout).filter(d => d.state === 'device');
                const asked = String(input?.serial || '').trim();
                const pick = asked ? ready.find(d => d.serial === asked) : ready.length === 1 ? ready[0] : undefined;
                if (pick) return installJoeAppOverAdb(run, pick.serial, String(input?.name || ''), pick.model || pick.product || '');
                if (asked) return fail(`The phone «${asked}» is not connected and allowed: call android_devices.`);
                if (ready.length > 1) return fail(`More than one phone is connected (${ready.map(d => `${d.serial} ${d.model || ''}`.trim()).join(', ')}): name the one to put the Joe app on with "serial".`);
            }
            return linkPhoneApp(String(input?.name || ''), input?.base);
        }
        const adb = findAdb();
        if (wantsApp || (!adb && op !== 'devices' && apps.length)) return runOnApp(op, input, apps);
        if (APP_FIRST.has(op) && apps.length && !String(input?.serial || '').trim()) return runOnApp(op, input, apps);
        if (!adb) return apps.length ? ok(describeAppPhones(apps)) : fail(NO_ADB);
        const run = gatewayAdb(adb);
        if (op === 'pair') {
            const r = await pairPhone(run, String(input?.address || '').trim(), String(input?.code || '').trim());
            return r.ok ? ok('Paired. Now connect to the address the phone\'s Wireless debugging screen shows (android_connect), or call android_devices.') : fail(`pairing failed: ${r.error}`);
        }
        if (op === 'connect') {
            const r = await connectPhone(run, String(input?.address || '').trim());
            return r.ok ? ok('Connected. android_devices lists it now.') : fail(`the phone did not connect: ${r.error}`);
        }
        const listed = parseDevices((await run(['devices', '-l'], { timeoutMs: 20_000 })).stdout);
        if (op === 'devices') {
            //  Phones on this network that announce Wireless debugging, beside those already connected.
            const wifi = parseMdns((await run(['mdns', 'services'], { timeoutMs: 15_000 }).catch(() => ({ stdout: '' }) as any)).stdout)
                .filter(p => !listed.some(d => d.serial === p.address));
            const lines = listed.map(d => `- ${d.serial} ${d.model || d.product || ''} (${d.state === 'device' ? 'connected' : d.state === 'unauthorized' ? 'waiting: the owner must tap «Allow» on the phone' : d.state})`);
            for (const p of wifi) {
                lines.push(p.kind === 'pair'
                    ? `- ${p.name} on Wi-Fi at ${p.address}: showing its pairing code now. Ask the owner for the six digits on the phone's screen, then android_pair {"address": "${p.address}", "code": …}`
                    : `- ${p.name} on Wi-Fi at ${p.address}: ready to connect (android_connect {"address": "${p.address}"}); if it was never paired, the owner opens Wireless debugging › «Pair device with pairing code» on the phone («تصحيح الأخطاء اللاسلكي» › «إقران الجهاز باستخدام رمز الإقران» on an Arabic phone)`);
            }
            //  A phone on the cable that adb does not list: Windows says why (core/devices/phone-usb.ts, 2026-11-08).
            const usb = listed.some(d => d.state === 'device') ? '' : await unreachableUsbPhones();
            const viaApp = apps.length ? describeAppPhones(apps) : '';
            if (!lines.length && !viaApp) return ok(usb || 'No phone is connected or visible on this network. Tell the owner: plug the phone in by cable with USB debugging on, or turn on Wireless debugging (Settings › Developer options; on an Arabic phone «الإعدادات» › «خيارات المطور» › «تصحيح الأخطاء اللاسلكي») on the same Wi-Fi and open «Pair device with pairing code» («إقران الجهاز باستخدام رمز الإقران»), then tell Joe only the six digits it shows: Joe finds the phone on the Wi-Fi himself.');
            return ok([lines.join('\n'), viaApp, usb].filter(Boolean).join('\n\n'));
        }
        const ready = listed.filter(d => d.state === 'device');
        //  No phone on the cable, and the owner's phone is online through the Joe app: the app does it.
        if (!String(input?.serial || '').trim() && !ready.length && apps.length) return runOnApp(op, input, apps);
        const serial = String(input?.serial || '').trim() || (ready.length === 1 ? ready[0].serial : '');
        if (!serial) return fail(ready.length ? `More than one phone is connected (${ready.map(d => d.serial).join(', ')}): name one with "serial".` : 'No phone is connected and allowed: call devices to see why.');
        if (!ready.some(d => d.serial === serial)) return fail(`The phone «${serial}» is not connected and allowed.`);
        const phone = new AndroidPhone(run, serial);
        /*
         * A TAP ON A SLEEPING SCREEN DOES NOTHING.
         *
         * The owner's phone, 2026-11-07: «شغل الكشاف» — the run opened the
         * quick settings and tapped the flashlight tile while the screen was
         * asleep; nothing changed, and it took a look at a black picture to
         * find out why. Before anything that touches the screen, a sleeping
         * screen is woken (wakeup only wakes; it never turns the screen off),
         * and the answer says so.
         */
        let woke = '';
        if (['tap', 'swipe', 'type', 'panel', 'open', 'clear', 'email', 'uri'].includes(op)) {
            if (await phone.awake().catch(() => null) === false) {
                const w = await phone.key('wakeup');
                if (w.ok) { woke = 'The screen was asleep: Joe woke it first. '; await new Promise(r => setTimeout(r, 400)); }
            }
        }
        const done = (text = 'OK') => ok(`${woke}${text}`);
        switch (op) {
            case 'read': {
                const r = await phone.read();
                if (!r.ok) return fail(`the screen could not be read: ${r.error}`);
                //  Whether the screen is on and the phone locked comes first: a sleeping screen reads as a lock screen and looks black.
                const state = describeScreen(await phone.screen());
                return ok([state, describeAndroid(r.controls)].filter(Boolean).join('\n\n'), { controls: r.controls });
            }
            case 'look': {
                const file = String(input?.file || '');
                if (!file) return fail('engine_android look needs a file to keep the picture in');
                fs.mkdirSync(path.dirname(file), { recursive: true });
                const r = await phone.look(file, f => fs.readFileSync(f));
                if (!r.ok) return fail(`no picture: ${r.error}`);
                const w = r.png.readUInt32BE(16), h = r.png.readUInt32BE(20);
                const state = describeScreen(await phone.screen());
                return ok(`PICTURE\t${w}\t${h}${state ? `\n${state}` : ''}`);
            }
            case 'panel': {
                const r = await phone.panel(String(input?.panel || ''));
                return r.ok ? done() : fail(r.error || 'the panel did not open');
            }
            case 'tap': {
                const x = n(input?.x), y = n(input?.y);
                if (!Number.isFinite(x) || !Number.isFinite(y)) return fail('tap needs x and y on the phone\'s screen');
                //  A press held in place («press and hold»): a swipe that does not move.
                const hold = n(input?.holdMs);
                const r = Number.isFinite(hold) && hold > 0 ? await phone.swipe(x, y, x, y, Math.min(Math.max(hold, 400), 5000)) : await phone.tap(x, y);
                return r.ok ? done() : fail(r.error || 'the tap failed');
            }
            case 'swipe': {
                const a = [input?.x, input?.y, input?.toX, input?.toY].map(n);
                if (a.some(v => !Number.isFinite(v))) return fail('swipe needs x, y, toX, toY');
                const r = await phone.swipe(a[0], a[1], a[2], a[3], n(input?.ms) || 300);
                return r.ok ? done() : fail(r.error || 'the swipe failed');
            }
            case 'key': {
                const r = await phone.key(String(input?.key || ''));
                return r.ok ? ok('OK') : fail(r.error || 'the key failed');
            }
            case 'type': {
                const r = await phone.type(String(input?.text ?? ''));
                return r.ok ? done() : fail(r.error || 'typing failed');
            }
            case 'open': {
                const r = await phone.open(String(input?.package || ''));
                return r.ok ? done() : fail(r.error || 'the app did not open');
            }
            case 'clear': {
                const r = await phone.clearField();
                return r.ok ? done() : fail(r.error || 'the field could not be emptied');
            }
            case 'email': {
                const list = (v: unknown) => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;\s]+/u) : []).map(String).filter(Boolean);
                const r = await phone.composeEmail({ to: list(input?.to), cc: list(input?.cc), subject: String(input?.subject || ''), body: String(input?.body || ''), app: String(input?.app || '') });
                return r.ok ? done() : fail(r.error || 'no mail app opened');
            }
            case 'uri': {
                const r = await phone.openUri(String(input?.uri || ''), String(input?.package || '') || undefined);
                return r.ok ? done() : fail(r.error || 'nothing opened it');
            }
            case 'apps': return ok((await phone.apps()).join('\n') || 'No app the owner installed was listed.');
            case 'torch':
                //  adb has no flashlight command every phone answers: the quick settings tile does it.
                return fail(`«${serial}» is reached by adb, which has no flashlight command: open the quick settings (android_panel "quick_settings"), android_read, and tap the flashlight tile. With the Joe app on the phone (android_link_app), android_torch turns it on directly.`);
            case 'volume': {
                const level = input?.level === undefined || input?.level === null || input?.level === '' ? undefined : Number(input.level);
                const r = await phone.volume(String(input?.stream || 'media'), { level, change: String(input?.change || '') });
                return r.ok ? ok(r.text || 'OK') : fail(r.error || 'the volume did not change');
            }
        }
        return fail('engine_android: unreachable');
    }
}

export const ENGINE_ANDROID_TOOLS: ToolDefinition[] = [new EngineAndroidTool()];

/*
 * THE PHONE'S SCREEN, LIVE, IN JOE'S PAGE.
 *
 * The owner, 2026-11-08: «why doesn't Joe's preview show live what Joe is
 * doing?» — he read log lines while Joe tapped his phone. The page's Device
 * tab asks for the screen again and again (api/routes/devices.ts); a picture
 * is taken the way android_look takes one (on the phone, then pulled), through
 * the same gateway. One capture runs at a time and a frame younger than
 * 700 ms is shared, so two open tabs never double the phone's work.
 */
export type LiveFrame =
    | { ok: true; png: Buffer; serial: string; model: string; awake: boolean | null; at: number }
    | { ok: false; code: 'no_adb' | 'no_phone' | 'failed'; error: string };

let lastFrame: (LiveFrame & { ok: true }) | null = null;
let capturing: Promise<LiveFrame> | null = null;

export async function phoneScreenNow(serial?: string): Promise<LiveFrame> {
    if (lastFrame && Date.now() - lastFrame.at < 700 && (!serial || serial === lastFrame.serial)) return lastFrame;
    if (capturing) return capturing;
    capturing = (async (): Promise<LiveFrame> => {
        const adb = findAdb();
        if (!adb) return { ok: false, code: 'no_adb', error: NO_ADB };
        const run = gatewayAdb(adb);
        const ready = parseDevices((await run(['devices', '-l'], { timeoutMs: 15_000 })).stdout).filter(d => d.state === 'device');
        const device = serial ? ready.find(d => d.serial === serial) : ready[0];
        if (!device) return { ok: false, code: 'no_phone', error: 'No phone is connected and allowed.' };
        const phone = new AndroidPhone(run, device.serial);
        const dir = path.join(os.tmpdir(), 'joe-live');
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `phone-${device.serial.replace(/[^\w.-]/gu, '_')}.png`);
        const shot = await phone.look(file, f => fs.readFileSync(f));
        if (!shot.ok) return { ok: false, code: 'failed', error: shot.error };
        const awake = await phone.awake().catch(() => null);
        lastFrame = { ok: true, png: shot.png, serial: device.serial, model: device.model || device.product || '', awake, at: Date.now() };
        return lastFrame;
    })().finally(() => { capturing = null; });
    return capturing;
}

/*
 * THE PHONE'S NOTIFICATIONS NOW, FOR JOE'S WATCH ON EMAIL REPLIES.
 *
 * modules/services/MailWatchService.ts asks every minute while Joe watches
 * for a reply (core/devices/mail-watch.ts). «dumpsys notification» only
 * reads: no app opens, nothing on the screen moves. The phone's own sed
 * keeps the list of notifications (about 30 KB instead of 650 KB of
 * channel settings); a phone without sed gives the whole dump.
 */
export type PhoneNotices =
    | { ok: true; dumps: Array<{ serial: string; model: string; text: string }> }
    | { ok: false; code: 'no_adb' | 'no_phone' | 'failed'; error: string };

export async function phoneNotificationsNow(): Promise<PhoneNotices> {
    const adb = findAdb();
    if (!adb) return { ok: false, code: 'no_adb', error: NO_ADB };
    const run = gatewayAdb(adb);
    const ready = parseDevices((await run(['devices', '-l'], { timeoutMs: 15_000 })).stdout).filter(d => d.state === 'device');
    if (!ready.length) return { ok: false, code: 'no_phone', error: 'No phone is connected and allowed.' };
    const dumps: Array<{ serial: string; model: string; text: string }> = [];
    for (const d of ready) {
        let r = await run(['-s', d.serial, 'shell', "dumpsys notification --noredact | sed -n '/Notification List:/,/mArchive=/p'"], { timeoutMs: 25_000 });
        if (r.code !== 0 || !/NotificationRecord\(|Notification List:/u.test(r.stdout)) {
            r = await run(['-s', d.serial, 'shell', 'dumpsys', 'notification', '--noredact'], { timeoutMs: 25_000 });
        }
        if (r.code === 0 && r.stdout) dumps.push({ serial: d.serial, model: d.model || d.product || '', text: r.stdout });
    }
    return dumps.length ? { ok: true, dumps } : { ok: false, code: 'failed', error: 'the phone did not give its notifications' };
}
