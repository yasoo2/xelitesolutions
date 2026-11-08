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

/**
 * «hold»: press and hold. The owner's lock screen, 2026-11-07: its flashlight
 * button said «press and hold», and a tap did nothing; so do a message's
 * menu, an icon's shortcuts, a word to select.
 */
export interface TapArgs { control?: number; x?: number; y?: number; hold?: boolean; serial?: string }
export const androidTapTool: EngineTool<TapArgs> = {
    name: 'android_tap',
    description: 'Tap a control by its number from the last android_read ("control"), or a point in the phone\'s pixels ("x", "y"). "hold": true presses and holds (about a second) for what says «press and hold» / «اضغط مطولاً», a message\'s menu, an icon\'s shortcuts. A sleeping screen is woken first.',
    parameters: { type: 'object', properties: { control: { type: 'integer' }, x: { type: 'integer' }, y: { type: 'integer' }, hold: { type: 'boolean' }, serial: SERIAL } },
    parse: raw => {
        const a = obj(raw);
        const hold = a.hold === true || a.hold === 'true' ? { hold: true } : {};
        const control = Number(a.control);
        if (Number.isInteger(control) && control > 0) return { ok: true, value: { control, ...hold, ...withSerial(a) } };
        const x = Number(a.x), y = Number(a.y);
        if (Number.isFinite(x) && Number.isFinite(y)) return { ok: true, value: { x, y, ...hold, ...withSerial(a) } };
        return { ok: false, error: 'android_tap takes "control" (a number from android_read) or "x" and "y".' };
    },
    async run(a, ctx): Promise<ToolOutcome> {
        const verb = a.hold ? 'hold' : 'tap';
        let x = a.x, y = a.y, what = `${verb} ${a.x},${a.y}`;
        if (a.control) {
            const c = (CONTROLS.get(ctx.runId) || []).find(k => k.index === a.control);
            if (!c) return { ok: false, output: `Control ${a.control} is not in the last android_read: read the screen again.` };
            x = Math.round(c.x + c.width / 2); y = Math.round(c.y + c.height / 2);
            what = `${verb} [${c.index}] «${c.text || c.description}»`;
        }
        const r = await phone(ctx, { op: 'tap', x, y, ...(a.hold ? { holdMs: 1000 } : {}), ...withSerial(a as any) });
        did(ctx, 'android_tap', r.ok, what);
        const woke = /^The screen was asleep/u.test(r.text) ? 'The screen was asleep and was woken first. ' : '';
        return { ok: r.ok, output: r.ok ? `${woke}${a.hold ? 'Pressed and held' : 'Tapped'}. Read or look again to see what it did.` : `android_tap failed: ${r.text}` };
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

/*
 * WRITING AN EMAIL WITHOUT TYPING INTO ITS FIELDS.
 *
 * The owner, 2026-11-08: «send an email from Gmail to Outlook». Joe tapped
 * Gmail's «To» field and typed; the address and the subject ended in the same
 * field, deleting did not empty it, and after three minutes Joe asked him what
 * to do. android_email opens the mail app's new message already filled (To,
 * Cc, Subject, text) from one mailto: address; the run reads it, checks every
 * field, and taps Send. android_clear empties the field the cursor is in.
 */
const MAIL_APP: Record<string, string> = { gmail: 'com.google.android.gm', outlook: 'com.microsoft.office.outlook' };
const emails = (v: unknown): string[] => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;\s]+/u) : [])
    .map(x => String(x).trim()).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(x));

export const androidEmailTool: EngineTool<{ to: string[]; cc?: string[]; subject?: string; body?: string; app?: string; serial?: string }> = {
    name: 'android_email',
    description: 'Open a NEW email on the owner\'s phone with every field already filled: To, Cc, Subject and the text (any language), in Gmail or Outlook. Use it instead of tapping and typing into an email\'s fields. Then android_read: check the recipient, the subject and the text, tap Send by its number, and check the Sent folder. It sends nothing by itself.',
    parameters: {
        type: 'object',
        properties: {
            to: { type: 'array', items: { type: 'string' }, description: 'Recipient addresses (name@example.com).' },
            cc: { type: 'array', items: { type: 'string' } },
            subject: { type: 'string' },
            body: { type: 'string', description: 'The text of the email.' },
            app: { type: 'string', enum: ['gmail', 'outlook'], description: 'The app to write it in (the account it is sent from): gmail or outlook.' },
            serial: SERIAL,
        },
        required: ['to'],
    },
    parse: raw => {
        const a = obj(raw);
        const to = emails(a.to);
        if (!to.length) return { ok: false, error: '"to" holds the recipient addresses (name@example.com). The owner\'s own accounts are in the facts above; ask him only for an address nobody named.' };
        const app = String(a.app || '').trim().toLowerCase();
        return {
            ok: true,
            value: {
                to,
                ...(emails(a.cc).length ? { cc: emails(a.cc) } : {}),
                ...(typeof a.subject === 'string' && a.subject.trim() ? { subject: a.subject.trim().slice(0, 300) } : {}),
                ...(typeof a.body === 'string' && a.body.trim() ? { body: a.body.slice(0, 5000) } : {}),
                ...(MAIL_APP[app] ? { app } : {}),
                ...withSerial(a),
            },
        };
    },
    async run(a, ctx): Promise<ToolOutcome> {
        const r = await phone(ctx, { op: 'email', to: a.to, cc: a.cc || [], subject: a.subject || '', body: a.body || '', app: a.app ? MAIL_APP[a.app] : '', ...withSerial(a as any) });
        did(ctx, 'android_email', r.ok, `new email to ${a.to.join(', ')}${a.subject ? ` «${a.subject.slice(0, 60)}»` : ''}`);
        return { ok: r.ok, output: r.ok ? `A new email to ${a.to.join(', ')} is open and filled${a.app ? ` in ${a.app}` : ''}. Read the screen now: check To, Subject and the text, then tap Send by its number. Nothing is sent yet.` : `android_email failed: ${r.text}` };
    },
};

export const androidClearTool: EngineTool<{ serial?: string }> = {
    name: 'android_clear',
    description: 'Empty the text field the phone\'s cursor is in (tap the field first): all its text, and the recipient chips of an email field. Use it to fix a field that holds the wrong text, instead of deleting character by character.',
    parameters: { type: 'object', properties: { serial: SERIAL } },
    parse: raw => ({ ok: true, value: withSerial(obj(raw)) }),
    async run(a, ctx): Promise<ToolOutcome> {
        const r = await phone(ctx, { op: 'clear', ...a });
        did(ctx, 'android_clear', r.ok, 'empty the field');
        return { ok: r.ok, output: r.ok ? 'The field is empty. Read the screen to check, then type what belongs there.' : `android_clear failed: ${r.text}` };
    },
};

export const androidLinkTool: EngineTool<{ uri: string; package?: string; serial?: string }> = {
    name: 'android_link',
    description: 'Open an address on the phone in the app that handles it: a web page (https://…), a phone number to call (tel:+…), an SMS (sms:+…?body=…), a place on the map (geo:lat,lng?q=…), a WhatsApp chat (https://wa.me/<number>?text=…). Encode spaces and Arabic (%20…). It opens; it sends or calls nothing until a button is tapped.',
    parameters: { type: 'object', properties: { uri: { type: 'string' }, package: { type: 'string', description: 'Optional: the app to open it in.' }, serial: SERIAL }, required: ['uri'] },
    parse: raw => {
        const a = obj(raw);
        const uri = String(a.uri || '').trim();
        return uri ? { ok: true, value: { uri, ...(typeof a.package === 'string' && a.package.trim() ? { package: a.package.trim() } : {}), ...withSerial(a) } } : { ok: false, error: '"uri" is the address to open.' };
    },
    async run(a, ctx): Promise<ToolOutcome> {
        const r = await phone(ctx, { op: 'uri', ...a });
        did(ctx, 'android_link', r.ok, `open ${a.uri.slice(0, 80)}`);
        return { ok: r.ok, output: r.ok ? `Opened ${a.uri.slice(0, 80)}. Read the screen to see it.` : `android_link failed: ${r.text}` };
    },
};

export const androidTools: EngineTool[] = [
    androidDevicesTool, androidPairTool, androidConnectTool, androidReadTool, androidLookTool, androidTapTool, androidTypeTool,
    androidKeyTool, androidPanelTool, androidScrollTool, androidOpenTool, androidAppsTool, androidEmailTool, androidClearTool, androidLinkTool,
];
