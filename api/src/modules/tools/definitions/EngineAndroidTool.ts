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
import { AndroidPhone, describeAndroid, parseDevices, type AdbRunner } from '../../../core/devices/android';

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

const OPS = new Set(['devices', 'read', 'look', 'tap', 'swipe', 'key', 'type', 'open', 'apps']);
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
            op: { type: 'string', description: 'devices | read | look | tap | swipe | key | type | open | apps' },
            serial: { type: 'string', description: 'The phone, as devices lists it; absent when only one is connected.' },
        },
        required: ['op'],
    };
    readonly outputSchema = { type: 'object', properties: { text: { type: 'string' } } };
    permissions: ToolPermission[] = ['execute'];
    sideEffects: ToolPermission[] = ['execute'];
    rateLimitPerMinute = 240;
    auditFields = ['op', 'serial', 'package'];
    mockSupported = false;

    async execute(input: any): Promise<ToolExecutionResult> {
        const op = String(input?.op || '');
        if (!OPS.has(op)) return fail(`engine_android: unknown action «${op}»`);
        const adb = findAdb();
        if (!adb) return fail(NO_ADB);
        const run = gatewayAdb(adb);
        const listed = parseDevices((await run(['devices', '-l'], { timeoutMs: 20_000 })).stdout);
        if (op === 'devices') {
            if (!listed.length) return ok('No phone is connected. Tell the owner: plug the phone in by cable with USB debugging on (or pair it with Wireless debugging), and allow this computer when the phone asks.');
            return ok(listed.map(d => `- ${d.serial} ${d.model || d.product || ''} (${d.state === 'device' ? 'connected' : d.state === 'unauthorized' ? 'waiting: the owner must tap «Allow» on the phone' : d.state})`).join('\n'));
        }
        const ready = listed.filter(d => d.state === 'device');
        const serial = String(input?.serial || '').trim() || (ready.length === 1 ? ready[0].serial : '');
        if (!serial) return fail(ready.length ? `More than one phone is connected (${ready.map(d => d.serial).join(', ')}): name one with "serial".` : 'No phone is connected and allowed: call devices to see why.');
        if (!ready.some(d => d.serial === serial)) return fail(`The phone «${serial}» is not connected and allowed.`);
        const phone = new AndroidPhone(run, serial);
        switch (op) {
            case 'read': {
                const r = await phone.read();
                return r.ok ? ok(describeAndroid(r.controls), { controls: r.controls }) : fail(`the screen could not be read: ${r.error}`);
            }
            case 'look': {
                const file = String(input?.file || '');
                if (!file) return fail('engine_android look needs a file to keep the picture in');
                fs.mkdirSync(path.dirname(file), { recursive: true });
                const r = await phone.look(file, f => fs.readFileSync(f));
                if (!r.ok) return fail(`no picture: ${r.error}`);
                const w = r.png.readUInt32BE(16), h = r.png.readUInt32BE(20);
                return ok(`PICTURE\t${w}\t${h}`);
            }
            case 'tap': {
                const x = n(input?.x), y = n(input?.y);
                if (!Number.isFinite(x) || !Number.isFinite(y)) return fail('tap needs x and y on the phone\'s screen');
                const r = await phone.tap(x, y);
                return r.ok ? ok('OK') : fail(r.error || 'the tap failed');
            }
            case 'swipe': {
                const a = [input?.x, input?.y, input?.toX, input?.toY].map(n);
                if (a.some(v => !Number.isFinite(v))) return fail('swipe needs x, y, toX, toY');
                const r = await phone.swipe(a[0], a[1], a[2], a[3], n(input?.ms) || 300);
                return r.ok ? ok('OK') : fail(r.error || 'the swipe failed');
            }
            case 'key': {
                const r = await phone.key(String(input?.key || ''));
                return r.ok ? ok('OK') : fail(r.error || 'the key failed');
            }
            case 'type': {
                const r = await phone.type(String(input?.text ?? ''));
                return r.ok ? ok('OK') : fail(r.error || 'typing failed');
            }
            case 'open': {
                const r = await phone.open(String(input?.package || ''));
                return r.ok ? ok('OK') : fail(r.error || 'the app did not open');
            }
            case 'apps': return ok((await phone.apps()).join('\n') || 'No app the owner installed was listed.');
        }
        return fail('engine_android: unreachable');
    }
}

export const ENGINE_ANDROID_TOOLS: ToolDefinition[] = [new EngineAndroidTool()];
