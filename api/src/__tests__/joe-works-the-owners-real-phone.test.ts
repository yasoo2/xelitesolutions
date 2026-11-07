/**
 *  JOE WORKS THE OWNER'S REAL PHONE — WHAT THE FIRST EVENING ON THE CABLE TAUGHT.
 *
 *  2026-11-07, a TECNO KI7 (Android 13) on the cable, the owner at Joe's chat:
 *   1. «اشبك على هاتفي وقل لي شو الظاهر على شاشته»: the picture came back all
 *      black — the screen had gone to sleep — and Joe could only say so. The
 *      phone now says first whether its screen is off and whether it is locked
 *      (what `dumpsys` answered on that phone is below), and android_key has
 *      «wakeup», which only wakes.
 *   2. «شغل الكشاف في الهاتف» went to the chat's answerer, which gave advice:
 *      without «هاتفي» it was not an action on a device. A command on «the
 *      phone», the flashlight, and a short command after work on a device in
 *      the same chat now go to the phone. The flashlight is a quick-settings
 *      tile: android_panel opens them.
 *   3. plan_update refused «add R1 and mark it» in one call; the log read
 *      «ERROR: Unknown error».
 */
import { AndroidPhone, androidKey, describeScreen, parseScreenState, type AdbRunner } from '../core/devices/android';

//  What the owner's phone answered, trimmed to the lines read.
const POWER_ASLEEP = 'Power Manager State:\n  mDirty=0x0\n  mWakefulness=Asleep\n  mWakefulnessChanging=false\n';
const POWER_AWAKE = 'Power Manager State:\n  mWakefulness=Awake\n';
const POLICY_LOCKED = 'WINDOW MANAGER POLICY STATE (dumpsys window policy)\n    KeyguardServiceDelegate\n      showing=true\n      showingAndNotOccluded=true\n      inputRestricted=false\n      occluded=false\n      secure=true\n      dreaming=false\n';
const POLICY_OPEN = 'WINDOW MANAGER POLICY STATE (dumpsys window policy)\n    KeyguardServiceDelegate\n      showing=false\n      secure=true\n';

function fakeAdb(answers: Record<string, { code?: number; stdout?: string; stderr?: string }>) {
    const calls: string[][] = [];
    const run: AdbRunner = async args => {
        calls.push(args);
        const key = args.slice(2).join(' ');
        const hit = Object.entries(answers).sort((a, b) => b[0].length - a[0].length).find(([k]) => key.startsWith(k));
        const a = hit ? hit[1] : {};
        return { code: a.code ?? 0, stdout: a.stdout ?? '', stderr: a.stderr ?? '' };
    };
    return { run, calls };
}

describe('the phone says whether its screen is on and whether it is locked', () => {
    test('read off what the owner\'s phone answered', () => {
        expect(parseScreenState(POWER_ASLEEP, POLICY_LOCKED)).toEqual({ awake: false, locked: true, secure: true });
        expect(parseScreenState(POWER_AWAKE, POLICY_OPEN)).toEqual({ awake: true, locked: false, secure: true });
        expect(parseScreenState('', '    isKeyguardShowing=true\n')).toEqual({ awake: null, locked: true, secure: null });
        expect(parseScreenState('', '')).toEqual({ awake: null, locked: null, secure: null });
    });

    test('an off screen is said with how to wake it, a locked one with what still works and the rule about the PIN', () => {
        const off = describeScreen({ awake: false, locked: true, secure: true });
        expect(off).toMatch(/screen is OFF/u);
        expect(off).toMatch(/android_key "wakeup"/u);
        expect(off).toMatch(/LOCKED with a PIN/u);
        expect(off).toMatch(/android_panel "quick_settings"/u);
        expect(off).toMatch(/Never type a PIN/u);
        expect(describeScreen({ awake: true, locked: true, secure: false })).toMatch(/no PIN: a swipe up/u);
        expect(describeScreen({ awake: true, locked: false, secure: true })).toBe('');
    });

    test('wakeup only wakes (224); power toggles (26)', () => {
        expect(androidKey('wakeup')).toBe(224);
        expect(androidKey('wake')).toBe(224);
        expect(androidKey('sleep')).toBe(223);
        expect(androidKey('power')).toBe(26);
    });

    test('the phone is asked through dumpsys as argv, and the panels through the status bar', async () => {
        const adb = fakeAdb({
            'shell dumpsys power': { stdout: POWER_ASLEEP },
            'shell dumpsys window policy': { stdout: POLICY_LOCKED },
        });
        const phone = new AndroidPhone(adb.run, 'SER1');
        expect(await phone.screen()).toEqual({ awake: false, locked: true, secure: true });
        expect(adb.calls).toEqual([['-s', 'SER1', 'shell', 'dumpsys', 'power'], ['-s', 'SER1', 'shell', 'dumpsys', 'window', 'policy']]);
        adb.calls.length = 0;
        expect(await phone.panel('quick_settings')).toEqual({ ok: true });
        expect(await phone.panel('quick settings')).toEqual({ ok: true });
        expect(await phone.panel('notifications')).toEqual({ ok: true });
        expect(await phone.panel('close')).toEqual({ ok: true });
        expect(adb.calls.map(c => c.slice(2).join(' '))).toEqual([
            'shell cmd statusbar expand-settings', 'shell cmd statusbar expand-settings',
            'shell cmd statusbar expand-notifications', 'shell cmd statusbar collapse',
        ]);
        const bad = await phone.panel('everything');
        expect(bad.ok).toBe(false);
        expect(adb.calls).toHaveLength(4);
    });

    test('the ADB Keyboard installed but not turned on: Joe turns it on, types Arabic, and the owner\'s keyboard comes back', async () => {
        //  What the owner's phone listed right after the install, 2026-11-08.
        const LATIN = 'com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME';
        const adb = fakeAdb({
            'shell ime list -s': { stdout: `com.facemoji.lite.transsion/com.baidu.simeji.SimejiIME\n${LATIN}\n` },
            'shell ime list -a -s': { stdout: `com.facemoji.lite.transsion/com.baidu.simeji.SimejiIME\ncom.android.adbkeyboard/.AdbIME\n${LATIN}\n` },
            'shell ime enable': { stdout: 'Input method com.android.adbkeyboard/.AdbIME: now enabled for user #0\n' },
            'shell settings get secure default_input_method': { stdout: `${LATIN}\n` },
            'shell am broadcast': { stdout: 'Broadcasting: Intent { act=ADB_INPUT_B64 flg=0x400000 }\nBroadcast completed: result=0\n' },
        });
        const waits: number[] = [];
        const phone = new AndroidPhone(adb.run, 'SER1', async ms => { waits.push(ms); });
        expect(await phone.type('مرحبا من جو')).toEqual({ ok: true });
        const sent = adb.calls.map(c => c.slice(2).join(' '));
        expect(sent).toEqual([
            'shell ime list -s',
            'shell ime list -a -s',
            'shell ime enable com.android.adbkeyboard/.AdbIME',
            'shell settings get secure default_input_method',
            'shell ime set com.android.adbkeyboard/.AdbIME',
            `shell am broadcast -a ADB_INPUT_B64 --es msg ${Buffer.from('مرحبا من جو', 'utf8').toString('base64')}`,
            `shell ime set ${LATIN}`,
        ]);
        expect(waits).toEqual([500, 300]);
    });

    test('a build without «policy» keyguard lines falls back to the full window dump', async () => {
        const adb = fakeAdb({
            'shell dumpsys power': { stdout: POWER_AWAKE },
            'shell dumpsys window policy': { stdout: 'nothing here' },
            'shell dumpsys window': { stdout: 'x\n    isKeyguardShowing=false\n' },
        });
        expect(await new AndroidPhone(adb.run, 'S').screen()).toEqual({ awake: true, locked: false, secure: null });
    });
});

describe('the gateway puts the screen\'s state before the controls and after the picture', () => {
    test('read and look carry it; panel is an action', async () => {
        jest.resetModules();
        const answers: Record<string, { code?: number; stdout?: string }> = {
            'devices -l': { stdout: 'List of devices attached\nSER1 device usb:1 product:KI7-TR model:TECNO_KI7 transport_id:2\n' },
            'shell dumpsys power': { stdout: POWER_ASLEEP },
            'shell dumpsys window policy': { stdout: POLICY_LOCKED },
            'shell uiautomator dump': { stdout: 'UI hierchary dumped to: /sdcard/joe-ui.xml' },
            'exec-out cat': { stdout: '<?xml version="1.0"?><hierarchy rotation="0"><node index="0" text="11:12" resource-id="" class="android.widget.TextView" package="com.android.systemui" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[400,300][680,420]" /></hierarchy>' },
            'shell cmd statusbar': { stdout: '' },
        };
        jest.doMock('../kernel/ExecutionGateway', () => ({
            ExecutionGateway: {
                execute: async (_exe: string, args: string[]) => {
                    const key = (args[0] === '-s' ? args.slice(2) : args).join(' ');
                    const hit = Object.entries(answers).sort((a, b) => b[0].length - a[0].length).find(([k]) => key.startsWith(k));
                    return { success: true, data: { exitCode: 0, output: hit ? hit[1].stdout : '', error: '' } };
                },
            },
        }));
        const prev = process.env.JOE_ADB;
        process.env.JOE_ADB = __filename;
        try {
            const { EngineAndroidTool } = require('../modules/tools/definitions/EngineAndroidTool');
            const tool = new EngineAndroidTool();
            const read = await tool.execute({ op: 'read' });
            expect(read.ok).toBe(true);
            const text: string = read.output.text;
            expect(text).toMatch(/^The phone's screen is OFF/u);
            expect(text).toMatch(/LOCKED with a PIN/u);
            expect(text).toMatch(/\[1\] TextView «11:12»/u);
            const panel = await tool.execute({ op: 'panel', panel: 'quick_settings' });
            expect(panel.ok).toBe(true);
            const wrong = await tool.execute({ op: 'panel', panel: 'all' });
            expect(wrong.ok).toBe(false);
        } finally {
            if (prev === undefined) delete process.env.JOE_ADB; else process.env.JOE_ADB = prev;
            jest.dontMock('../kernel/ExecutionGateway');
        }
    });

    test('a tap on a sleeping screen wakes it first; on a lit one it does not; «hold» presses and holds in place', async () => {
        jest.resetModules();
        const calls: string[] = [];
        let power = POWER_ASLEEP;
        jest.doMock('../kernel/ExecutionGateway', () => ({
            ExecutionGateway: {
                execute: async (_exe: string, args: string[]) => {
                    const key = (args[0] === '-s' ? args.slice(2) : args).join(' ');
                    calls.push(key);
                    if (key === 'shell input keyevent 224') power = POWER_AWAKE;
                    const out = key.startsWith('devices') ? 'List of devices attached\nSER1 device usb:1 model:TECNO_KI7\n' : key === 'shell dumpsys power' ? power : '';
                    return { success: true, data: { exitCode: 0, output: out, error: '' } };
                },
            },
        }));
        const prev = process.env.JOE_ADB;
        process.env.JOE_ADB = __filename;
        try {
            const { EngineAndroidTool } = require('../modules/tools/definitions/EngineAndroidTool');
            const tool = new EngineAndroidTool();
            const first = await tool.execute({ op: 'tap', x: 540, y: 2000 });
            expect(first.ok).toBe(true);
            expect(first.output.text).toMatch(/^The screen was asleep: Joe woke it first/u);
            expect(calls.filter(c => !c.startsWith('devices'))).toEqual(['shell dumpsys power', 'shell input keyevent 224', 'shell input tap 540 2000']);
            calls.length = 0;
            const held = await tool.execute({ op: 'tap', x: 540, y: 2000, holdMs: 1000 });
            expect(held.output.text).toBe('OK');
            expect(calls.filter(c => !c.startsWith('devices'))).toEqual(['shell dumpsys power', 'shell input swipe 540 2000 540 2000 1000']);
            calls.length = 0;
            await tool.execute({ op: 'read' });
            expect(calls).not.toContain('shell input keyevent 224');
        } finally {
            if (prev === undefined) delete process.env.JOE_ADB; else process.env.JOE_ADB = prev;
            jest.dontMock('../kernel/ExecutionGateway');
        }
    });

    test('android_tap takes «hold»', () => {
        const { androidTapTool } = require('../core/engine/tools/android');
        expect(androidTapTool.parse({ control: 21, hold: true })).toEqual({ ok: true, value: { control: 21, hold: true } });
        expect(androidTapTool.parse({ x: 1, y: 2 })).toEqual({ ok: true, value: { x: 1, y: 2 } });
        expect(androidTapTool.description).toMatch(/press and hold/u);
    });

    test('the engine has android_panel, and android_key names wakeup', () => {
        const { androidTools } = require('../core/engine/tools/android');
        const names = androidTools.map((t: any) => t.name);
        expect(names).toContain('android_panel');
        const key = androidTools.find((t: any) => t.name === 'android_key');
        expect(key.description).toMatch(/wakeup/u);
        const panel = androidTools.find((t: any) => t.name === 'android_panel');
        expect(panel.description).toMatch(/flashlight/u);
        expect(panel.parse({ panel: 'quick settings' })).toEqual({ ok: true, value: { panel: 'quick_settings' } });
        expect(panel.parse({ panel: 'all' }).ok).toBe(false);
    });
});

describe('a command on «the phone», the flashlight, and a follow-up in a phone chat go to the phone', () => {
    const op = require('../core/engine/operate');

    test.each([
        'شغل الكشاف في الهاتف',
        'شغّل الكشاف',
        'طفي الكشاف',
        //  The owner's own spelling, 2026-11-07, and its sisters.
        'اطفيئ الكشاف',
        'اطفيء الكشاف',
        'أطفئ الكشاف',
        'طفّي الفلاش',
        'الكشاف طفيه',
        'سكّر الكشاف',
        'وقف الكشاف',
        'افتح واتساب على الجوال',
        'شغله على الموبايل',
        'ارفع الصوت بالموبايل',
        'turn on the flashlight',
        'turn the torch off',
        'open youtube on the phone',
    ])('«%s» is operate, on the phone', t => {
        expect(op.isOperateRequest(t)).toBe(true);
        expect(op.isPhoneRequest(t)).toBe(true);
        expect(op.operatorFirstTool(t)).toBe('android_devices');
    });

    test.each([
        'اجعل الموقع يظهر جيداً على الجوال',
        'افتح الصفحة على الجوال وشوف إذا التصميم مرتب',
        'ابني تطبيق جوال لمطعم',
        'make the site look right on mobile',
        'what is a flashlight app',
        'اشرح لي كيف يعمل الهاتف',
        'كيف اشغل الكشاف؟',
        'طفلي يحب الكشافة',
        'ما هو الكشاف؟',
    ])('«%s» is not an action on the phone', t => {
        expect(op.isOperateRequest(t) && op.isPhoneRequest(t)).toBe(false);
    });

    test('after work on the phone, a short command in the same chat goes to the phone; a question, a build or another chat does not', () => {
        const at = Date.now();
        op.noteOperate('chat-A', 'اشبك على هاتفي وقل لي شو الظاهر على شاشته');
        for (const t of ['افتح واتساب', 'وكمان اطفيه', 'اطفيئه', 'ارجع للرئيسية', 'now open YouTube', 'لو سمحت صور الشاشة', 'turn it off']) {
            expect([t, op.operateFollowUp('chat-A', t, at + 60_000)]).toEqual([t, 'phone']);
        }
        for (const t of ['ما هي عاصمة فرنسا؟', 'ابني لي موقع مطعم', 'اكتب لي قصيدة عن البحر طويلة جداً جداً جداً جداً جداً جداً جداً جداً جداً جداً جداً جداً جداً جداً جداً جداً جداً جداً جداً جداً جداً جداً جداً جداً جداً جداً جداً', 'عدّل الصفحة']) {
            expect([t, op.operateFollowUp('chat-A', t, at + 60_000)]).toEqual([t, null]);
        }
        expect(op.operateFollowUp('chat-B', 'افتح واتساب', at + 60_000)).toBeNull();
        expect(op.operateFollowUp('chat-A', 'افتح واتساب', at + 31 * 60_000)).toBeNull();
        op.forgetOperate('chat-A');
        expect(op.operateFollowUp('chat-A', 'افتح واتساب', at + 60_000)).toBeNull();
    });

    test('a follow-up run is told it is about the phone and starts there', () => {
        const msg = op.operatorFirstMessage('افتح واتساب', 'ar', 'ar', 'phone');
        expect(msg).toContain('as being about the owner\'s Android phone');
        expect(msg).toContain('then android_devices.');
        expect(op.operatorFirstMessage('اشبك على هاتفي', 'ar', 'ar', 'phone')).not.toContain('Joe read this message');
    });

    test('the route carries the device, and remembers it for the next message', async () => {
        const { agentEngineRoute } = require('../core/engine/select');
        const ctx = { engine: 'agent', sessionId: 'chat-route' };
        expect(await agentEngineRoute('اشبك على هاتفي وقل لي شو الظاهر على شاشته', ctx)).toEqual({ kind: 'operate', target: 'phone' });
        expect(await agentEngineRoute('شغل الكشاف في الهاتف', ctx)).toEqual({ kind: 'operate', target: 'phone' });
        expect(await agentEngineRoute('افتح واتساب', ctx)).toEqual({ kind: 'operate', target: 'phone' });
        expect(await agentEngineRoute('افتح المفكرة واكتب مرحبا', { engine: 'agent', sessionId: 'chat-pc' })).toEqual({ kind: 'operate', target: 'computer' });
        op.forgetOperate('chat-route');
        op.forgetOperate('chat-pc');
    });
});

describe('what the word lists do not know, the chosen model reads (understand.ts)', () => {
    const { deviceIntentByModel, deviceIntentPrompt, readDeviceIntent } = require('../core/engine/understand');
    const op = require('../core/engine/operate');
    const { agentEngineRoute } = require('../core/engine/select');

    test('the prompt carries the message verbatim, the chat\'s recent device and the one answer wanted', () => {
        const p = deviceIntentPrompt('خلّي الضو اللي ورا التلفون يطفى', { target: 'phone', request: 'شغل الكشاف في الهاتف' });
        expect(p).toContain('خلّي الضو اللي ورا التلفون يطفى');
        expect(p).toContain('working on the user\'s PHONE');
        expect(p).toContain('شغل الكشاف في الهاتف');
        expect(p).toContain('{"device":"phone"} {"device":"computer"} {"device":"none"}');
        expect(deviceIntentPrompt('hello')).not.toContain('working on');
    });

    test('the answer is read whatever wraps it; anything unclear is none', () => {
        expect(readDeviceIntent('{"device":"phone"}')).toBe('phone');
        expect(readDeviceIntent('Sure:\n```json\n{"device": "computer"}\n```')).toBe('computer');
        expect(readDeviceIntent('{"device":"none"}')).toBeNull();
        expect(readDeviceIntent('{"device":"toaster"}')).toBeNull();
        expect(readDeviceIntent('I think the phone')).toBeNull();
    });

    test('no model choice, understanding off, a failing or an aborted model: no route is added', async () => {
        const never = jest.fn(async () => '{"device":"phone"}');
        expect(await deviceIntentByModel('اطفي الضو', {}, null, undefined)).toBeNull();
        expect(await deviceIntentByModel('اطفي الضو', {}, null, never, { JOE_ROUTE_UNDERSTANDING: 'off' })).toBeNull();
        expect(never).not.toHaveBeenCalled();
        expect(await deviceIntentByModel('اطفي الضو', {}, null, async () => { throw new Error('429'); })).toBeNull();
        const aborted = new AbortController(); aborted.abort();
        expect(await deviceIntentByModel('اطفي الضو', { signal: aborted.signal }, null, () => new Promise<string>(() => { }))).toBeNull();
    });

    test('a message no list knows reaches the phone when the model reads it so; small talk and questions are not asked', async () => {
        //  Required here: an earlier test reset the module registry, and the route reads the chat's device from this instance.
        const op = require('../core/engine/operate');
        const { agentEngineRoute } = require('../core/engine/select');
        const AGENT = { JOE_ENGINE: 'agent' };
        const seen: string[] = [];
        const ask = async (prompt: string) => { seen.push(prompt); return /الضو/u.test(prompt.split('Message:')[1] || '') ? '{"device":"phone"}' : '{"device":"none"}'; };
        const ctx = { engine: 'agent', sessionId: 'chat-understand' };
        op.noteOperate('chat-understand', 'شغل الكشاف في الهاتف', 'phone');
        expect(await agentEngineRoute('خلّي الضو اللي ورا التلفون يطفى', ctx, AGENT, { ask })).toEqual({ kind: 'operate', target: 'phone' });
        expect(seen[0]).toContain('working on the user\'s PHONE');
        expect(await agentEngineRoute('ما هي عاصمة فرنسا؟', ctx, AGENT, { ask })).toBeNull();
        const asked = seen.length;
        expect(await agentEngineRoute('شكرا', ctx, AGENT, { ask })).toBeNull();
        expect(seen.length).toBe(asked);
        op.forgetOperate('chat-understand');
    });
});

describe('the verifier and the closing words fit what was asked', () => {
    const { deviceRecordFor } = require('../core/engine/tools/devices');
    const op = require('../core/engine/operate');

    test('connect AND say what is on the screen: a list of the devices alone does not pass; a read does', async () => {
        const runId = 'run-look-' + Date.now();
        const request = 'اشبك على هاتفي وقل لي شو الظاهر على شاشته';
        expect(op.asksToLook(request)).toBe(true);
        const rec = deviceRecordFor(runId);
        rec.looks.push({ at: Date.now(), kind: 'devices' });
        const before = await op.operateVerifier()({ runId, request } as any, {} as any);
        expect(before.passed).toBe(false);
        expect(before.checks.find((c: any) => c.id === 'looked')?.status).toBe('failed');
        rec.looks.push({ at: Date.now() + 1, kind: 'read' });
        const after = await op.operateVerifier()({ runId, request } as any, {} as any);
        expect(after.passed).toBe(true);
        const out = op.operateOutput({ status: 'delivered', verification: after, summary: 'شاشة القفل', durationMs: 23_000, costUsd: 0.003 } as any, 'ar');
        expect(out.output.summary).toContain('قرأتُ الشاشة كما هي');
        expect(out.output.summary).not.toContain('هذا ما أصل إليه');
    });

    test('a list of the devices is not a look after an action', async () => {
        const runId = 'run-act-' + Date.now();
        const rec = deviceRecordFor(runId);
        rec.actions.push({ tool: 'android_panel', ok: true, at: Date.now(), what: 'panel quick_settings' });
        rec.looks.push({ at: Date.now() + 5, kind: 'devices' });
        const v = await op.operateVerifier()({ runId, request: 'شغل الكشاف في الهاتف' } as any, {} as any);
        expect(v.checks.find((c: any) => c.id === 'looked_after')?.status).toBe('failed');
    });
});

describe('the chat\'s answerer knows what Joe did on the devices', () => {
    test('each operate run leaves its result; the answerer is given them as facts, the last five for two hours', () => {
        const op = require('../core/engine/device-work');
        const t0 = Date.now();
        expect(op.deviceWorkFacts('chat-facts', t0)).toBe('');
        op.noteOperateResult('chat-facts', { target: 'phone', request: 'شغل الكشاف في الهاتف', summary: 'شغّلت الكشاف في هاتف TECNO KI7.', ok: true }, t0);
        const facts = op.deviceWorkFacts('chat-facts', t0 + 60_000);
        expect(facts).toContain('never say Joe did nothing there');
        expect(facts).toContain('1 min ago, on the owner\'s phone: «شغل الكشاف في الهاتف» → done and checked: شغّلت الكشاف');
        for (let i = 0; i < 6; i++) op.noteOperateResult('chat-facts', { request: `افتح المفكرة ${i}`, summary: 'x', ok: false }, t0 + i);
        expect(op.deviceWorkFacts('chat-facts', t0 + 10).match(/^- /gmu)).toHaveLength(5);
        expect(op.deviceWorkFacts('chat-facts', t0 + 3 * 60 * 60_000)).toBe('');
        expect(op.deviceWorkFacts('another-chat', t0)).toBe('');
    });

    test('the answerer\'s prompt carries them, and the operate run leaves them', () => {
        const fs = require('fs');
        const path = require('path');
        const answer = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'CentralAnswerTool.ts'), 'utf8');
        expect(answer).toMatch(/deviceWorkFacts\(context\?\.sessionId\)/u);
        const engine = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'AgentEngineTool.ts'), 'utf8');
        expect(engine).toMatch(/noteOperateResult\(o\.context\.sessionId/u);
    });
});

describe('the owner\'s language is kept for the whole run', () => {
    const { languageSection, noteInWrongScript, languageReminder } = require('../core/engine/prompt');

    test('the system prompt names it, for every note and the summary', () => {
        expect(languageSection('ar')).toContain('The owner reads Arabic. Every note you write between tool calls');
        expect(languageSection('ar')).toContain('in Arabic only, even when the tools');
        expect(languageSection('en')).toContain('The owner reads English.');
    });

    test('an English note to an Arabic reader is caught; Arabic with a name in it, code and addresses are not', () => {
        expect(noteInWrongScript('The tap opened the flashlight detail panel instead of toggling it.', 'ar')).toBe(true);
        expect(noteInWrongScript('The phone is already connected. I\'ll read its screen.', 'ar')).toBe(true);
        expect(noteInWrongScript('ضغطتُ بطاقة «الكشاف» في TECNO KI7.', 'ar')).toBe(false);
        expect(noteInWrongScript('`android_read` http://127.0.0.1:5047/x', 'ar')).toBe(false);
        expect(noteInWrongScript('The tap opened the panel instead.', 'en')).toBe(false);
        expect(noteInWrongScript('The tap opened the panel instead.', 'fr')).toBe(false);
        expect(noteInWrongScript('The tap opened the panel instead.', 'ru')).toBe(true);
        expect(languageReminder('ar')).toContain('The owner reads Arabic');
    });

    test('the loop puts it in the system prompt and answers a wrong-script note with the reminder', async () => {
        const { runEngine } = require('../core/engine/loop');
        const os = require('os');
        const fs = require('fs');
        const path = require('path');
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-lang-'));
        const seen: any[][] = [];
        let n = 0;
        const model = {
            vision: false, label: 'script', contextTokens: () => 100_000,
            async step(messages: any[]) {
                seen.push(JSON.parse(JSON.stringify(messages)));
                n++;
                if (n === 1) return { text: 'The phone is already connected. I will read its screen.', toolCalls: [{ id: 'c1', name: 'echo_tool', arguments: '{}' }], durationMs: 1 };
                return { text: 'انتهيت.', toolCalls: [{ id: 'c2', name: 'task_finish', arguments: JSON.stringify({ summary: 'تم.' }) }], durationMs: 1 };
            },
        };
        const echo = { name: 'echo_tool', description: 'x', parameters: { type: 'object', properties: {} }, parse: () => ({ ok: true, value: {} }), run: async () => ({ ok: true, output: 'fine' }) };
        const finish = { name: 'task_finish', description: 'x', parameters: { type: 'object', properties: {} }, parse: (a: any) => ({ ok: true, value: a }), run: async () => ({ ok: true, output: 'ok', facts: { verification: { passed: true, checks: [], unproven: [], at: Date.now() } } }) };
        await runEngine({ runId: 'lang-run', request: 'اطفي الكشاف', language: 'ar', replyLanguage: 'ar', projectDir: dir, deadlineAt: Date.now() + 60_000, signal: new AbortController().signal, emit: () => { }, joe: {}, operate: true }, {
            model, tools: [echo, finish], processes: { list: () => [], stopAll: async () => { } } as any, browser: () => ({}) as any, machine: { platform: 'win32', shell: 'powershell' } as any,
        }).catch(() => { });
        expect(seen[0][0].content).toContain('The owner reads Arabic');
        const toolAnswer = seen[1].find((m: any) => m.role === 'tool' && m.tool_call_id === 'c1');
        expect(toolAnswer.content).toContain('your last note was not in Arabic');
    });
});

describe('«حاول مره اخرى»: the run knows the chat\'s device work, and ends on one question when it needs the owner', () => {
    test('a retry in a phone chat is a follow-up on the phone', () => {
        const op = require('../core/engine/operate');
        op.noteOperate('chat-retry', 'شغل الموسيقى داخل الهاتف', 'phone');
        for (const t of ['حاول مره اخرى', 'أعدها', 'كرر', 'try again']) expect([t, op.operateFollowUp('chat-retry', t)]).toEqual([t, 'phone']);
        op.forgetOperate('chat-retry');
    });

    test('the first message carries what was done on the devices in this chat', () => {
        const op = require('../core/engine/operate');
        const dw = require('../core/engine/device-work');
        dw.noteOperateResult('chat-history', { target: 'phone', request: 'شغل الموسيقى داخل الهاتف', summary: 'لم أتمكن: الهاتف مقفل برمز PIN.', ok: false });
        const msg = op.operatorFirstMessage('حاول مره اخرى', 'ar', 'ar', 'phone', dw.deviceWorkFacts('chat-history'));
        expect(msg).toContain('«شغل الموسيقى داخل الهاتف» → not completed: لم أتمكن: الهاتف مقفل برمز PIN.');
        expect(msg).toContain('A short request («try again»');
        expect(op.operatorFirstMessage('افتح واتساب على هاتفي', 'ar', 'ar', 'phone', '')).not.toContain('A short request');
    });

    test('ask_owner ends the run at once, delivered with the question, and the answer says it waits for him', async () => {
        const op = require('../core/engine/operate');
        const { runEngine } = require('../core/engine/loop');
        const os = require('os');
        const fs = require('fs');
        const path = require('path');
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-ask-'));
        let n = 0;
        const model = {
            vision: false, label: 'script', contextTokens: () => 100_000,
            async step() {
                n++;
                return { text: '', toolCalls: [{ id: `q${n}`, name: 'ask_owner', arguments: JSON.stringify({ question: 'الهاتف مقفل برمز PIN. افتح القفل ثم قل لي «تم».' }) }], durationMs: 1 };
            },
        };
        const result = await runEngine({ runId: 'ask-run', request: 'حاول مره اخرى', language: 'ar', replyLanguage: 'ar', projectDir: dir, deadlineAt: Date.now() + 60_000, signal: new AbortController().signal, emit: () => { }, joe: {}, operate: true }, {
            model, tools: [op.askOwnerTool], processes: { list: () => [], stopAll: async () => { } } as any, browser: () => ({}) as any, machine: { platform: 'win32', shell: 'powershell' } as any,
        });
        expect(n).toBe(1);
        expect(result.status).toBe('delivered');
        expect(result.summary).toBe('الهاتف مقفل برمز PIN. افتح القفل ثم قل لي «تم».');
        const out = op.operateOutput(result, 'ar');
        expect(out.ok).toBe(true);
        expect(out.output.summary).toContain('افتح القفل');
        expect(out.output.summary).toContain('❓ أحتاج جوابك لأكمل');
        expect(op.askOwnerTool.parse({ question: '' }).ok).toBe(false);
    });

    test('an English reason reaches an Arabic reader in Arabic', () => {
        const op = require('../core/engine/operate');
        const out = op.operateOutput({ status: 'failed', reason: 'the model stopped calling tools before the checks passed', summary: '', steps: 24 } as any, 'ar');
        expect(out.output.summary).toContain('توقّف النموذج عن العمل قبل أن تنجح الفحوص');
        expect(out.output.summary).not.toMatch(/stopped calling tools/u);
        expect(op.operateOutput({ status: 'failed', reason: 'the model stopped calling tools before the checks passed', summary: '', steps: 3 } as any, 'en').output.summary).toContain('stopped calling tools');
    });
});

describe('the logs panel follows the newest line past its 220-line window', () => {
    test('the scroll follows the lines, not the length of the window on screen', () => {
        const fs = require('fs');
        const path = require('path');
        const panel = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'web', 'src', 'components', 'WorkspacePanel.tsx'), 'utf8');
        expect(panel).toContain('}, [filtered.length, filtered[filtered.length - 1], autoScroll,');
        expect(panel).not.toContain('}, [renderedLogs.length, autoScroll,');
    });
});

describe('the chat\'s device work survives a restart of Joe', () => {
    test('written to its file and read back by a fresh process', () => {
        const fs = require('fs');
        const os = require('os');
        const path = require('path');
        const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'joe-dw-')), 'data', 'device-work.json');
        const prev = process.env.JOE_DEVICE_WORK_FILE;
        process.env.JOE_DEVICE_WORK_FILE = file;
        try {
            const dw = require('../core/engine/device-work');
            dw.reloadDeviceWork();
            dw.setWorking('chat-restart', { target: 'phone', at: Date.now(), request: 'اغلق الكشاف وشغل الموسيقى' });
            dw.noteOperateResult('chat-restart', { target: 'phone', request: 'اغلق الكشاف وشغل الموسيقى', summary: 'أُغلق الكشاف وبدأت الموسيقى.', ok: true });
            expect(JSON.parse(fs.readFileSync(file, 'utf8')).working['chat-restart'].target).toBe('phone');
            //  A restart: the process forgets, the file remembers.
            dw.reloadDeviceWork();
            const op = require('../core/engine/operate');
            expect(op.recentOperate('chat-restart')).toEqual({ target: 'phone', request: 'اغلق الكشاف وشغل الموسيقى' });
            expect(op.operateFollowUp('chat-restart', 'ارسل ايميل الى shoroq@example.com')).toBe('phone');
            expect(dw.deviceWorkFacts('chat-restart')).toContain('أُغلق الكشاف وبدأت الموسيقى.');
            op.forgetOperate('chat-restart');
            dw.reloadDeviceWork();
            expect(op.recentOperate('chat-restart')).toBeNull();
        } finally {
            if (prev === undefined) delete process.env.JOE_DEVICE_WORK_FILE; else process.env.JOE_DEVICE_WORK_FILE = prev;
            require('../core/engine/device-work').reloadDeviceWork();
        }
    });

    test('a plan note is said to the model, not shown as a red error', async () => {
        const { planUpdateTool } = require('../core/engine/plan');
        const ctx: any = { state: { plan: { steps: [], requirements: [], revision: 0 } }, emit: () => { } };
        const r = await planUpdateTool.run({ requirements: [{ id: 'R1', status: 'open' }] }, ctx);
        expect(r.ok).toBe(true);
        expect(r.output).toContain('Note: There is no requirement R1');
    });
});

describe('the plan and the log', () => {
    test('a step called blocked, failed or completed is kept, not refused', () => {
        const { parsePlanArgs } = require('../core/engine/plan');
        const r = parsePlanArgs({ steps: [{ title: 'فحص الهاتف', status: 'completed' }, { title: 'فتح البريد', status: 'blocked' }, { title: 'تلخيص', status: 'failed' }] });
        expect(r).toEqual({ ok: true, value: { steps: [{ title: 'فحص الهاتف', status: 'done' }, { title: 'فتح البريد', status: 'pending' }, { title: 'تلخيص', status: 'pending' }] } });
        expect(parsePlanArgs({ steps: [{ title: 'x', status: 'flying' }] }).ok).toBe(false);
    });

    test('a requirement added and marked in the same call is kept and marked, with no refusal', () => {
        const { applyPlanUpdate } = require('../core/engine/plan');
        const plan = { steps: [], requirements: [], revision: 0 } as any;
        const problems = applyPlanUpdate(plan, {
            steps: [{ title: 'قائمة الأجهزة', status: 'in_progress' }],
            requirements: [{ id: 'R1', status: 'open', evidence: '' }],
            add_requirements: [{ text: 'قراءة ما يظهر على شاشة الهاتف' }],
        });
        expect(problems).toEqual([]);
        expect(plan.requirements).toEqual([expect.objectContaining({ id: 'R1', text: 'قراءة ما يظهر على شاشة الهاتف', status: 'open' })]);
    });

    test('a failed step says why in the log', () => {
        const fs = require('fs');
        const path = require('path');
        const run = fs.readFileSync(path.join(__dirname, '..', 'core', 'engine', 'run.ts'), 'utf8');
        expect(run).toMatch(/e\.ok \? \{\} : \{ error: String\(e\.output/u);
        const { logTextFor } = require('../core/session/log-line');
        expect(logTextFor({ type: 'step_failed', data: { result: { ok: false, output: 'There is no requirement R1', error: 'There is no requirement R1' } } })).toEqual(['ERROR: There is no requirement R1']);
    });
});
