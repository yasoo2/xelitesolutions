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
        'افتح واتساب على الجوال',
        'ارفع الصوت بالموبايل',
        'turn on the flashlight',
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
    ])('«%s» is not an action on the phone', t => {
        expect(op.isOperateRequest(t) && op.isPhoneRequest(t)).toBe(false);
    });

    test('after work on the phone, a short command in the same chat goes to the phone; a question, a build or another chat does not', () => {
        const at = Date.now();
        op.noteOperate('chat-A', 'اشبك على هاتفي وقل لي شو الظاهر على شاشته');
        for (const t of ['افتح واتساب', 'وكمان اطفيه', 'ارجع للرئيسية', 'now open YouTube', 'لو سمحت صور الشاشة']) {
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
        expect(msg).toContain('it is about the phone');
        expect(msg).toContain('then android_devices.');
        expect(op.operatorFirstMessage('اشبك على هاتفي', 'ar', 'ar', 'phone')).not.toContain('This message follows');
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

describe('the plan and the log', () => {
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
