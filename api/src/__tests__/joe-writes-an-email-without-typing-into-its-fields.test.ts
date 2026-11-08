/**
 * WRITING AN EMAIL WITHOUT TYPING INTO ITS FIELDS.
 *
 * The owner, 2026-11-08: «send an email from Gmail to Outlook, saying hello».
 * Joe asked him for his Outlook address (his phone shows it on every Outlook
 * notification), then tapped Gmail's «To» field and typed: the address and the
 * subject ended up in the same field, deleting did not empty it, and after
 * three minutes Joe asked him what to do.
 *
 * Pinned: android_email opens a new email already filled from one mailto:
 * address (Arabic, spaces, «&» and quotes arrive as written, one quoted word
 * for the phone's shell), in the app asked for and in any mail app when that
 * one is missing; android_clear empties a field in one step; android_link
 * opens only addresses it knows; his own accounts are facts the run is given.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { AndroidPhone, type AdbRunner } from '../core/devices/android';

function fakePhone(answer: (args: string[]) => { code: number; stdout?: string; stderr?: string } = () => ({ code: 0, stdout: 'Status: ok' })) {
    const calls: string[][] = [];
    const run: AdbRunner = async args => { calls.push(args); const r = answer(args); return { code: r.code, stdout: r.stdout || '', stderr: r.stderr || '' }; };
    return { phone: new AndroidPhone(run, 'TECNO', async () => { /* no wait */ }), calls };
}

describe('a new email, already filled', () => {
    test('one mailto: address, quoted for the phone, every part percent-encoded, in the app asked for', async () => {
        const { phone, calls } = fakePhone();
        const r = await phone.composeEmail({ to: ['Younis.Soudi@inovar.com'], subject: 'تجربة جو', body: "مرحبا بالايميل & it's fine", app: 'com.google.android.gm' });
        expect(r.ok).toBe(true);
        const args = calls[0];
        expect(args.join(' ')).toContain('shell am start -W -a android.intent.action.SENDTO -d ');
        const d = args[args.indexOf('-d') + 1];
        expect(d.startsWith("'mailto:Younis.Soudi%40inovar.com?subject=")).toBe(true);
        expect(d.endsWith("'")).toBe(true);
        const uri = d.slice(1, -1);
        //  Inside the quotes: no space and no quote the phone's shell could split on.
        expect(uri).not.toMatch(/[\s']/u);
        const q = new URLSearchParams(uri.split('?')[1]);
        expect(q.get('subject')).toBe('تجربة جو');
        expect(q.get('body')).toBe("مرحبا بالايميل & it's fine");
        expect(args.slice(-2)).toEqual(['-p', 'com.google.android.gm']);
    });

    test('the app asked for is missing: any mail app opens it; no valid recipient: nothing opens', async () => {
        const { phone, calls } = fakePhone(args => (args.includes('-p') ? { code: 0, stdout: 'Error: Activity not started, unable to resolve Intent' } : { code: 0, stdout: 'Status: ok' }));
        expect((await phone.composeEmail({ to: ['a@b.co'], app: 'com.microsoft.office.outlook' })).ok).toBe(true);
        expect(calls).toHaveLength(2);
        expect(calls[1]).not.toContain('-p');
        const none = fakePhone();
        expect((await none.phone.composeEmail({ to: ['not an address', "x'@y.z"] })).ok).toBe(false);
        expect(none.calls).toHaveLength(0);
    });
});

describe('a field with the wrong text is emptied in one step', () => {
    test('the ADB Keyboard empties it, then the cursor goes to the end and deletes backwards, chips included', async () => {
        const { phone, calls } = fakePhone(args => (args.join(' ').includes('ime list') ? { code: 0, stdout: 'com.android.adbkeyboard/.AdbIME\ncom.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME' } : args.join(' ').includes('default_input_method') ? { code: 0, stdout: 'com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME' } : { code: 0, stdout: 'Broadcast completed: result=0' }));
        expect((await phone.clearField()).ok).toBe(true);
        const flat = calls.map(c => c.join(' '));
        expect(flat.some(c => c.includes('am broadcast -a ADB_CLEAR_TEXT'))).toBe(true);
        const keys = calls.find(c => c.includes('keyevent'))!;
        expect(keys[keys.indexOf('keyevent') + 1]).toBe('123');
        expect(keys.filter(k => k === '67').length).toBeGreaterThanOrEqual(60);
        //  His own keyboard comes back.
        expect(flat[flat.length - 2]).toContain('ime set com.google.android.inputmethod.latin');
    });
});

describe('an address opens in the app that handles it', () => {
    test('known schemes open; anything else, or an address with quotes or spaces, does not', async () => {
        const { phone, calls } = fakePhone();
        expect((await phone.openUri('https://wa.me/966500000000?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7')).ok).toBe(true);
        expect(calls[0]).toContain("'https://wa.me/966500000000?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7'");
        expect((await phone.openUri('tel:+966500000000')).ok).toBe(true);
        for (const bad of ['javascript:alert(1)', "https://x.com/'; rm -rf /", 'https://x.com/a b', 'file:///sdcard/x']) {
            expect([bad, (await phone.openUri(bad)).ok]).toEqual([bad, false]);
        }
        expect(calls).toHaveLength(2);
    });
});

describe('the run knows his own accounts and the tools', () => {
    let dir: string;
    beforeEach(() => {
        jest.resetModules();
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-own-mail-'));
        process.env.JOE_MAIL_WATCH_FILE = path.join(dir, 'mail-watch.json');
    });
    afterEach(() => { delete process.env.JOE_MAIL_WATCH_FILE; fs.rmSync(dir, { recursive: true, force: true }); });

    test('an Outlook notice tells Joe his Outlook address, kept across a restart, and every device run is given it', () => {
        const mw = require('../core/devices/mail-watch');
        mw.newReplies([{ pkg: 'com.microsoft.office.outlook', app: 'Outlook', key: 'k', title: 'Ismail', text: 'Re: x', bigText: '', subText: 'Younis.Soudi@inovar.com', lines: [], at: 1 }], 2);
        mw.reloadMailWatch();
        const facts = mw.mailWatchFacts();
        expect(facts).toContain("THE OWNER'S OWN MAIL ACCOUNTS");
        expect(facts).toContain('- younis.soudi@inovar.com (Outlook on his phone)');
        expect(facts).toContain('never ask him for them');
    });

    test('the phone tools include android_email, android_clear and android_link, and the operator is told to use them', () => {
        const { androidTools } = require('../core/engine/tools/android');
        const names = androidTools.map((t: any) => t.name);
        expect(names).toEqual(expect.arrayContaining(['android_email', 'android_clear', 'android_link']));
        const email = androidTools.find((t: any) => t.name === 'android_email');
        expect(email.parse({ to: [] }).ok).toBe(false);
        expect(email.parse({ to: 'Younis.Soudi@inovar.com', subject: 'تجربة جو', app: 'Gmail' })).toEqual({ ok: true, value: { to: ['Younis.Soudi@inovar.com'], subject: 'تجربة جو', app: 'gmail' } });
        const { operatorSystemPrompt } = require('../core/engine/operate');
        const prompt = operatorSystemPrompt({ platform: 'win32' });
        expect(prompt).toContain('call android_email with the recipients');
        expect(prompt).toContain('Never tap and type into an email\'s To field by hand');
    });
});
