/**
 * The agent engine's tools for the owner's Android phone (operate route).
 *
 * Each one calls engine_android through Joe's gateway (modules/tools/
 * definitions/EngineAndroidTool.ts). What was done and seen goes into the same
 * run record as the desktop tools (tools/devices.ts deviceRecordFor), so the
 * operate verifier asks the same question: was something done, and was it
 * looked at afterwards?
 *
 * Controls are acted on by their number from the last android_read: the
 * centre of the control is tapped, in the phone's own pixels.
 */
import fs from 'fs';
import path from 'path';
import type { EngineTool, ToolContext, ToolOutcome } from '../types';
import { toolContextFor } from './shell';
import { deviceRecordFor } from './devices';
import type { AndroidControl } from '../../devices/android';

function gateway(): (name: string, input: any, context?: any) => Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../../../modules/services/ToolService').executeTool;
}

const CONTROLS = new Map<string, AndroidControl[]>();
export function forgetAndroid(runId: string): void { CONTROLS.delete(runId); }

async function phone(ctx: ToolContext, input: Record<string, unknown>): Promise<{ ok: boolean; text: string; output: any }> {
    const result = await gateway()('engine_android', input, toolContextFor(ctx));
    const out = result?.output || {};
    const text = typeof out.text === 'string' ? out.text : String(result?.error || 'no answer');
    return { ok: result?.ok === true, text, output: out };
}

function did(ctx: ToolContext, tool: string, ok: boolean, what: string): void {
    deviceRecordFor(ctx.runId).actions.push({ tool, ok, at: Date.now(), what: what.slice(0, 200) });
}
function saw(ctx: ToolContext, kind: 'look' | 'read' | 'devices'): void {
    deviceRecordFor(ctx.runId).looks.push({ at: Date.now(), kind });
}

const obj = (raw: unknown): Record<string, unknown> => (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {});
const SERIAL = { type: 'string', description: 'The phone, as android_devices lists it; leave it out when only one is connected.' };
const withSerial = (a: Record<string, unknown>) => (typeof a.serial === 'string' && a.serial.trim() ? { serial: a.serial.trim() } : {});

export const androidDevicesTool: EngineTool<Record<string, never>> = {
    name: 'android_devices',
    description: 'List the Android phones connected to this computer through adb, and whether each is allowed. Call it first for any request about the owner\'s phone.',
    parameters: { type: 'object', properties: {} },
    parse: () => ({ ok: true, value: {} }),
    async run(_a, ctx): Promise<ToolOutcome> {
        const r = await phone(ctx, { op: 'devices' });
        if (r.ok) saw(ctx, 'devices');
        return { ok: r.ok, output: r.text };
    },
};

export const androidReadTool: EngineTool<{ serial?: string }> = {
    name: 'android_read',
    description: 'Read the phone\'s screen as numbered controls: kind, text or description, id, what it can do (tap, type, scroll) and where its centre is. Acting by number with android_tap is surer than a point.',
    parameters: { type: 'object', properties: { serial: SERIAL } },
    parse: raw => ({ ok: true, value: withSerial(obj(raw)) }),
    async run(a, ctx): Promise<ToolOutcome> {
        const r = await phone(ctx, { op: 'read', ...a });
        if (!r.ok) return { ok: false, output: `android_read failed: ${r.text}` };
        CONTROLS.set(ctx.runId, Array.isArray(r.output.controls) ? r.output.controls : []);
        saw(ctx, 'read');
        return { ok: true, output: r.text };
    },
};

export const androidLookTool: EngineTool<{ serial?: string }> = {
    name: 'android_look',
    description: 'Take a picture of the phone\'s screen and look at it. Points on it are the phone\'s own pixels; prefer android_read numbers when the control is named.',
    parameters: { type: 'object', properties: { serial: SERIAL } },
    parse: raw => ({ ok: true, value: withSerial(obj(raw)) }),
    async run(a, ctx): Promise<ToolOutcome> {
        const dir = path.join(ctx.stateDir, 'screens');
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `phone-${Date.now()}.png`);
        const r = await phone(ctx, { op: 'look', file, ...a });
        const size = r.text.match(/^PICTURE\t(\d+)\t(\d+)/u);
        if (!r.ok || !size || !fs.existsSync(file)) return { ok: false, output: `android_look failed: ${r.text}` };
        saw(ctx, 'look');
        const state = r.text.split('\n').slice(1).join('\n').trim();
        return { ok: true, output: `A picture of the phone's screen, ${size[1]}×${size[2]} (the phone's own pixels).${state ? `\n${state}` : ''}`, images: [{ path: file, mime: 'image/png' }] };
    },
};

export interface TapArgs { control?: number; x?: number; y?: number; serial?: string }
export const androidTapTool: EngineTool<TapArgs> = {
    name: 'android_tap',
    description: 'Tap a control by its number from the last android_read ("control"), or a point in the phone\'s pixels ("x", "y").',
    parameters: { type: 'object', properties: { control: { type: 'integer' }, x: { type: 'integer' }, y: { type: 'integer' }, serial: SERIAL } },
    parse: raw => {
        const a = obj(raw);
        const control = Number(a.control);
        if (Number.isInteger(control) && control > 0) return { ok: true, value: { control, ...withSerial(a) } };
        const x = Number(a.x), y = Number(a.y);
        if (Number.isFinite(x) && Number.isFinite(y)) return { ok: true, value: { x, y, ...withSerial(a) } };
        return { ok: false, error: 'android_tap takes "control" (a number from android_read) or "x" and "y".' };
    },
    async run(a, ctx): Promise<ToolOutcome> {
        let x = a.x, y = a.y, what = `tap ${a.x},${a.y}`;
        if (a.control) {
            const c = (CONTROLS.get(ctx.runId) || []).find(k => k.index === a.control);
            if (!c) return { ok: false, output: `Control ${a.control} is not in the last android_read: read the screen again.` };
            x = Math.round(c.x + c.width / 2); y = Math.round(c.y + c.height / 2);
            what = `tap [${c.index}] «${c.text || c.description}»`;
        }
        const r = await phone(ctx, { op: 'tap', x, y, ...withSerial(a as any) });
        did(ctx, 'android_tap', r.ok, what);
        return { ok: r.ok, output: r.ok ? 'Tapped. Read or look again to see what it did.' : `android_tap failed: ${r.text}` };
    },
};

export const androidTypeTool: EngineTool<{ text: string; serial?: string }> = {
    name: 'android_type',
    description: 'Type text where the phone\'s cursor is: tap the field first. Any language; Arabic needs the ADB Keyboard app on the phone, and the tool says so when it is missing.',
    parameters: { type: 'object', properties: { text: { type: 'string' }, serial: SERIAL }, required: ['text'] },
    parse: raw => {
        const a = obj(raw);
        return typeof a.text === 'string' && a.text ? { ok: true, value: { text: a.text, ...withSerial(a) } } : { ok: false, error: '"text" is what to type.' };
    },
    async run(a, ctx): Promise<ToolOutcome> {
        const r = await phone(ctx, { op: 'type', ...a });
        did(ctx, 'android_type', r.ok, `type «${a.text.slice(0, 60)}»`);
        return { ok: r.ok, output: r.ok ? `Typed ${a.text.length} character(s).` : `android_type failed: ${r.text}` };
    },
};

export const androidKeyTool: EngineTool<{ key: string; serial?: string }> = {
    name: 'android_key',
    description: 'Press a phone key: wakeup (turns a sleeping screen on), back, home, recent, enter, delete, tab, up, down, left, right, volumeup, volumedown, search, menu, sleep, power (toggles the screen: use wakeup to wake it).',
    parameters: { type: 'object', properties: { key: { type: 'string' }, serial: SERIAL }, required: ['key'] },
    parse: raw => {
        const a = obj(raw);
        return typeof a.key === 'string' && a.key.trim() ? { ok: true, value: { key: a.key.trim(), ...withSerial(a) } } : { ok: false, error: '"key" is a key name, like back or home.' };
    },
    async run(a, ctx): Promise<ToolOutcome> {
        const r = await phone(ctx, { op: 'key', ...a });
        did(ctx, 'android_key', r.ok, `key ${a.key}`);
        return { ok: r.ok, output: r.ok ? `Pressed ${a.key}.` : `android_key failed: ${r.text}` };
    },
};

/**
 * The phone's pull-down panels. The owner's phone, 2026-11-07: «شغل الكشاف»
 * — the flashlight has no app and no shell command; it is a tile in the
 * quick settings, as are Wi-Fi, Bluetooth, airplane mode, mobile data,
 * rotation and do-not-disturb. They open on the lock screen too.
 */
export const androidPanelTool: EngineTool<{ panel: 'quick_settings' | 'notifications' | 'close'; serial?: string }> = {
    name: 'android_panel',
    description: 'Open the phone\'s quick settings (the tiles: flashlight/torch, Wi-Fi, Bluetooth, airplane mode, mobile data, rotation, do not disturb, hotspot…) or its notifications, or close them. Then android_read and tap the tile by its number, and read again to see that it changed. Works on the lock screen.',
    parameters: { type: 'object', properties: { panel: { type: 'string', enum: ['quick_settings', 'notifications', 'close'] }, serial: SERIAL }, required: ['panel'] },
    parse: raw => {
        const a = obj(raw);
        const p = String(a.panel || '').trim().toLowerCase().replace(/[\s-]/gu, '_');
        return ['quick_settings', 'notifications', 'close'].includes(p) ? { ok: true, value: { panel: p as any, ...withSerial(a) } } : { ok: false, error: '"panel" is quick_settings, notifications or close.' };
    },
    async run(a, ctx): Promise<ToolOutcome> {
        const r = await phone(ctx, { op: 'panel', ...a });
        did(ctx, 'android_panel', r.ok, `panel ${a.panel}`);
        return { ok: r.ok, output: r.ok ? `The ${a.panel === 'close' ? 'panels are closed' : `${a.panel.replace('_', ' ')} panel is open`}. Read the screen to see it.` : `android_panel failed: ${r.text}` };
    },
};

export const androidScrollTool: EngineTool<{ direction: 'up' | 'down' | 'left' | 'right'; serial?: string }> = {
    name: 'android_scroll',
    description: 'Scroll the phone\'s screen: "down" shows what is below, "up" what is above, "left"/"right" sideways.',
    parameters: { type: 'object', properties: { direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] }, serial: SERIAL }, required: ['direction'] },
    parse: raw => {
        const a = obj(raw);
        const d = String(a.direction || '');
        return ['up', 'down', 'left', 'right'].includes(d) ? { ok: true, value: { direction: d as any, ...withSerial(a) } } : { ok: false, error: '"direction" is up, down, left or right.' };
    },
    async run(a, ctx): Promise<ToolOutcome> {
        //  A finger moving the other way: to see what is below, it moves up.
        const W = 1080, H = 2400;
        const [x, y, toX, toY] = a.direction === 'down' ? [W / 2, H * 0.75, W / 2, H * 0.3]
            : a.direction === 'up' ? [W / 2, H * 0.3, W / 2, H * 0.75]
                : a.direction === 'right' ? [W * 0.8, H / 2, W * 0.2, H / 2] : [W * 0.2, H / 2, W * 0.8, H / 2];
        const r = await phone(ctx, { op: 'swipe', x, y, toX, toY, ...withSerial(a as any) });
        did(ctx, 'android_scroll', r.ok, `scroll ${a.direction}`);
        return { ok: r.ok, output: r.ok ? 'Scrolled. Read or look again.' : `android_scroll failed: ${r.text}` };
    },
};

export const androidOpenTool: EngineTool<{ package: string; serial?: string }> = {
    name: 'android_open',
    description: 'Open an app by its package name (com.whatsapp, com.android.chrome, com.google.android.gm…). android_apps lists the apps the owner installed.',
    parameters: { type: 'object', properties: { package: { type: 'string' }, serial: SERIAL }, required: ['package'] },
    parse: raw => {
        const a = obj(raw);
        return typeof a.package === 'string' && a.package.trim() ? { ok: true, value: { package: a.package.trim(), ...withSerial(a) } } : { ok: false, error: '"package" is the app\'s package name.' };
    },
    async run(a, ctx): Promise<ToolOutcome> {
        const r = await phone(ctx, { op: 'open', ...a });
        did(ctx, 'android_open', r.ok, `open ${a.package}`);
        return { ok: r.ok, output: r.ok ? `Opened ${a.package}. Read the screen to see it.` : `android_open failed: ${r.text}` };
    },
};

export const androidAppsTool: EngineTool<{ serial?: string }> = {
    name: 'android_apps',
    description: 'List the package names of the apps the owner installed on the phone.',
    parameters: { type: 'object', properties: { serial: SERIAL } },
    parse: raw => ({ ok: true, value: withSerial(obj(raw)) }),
    async run(a, ctx): Promise<ToolOutcome> {
        const r = await phone(ctx, { op: 'apps', ...a });
        return { ok: r.ok, output: r.text };
    },
};

export const androidPairTool: EngineTool<{ address: string; code: string }> = {
    name: 'android_pair',
    description: 'Pair this computer with a phone on Wi-Fi: "address" from android_devices (the pairing one), "code" the six digits the phone shows under «Pair device with pairing code» (ask the owner for them). Then android_connect.',
    parameters: { type: 'object', properties: { address: { type: 'string' }, code: { type: 'string' } }, required: ['address', 'code'] },
    parse: raw => {
        const a = obj(raw);
        const address = String(a.address || '').trim(), code = String(a.code ?? '').replace(/\s+/gu, '');
        return address && code ? { ok: true, value: { address, code } } : { ok: false, error: 'android_pair needs "address" and the six-digit "code" the phone shows.' };
    },
    async run(a, ctx): Promise<ToolOutcome> {
        const r = await phone(ctx, { op: 'pair', ...a });
        did(ctx, 'android_pair', r.ok, `pair ${a.address}`);
        if (r.ok) saw(ctx, 'read');
        return { ok: r.ok, output: r.text };
    },
};

export const androidConnectTool: EngineTool<{ address: string }> = {
    name: 'android_connect',
    description: 'Connect to a phone on Wi-Fi that this computer is paired with, at the address its Wireless debugging screen (or android_devices) shows.',
    parameters: { type: 'object', properties: { address: { type: 'string' } }, required: ['address'] },
    parse: raw => {
        const address = String(obj(raw).address || '').trim();
        return address ? { ok: true, value: { address } } : { ok: false, error: '"address" is the phone\'s address, like 192.168.1.40:37011.' };
    },
    async run(a, ctx): Promise<ToolOutcome> {
        const r = await phone(ctx, { op: 'connect', ...a });
        did(ctx, 'android_connect', r.ok, `connect ${a.address}`);
        if (r.ok) saw(ctx, 'read');
        return { ok: r.ok, output: r.text };
    },
};

export const androidTools: EngineTool[] = [
    androidDevicesTool, androidPairTool, androidConnectTool, androidReadTool, androidLookTool, androidTapTool, androidTypeTool,
    androidKeyTool, androidPanelTool, androidScrollTool, androidOpenTool, androidAppsTool,
];
