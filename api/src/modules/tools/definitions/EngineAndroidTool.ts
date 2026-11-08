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
import { AndroidPhone, connectPhone, describeAndroid, describeScreen, pairPhone, parseDevices, parseMdns, type AdbRunner } from '../../../core/devices/android';

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

const OPS = new Set(['devices', 'read', 'look', 'tap', 'swipe', 'key', 'type', 'open', 'apps', 'pair', 'connect', 'panel']);
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
            op: { type: 'string', description: 'devices | read | look | tap | swipe | key | type | open | apps | panel' },
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
        if (!OPS.has(op)) return fail(`engine_android: unknown action «${op}»`);
        const adb = findAdb();
        if (!adb) return fail(NO_ADB);
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
                    : `- ${p.name} on Wi-Fi at ${p.address}: ready to connect (android_connect {"address": "${p.address}"}); if it was never paired, the owner opens Wireless debugging › «Pair device with pairing code» on the phone`);
            }
            if (!lines.length) return ok('No phone is connected or visible on this network. Tell the owner: plug the phone in by cable with USB debugging on, or turn on Wireless debugging (Settings › Developer options) on the same Wi-Fi and open «Pair device with pairing code»; then ask Joe again.');
            return ok(lines.join('\n'));
        }
        const ready = listed.filter(d => d.state === 'device');
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
        if (['tap', 'swipe', 'type', 'panel', 'open'].includes(op)) {
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
            case 'apps': return ok((await phone.apps()).join('\n') || 'No app the owner installed was listed.');
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
