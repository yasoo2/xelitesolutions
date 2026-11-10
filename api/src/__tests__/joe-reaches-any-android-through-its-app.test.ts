/**
 * ANY ANDROID, FROM ANYWHERE: THE JOE APP.
 *
 * The owner, 2026-11-08: «why doesn't Joe work with every phone? … when Joe is
 * on a domain, can it work on the phone I open it from and control it?» His
 * Samsung needed a driver on the cable. The Joe app links any Android phone
 * once with a six-digit code and calls Joe by itself over the internet.
 *
 * Pinned with a real server and a real WebSocket, and a fake app on the other
 * end: the code links once and only once; the app gets its id and key and
 * comes back with them; a wrong key is refused; every android_ operation goes
 * to the app and its answers read like a cable phone's; the notifications the
 * app pushes reach the email-reply watch; a forgotten phone is told to unlink
 * itself; the APK route serves the app only when it is built.
 */
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import WebSocket from 'ws';

jest.setTimeout(60_000);

let server: http.Server;
let base = '';
let dir = '';

beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-phones-'));
    process.env.JOE_LINKED_PHONES_FILE = path.join(dir, 'linked-phones.json');
    const { acceptPhoneLink } = require('../api/phone-link-socket');
    server = http.createServer((_q, s) => { s.writeHead(404); s.end(); });
    server.on('upgrade', (req, socket, head) => acceptPhoneLink(req, socket, head, (status: number, msg: string) => {
        socket.write(`HTTP/1.1 ${status} ${msg}\r\n\r\n`); socket.destroy();
    }));
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    base = `ws://127.0.0.1:${(server.address() as any).port}/ws/phone-link`;
});
afterAll(async () => {
    await new Promise<void>(r => server.close(() => r()));
    delete process.env.JOE_LINKED_PHONES_FILE;
    fs.rmSync(dir, { recursive: true, force: true });
});

/** A fake Joe app: says hello, answers requests with `answer`, records what it is told. */
function fakeApp(url: string, hello: Record<string, unknown>, answer: (op: string, args: any) => any = () => ({ text: 'OK' })) {
    const heard: any[] = [];
    const ws = new WebSocket(url);
    const ready = new Promise<void>((resolve, reject) => {
        ws.on('open', () => { ws.send(JSON.stringify({ t: 'hello', ...hello })); resolve(); });
        ws.on('error', reject);
    });
    ws.on('message', data => {
        const m = JSON.parse(String(data));
        heard.push(m);
        if (m.t === 'req') ws.send(JSON.stringify({ t: 'res', id: m.id, ok: true, data: answer(m.op, m.args) }));
    });
    const closed = new Promise<number>(r => ws.on('close', code => r(code)));
    return { ws, heard, ready, closed };
}
const until = async (f: () => boolean, ms = 5000) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('timed out'); await new Promise(r => setTimeout(r, 20)); } };

describe('a phone links once with six digits and comes back by itself', () => {
    test('the code links once; the app gets its id and key; with them it comes back; a wrong key is refused', async () => {
        const { newPhonePairing, keptPhones } = require('../core/devices/linked-phones');
        const { phoneLinks } = require('../core/devices/phone-link');
        const { code } = newPhonePairing('owner-1', 'جوال يونس');
        expect(code).toMatch(/^\d{6}$/u);

        const first = fakeApp(`${base}?code=${code}`, { model: 'SM-F956B', android: '14' });
        await first.ready;
        await until(() => first.heard.some(m => m.t === 'welcome'));
        const welcome = first.heard.find(m => m.t === 'welcome');
        expect(welcome.name).toBe('جوال يونس');
        expect(welcome.key).toMatch(/^[0-9a-f]{64}$/u);
        expect(keptPhones('owner-1')[0]).toMatchObject({ id: welcome.id, name: 'جوال يونس', model: 'SM-F956B', android: '14' });
        await until(() => phoneLinks.isOnline(welcome.id));

        //  The code works once.
        const again = new WebSocket(`${base}?code=${code}`);
        const refused = await new Promise<string>(r => { again.on('unexpected-response', (_q, res) => r(String(res.statusCode))); again.on('error', () => r('error')); });
        expect(refused).toBe('401');

        first.ws.close();
        await until(() => !phoneLinks.isOnline(welcome.id));
        const back = fakeApp(`${base}?phone=${welcome.id}`, { key: welcome.key, model: 'SM-F956B', android: '14' });
        await back.ready;
        await until(() => phoneLinks.isOnline(welcome.id));

        const thief = fakeApp(`${base}?phone=${welcome.id}`, { key: 'f'.repeat(64) });
        expect(await thief.closed).toBe(4401);
        back.ws.close();
    });
});

describe('every android_ operation goes to the app, and reads like a cable phone', () => {
    test('read, type, email and look travel to the app and back; notifications reach the watch', async () => {
        const { newPhonePairing } = require('../core/devices/linked-phones');
        const { phoneLinks } = require('../core/devices/phone-link');
        const { code } = newPhonePairing('owner-2', '');
        const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]), Buffer.from([0, 0, 4, 0x38, 0, 0, 9, 0x60]), Buffer.alloc(16)]);
        const app = fakeApp(`${base}?code=${code}`, { model: 'Pixel 8', android: '15' }, (op, args) => {
            if (op === 'read') return { screen: { awake: true, locked: false }, controls: [{ index: 0, kind: 'Button', text: 'إرسال', description: '', id: 'send', packageName: 'com.google.android.gm', x: 900, y: 120, width: 120, height: 80, clickable: true, scrollable: false, editable: false, checked: null, enabled: true, focused: false }] };
            if (op === 'look') return { png: png.toString('base64') };
            if (op === 'email') return { text: `opened a new email to ${args.to.join(',')}` };
            return { text: `did ${op}` };
        });
        await app.ready;
        await until(() => app.heard.some(m => m.t === 'welcome'));
        const id = app.heard.find(m => m.t === 'welcome').id;
        await until(() => phoneLinks.isOnline(id));

        const { EngineAndroidTool } = require('../modules/tools/definitions/EngineAndroidTool');
        const tool = new EngineAndroidTool();
        const read = await tool.execute({ op: 'read', serial: `app:${id}` });
        expect(read.ok).toBe(true);
        expect(read.output.text).toContain('[0] Button «إرسال» #send (tap) at 960,160');
        const typed = await tool.execute({ op: 'type', serial: `app:${id}`, text: 'مرحبا' });
        expect(typed.output.text).toBe('did type');
        expect(app.heard.find(m => m.op === 'type').args).toEqual({ text: 'مرحبا' });
        const email = await tool.execute({ op: 'email', serial: `app:${id}`, to: ['Younis.Soudi@inovar.com'], subject: 'تجربة جو' });
        expect(email.output.text).toBe('opened a new email to Younis.Soudi@inovar.com');
        const file = path.join(dir, 'shot.png');
        const look = await tool.execute({ op: 'look', serial: `app:${id}`, file });
        expect(look.output.text.split('\n')[0]).toBe('PICTURE\t1080\t2400');
        expect(fs.existsSync(file)).toBe(true);

        //  The app pushes a mail notification: it is among the notices the watch reads.
        app.ws.send(JSON.stringify({ t: 'notif', pkg: 'com.microsoft.office.outlook', key: 'k1', title: 'Shurouq Suwan', text: 'Re: hello', bigText: 'Re: hello\nThanks', subText: 'Younis.Soudi@inovar.com', at: 5 }));
        await until(() => phoneLinks.notices().length === 1);
        expect(phoneLinks.notices()[0]).toMatchObject({ phoneId: id, ownerId: 'owner-2', notice: { title: 'Shurouq Suwan', pkg: 'com.microsoft.office.outlook' } });
        app.ws.close();
    });

    test('a forgotten phone is told to unlink itself, and is not let back in', async () => {
        const { newPhonePairing, forgetPhone } = require('../core/devices/linked-phones');
        const { phoneLinks } = require('../core/devices/phone-link');
        const { code } = newPhonePairing('owner-3', 'تابلت');
        const app = fakeApp(`${base}?code=${code}`, { model: 'Tab S9' });
        await app.ready;
        await until(() => app.heard.some(m => m.t === 'welcome'));
        const { id, key } = app.heard.find(m => m.t === 'welcome');
        expect(forgetPhone('owner-3', 'تابلت')?.id).toBe(id);
        phoneLinks.forget(id);
        expect(await app.closed).toBe(4404);
        expect(app.heard.some(m => m.t === 'forget')).toBe(true);
        const back = fakeApp(`${base}?phone=${id}`, { key });
        expect(await back.closed).toBe(4404);
        expect(back.heard.some(m => m.t === 'forget')).toBe(true);
    });
});

describe('the app is downloaded from Joe', () => {
    test('/api/phones/app.apk serves the built app, and says plainly when there is none', async () => {
        const express = require('express');
        const apk = path.join(dir, 'joe-phone.apk');
        process.env.JOE_PHONE_APK = apk;
        const app = express();
        app.use('/api/phones', require('../api/routes/phones').default);
        const s: http.Server = await new Promise(r => { const x = app.listen(0, '127.0.0.1', () => r(x)); });
        const url = `http://127.0.0.1:${(s.address() as any).port}/api/phones/app.apk`;
        //  A loopback request through Node's own http (the suite forbids fetch).
        const get = () => new Promise<{ status: number; type: string }>((resolve, reject) => {
            http.get(url, res => { res.resume(); resolve({ status: Number(res.statusCode), type: String(res.headers['content-type'] || '') }); }).on('error', reject);
        });
        try {
            expect((await get()).status).toBe(404);
            fs.writeFileSync(apk, Buffer.from('PK\u0003\u0004 joe'));
            const res = await get();
            expect(res.status).toBe(200);
            expect(res.type).toContain('application/vnd.android.package-archive');
        } finally {
            delete process.env.JOE_PHONE_APK;
            await new Promise<void>(r => s.close(() => r()));
        }
    });
});
