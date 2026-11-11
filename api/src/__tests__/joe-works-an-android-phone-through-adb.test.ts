/**
 *  JOE WORKS AN ANDROID PHONE THROUGH adb — THE PIECES, ON A RUNNER THE TEST ANSWERS.
 *
 *  core/devices/android.ts reads the phone's screen as numbered controls
 *  (uiautomator), takes its picture (screencap), taps, swipes, presses keys,
 *  opens apps and types. No phone is attached to this laptop, so these tests
 *  answer for adb with what a phone answers; the argv Joe sends is checked
 *  exactly, because on the phone it runs through `sh -c`.
 */
import os from 'os';
import { AndroidPhone, ADB_KEYBOARD, androidKey, describeAndroid, inputTextArg, parseDevices, parseUiDump, type AdbRunner } from '../core/devices/android';

const DUMP = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0">
<node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="com.whatsapp" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,0][1080,2400]">
<node index="0" text="الدردشات" resource-id="com.whatsapp:id/tab_chats" class="android.widget.TextView" package="com.whatsapp" content-desc="" checkable="false" checked="false" clickable="true" enabled="true" focusable="true" focused="false" scrollable="false" long-clickable="false" password="false" selected="true" bounds="[0,220][360,330]" />
<node index="1" text="" resource-id="com.whatsapp:id/menuitem_search" class="android.widget.ImageButton" package="com.whatsapp" content-desc="بحث" checkable="false" checked="false" clickable="true" enabled="true" focusable="true" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[880,90][1000,200]" />
<node index="2" text="" resource-id="com.whatsapp:id/conversations" class="androidx.recyclerview.widget.RecyclerView" package="com.whatsapp" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="true" focused="false" scrollable="true" long-clickable="false" password="false" selected="false" bounds="[0,330][1080,2200]" />
<node index="3" text="اكتب رسالة &amp; أرسلها" resource-id="com.whatsapp:id/entry" class="android.widget.EditText" package="com.whatsapp" content-desc="" checkable="false" checked="false" clickable="true" enabled="true" focusable="true" focused="true" scrollable="false" long-clickable="true" password="false" selected="false" bounds="[40,2220][900,2360]" />
<node index="4" text="" resource-id="" class="android.view.View" package="com.whatsapp" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,0][0,0]" />
<node index="5" text="Wi-Fi" resource-id="android:id/switch_widget" class="android.widget.Switch" package="com.android.settings" content-desc="" checkable="true" checked="true" clickable="true" enabled="false" focusable="true" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[900,600][1040,700]" />
</node></hierarchy>`;

describe('what the phone says', () => {
    test('the phones, and which ones still wait for the owner to allow this computer', () => {
        const d = parseDevices('List of devices attached\n* daemon started successfully\nR58N12ABCDE    device usb:1-1 product:a52qnsxx model:SM_A525F device:a52q transport_id:3\n192.168.1.40:37011 unauthorized transport_id:4\n\n');
        expect(d).toEqual([
            { serial: 'R58N12ABCDE', state: 'device', model: 'SM A525F', product: 'a52qnsxx', transport: '3' },
            { serial: '192.168.1.40:37011', state: 'unauthorized', model: '', product: '', transport: '4' },
        ]);
    });

    test('the screen is read as numbered controls: text, description, id, what each can do, where its centre is', () => {
        const c = parseUiDump(DUMP);
        expect(c.map(x => x.index)).toEqual([1, 2, 3, 4, 5]);
        expect(c[0]).toMatchObject({ kind: 'TextView', text: 'الدردشات', id: 'tab_chats', clickable: true });
        expect(c[1]).toMatchObject({ kind: 'ImageButton', description: 'بحث', id: 'menuitem_search' });
        expect(c[3]).toMatchObject({ kind: 'EditText', text: 'اكتب رسالة & أرسلها', editable: true, focused: true });
        expect(c[4]).toMatchObject({ checked: true, enabled: false });
        const said = describeAndroid(c);
        expect(said).toContain('[1] TextView «الدردشات» #tab_chats (tap) at 180,275');
        expect(said).toContain('[2] ImageButton «بحث» #menuitem_search (tap) at 940,145');
        expect(said).toContain('[3] RecyclerView «» #conversations (scroll)');
        expect(said).toContain('[4] EditText «اكتب رسالة & أرسلها» #entry (tap, type)');
        expect(said).toContain('[5] Switch «Wi-Fi» #switch_widget (tap, checked) (disabled)');
    });

    test('keys by name, and text adb can carry through the phone\'s shell', () => {
        expect(androidKey('Back')).toBe(4);
        expect(androidKey('home')).toBe(3);
        expect(androidKey('enter')).toBe(66);
        expect(androidKey('hyper')).toBeNull();
        expect(inputTextArg('hello world')).toBe('hello%sworld');
        expect(inputTextArg("it's $5 & (more)")).toBe("it\\'s%s\\$5%s\\&%s\\(more\\)");
        expect(inputTextArg('مرحبا')).toBeNull();
    });
});

describe('what Joe sends', () => {
    function fakeAdb(answers: Record<string, { code?: number; stdout?: string; stderr?: string }>) {
        const calls: string[][] = [];
        const run: AdbRunner = async args => {
            calls.push(args);
            const key = args.slice(2).join(' ');
            const hit = Object.entries(answers).find(([k]) => key.startsWith(k));
            const a = hit ? hit[1] : {};
            return { code: a.code ?? 0, stdout: a.stdout ?? '', stderr: a.stderr ?? '' };
        };
        return { run, calls };
    }

    test('every command names its phone and is an argv, never a shell string', async () => {
        const adb = fakeAdb({ 'exec-out cat': { stdout: DUMP } });
        const phone = new AndroidPhone(adb.run, 'R58N12ABCDE');
        const read = await phone.read();
        expect(read.ok && read.controls.length).toBe(5);
        await phone.tap(940.4, 145.6);
        await phone.key('back');
        await phone.swipe(540, 1800, 540, 600);
        //  The dump has its own file on the phone (2026-11-08: two readers at once never share one), removed after.
        const dumpFile = adb.calls[0][5];
        expect(dumpFile).toMatch(/^\/sdcard\/joe-ui-[0-9a-z]+\.xml$/u);
        expect(adb.calls).toEqual([
            ['-s', 'R58N12ABCDE', 'shell', 'uiautomator', 'dump', dumpFile],
            ['-s', 'R58N12ABCDE', 'exec-out', 'cat', dumpFile],
            ['-s', 'R58N12ABCDE', 'shell', 'rm', '-f', dumpFile],
            ['-s', 'R58N12ABCDE', 'shell', 'input', 'tap', '940', '146'],
            ['-s', 'R58N12ABCDE', 'shell', 'input', 'keyevent', '4'],
            ['-s', 'R58N12ABCDE', 'shell', 'input', 'swipe', '540', '1800', '540', '600', '300'],
        ]);
    });

    test('Arabic goes through the ADB Keyboard, and the owner\'s own keyboard comes back', async () => {
        const adb = fakeAdb({
            'shell ime list -s': { stdout: `com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME\n${ADB_KEYBOARD}\n` },
            'shell settings get secure default_input_method': { stdout: 'com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME\n' },
            'shell am broadcast': { stdout: 'Broadcasting: Intent { act=ADB_INPUT_B64 }\nBroadcast completed: result=0\n' },
        });
        const phone = new AndroidPhone(adb.run, 'R58N12ABCDE');
        expect(await phone.type('مرحبا من جو')).toEqual({ ok: true });
        const sent = adb.calls.map(c => c.slice(2).join(' '));
        expect(sent).toContain(`shell ime set ${ADB_KEYBOARD}`);
        expect(sent).toContain(`shell am broadcast -a ADB_INPUT_B64 --es msg ${Buffer.from('مرحبا من جو', 'utf8').toString('base64')}`);
        expect(sent[sent.length - 1]).toBe('shell ime set com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME');
    });

    test('without the ADB Keyboard, Arabic is refused with what to install, and nothing is typed', async () => {
        const adb = fakeAdb({ 'shell ime list -s': { stdout: 'com.google.android.inputmethod.latin/.LatinIME\n' } });
        const r = await new AndroidPhone(adb.run, 'X').type('مرحبا');
        expect(r.ok).toBe(false);
        expect(r.error).toContain('ADB Keyboard');
        expect(adb.calls.some(c => c.includes('broadcast'))).toBe(false);
    });

    test('a picture is a PNG or a failure, and an app opens by its package name only', async () => {
        //  A whole PNG ends with its IEND chunk.
        const png = Buffer.concat([Buffer.from([0x89]), Buffer.from('PNG\r\n'), Buffer.alloc(20), Buffer.from([0, 0, 0, 0]), Buffer.from('IEND'), Buffer.from([0xae, 0x42, 0x60, 0x82])]);
        const adb = fakeAdb({ 'shell monkey': { stdout: 'Events injected: 1\n' } });
        const phone = new AndroidPhone(adb.run, 'X');
        //  Taken on the phone into its own file, pulled as a file (no binary through a text pipe), removed there.
        const look = await phone.look('C:/tmp/shot.png', () => png);
        expect(look.ok).toBe(true);
        const shot = adb.calls[0][5];
        expect(shot).toMatch(/^\/sdcard\/joe-shot-[0-9a-z]+\.png$/u);
        expect(adb.calls.slice(0, 3).map(c => c.slice(2).join(' '))).toEqual([`shell screencap -p ${shot}`, `pull ${shot} C:/tmp/shot.png`, `shell rm -f ${shot}`]);
        expect((await phone.look('C:/tmp/shot.png', () => Buffer.from('not a picture'))).ok).toBe(false);
        //  A picture cut short (the live view and Joe writing one file at once, 2026-11-08) is taken again, then refused.
        const cut = png.subarray(0, png.length - 12);
        const before = adb.calls.length;
        const r = await phone.look('C:/tmp/shot.png', () => cut);
        expect(r).toEqual({ ok: false, error: 'the picture came over cut short' });
        expect(adb.calls.slice(before).filter(c => c.includes('screencap'))).toHaveLength(2);
        expect(await phone.open('com.whatsapp')).toEqual({ ok: true });
        expect((await phone.open('whatsapp; reboot')).ok).toBe(false);
        expect(adb.calls.filter(c => c.includes('monkey'))).toHaveLength(1);
    });
});

describe('which requests are about his phone', () => {
    const { isOperateRequest, isPhoneRequest } = require('../core/engine/operate');
    test.each([
        'على هاتفي افتح واتساب واكتب لسارة: سأتأخر قليلاً',
        'افتح الإعدادات على جوالي وشغّل الواي فاي',
        'open whatsapp on my phone and text Sara',
    ])('«%s» is operate, on the phone', t => {
        expect(isOperateRequest(t)).toBe(true);
        expect(isPhoneRequest(t)).toBe(true);
    });
    test.each([
        'اجعل الموقع يظهر جيداً على الجوال',
        'ابني تطبيق جوال لمطعم',
        'make the site look right on mobile',
    ])('«%s» is not', t => expect(isPhoneRequest(t) && isOperateRequest(t)).toBe(false));

    //  The owner's phone on the cable, 2026-11-07: the first message pointed
    //  every operate run at device_windows, the computer's windows, even «اشبك
    //  على هاتفي».
    const { operatorFirstTool, operatorFirstMessage } = require('../core/engine/operate');
    test.each([
        ['اشبك على هاتفي وقل لي شو الظاهر على شاشته', 'android_devices'],
        ['اشبك على الهاتف', 'android_devices'],
        ['شو الهواتف اللي بتقدر توصلها؟', 'android_devices'],
        ['connect to the phone and read its screen', 'android_devices'],
        ['ابحث وين كمبيوترات تقدر توصل لها', 'device_computers'],
        ['اشبك على كمبيوتر المكتب', 'device_computers'],
        ['افتح المفكرة واكتب مرحبا', 'device_windows'],
    ])('«%s» starts with %s', (t, tool) => {
        expect(isOperateRequest(t)).toBe(true);
        expect(operatorFirstTool(t)).toBe(tool);
        expect(operatorFirstMessage(t, 'ar')).toContain(`then ${tool}.`);
    });
});

describe('adb on this computer', () => {
    const { adbCandidates, findAdb } = require('../modules/tools/definitions/EngineAndroidTool');
    test('looked for where Google and Joe put it, and absent is said with what to do', async () => {
        const c = adbCandidates({ JOE_ADB: 'D:/tools/adb.exe', ANDROID_HOME: 'C:/sdk', LOCALAPPDATA: 'C:/Users/o/AppData/Local' });
        expect(c[0]).toBe('D:/tools/adb.exe');
        expect(c.some((p: string) => /sdk[\\/]platform-tools[\\/]adb/u.test(p))).toBe(true);
        expect(findAdb({}, () => false)).toBeNull();
        const prev = process.env.JOE_ADB; const prevHome = process.env.ANDROID_HOME; const prevLocal = process.env.LOCALAPPDATA;
        process.env.JOE_ADB = 'Z:/nowhere/adb.exe'; delete process.env.ANDROID_HOME; process.env.LOCALAPPDATA = 'Z:/nowhere';
        try {
            const { EngineAndroidTool } = require('../modules/tools/definitions/EngineAndroidTool');
            const r = await new EngineAndroidTool().execute({ op: 'devices' });
            if (!findAdb()) {
                expect(r.ok).toBe(false);
                expect(r.output.text).toContain('Platform-Tools');
            }
        } finally {
            if (prev === undefined) delete process.env.JOE_ADB; else process.env.JOE_ADB = prev;
            if (prevHome !== undefined) process.env.ANDROID_HOME = prevHome;
            if (prevLocal !== undefined) process.env.LOCALAPPDATA = prevLocal;
        }
    });
});

describe('the engine works the phone, and the verifier asks what it asks of a computer', () => {
    test('read → tap by number → type → read: acted and seen, delivered', async () => {
        const calls: any[] = [];
        jest.resetModules();
        jest.doMock('../modules/services/ToolService', () => ({
            executeTool: async (name: string, input: any) => {
                calls.push({ name, input });
                if (input.op === 'read') return { ok: true, output: { text: describeAndroid(parseUiDump(DUMP)), controls: parseUiDump(DUMP) } };
                return { ok: true, output: { text: 'OK' } };
            },
        }));
        const { androidReadTool, androidTapTool, androidTypeTool } = require('../core/engine/tools/android');
        const { operateVerifier } = require('../core/engine/operate');
        const { forgetDeviceRecord } = require('../core/engine/tools/devices');
        const ctx: any = { runId: 'phone-1', request: 'على هاتفي اكتب رسالة لسارة', signal: new AbortController().signal, cancelled: new Promise(() => undefined), stateDir: os.tmpdir(), projectDir: os.tmpdir(), joe: { toolContext: {} } };
        expect((await androidReadTool.run({}, ctx)).ok).toBe(true);
        const tap = await androidTapTool.run({ control: 4 }, ctx);
        expect(tap.ok).toBe(true);
        expect(calls.find(c => c.input.op === 'tap').input).toMatchObject({ x: 470, y: 2290 });
        expect((await androidTypeTool.run({ text: 'سأتأخر قليلاً' }, ctx)).ok).toBe(true);
        expect((await androidReadTool.run({}, ctx)).ok).toBe(true);
        const verdict = await operateVerifier()(ctx, { summary: 'كتبتُ الرسالة' });
        expect(verdict.passed).toBe(true);
        expect((await androidTapTool.run({ control: 99 }, ctx)).ok).toBe(false);
        forgetDeviceRecord('phone-1');
        jest.dontMock('../modules/services/ToolService');
    });
});
