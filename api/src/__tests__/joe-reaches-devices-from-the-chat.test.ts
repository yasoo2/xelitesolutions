/**
 *  JOE REACHES THE OWNER'S DEVICES FROM THE CHAT, NOT FROM A BUTTON.
 *
 *  The owner, 2026-11-07: «I give the orders from the command box… I tell it
 *  connect to computer such-and-such, search which computers you can reach…
 *  it gives me the names… and the same for phones». So «شو الأجهزة اللي بتقدر
 *  توصلها؟» is operate work that lists them, and «اشبك على كمبيوتر المكتب»
 *  shows him, in the chat, the one line to run there, waits for that computer
 *  and works on it — the settings' button is only another way to the same.
 */
import http from 'http';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { spawn, type ChildProcess } from 'child_process';
import { isOperateRequest, onlyAboutDevices, operateVerifier } from '../core/engine/operate';
import { deviceLinks } from '../core/devices/device-link';
import { parseMdns } from '../core/devices/android';
import { takeTheScreen } from './fixtures/desktop-lock';
import { fileToolsFixture, type FileToolsFixture } from './fixtures/engine-file-tools';
import type { ChatMessage, EngineModel, EngineEvent, ModelStep } from '../core/engine/types';

jest.setTimeout(600_000);
const WINDOWS = process.platform === 'win32';

describe('what the chat asks of the devices', () => {
    test.each([
        'شو الأجهزة اللي بتقدر توصلها؟',
        'ابحث في وين كمبيوترات تقدر انت توصل لها',
        'اشبك على كمبيوتر المكتب',
        'اشبك على هاتفي',
        'which devices can you reach?',
        'connect to my other computer',
    ])('«%s» is about the devices, and listing or linking is the whole of it', t => {
        expect(isOperateRequest(t)).toBe(true);
        expect(onlyAboutDevices(t)).toBe(true);
    });

    test('connecting and then doing something is that something, on the device', () => {
        const t = 'اشبك على كمبيوتر المكتب وافتح المفكرة واكتب مرحبا';
        expect(isOperateRequest(t)).toBe(true);
        expect(onlyAboutDevices(t)).toBe(false);
    });

    test.each([
        'ابني لوحة تحكم لإدارة أجهزة المستودع',
        'صمم صفحة تعرض الهواتف المتوفرة في المتجر',
        'ما هي الأجهزة الطبية في العيادة؟',
        'Build a store that sells phones',
    ])('«%s» is not', t => expect(isOperateRequest(t) && onlyAboutDevices(t)).toBe(false));

    test('the answer about his devices is said as that, not as «done on your computer»', () => {
        const { operateOutput } = require('../core/engine/operate');
        const out = operateOutput({ status: 'delivered', summary: 'أصل إلى هذا الحاسوب وإلى حاسوب المكتب.', verification: { passed: true, checks: [{ id: 'devices', status: 'passed', detail: 'listed' }], unproven: [], at: 1 }, filesChanged: [], served: [], steps: 2, model: 'm', durationMs: 9_000 } as any, 'ar');
        expect(out.output.summary).toContain('هذا ما أصل إليه الآن من أجهزتك');
        expect(out.output.summary).not.toContain('نفّذتُه على جهازك');
    });

    test('phones on Wi-Fi are read from adb\'s own announcement', () => {
        expect(parseMdns('List of discovered mdns services\nadb-R58N12ABCDE-AbCdEf\t_adb-tls-pairing._tcp.\t192.168.1.40:41235\nadb-R58N12ABCDE-AbCdEf\t_adb-tls-connect._tcp.\t192.168.1.40:37011\n'))
            .toEqual([
                { name: 'adb-R58N12ABCDE-AbCdEf', kind: 'pair', address: '192.168.1.40:41235' },
                { name: 'adb-R58N12ABCDE-AbCdEf', kind: 'connect', address: '192.168.1.40:37011' },
            ]);
    });
});

/** A scripted model: each turn reads what the last tool said. */
function scripted(turns: Array<(seen: string) => { name: string; args: unknown }>): EngineModel {
    let i = 0;
    return {
        label: 'scripted:devices', vision: false, contextTokens: () => 64_000,
        async step(messages: ChatMessage[]): Promise<ModelStep> {
            const t = turns[Math.min(i, turns.length - 1)](JSON.stringify(messages.slice(-2)));
            i++;
            return { text: '', toolCalls: [{ id: `c${i}`, name: t.name, arguments: JSON.stringify(t.args) }], durationMs: 1 };
        },
    };
}

async function runOperate(fx: FileToolsFixture, request: string, model: EngineModel, emit: (e: EngineEvent) => void = () => undefined) {
    const { runEngine } = require('../core/engine/loop');
    const { finishTool } = require('../core/engine/finish');
    const { deviceTools, forgetDeviceRecord } = require('../core/engine/tools/devices');
    const { androidTools } = require('../core/engine/tools/android');
    const { executionFirewall } = require('../orchestration/AgentExecutionFirewall');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-devices-chat-'));
    const runId = `${fx.context.runId}-${Math.random().toString(36).slice(2, 8)}`;
    try {
        return await executionFirewall.runInContext('devices-chat', () => runEngine({
            runId, request, language: 'ar', replyLanguage: 'ar', projectDir: dir, operate: true,
            deadlineAt: Date.now() + 480_000, signal: new AbortController().signal, emit, joe: { toolContext: { ...fx.context, runId, projectRoot: dir } },
        }, {
            model, tools: [...deviceTools, ...androidTools, finishTool(operateVerifier())],
            processes: { async start() { throw new Error('none'); }, logs: () => undefined, stop: async () => true, list: () => [], stopAll: async () => undefined },
            browser: () => { throw new Error('no browser'); },
            machine: { platform: 'win32', shell: 'Windows PowerShell 5.1' },
        }), { userId: String(fx.context.userId), sessionId: String(fx.context.sessionId), runId });
    } finally {
        forgetDeviceRecord(runId);
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

describe('«what can you reach?» in the real loop', () => {
    let fx: FileToolsFixture;
    beforeAll(() => { fx = fileToolsFixture('devices-list'); });
    afterAll(() => fx.cleanup());

    test('Joe lists this computer and says how to add another, and that is delivered', async () => {
        let listed = '';
        const result = await runOperate(fx, 'شو الأجهزة اللي بتقدر توصلها؟', scripted([
            () => ({ name: 'device_computers', args: {} }),
            seen => { listed = seen; return { name: 'task_finish', args: { summary: 'أصل الآن إلى هذا الحاسوب، ولا حاسوب آخر مربوط بعد.' } }; },
        ]));
        expect(listed).toContain('This computer:');
        expect(listed).toContain('device_link_new');
        expect(result.status).toBe('delivered');
    });
});

(WINDOWS ? describe : describe.skip)('«connect to the office computer»: the line in the chat, the computer links, Joe works on it', () => {
    let fx: FileToolsFixture;
    let server: http.Server;
    let link: ChildProcess | null = null;
    let release: () => void = () => undefined;
    const prevPort = require('../shared/config').config.port;
    const prevBind = process.env.JOE_BIND_HOST;

    beforeAll(async () => {
        release = await takeTheScreen();
        fx = fileToolsFixture('devices-link');
        const express = require('express');
        const app = express();
        app.use('/api/devices', require('../api/routes/devices').default);
        server = http.createServer(app);
        const { acceptDeviceLink } = require('../api/device-link-socket');
        server.on('upgrade', (req, socket, head) => acceptDeviceLink(req, socket, head, (status: number, message: string) => {
            socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\n\r\n`); socket.destroy();
        }));
        await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
        //  This Joe is reached at the test server; only this computer knows it.
        require('../shared/config').config.port = (server.address() as any).port;
        process.env.JOE_BIND_HOST = '127.0.0.1';
    });
    afterAll(async () => {
        for (const d of deviceLinks.list(String(fx.context.userId))) deviceLinks.disconnect(String(fx.context.userId), d.id);
        await new Promise(r => setTimeout(r, 1500));
        try { link?.kill(); } catch { /* gone */ }
        require('../shared/config').config.port = prevPort;
        if (prevBind === undefined) delete process.env.JOE_BIND_HOST; else process.env.JOE_BIND_HOST = prevBind;
        await new Promise<void>(r => server.close(() => r()));
        fx.cleanup();
        release();
    });

    test('link_new → (he runs the line) → wait_link → use → windows → finish', async () => {
        let shown = '';
        let name = '';
        const emit = (e: EngineEvent) => {
            if (e.type !== 'thought' || !/PowerShell/u.test(e.text)) return;
            shown = e.text;
            //  The owner, on the other computer, runs the line he was shown.
            const url = (e.text.match(/irm '([^']+)'/u) || [])[1];
            if (url && !link) link = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `irm '${url}' | iex`], { stdio: 'ignore', windowsHide: true });
        };
        const result = await runOperate(fx, 'اشبك على كمبيوتر المكتب', scripted([
            () => ({ name: 'device_computers', args: {} }),
            () => ({ name: 'device_link_new', args: {} }),
            () => ({ name: 'device_wait_link', args: { minutes: 6 } }),
            seen => { name = (seen.match(/«([^»]+)» is linked/u) || [])[1] || ''; return { name: 'device_use', args: { computer: name } }; },
            () => ({ name: 'device_windows', args: {} }),
            () => ({ name: 'task_finish', args: { summary: `صار ${name} مربوطاً وأعمل عليه الآن.` } }),
        ]), emit);
        expect(shown).toContain('لربط الحاسوب الآخر بجو، افتح عليه PowerShell');
        expect(shown).toContain('السطر يعمل مرة واحدة');
        expect(name.toLowerCase()).toBe(os.hostname().toLowerCase());
        expect(result.status).toBe('delivered');
    });
});
