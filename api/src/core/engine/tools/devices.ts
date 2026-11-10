/**
 * THIS COMPUTER, AS THE ENGINE'S MODEL SEES IT.
 *
 *   device_windows   which windows are open (handle, program, title, place)
 *   device_look      a picture of the screen or of one window
 *   device_read      a window's controls, numbered, with what each can do
 *   device_press     press / set / focus / toggle a control by its number
 *   device_click     click a point read off the last picture of a window
 *   device_type      type text into the window in front
 *   device_keys      press keys (ctrl+s, enter, alt+tab…) in that window
 *   device_scroll    scroll a window
 *   device_open      start a program, open a file or an address
 *   device_focus     bring a window to the front
 *
 * Each one calls engine_device through Joe's gateway. Every action that sends
 * input names its window, and the driver refuses to send it anywhere else.
 * A point read off a picture is mapped back to the real screen through the
 * picture's own frame, so the model never deals with the display's scaling.
 *
 * The run keeps what was done and seen (deviceRecordFor): the operate
 * verifier asks it whether something was done and looked at afterwards.
 */
import fs from 'fs';
import path from 'path';
import type { EngineTool, ParseResult, ToolContext, ToolOutcome } from '../types';
import { toolContextFor } from './shell';
import { describeUi, keyCodes, parseLook, parseUi, parseWindows, screenPoint, type DesktopWindow, type LookFrame, type UiControl } from '../../devices/windows-desktop';

function gateway(): (name: string, input: any, context?: any) => Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../../../modules/services/ToolService').executeTool;
}

/* ───────────────────────── what the run did and saw ───────────────────────── */

export interface DeviceRecord {
    actions: Array<{ tool: string; ok: boolean; at: number; window?: number; what: string }>;
    looks: Array<{ at: number; window?: number; kind: 'look' | 'read' | 'windows' | 'devices' }>;
    frames: Map<string, LookFrame>;
    controls: Map<number, UiControl[]>;
    windows: Map<number, DesktopWindow>;
    /** The linked computer this run works on (device_use); empty for this computer. */
    computer: string;
}

const RECORDS = new Map<string, DeviceRecord>();

export function deviceRecordFor(runId: string): DeviceRecord {
    let r = RECORDS.get(runId);
    if (!r) { r = { actions: [], looks: [], frames: new Map(), controls: new Map(), windows: new Map(), computer: '' }; RECORDS.set(runId, r); }
    return r;
}

export function forgetDeviceRecord(runId: string): void { RECORDS.delete(runId); }

async function device(ctx: ToolContext, input: Record<string, unknown>): Promise<{ ok: boolean; text: string }> {
    const computer = deviceRecordFor(ctx.runId).computer;
    const result = await gateway()('engine_device', computer && input.op !== 'computers' ? { ...input, computer } : input, toolContextFor(ctx));
    const text = result?.output && typeof result.output.text === 'string' ? result.output.text : String(result?.error || 'no answer');
    return { ok: result?.ok === true, text };
}

function act(ctx: ToolContext, tool: string, ok: boolean, what: string, window?: number): void {
    deviceRecordFor(ctx.runId).actions.push({ tool, ok, at: Date.now(), window, what: what.slice(0, 200) });
}

function seen(ctx: ToolContext, kind: 'look' | 'read' | 'windows' | 'devices', window?: number): void {
    deviceRecordFor(ctx.runId).looks.push({ at: Date.now(), window, kind });
}

/* ───────────────────────── arguments ───────────────────────── */

function obj(raw: unknown): Record<string, unknown> | null {
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
}

function windowOf(a: Record<string, unknown>, tool: string, required: boolean): number | undefined | { error: string } {
    if (a.window === undefined || a.window === null || a.window === '') {
        return required ? { error: `${tool} needs "window": the handle number device_windows shows, for example {"window": 132468}.` } : undefined;
    }
    const n = Number(a.window);
    return Number.isInteger(n) && n > 0 ? n : { error: '"window" is the handle number device_windows shows.' };
}

function need<T>(raw: unknown, tool: string, read: (a: Record<string, unknown>) => T | { error: string }): ParseResult<T> {
    const a = obj(raw);
    if (!a) return { ok: false, error: `${tool} takes an object of arguments.` };
    const v = read(a);
    return v && typeof v === 'object' && 'error' in (v as any) ? { ok: false, error: (v as any).error } : { ok: true, value: v as T };
}

/* ───────────────────────── the tools ───────────────────────── */

const WINDOW = { type: 'integer', description: 'The window\'s handle number, as device_windows shows it.' };

function listWindows(ws: DesktopWindow[]): string {
    if (!ws.length) return 'No window is open.';
    return ws.map(w => `[${w.handle}] ${w.process} «${w.title}» at ${w.x},${w.y} ${w.width}×${w.height}${w.foreground ? ' (in front)' : ''}${w.minimized ? ' (minimized)' : ''}`).join('\n');
}

export const deviceWindowsTool: EngineTool<Record<string, never>> = {
    name: 'device_windows',
    description: 'List the windows open on this computer: handle number, program, title, place and size, and which one is in front. Every other device_ tool names a window by this handle number.',
    parameters: { type: 'object', properties: {} },
    parse: () => ({ ok: true, value: {} }),
    async run(_a, ctx): Promise<ToolOutcome> {
        const r = await device(ctx, { op: 'windows' });
        if (!r.ok) return { ok: false, output: `device_windows failed: ${r.text}` };
        const ws = parseWindows(r.text);
        const rec = deviceRecordFor(ctx.runId);
        for (const w of ws) rec.windows.set(w.handle, w);
        seen(ctx, 'windows');
        return { ok: true, output: listWindows(ws) };
    },
};

export interface LookArgs { window?: number }
export const deviceLookTool: EngineTool<LookArgs> = {
    name: 'device_look',
    description: 'Take a picture of the whole screen, or of one window when "window" is given, and look at it. Use it before acting, and again after acting to see what changed. device_click takes points read off the LAST picture of the same window.',
    parameters: { type: 'object', properties: { window: WINDOW } },
    parse: raw => need(raw ?? {}, 'device_look', a => {
        const w = windowOf(a, 'device_look', false);
        return typeof w === 'object' ? w : { ...(w ? { window: w } : {}) };
    }),
    async run(a, ctx): Promise<ToolOutcome> {
        const rec = deviceRecordFor(ctx.runId);
        const target = a.window ? rec.windows.get(a.window) : undefined;
        if (a.window && !target) return { ok: false, output: `Window ${a.window} is not in the last device_windows list: call device_windows first.` };
        const dir = path.join(ctx.stateDir, 'screens');
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `look-${Date.now()}.png`);
        const r = await device(ctx, { op: 'look', file, ...(target ? { left: target.x, top: target.y, width: target.width, height: target.height } : {}), maxWidth: 1280 });
        const frame = r.ok ? parseLook(r.text) : null;
        if (!frame || !fs.existsSync(file)) return { ok: false, output: `device_look failed: ${r.text}` };
        rec.frames.set(String(a.window || 'screen'), frame);
        seen(ctx, 'look', a.window);
        const what = target ? `window [${a.window}] «${target.title}»` : 'the whole screen';
        return {
            ok: true,
            output: `A picture of ${what}, ${frame.pictureWidth}×${frame.pictureHeight}. Points for device_click on ${a.window ? `window ${a.window}` : 'the screen'} are read off this picture.`,
            images: [{ path: file, mime: 'image/png' }],
        };
    },
};

export const deviceReadTool: EngineTool<{ window: number }> = {
    name: 'device_read',
    description: 'Read a window\'s controls: each with a number, its kind (Button, Edit, MenuItem, ListItem, Hyperlink…), its name, its value and what it can do. Acting on a control by its number with device_press is surer than clicking a point.',
    parameters: { type: 'object', properties: { window: WINDOW }, required: ['window'] },
    parse: raw => need(raw, 'device_read', a => { const w = windowOf(a, 'device_read', true); return typeof w === 'object' ? w : { window: w as number }; }),
    async run(a, ctx): Promise<ToolOutcome> {
        const r = await device(ctx, { op: 'ui', window: a.window, limit: 150 });
        if (!r.ok) return { ok: false, output: `device_read failed: ${r.text}` };
        const ui = parseUi(r.text);
        deviceRecordFor(ctx.runId).controls.set(a.window, ui.controls);
        seen(ctx, 'read', a.window);
        return { ok: true, output: ui.controls.length ? describeUi(ui) : `Window «${ui.window}» shows no control it can name: use device_look and device_click.` };
    },
};

const PRESS_ACTIONS: Record<string, string> = { press: 'invoke', set: 'set_value', focus: 'focus', toggle: 'toggle', select: 'select' };
export interface PressArgs { window: number; control: number; action: string; value?: string }
export const devicePressTool: EngineTool<PressArgs> = {
    name: 'device_press',
    description: 'Act on a control from the last device_read of the same window, by its number: "press" a button or link, "set" a text box\'s value (with "value"), "focus" it, "toggle" a check box, "select" a list item.',
    parameters: {
        type: 'object',
        properties: { window: WINDOW, control: { type: 'integer', description: 'The control\'s number from device_read.' }, action: { type: 'string', enum: Object.keys(PRESS_ACTIONS) }, value: { type: 'string', description: 'The text, for "set".' } },
        required: ['window', 'control', 'action'],
    },
    parse: raw => need(raw, 'device_press', a => {
        const w = windowOf(a, 'device_press', true);
        if (typeof w === 'object') return w;
        const control = Number(a.control);
        if (!Number.isInteger(control) || control < 1) return { error: '"control" is the number device_read shows.' };
        const action = String(a.action || 'press');
        if (!PRESS_ACTIONS[action]) return { error: `"action" is one of ${Object.keys(PRESS_ACTIONS).join(', ')}.` };
        if (action === 'set' && typeof a.value !== 'string') return { error: '"set" needs "value": the text to put in the control.' };
        return { window: w as number, control, action, ...(typeof a.value === 'string' ? { value: a.value } : {}) };
    }),
    async run(a, ctx): Promise<ToolOutcome> {
        const r = await device(ctx, { op: 'act', window: a.window, index: a.control, action: PRESS_ACTIONS[a.action], value: a.value ?? '' });
        act(ctx, 'device_press', r.ok, `${a.action} control ${a.control}${a.value !== undefined ? ` = «${a.value}»` : ''}`, a.window);
        return { ok: r.ok, output: r.ok ? `Done: ${a.action} on control ${a.control} (${r.text.replace(/^OK\t?/u, '')}). Look or read again to see the result.` : `device_press failed: ${r.text}` };
    },
};

export interface ClickArgs { window: number; x: number; y: number; button?: 'left' | 'right' | 'middle'; double?: boolean }
export const deviceClickTool: EngineTool<ClickArgs> = {
    name: 'device_click',
    description: 'Click a point of a window, read off the LAST device_look picture of that same window (x, y in that picture). The click happens only if the point is on that window.',
    parameters: {
        type: 'object',
        properties: { window: WINDOW, x: { type: 'integer' }, y: { type: 'integer' }, button: { type: 'string', enum: ['left', 'right', 'middle'] }, double: { type: 'boolean' } },
        required: ['window', 'x', 'y'],
    },
    parse: raw => need(raw, 'device_click', a => {
        const w = windowOf(a, 'device_click', true);
        if (typeof w === 'object') return w;
        const x = Number(a.x), y = Number(a.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return { error: '"x" and "y" are the point on the last picture of the window.' };
        return { window: w as number, x, y, ...(a.button ? { button: a.button as any } : {}), ...(a.double ? { double: true } : {}) };
    }),
    async run(a, ctx): Promise<ToolOutcome> {
        const frame = deviceRecordFor(ctx.runId).frames.get(String(a.window));
        if (!frame) return { ok: false, output: `No picture of window ${a.window} yet: call device_look with {"window": ${a.window}} first, then read the point off it.` };
        if (a.x < 0 || a.y < 0 || a.x > frame.pictureWidth || a.y > frame.pictureHeight) return { ok: false, output: `(${a.x}, ${a.y}) is outside the picture (${frame.pictureWidth}×${frame.pictureHeight}).` };
        const p = screenPoint(frame, a.x, a.y);
        const r = await device(ctx, { op: 'click', x: p.x, y: p.y, button: a.button || 'left', count: a.double ? 2 : 1, window: a.window });
        act(ctx, 'device_click', r.ok, `click ${a.x},${a.y}`, a.window);
        return { ok: r.ok, output: r.ok ? 'Clicked. Look again to see what it did.' : `device_click refused or failed: ${r.text}` };
    },
};

export const deviceTypeTool: EngineTool<{ window: number; text: string }> = {
    name: 'device_type',
    description: 'Type text into the window in front, where its cursor is (click or focus the field first). Any language, Arabic included. A new line is typed as Enter. Refused when that window is not in front.',
    parameters: { type: 'object', properties: { window: WINDOW, text: { type: 'string' } }, required: ['window', 'text'] },
    parse: raw => need(raw, 'device_type', a => {
        const w = windowOf(a, 'device_type', true);
        if (typeof w === 'object') return w;
        if (typeof a.text !== 'string' || !a.text) return { error: '"text" is what to type.' };
        return { window: w as number, text: a.text };
    }),
    async run(a, ctx): Promise<ToolOutcome> {
        const r = await device(ctx, { op: 'type', text: a.text, window: a.window });
        act(ctx, 'device_type', r.ok, `type «${a.text.slice(0, 60)}»`, a.window);
        return { ok: r.ok, output: r.ok ? `Typed ${a.text.length} character(s).` : `device_type refused or failed: ${r.text}` };
    },
};

export const deviceKeysTool: EngineTool<{ window: number; keys: string }> = {
    name: 'device_keys',
    description: 'Press a key or a combination in the window in front: "enter", "tab", "esc", "ctrl+s", "ctrl+shift+t", "alt+f4", "f5", "down"… Refused when that window is not in front.',
    parameters: { type: 'object', properties: { window: WINDOW, keys: { type: 'string' } }, required: ['window', 'keys'] },
    parse: raw => need(raw, 'device_keys', a => {
        const w = windowOf(a, 'device_keys', true);
        if (typeof w === 'object') return w;
        const keys = String(a.keys || '').trim();
        if (!keyCodes(keys)) return { error: `"${keys}" is not a key Joe knows: use names like enter, tab, esc, ctrl+s, alt+f4, f5, up, down, a letter or a digit.` };
        return { window: w as number, keys };
    }),
    async run(a, ctx): Promise<ToolOutcome> {
        const r = await device(ctx, { op: 'key', codes: keyCodes(a.keys), window: a.window });
        act(ctx, 'device_keys', r.ok, `keys ${a.keys}`, a.window);
        return { ok: r.ok, output: r.ok ? `Pressed ${a.keys}.` : `device_keys refused or failed: ${r.text}` };
    },
};

export const deviceScrollTool: EngineTool<{ window: number; amount: number }> = {
    name: 'device_scroll',
    description: 'Scroll a window: "amount" notches, positive up, negative down.',
    parameters: { type: 'object', properties: { window: WINDOW, amount: { type: 'integer' } }, required: ['window', 'amount'] },
    parse: raw => need(raw, 'device_scroll', a => {
        const w = windowOf(a, 'device_scroll', true);
        if (typeof w === 'object') return w;
        const amount = Math.round(Number(a.amount));
        return Number.isFinite(amount) && amount !== 0 ? { window: w as number, amount: Math.max(-30, Math.min(30, amount)) } : { error: '"amount" is a whole number of notches, positive up, negative down.' };
    }),
    async run(a, ctx): Promise<ToolOutcome> {
        const w = deviceRecordFor(ctx.runId).windows.get(a.window);
        if (!w) return { ok: false, output: `Window ${a.window} is not in the last device_windows list: call device_windows first.` };
        const r = await device(ctx, { op: 'scroll', x: Math.round(w.x + w.width / 2), y: Math.round(w.y + w.height / 2), notches: a.amount, window: a.window });
        act(ctx, 'device_scroll', r.ok, `scroll ${a.amount}`, a.window);
        return { ok: r.ok, output: r.ok ? 'Scrolled. Look again to see where it is.' : `device_scroll refused or failed: ${r.text}` };
    },
};

export const deviceOpenTool: EngineTool<{ target: string }> = {
    name: 'device_open',
    description: 'Start a program (notepad, calc, mspaint, excel, a full path to an .exe), open a file with its program, or open a web address in the default browser. Then call device_windows to find its window.',
    parameters: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] },
    parse: raw => need<{ target: string }>(raw, 'device_open', a => {
        const target = String(a.target || '').trim();
        return target ? { target } : { error: '"target" is the program, file or address to open.' };
    }),
    async run(a, ctx): Promise<ToolOutcome> {
        const r = await device(ctx, { op: 'open', target: a.target });
        act(ctx, 'device_open', r.ok, `open ${a.target}`);
        if (!r.ok) return { ok: false, output: `device_open failed: ${r.text}` };
        await new Promise(res => setTimeout(res, 1500));
        return { ok: true, output: `Opened ${a.target}. Call device_windows to find its window (it may take a moment to appear).` };
    },
};

export const deviceFocusTool: EngineTool<{ window: number }> = {
    name: 'device_focus',
    description: 'Bring a window to the front (restoring it when minimized), so keys and typing go to it.',
    parameters: { type: 'object', properties: { window: WINDOW }, required: ['window'] },
    parse: raw => need(raw, 'device_focus', a => { const w = windowOf(a, 'device_focus', true); return typeof w === 'object' ? w : { window: w as number }; }),
    async run(a, ctx): Promise<ToolOutcome> {
        const r = await device(ctx, { op: 'focus', window: a.window });
        const ok = r.ok && /True/u.test(r.text);
        act(ctx, 'device_focus', ok, 'focus', a.window);
        return { ok, output: ok ? `Window ${a.window} is in front.` : `device_focus could not bring window ${a.window} to the front: ${r.text}` };
    },
};

export const deviceComputersTool: EngineTool<Record<string, never>> = {
    name: 'device_computers',
    description: 'List every device you can reach: this computer, the other computers the owner linked to Joe (by name), and the Android phones connected by cable or visible on this Wi-Fi. Call it first when the owner asks what you can reach, or names another computer or his phone.',
    parameters: { type: 'object', properties: {} },
    parse: () => ({ ok: true, value: {} }),
    async run(_a, ctx): Promise<ToolOutcome> {
        const r = await device(ctx, { op: 'computers' });
        let phones = '';
        try {
            const p = await gateway()('engine_android', { op: 'devices' }, toolContextFor(ctx));
            const text = p?.output && typeof p.output.text === 'string' ? p.output.text : String(p?.error || '');
            phones = text ? `Phones:\n${text}` : '';
        } catch { /* the computers are still listed */ }
        seen(ctx, 'devices');
        const add = 'To add a computer for good, device_link_new with the name the owner gives it («كمبيوتر المكتب»): he runs one line on it ONCE, and from then on it calls Joe by itself at every start. To add a phone, see the Phones lines. Every device on his Wi-Fi (printers, TVs, phones, smart devices): network_devices.';
        return { ok: r.ok, output: [r.text, phones, add].filter(Boolean).join('\n\n') };
    },
};

/**
 * Every device on the owner's Wi-Fi (core/devices/network-scan.ts). The
 * owner, 2026-11-08: «are there devices on the same Wi-Fi?» got instructions
 * to type `arp -a` himself.
 *
 * Through device(), like every other device_ tool, so the computer chosen
 * with device_use travels with it: the scan called the gateway directly and
 * answered with Joe's own network as if it were the chosen computer's
 * (2026-11-08). With a linked computer chosen, engine_device runs the scan ON
 * that computer (device-link.ts scanNetwork); one linked before that change
 * must be relinked once, and nothing else is scanned in its place.
 */
export const networkDevicesTool: EngineTool<Record<string, never>> = {
    name: 'network_devices',
    description: 'List every device on the owner\'s Wi-Fi / home network now: each address with its maker and what it most likely is (router, phone, TV, printer, smart device, computer), and which of them Joe can control. Use it when he asks what is on his Wi-Fi or network, how many devices, or to check or scan it. It scans the network of the computer device_use chose: Joe\'s own computer, or a linked computer (then the scan runs ON that computer and lists ITS network; a computer linked before this could must be relinked once, and the answer says so). Takes about ten seconds.',
    parameters: { type: 'object', properties: {} },
    parse: () => ({ ok: true, value: {} }),
    async run(_a, ctx): Promise<ToolOutcome> {
        const r = await device(ctx, { op: 'network' });
        if (r.ok) seen(ctx, 'devices');
        return { ok: r.ok, output: r.ok ? r.text : (r.text && r.text !== 'no answer' ? r.text : 'the network could not be read') };
    },
};

const LINK_WORDS: Record<string, (command: string, minutes: number, via: string) => string> = {
    ar: (command, minutes, via) => [
        'لربط الحاسوب الآخر بجو، افتح عليه PowerShell والصق هذا السطر ثم اضغط Enter:',
        command,
        `السطر يعمل مرة واحدة خلال ${minutes} دقائق. ستظهر هناك نافذة تقول إن جو يتحكم بالحاسوب، وإغلاقها ينهي الربط فوراً.`,
        via === 'lan' ? 'هذا السطر يعمل من حاسوب على الشبكة نفسها (البيت أو المكتب).' : via === 'local' ? 'تنبيه: جو مفتوح على عنوان محلي فقط، فلن يصل إليه حاسوب آخر إلا عبر عنوان شبكة أو عنوان عام.' : '',
    ].filter(Boolean).join('\n'),
    en: (command, minutes, via) => [
        'To link the other computer to Joe, open PowerShell on it, paste this line and press Enter:',
        command,
        `The line works once, within ${minutes} minutes. A window there says Joe is in control; closing it ends the link at once.`,
        via === 'lan' ? 'This line works from a computer on the same network (home or office).' : via === 'local' ? 'Note: Joe is open at a local address only, so another computer reaches it only through a network or public address.' : '',
    ].filter(Boolean).join('\n'),
};

/**
 * The words for a PERMANENT link (linked-computers.ts): run once, and the
 * computer calls Joe by itself at every start, under the name given.
 */
const KEEP_WORDS: Record<string, (command: string, minutes: number, via: string, name: string) => string> = {
    ar: (command, minutes, via, name) => [
        `لربط «${name}» بجو ربطاً دائماً: افتح على ذلك الكمبيوتر برنامج PowerShell، والصق هذا السطر، واضغط Enter، مرة واحدة فقط في العمر:`,
        command,
        `السطر صالح لمدة ${minutes} دقائق. بعده يبقى الكمبيوتر مربوطاً دائماً باسم «${name}»: يتصل بجو وحده كلما شُغّل ويندوز، وتظهر أيقونة جو قرب الساعة، ومنها يُوقَف أو يُفصل نهائياً. بعدها تكفي جملة «اشبك على ${name}» من أي مكان.`,
        via === 'lan' ? 'تنبيه: جو الآن على عنوان داخل شبكتك فقط، فهذا الكمبيوتر يصل إليه وهو على الشبكة نفسها. ليصل إليه من مدينة أخرى يحتاج جو عنواناً على الإنترنت.' : via === 'local' ? 'تنبيه: جو مفتوح على عنوان محلي فقط، فلن يصل إليه كمبيوتر آخر إلا عبر عنوان شبكة أو عنوان عام.' : '',
    ].filter(Boolean).join('\n'),
    en: (command, minutes, via, name) => [
        `To link «${name}» to Joe for good: open PowerShell on that computer, paste this line and press Enter — once, ever:`,
        command,
        `The line works for ${minutes} minutes. From then on the computer stays linked as «${name}»: it calls Joe by itself whenever Windows starts, and Joe's icon by its clock stops it or unlinks it for good. Then «connect to ${name}» works from anywhere.`,
        via === 'lan' ? 'Note: Joe is at an address inside your network only, so this computer reaches it while on the same network. From another city, Joe needs an address on the internet.' : via === 'local' ? 'Note: Joe is open at a local address only, so another computer reaches it only through a network or public address.' : '',
    ].filter(Boolean).join('\n'),
};

export const deviceLinkNewTool: EngineTool<{ name?: string }> = {
    name: 'device_link_new',
    description: 'The owner asked for a computer that is not linked yet: show him, now, in his language, the one line to run on that computer. With "name" (what the owner calls it: «كمبيوتر المكتب», "home PC") the link is PERMANENT — run once, the computer calls Joe by itself at every start and is known by that name from anywhere; give a name whenever he will use that computer again. Without a name, the link lasts this session. Then call device_wait_link.',
    parameters: { type: 'object', properties: { name: { type: 'string', description: 'The name the owner gives the computer; makes the link permanent.' } } },
    parse: raw => {
        const name = String(obj(raw)?.name ?? '').replace(/\s+/gu, ' ').trim().slice(0, 60);
        return { ok: true, value: name ? { name } : {} };
    },
    async run(a, ctx): Promise<ToolOutcome> {
        const result = await gateway()('engine_device', { op: 'pair', ...(a.name ? { name: a.name } : {}) }, toolContextFor(ctx));
        const out = result?.output || {};
        if (result?.ok !== true || typeof out.command !== 'string') return { ok: false, output: `device_link_new failed: ${String(out.text || result?.error || 'no line was made')}` };
        const minutes = Math.max(1, Math.round((Number(out.expiresAt) - Date.now()) / 60_000));
        const lang = String(ctx.replyLanguage || ctx.language || 'en').startsWith('ar') ? 'ar' : 'en';
        const message = a.name ? KEEP_WORDS[lang](out.command, minutes, String(out.via || ''), a.name) : LINK_WORDS[lang](out.command, minutes, String(out.via || ''));
        //  Shown in the chat now, while the run waits for the computer.
        ctx.emit({ type: 'thought', text: message });
        act(ctx, 'device_link_new', true, 'showed the owner the line that links another computer');
        return { ok: true, output: `The owner was shown this, in his language:\n${message}\n\nNow call device_wait_link: it returns the computer's name when it connects. Repeat the line in task_finish if it never does.` };
    },
};

export const deviceWaitLinkTool: EngineTool<{ minutes: number }> = {
    name: 'device_wait_link',
    description: 'Wait for a computer to link after device_link_new (up to "minutes", 10 at most). Returns its name; then device_use it.',
    parameters: { type: 'object', properties: { minutes: { type: 'integer', description: 'How long to wait, 1 to 10.' } } },
    parse: raw => ({ ok: true, value: { minutes: Math.max(1, Math.min(10, Math.round(Number(obj(raw)?.minutes) || 5))) } }),
    async run(a, ctx): Promise<ToolOutcome> {
        const names = async (): Promise<Array<{ name: string; connectedAt: number; online?: boolean }>> => {
            const r = await gateway()('engine_device', { op: 'linked' }, toolContextFor(ctx));
            try { return JSON.parse(String(r?.output?.text || '[]')); } catch { return []; }
        };
        //  A computer that comes ONLINE: a kept one is listed (off) before it calls the first time.
        const online = (list: Array<{ name: string; online?: boolean }>) => list.filter(d => d.online !== false);
        const before = new Set(online(await names()).map(d => d.name));
        const until = Math.min(Date.now() + a.minutes * 60_000, ctx.deadlineAt - 30_000);
        while (Date.now() < until && !ctx.signal.aborted) {
            const fresh = online(await names()).find(d => !before.has(d.name));
            if (fresh) {
                act(ctx, 'device_wait_link', true, `linked «${fresh.name}»`);
                seen(ctx, 'devices');
                return { ok: true, output: `«${fresh.name}» is linked (${(fresh as any).os || 'Windows'}). device_use {"computer": "${fresh.name}"} to work on it.` };
            }
            await new Promise(r => setTimeout(r, 3000));
        }
        return { ok: false, output: `No computer linked within ${a.minutes} minute(s). Tell the owner the line is still waiting (it works for ten minutes from when it was shown), or offer a new one.` };
    },
};

export const deviceUseTool: EngineTool<{ computer: string }> = {
    name: 'device_use',
    description: 'Choose the computer every following device_ tool works on: the name of a linked computer from device_computers, or "this" for this computer. Window numbers belong to one computer: after switching, call device_windows again.',
    parameters: { type: 'object', properties: { computer: { type: 'string' } }, required: ['computer'] },
    parse: raw => need<{ computer: string }>(raw, 'device_use', a => {
        const computer = String(a.computer || '').trim();
        return computer ? { computer } : { error: '"computer" is a name from device_computers, or "this".' };
    }),
    async run(a, ctx): Promise<ToolOutcome> {
        const rec = deviceRecordFor(ctx.runId);
        const here = /^(this|here|local|this computer|هذا|هذا الحاسوب|هذا الكمبيوتر|جهازي)$/iu.test(a.computer);
        let chosen = a.computer;
        if (!here) {
            //  The owner's computers as Joe keeps them: online now, or kept and off.
            const r = await gateway()('engine_device', { op: 'linked' }, toolContextFor(ctx));
            let list: Array<{ name: string; online?: boolean; kept?: boolean }> = [];
            try { list = JSON.parse(String(r?.output?.text || '[]')); } catch { /* none */ }
            const want = a.computer.trim().toLowerCase();
            const match = list.find(d => d.name.toLowerCase() === want)
                //  «كمبيوتر المكتب» for a computer kept as «المكتب», or the reverse.
                || list.find(d => d.name.toLowerCase().includes(want) || want.includes(d.name.toLowerCase()));
            if (!match) {
                const text = (await device(ctx, { op: 'computers' })).text;
                return { ok: false, output: `The owner has no computer named «${a.computer}».\n${text}` };
            }
            if (match.online === false) {
                return { ok: false, output: `«${match.name}» is linked for good but is OFF or without internet now: it connects by itself as soon as it is on. Tell the owner so (ask_owner or task_finish); nothing can reach it until then.` };
            }
            chosen = match.name;
        }
        rec.computer = here ? '' : chosen;
        rec.windows.clear(); rec.frames.clear(); rec.controls.clear();
        return { ok: true, output: `Now working on ${here ? 'this computer' : `«${chosen}»`}. Call device_windows to see its windows.` };
    },
};

/**
 * Unlink a computer for good (the owner: «افصل كمبيوتر المكتب نهائياً»): its
 * key opens nothing any more, and its agent removes itself from that computer
 * the next time it calls.
 */
export const deviceForgetTool: EngineTool<{ computer: string }> = {
    name: 'device_forget',
    description: 'Unlink one of the owner\'s computers FOR GOOD, only when he asks for exactly that («افصل … نهائياً», "unlink … for good"): Joe forgets it, and its agent removes itself from that computer. Give its EXACT name as device_computers lists it: any other name unlinks nothing and comes back with the names that come close — then ask the owner which one he means, never pick one for him.',
    parameters: { type: 'object', properties: { computer: { type: 'string' } }, required: ['computer'] },
    parse: raw => need<{ computer: string }>(raw, 'device_forget', a => {
        const computer = String(a.computer || '').trim();
        return computer ? { computer } : { error: '"computer" is the name of the computer to unlink for good.' };
    }),
    async run(a, ctx): Promise<ToolOutcome> {
        const r = await gateway()('engine_device', { op: 'forget', computer: a.computer }, toolContextFor(ctx));
        const text = String(r?.output?.text || r?.error || '');
        //  A refusal is recorded as one: «unlinked» was written even when nothing was forgotten.
        act(ctx, 'device_forget', r?.ok === true, r?.ok === true ? `unlinked «${a.computer}» for good` : `did not unlink «${a.computer}»: nothing was forgotten`);
        if (r?.ok === true) seen(ctx, 'devices');
        return { ok: r?.ok === true, output: text };
    },
};

export const deviceTools: EngineTool[] = [
    deviceComputersTool, networkDevicesTool, deviceLinkNewTool, deviceWaitLinkTool, deviceUseTool, deviceForgetTool, deviceWindowsTool, deviceLookTool, deviceReadTool, devicePressTool, deviceClickTool,
    deviceTypeTool, deviceKeysTool, deviceScrollTool, deviceOpenTool, deviceFocusTool,
];
