/**
 *  JOE WORKS ANOTHER COMPUTER OF THE OWNER'S, THROUGH A LINK IT OPENED ITSELF.
 *
 *  The owner asked for Joe to work «a remote computer» as it works this one.
 *  The other computer runs one line (core/devices/device-link.ts linkScript):
 *  it says in its own window that Joe is in control, compiles the same helper,
 *  and calls OUT to Joe at /ws/device-link with a one-use pairing code. Every
 *  action then travels as the line the local host reads, and the window guard
 *  is that computer's own.
 *
 *  The live part runs the link script as a separate PowerShell process on
 *  this machine, connected over a real socket: the same path a computer
 *  across the world takes, minus the distance.
 */
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { spawn, type ChildProcess } from 'child_process';
import WebSocket from 'ws';
import { acceptDeviceLink } from '../api/device-link-socket';
import { DeviceLinks, deviceLinks, linkCommand, linkScript, type LinkSocket } from '../core/devices/device-link';
import { encodedCommand, parseLook, parseUi, parseWindows, psQuote } from '../core/devices/windows-desktop';
import { takeTheScreen } from './fixtures/desktop-lock';
import { fileToolsFixture, type FileToolsFixture } from './fixtures/engine-file-tools';
import type { ChatMessage, EngineModel, ModelStep } from '../core/engine/types';

jest.setTimeout(600_000);
const WINDOWS = process.platform === 'win32';
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

/** A socket that records what Joe sends and lets the test answer. */
function fakeSocket() {
    const sent: string[] = [];
    const handlers: Record<string, Array<(d?: unknown) => void>> = {};
    let closed = false;
    const socket: LinkSocket = {
        send: (d: string) => { sent.push(d); },
        close: () => { closed = true; for (const h of handlers.close || []) h(); },
        on: (event: string, fn: (d?: unknown) => void) => { (handlers[event] ||= []).push(fn); return socket; },
    } as any;
    return { socket, sent, reply: (d: string) => { for (const h of handlers.message || []) h(d); }, isClosed: () => closed };
}

describe('the pairing code', () => {
    test('is long, works once, and not after ten minutes', () => {
        const links = new DeviceLinks();
        const { code, expiresAt } = links.newPairingCode('owner-a', 1_000);
        expect(code).toMatch(/^[0-9a-f]{24}$/u);
        expect(expiresAt).toBe(1_000 + 10 * 60_000);
        expect(links.isWaiting(code, 2_000)).toBe(true);
        expect(links.claim(code, 2_000)).toBe('owner-a');
        expect(links.claim(code, 2_000)).toBeNull();
        const late = links.newPairingCode('owner-a', 1_000).code;
        expect(links.claim(late, 1_000 + 10 * 60_000 + 1)).toBeNull();
        expect(links.claim('000000', 2_000)).toBeNull();
    });
});

describe('the link, on a socket the test answers', () => {
    test('an action goes out numbered, as the host line, and the answer comes back as the host answers', async () => {
        const links = new DeviceLinks();
        const s = fakeSocket();
        const d = links.attach(s.socket, 'owner-a', { name: 'OFFICE-PC', os: 'Windows 11 Pro', user: 'sara', screen: '1920x1080' });
        expect(links.list('owner-a').map(x => x.name)).toEqual(['OFFICE-PC']);
        expect(links.list('owner-b')).toEqual([]);
        const pending = links.send('owner-a', 'office-pc', { op: 'windows' });
        await new Promise(r => setImmediate(r));
        expect(s.sent[0]).toMatch(/^\d+\twindows$/u);
        s.reply(`${s.sent[0].split('\t')[0]}\tOK\t${b64('1\t2\tnotepad\t0,0,10,10\t1\t0\tملاحظة')}`);
        const r = await pending;
        expect(r).toEqual({ ok: true, out: '1\t2\tnotepad\t0,0,10,10\t1\t0\tملاحظة' });
        //  The guard's refusal on that computer is a refusal here.
        const refused = links.send('owner-a', d.id, { op: 'type', text: 'x', window: 5 });
        await new Promise(r2 => setImmediate(r2));
        s.reply(`${s.sent[1].split('\t')[0]}\tOK\t${b64('REFUSED\twindow 5 is not in front')}`);
        expect(await refused).toMatchObject({ ok: false, error: 'window 5 is not in front' });
    });

    test('another owner cannot reach it, and a computer that is gone is said to be gone', async () => {
        const links = new DeviceLinks();
        const s = fakeSocket();
        links.attach(s.socket, 'owner-a', { name: 'LAPTOP' });
        expect((await links.send('owner-b', 'LAPTOP', { op: 'windows' })).error).toContain('no linked computer named «LAPTOP»');
        s.socket.close();
        expect(links.list('owner-a')).toEqual([]);
        expect((await links.send('owner-a', 'LAPTOP', { op: 'windows' })).ok).toBe(false);
    });

    test('two computers with one name are told apart, and a disconnect says bye', () => {
        const links = new DeviceLinks();
        const a = fakeSocket(), b = fakeSocket();
        links.attach(a.socket, 'owner-a', { name: 'PC' });
        links.attach(b.socket, 'owner-a', { name: 'PC' });
        expect(links.list('owner-a').map(x => x.name).sort()).toEqual(['PC', 'PC-2']);
        expect(links.disconnect('owner-a', 'PC-2')).toBe(true);
        expect(b.sent).toContain('0\tbye');
        expect(b.isClosed()).toBe(true);
        expect(links.list('owner-a').map(x => x.name)).toEqual(['PC']);
    });

    test('the script says who is in control and how to stop it, in both languages, and carries the whole helper', () => {
        const s = linkScript('ws://joe.example:5000/ws/device-link?code=abc');
        expect(s).toContain("[JoeDesktop]::Link('ws://joe.example:5000/ws/device-link?code=abc', $hello)");
        expect(s).toContain('Close this window to stop him at once');
        expect(s).toContain('أغلق هذه النافذة لإيقافه فوراً');
        expect(s).toContain('public static string Link(string url, string hello)');
        expect(s.split('\n').filter(l => l.startsWith("'@"))).toEqual(["'@"]);
        expect(linkCommand('http://joe.example:5000/api/devices/link.ps1?code=abc'))
            .toBe(`powershell -NoProfile -ExecutionPolicy Bypass -Command "irm 'http://joe.example:5000/api/devices/link.ps1?code=abc' | iex"`);
    });
});

describe('the address the other computer is given', () => {
    const { publicBase, lanAddress } = require('../api/routes/devices');
    const req = (host: string, extra: Record<string, string> = {}) => ({ headers: { host, ...extra }, protocol: 'http' }) as any;

    test('Joe opened at a network address gives that address', () => {
        expect(publicBase(req('192.168.1.20:5047'), {}, () => '10.0.0.9')).toMatchObject({ http: 'http://192.168.1.20:5047', ws: 'ws://192.168.1.20:5047', via: 'request' });
        expect(publicBase(req('joe.example.com', { 'x-forwarded-proto': 'https' }), {}, () => '')).toMatchObject({ http: 'https://joe.example.com', ws: 'wss://joe.example.com', via: 'request' });
    });

    test('Joe opened at localhost gives its public address, else its address on the network, else says it is local only', () => {
        expect(publicBase(req('127.0.0.1:5047'), { PUBLIC_URL: 'https://joe.example.com' }, () => '192.168.1.20')).toMatchObject({ http: 'https://joe.example.com', via: 'public' });
        expect(publicBase(req('localhost:5047'), {}, () => '192.168.1.20')).toMatchObject({ http: 'http://192.168.1.20:5047', ws: 'ws://192.168.1.20:5047', via: 'lan' });
        expect(publicBase(req('127.0.0.1:5047'), { JOE_BIND_HOST: '127.0.0.1' }, () => '192.168.1.20')).toMatchObject({ http: 'http://127.0.0.1:5047', via: 'local' });
        expect(publicBase(req('127.0.0.1:5047'), {}, () => '')).toMatchObject({ via: 'local' });
    });

    test('the network address is a private IPv4 that is not this computer alone', () => {
        expect(lanAddress({
            lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
            vpn: [{ address: '100.64.1.2', family: 'IPv4', internal: false }],
            wifi: [{ address: 'fe80::1', family: 'IPv6', internal: false }, { address: '192.168.1.20', family: 'IPv4', internal: false }],
        } as any)).toBe('192.168.1.20');
        expect(lanAddress({ lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }] } as any)).toBe('');
    });
});

describe('the door at /ws/device-link', () => {
    let server: http.Server;
    let port = 0;
    beforeAll(async () => {
        server = http.createServer();
        server.on('upgrade', (req, socket, head) => acceptDeviceLink(req, socket, head, (status, message) => {
            socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\n\r\n`); socket.destroy();
        }));
        await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
        port = (server.address() as any).port;
    });
    afterAll(() => new Promise<void>(r => server.close(() => r())));

    const knock = (code: string) => new Promise<number | 'open'>(resolve => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/device-link?code=${code}`);
        ws.on('open', () => { ws.close(); resolve('open'); });
        ws.on('unexpected-response', (_req, res) => resolve(res.statusCode || 0));
        ws.on('error', () => resolve(0));
    });

    test('a code that is not waiting is turned away; a waiting one opens once', async () => {
        expect(await knock('not-a-code')).toBe(401);
        const { code } = deviceLinks.newPairingCode('owner-door');
        expect(await knock(code)).toBe('open');
        expect(await knock(code)).toBe(401);
    });
});

(WINDOWS ? describe : describe.skip)('a computer linked over a real socket, worked by the real loop', () => {
    let fx: FileToolsFixture;
    let server: http.Server;
    let link: ChildProcess | null = null;
    let form: ChildProcess | null = null;
    let linkOut = '';
    let release: () => void = () => undefined;
    const TITLE = `Joe linked test ${process.pid}`;
    let owner = '';
    let name = '';

    beforeAll(async () => {
        release = await takeTheScreen();
        fx = fileToolsFixture('device-link');
        owner = String(fx.context.userId);
        //  Joe's own devices route serves the script, as it will to a computer across the world.
        const express = require('express');
        const app = express();
        app.use('/api/devices', require('../api/routes/devices').default);
        server = http.createServer(app);
        server.on('upgrade', (req, socket, head) => acceptDeviceLink(req, socket, head, (status, message) => {
            socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\n\r\n`); socket.destroy();
        }));
        await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
        const port = (server.address() as any).port;
        //  A window on «the other computer» for Joe to work.
        const formScript = [
            'Add-Type -AssemblyName System.Windows.Forms',
            '$f = New-Object System.Windows.Forms.Form',
            `$f.Text = ${psQuote(TITLE)}`,
            '$f.Width = 520; $f.Height = 240; $f.StartPosition = "CenterScreen"; $f.TopMost = $true',
            '$b = New-Object System.Windows.Forms.TextBox; $b.Left = 20; $b.Top = 20; $b.Width = 300',
            '$k = New-Object System.Windows.Forms.Button; $k.Text = "Save"; $k.Left = 340; $k.Top = 18; $k.Width = 120',
            '$l = New-Object System.Windows.Forms.Label; $l.Left = 20; $l.Top = 80; $l.Width = 440; $l.Text = "nothing saved"',
            '$k.Add_Click({ $l.Text = "saved: " + $b.Text })',
            '$f.Controls.AddRange(@($b, $k, $l))',
            '$t = New-Object System.Windows.Forms.Timer; $t.Interval = 480000; $t.Add_Tick({ $f.Close() }); $t.Start()',
            '[void]$f.ShowDialog()',
        ].join('\n');
        form = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedCommand(formScript)], { stdio: 'ignore' });
        //  «The other computer» runs the very line the owner copies: fetch the script, run it.
        const { code } = deviceLinks.newPairingCode(owner);
        const scriptUrl = `http://127.0.0.1:${port}/api/devices/link.ps1?code=${code}`;
        expect(linkCommand(scriptUrl)).toContain(`irm '${scriptUrl}' | iex`);
        link = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `irm '${scriptUrl}' | iex`],
            { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
        link.stdout?.on('data', d => { linkOut += String(d); });
        link.stderr?.on('data', d => { linkOut += String(d); });
        const until = Date.now() + 300_000;
        while (!deviceLinks.list(owner).length && Date.now() < until) await new Promise(r => setTimeout(r, 500));
        if (!deviceLinks.list(owner).length) throw new Error(`the link never came: ${linkOut.slice(-2000)}`);
        name = deviceLinks.list(owner)[0].name;
        //  …and the window is up on it.
        const shownBy = Date.now() + 240_000;
        while (Date.now() < shownBy) {
            const w = await deviceLinks.send(owner, name, { op: 'windows' });
            if (parseWindows(w.out).some(x => x.title === TITLE)) break;
            await new Promise(r => setTimeout(r, 500));
        }
    }, 600_000);

    afterAll(async () => {
        if (name) deviceLinks.disconnect(owner, name);
        await new Promise(r => setTimeout(r, 1500));
        try { link?.kill(); } catch { /* gone */ }
        try { form?.kill(); } catch { /* gone */ }
        await new Promise<void>(r => server.close(() => r()));
        fx.cleanup();
        release();
    });

    test('the linked computer says what it is, and its owner alone sees it', () => {
        const d = deviceLinks.list(owner)[0];
        //  It names itself as Windows names it ($env:COMPUTERNAME).
        expect(d.name.toLowerCase()).toBe(os.hostname().toLowerCase());
        expect(d.os).toMatch(/Windows/u);
        expect(d.screen).toMatch(/^\d+x\d+$/u);
        expect(deviceLinks.list('someone-else')).toEqual([]);
        const { computersText } = require('../modules/tools/definitions/EngineDeviceTools');
        expect(computersText(owner)).toContain(`- ${d.name} (`);
    });

    test('computers → use → windows → read → set → press → read → look → finish: delivered, and the remote window shows it', async () => {
        let handle = 0, box = 0, save = 0;
        const turns: Array<(seen: string) => { name: string; args: unknown }> = [
            () => ({ name: 'device_computers', args: {} }),
            () => ({ name: 'device_use', args: { computer: name } }),
            () => ({ name: 'device_windows', args: {} }),
            seen => {
                const m = seen.match(new RegExp(`\\[(\\d+)\\] powershell «${TITLE}»`, 'u'));
                handle = m ? Number(m[1]) : 0;
                return { name: 'device_read', args: { window: handle } };
            },
            seen => {
                box = Number((seen.match(/\[(\d+)\] Edit «/u) || [])[1] || 0);
                save = Number((seen.match(/\[(\d+)\] Button «Save»/u) || [])[1] || 0);
                return { name: 'device_press', args: { window: handle, control: box, action: 'set', value: 'من حاسوب آخر: تقرير الأسبوع' } };
            },
            () => ({ name: 'device_press', args: { window: handle, control: save, action: 'press' } }),
            () => ({ name: 'device_read', args: { window: handle } }),
            () => ({ name: 'device_look', args: { window: handle } }),
            () => ({ name: 'task_finish', args: { summary: 'كتبتُ التقرير في النافذة على الحاسوب الآخر وضغطتُ حفظ.' } }),
        ];
        let i = 0;
        const outputs: string[] = [];
        const model: EngineModel = {
            label: 'scripted:link', vision: false, contextTokens: () => 64_000,
            async step(messages: ChatMessage[]): Promise<ModelStep> {
                const seen = JSON.stringify(messages.slice(-2));
                outputs.push(seen.slice(0, 600));
                const t = turns[Math.min(i, turns.length - 1)](seen);
                i++;
                return { text: '', toolCalls: [{ id: `c${i}`, name: t.name, arguments: JSON.stringify(t.args) }], durationMs: 1 };
            },
        };
        const { runEngine } = require('../core/engine/loop');
        const { finishTool } = require('../core/engine/finish');
        const { deviceTools, forgetDeviceRecord } = require('../core/engine/tools/devices');
        const { operateVerifier } = require('../core/engine/operate');
        const { executionFirewall } = require('../orchestration/AgentExecutionFirewall');
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-link-'));
        const runId = String(fx.context.runId);
        const result = await executionFirewall.runInContext('link-loop', () => runEngine({
            runId, request: 'على حاسوب المكتب: اكتب تقرير الأسبوع في النافذة المفتوحة ثم احفظ', language: 'ar', projectDir: dir, operate: true,
            deadlineAt: Date.now() + 300_000, signal: new AbortController().signal, emit: () => undefined, joe: { toolContext: { ...fx.context, projectRoot: dir } },
        }, {
            model, tools: [...deviceTools, finishTool(operateVerifier())],
            processes: { async start() { throw new Error('none'); }, logs: () => undefined, stop: async () => true, list: () => [], stopAll: async () => undefined },
            browser: () => { throw new Error('no browser'); },
            machine: { platform: 'win32', shell: 'Windows PowerShell 5.1' },
        }), { userId: owner, sessionId: String(fx.context.sessionId), runId });
        if (result.status !== 'delivered' || !handle) console.log('LINK LOOP', JSON.stringify(result).slice(0, 1500), outputs.join('\n---\n').slice(-4000));
        expect(handle).toBeGreaterThan(0);
        expect(box && save).toBeTruthy();
        expect(result.status).toBe('delivered');
        const ui = parseUi((await deviceLinks.send(owner, name, { op: 'ui', handle, limit: 100 })).out);
        expect(ui.controls.some(c => c.name === 'saved: من حاسوب آخر: تقرير الأسبوع')).toBe(true);
        //  The picture came over the socket and was kept here.
        const screens = path.join(String((fx.context as any).stateDir || ''), 'screens');
        const kept = fs.existsSync(screens) ? fs.readdirSync(screens) : [];
        const look = outputs.find(o => /A picture of window/u.test(o));
        expect(look || kept.length).toBeTruthy();
        forgetDeviceRecord(runId);
        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('a picture of the remote screen comes back over the socket', async () => {
        const seen = await deviceLinks.look(owner, name, { maxWidth: 640 });
        expect(seen.ok).toBe(true);
        if (!seen.ok) return;
        const frame = parseLook(seen.look.frame);
        expect(frame?.pictureWidth).toBeLessThanOrEqual(640);
        expect(seen.look.png.subarray(1, 4).toString()).toBe('PNG');
        expect(seen.look.png.readUInt32BE(16)).toBe(frame!.pictureWidth);
    });

    test('disconnecting from here ends the link there, and its window says why', async () => {
        expect(deviceLinks.disconnect(owner, name)).toBe(true);
        name = '';
        const exited = await new Promise<boolean>(r => {
            const t = setTimeout(() => r(false), 30_000);
            link!.once('exit', () => { clearTimeout(t); r(true); });
        });
        expect(exited).toBe(true);
        expect(linkOut).toContain('the owner disconnected this computer');
    });
});
