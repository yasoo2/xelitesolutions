/**
 * JOE PUTS HIS APP ON A PHONE HE ALREADY REACHES, AND KEEPS ITS TUNNEL.
 *
 * The owner, 2026-11-08: Joe on his laptop listens on this computer alone; for
 * now his phone joins it the private way — paired once by Wireless debugging —
 * and later the Joe app on a domain. Pinned with a fake adb:
 *   - Joe installs the app over adb, opens the tunnel (adb reverse) on his own
 *     port, keeps the phone by its own serial, and opens the app with the
 *     address and a fresh six-digit code filled in (joe://link, quoted);
 *   - a failed install says what the phone may be asking, and links nothing;
 *   - the keeper reopens the tunnel of a kept phone that came back without it,
 *     leaves alone a phone it does not keep or one whose tunnel is there, and
 *     does nothing at all while no phone is kept.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AdbRunner } from '../core/devices/android';

let dir = '';
beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-tunnels-'));
    process.env.JOE_PHONE_TUNNELS_FILE = path.join(dir, 'phone-tunnels.json');
    process.env.JOE_PHONE_APK = path.join(dir, 'joe-phone.apk');
    process.env.JOE_LINKED_PHONES_FILE = path.join(dir, 'linked-phones.json');
});
afterEach(() => {
    delete process.env.JOE_PHONE_TUNNELS_FILE;
    delete process.env.JOE_PHONE_APK;
    delete process.env.JOE_LINKED_PHONES_FILE;
    jest.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
});

/** A fake adb: each call is recorded; the first rule whose key the joined argv contains answers. */
function fakeAdb(rules: Array<[string, { code?: number; stdout?: string; stderr?: string }]>) {
    const calls: string[][] = [];
    const run: AdbRunner = async args => {
        calls.push(args);
        const line = args.join(' ');
        const hit = rules.find(([k]) => line.includes(k));
        return { code: hit?.[1].code ?? 0, stdout: hit?.[1].stdout ?? '', stderr: hit?.[1].stderr ?? '' };
    };
    return { run, calls, lines: () => calls.map(c => c.join(' ')) };
}

function asOwner() {
    const { executionFirewall } = require('../orchestration/AgentExecutionFirewall');
    jest.spyOn(executionFirewall, 'currentOwner').mockReturnValue({ userId: 'owner-1', sessionId: 's1' });
}

describe('Joe installs the app over the adb line, opens the tunnel and the app', () => {
    it('installs, tunnels his own port, keeps the phone by its serial, opens the app with the code', async () => {
        fs.writeFileSync(process.env.JOE_PHONE_APK!, 'apk');
        asOwner();
        const { config } = require('../shared/config');
        const port = Number(config.port || 5000);
        const adb = fakeAdb([
            ['pm path ai.joe.phone', { code: 1, stdout: '' }],
            ['install -r -g', { stdout: 'Performing Streamed Install\nSuccess\n' }],
            ['getprop ro.serialno', { stdout: 'R5CX10ABCDE\n' }],
            ['dumpsys power', { stdout: 'mWakefulness=Awake\n' }],
            ['am start', { stdout: 'Starting: Intent { act=android.intent.action.VIEW }\nStatus: ok\n' }],
        ]);
        const { installJoeAppOverAdb } = require('../modules/tools/definitions/EngineAndroidTool');
        const r = await installJoeAppOverAdb(adb.run, 'adb-R5CX10ABCDE-x._adb-tls-connect._tcp', '', 'SM-F956B');
        expect(r.ok).toBe(true);
        const lines = adb.lines();
        expect(lines).toContain(`-s adb-R5CX10ABCDE-x._adb-tls-connect._tcp install -r -g ${process.env.JOE_PHONE_APK}`);
        expect(lines).toContain(`-s adb-R5CX10ABCDE-x._adb-tls-connect._tcp reverse tcp:${port} tcp:${port}`);
        const start = adb.calls.find(c => c.includes('am') && c.includes('start'))!;
        const code = r.output.code as string;
        expect(code).toMatch(/^\d{6}$/u);
        expect(start).toContain(`'joe://link?server=${encodeURIComponent(`http://127.0.0.1:${port}`)}&code=${code}'`);
        expect(start.slice(-2)).toEqual(['-p', 'ai.joe.phone']);
        expect(require('../core/devices/phone-tunnels').isTunnelPhone('R5CX10ABCDE')).toBe(true);
        expect(r.output.text).toMatch(/installed on «SM-F956B»/u);
        expect(r.output.text).toMatch(/«اربط»/u);
        // The code links the phone once, for this owner.
        const { claimPhonePairing } = require('../core/devices/linked-phones');
        expect(claimPhonePairing(code, { model: 'SM-F956B' })).toBeTruthy();
    });

    it('a refused install says what the phone may be asking, and keeps nothing', async () => {
        fs.writeFileSync(process.env.JOE_PHONE_APK!, 'apk');
        asOwner();
        const adb = fakeAdb([
            ['install -r -g', { code: 1, stdout: 'Failure [INSTALL_FAILED_USER_RESTRICTED: Install canceled by user]' }],
        ]);
        const { installJoeAppOverAdb } = require('../modules/tools/definitions/EngineAndroidTool');
        const r = await installJoeAppOverAdb(adb.run, '192.168.1.40:41234', '', 'SM-F956B');
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/INSTALL_FAILED_USER_RESTRICTED/u);
        expect(r.error).toMatch(/Auto Blocker/u);
        expect(adb.lines().some(l => l.includes('reverse'))).toBe(false);
        expect(require('../core/devices/phone-tunnels').tunnelPhones()).toEqual([]);
    });

    it('without the built app there is nothing to install, and it says so', async () => {
        asOwner();
        const adb = fakeAdb([]);
        const { installJoeAppOverAdb } = require('../modules/tools/definitions/EngineAndroidTool');
        const r = await installJoeAppOverAdb(adb.run, 'X', '', '');
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/not built/u);
        expect(adb.calls).toEqual([]);
    });
});

describe('the phone he writes from is «this phone»', () => {
    it('the app\'s user agent names one of his own linked phones; nothing else counts', () => {
        const lp = require('../core/devices/linked-phones');
        lp.reloadLinkedPhones();
        const { code } = lp.newPhonePairing('owner-1', 'Fold');
        const linked = lp.claimPhonePairing(code, { model: 'SM-F956B' });
        const ua = `Mozilla/5.0 (Linux; Android 15) Chrome/130 Mobile Safari/537.36 JoeApp/1 JoePhone/${linked.id}`;
        expect(lp.phoneWrittenFrom('owner-1', ua)?.id).toBe(linked.id);
        expect(lp.phoneWrittenFrom('someone-else', ua)).toBeNull();
        expect(lp.phoneWrittenFrom('owner-1', 'Mozilla/5.0 JoePhone/notaphone')).toBeNull();
        expect(lp.phoneWrittenFrom('owner-1', 'Mozilla/5.0 Chrome/130')).toBeNull();
        const { phoneWrittenFromFact } = require('../modules/tools/definitions/AgentEngineTool');
        const fact = phoneWrittenFromFact({ id: linked.id, name: 'Fold' });
        expect(fact).toContain(`"serial": "app:${linked.id}"`);
        expect(fact).toContain('«Fold»');
        expect(phoneWrittenFromFact(undefined)).toBe('');
        expect(phoneWrittenFromFact({ id: 'x"; drop' })).toBe('');
    });
});

describe('on a locked phone the PIN pad is closed before a panel opens', () => {
    //  2026-11-08: over the TECNO's PIN pad the quick settings never opened, and the tool said they had.
    test('locked: «back» first (it closes the pad only), then the panel; unlocked: the panel alone', async () => {
        const { AndroidPhone } = require('../core/devices/android');
        const locked = fakeAdb([
            ['dumpsys power', { stdout: 'mWakefulness=Awake\n' }],
            ['dumpsys window policy', { stdout: '    KeyguardServiceDelegate\n      showing=true\n      secure=true\n' }],
        ]);
        expect((await new AndroidPhone(locked.run, 'T', async () => undefined).panel('quick_settings')).ok).toBe(true);
        const l = locked.lines();
        expect(l.indexOf('-s T shell input keyevent KEYCODE_BACK')).toBeGreaterThan(-1);
        expect(l.indexOf('-s T shell input keyevent KEYCODE_BACK')).toBeLessThan(l.indexOf('-s T shell cmd statusbar expand-settings'));

        const open = fakeAdb([
            ['dumpsys power', { stdout: 'mWakefulness=Awake\n' }],
            ['dumpsys window policy', { stdout: '    KeyguardServiceDelegate\n      showing=false\n      secure=true\n' }],
        ]);
        await new AndroidPhone(open.run, 'T', async () => undefined).panel('quick_settings');
        expect(open.lines().some(x => x.includes('KEYCODE_BACK'))).toBe(false);
        //  Closing a panel never presses back.
        await new AndroidPhone(locked.run, 'T', async () => undefined).panel('close');
        expect(locked.lines().filter(x => x.includes('KEYCODE_BACK'))).toHaveLength(1);
    });
});

describe('the openJoeLink address is only Joe\'s', () => {
    it('refuses an address with quotes, spaces or a path, and a code that is not six digits', async () => {
        const { AndroidPhone } = require('../core/devices/android');
        const adb = fakeAdb([]);
        const p = new AndroidPhone(adb.run, 'S');
        expect((await p.openJoeLink("http://x';reboot;'", '123456')).ok).toBe(false);
        expect((await p.openJoeLink('http://127.0.0.1:5047/evil path', '123456')).ok).toBe(false);
        expect((await p.openJoeLink('http://127.0.0.1:5047', '12345')).ok).toBe(false);
        expect(adb.calls).toEqual([]);
    });
});

describe('the keeper reopens the tunnel when the phone comes back', () => {
    const DEVICES = 'List of devices attached\nadb-R5CX10ABCDE-x._adb-tls-connect._tcp device product:q6q model:SM_F956B\nOTHER123 device model:Pixel_8\n';

    it('reopens it for a kept phone without it; leaves others alone', async () => {
        require('../core/devices/phone-tunnels').keepTunnelFor('R5CX10ABCDE', 'SM-F956B');
        const adb = fakeAdb([
            ['devices -l', { stdout: DEVICES }],
            ['-s adb-R5CX10ABCDE-x._adb-tls-connect._tcp shell getprop ro.serialno', { stdout: 'R5CX10ABCDE\n' }],
            ['-s OTHER123 shell getprop ro.serialno', { stdout: 'OTHER123\n' }],
            ['reverse --list', { stdout: '' }],
            ['pm path ai.joe.phone', { stdout: 'package:/data/app/ai.joe.phone/base.apk\n' }],
        ]);
        const { keepJoeAppTunnels } = require('../modules/tools/definitions/EngineAndroidTool');
        const seen = new Map();
        const opened = await keepJoeAppTunnels(seen, 5047, 1_000, adb.run);
        expect(opened).toEqual(['adb-R5CX10ABCDE-x._adb-tls-connect._tcp']);
        expect(adb.lines()).toContain('-s adb-R5CX10ABCDE-x._adb-tls-connect._tcp reverse tcp:5047 tcp:5047');
        expect(adb.lines().some(l => l.startsWith('-s OTHER123 reverse'))).toBe(false);
        // Looked at again only after five minutes.
        const before = adb.calls.length;
        expect(await keepJoeAppTunnels(seen, 5047, 60_000, adb.run)).toEqual([]);
        expect(adb.calls.length).toBe(before + 1);
    });

    it('a kept phone whose tunnel is there is left as it is', async () => {
        require('../core/devices/phone-tunnels').keepTunnelFor('R5CX10ABCDE', 'SM-F956B');
        const adb = fakeAdb([
            ['devices -l', { stdout: DEVICES }],
            ['getprop ro.serialno', { stdout: 'R5CX10ABCDE\n' }],
            ['reverse --list', { stdout: 'adb-R5CX10ABCDE-x._adb-tls-connect._tcp tcp:5047 tcp:5047\n' }],
        ]);
        const { keepJoeAppTunnels } = require('../modules/tools/definitions/EngineAndroidTool');
        expect(await keepJoeAppTunnels(new Map(), 5047, 1_000, adb.run)).toEqual([]);
        expect(adb.lines().some(l => /reverse tcp:/u.test(l))).toBe(false);
    });

    it('with no kept phone it does not even ask adb', async () => {
        const adb = fakeAdb([]);
        const { keepJoeAppTunnels } = require('../modules/tools/definitions/EngineAndroidTool');
        expect(await keepJoeAppTunnels(new Map(), 5047, 1_000, adb.run)).toEqual([]);
        expect(adb.calls).toEqual([]);
    });
});
