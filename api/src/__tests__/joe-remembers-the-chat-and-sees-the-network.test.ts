/**
 *  JOE REMEMBERS THE CHAT, TAKES AN ANSWER AS AN ANSWER, AND SEES THE NETWORK.
 *
 *  The owner read his own chat with Joe back, 2026-11-08 («راجع المحادثة وشف
 *  غبائه»):
 *   - «هل توجد أجهزة على نفس الواي فاي؟» → «type arp -a yourself»;
 *   - «افحص» → «check what?» (the question before it was not seen);
 *   - «افحص كم جهاز على شبكة الواي فاي» → one robot vacuum in a phone app;
 *   - «send Shoroq a new email» → another address, a subject made up, the
 *     email of an hour before forgotten;
 *   - «اجل» to Joe's own question → «OK, I will send it», and nothing sent.
 *  A run now reads the chat's last turns and the question it may answer; an
 *  answer to Joe's waiting question goes back to that work; the answerer never
 *  promises an action; and Joe scans the Wi-Fi from the computer.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('the chat so far, for a run that acts', () => {
    test('the last turns, oldest first, each cut short, the request itself left out', () => {
        const { chatTurnsText } = require('../core/engine/chat-history');
        const text = chatTurnsText([
            { role: 'user', content: 'هل توجد اجهزة على نفس الواي فاي؟' },
            { role: 'assistant', content: 'لا أستطيع من هنا فحص شبكة الواي فاي…' },
            { role: 'user', content: 'افحص' },
        ], 'افحص');
        expect(text).toContain('THE CHAT SO FAR');
        expect(text).toContain('Owner: هل توجد اجهزة على نفس الواي فاي؟');
        expect(text).toContain('Joe: لا أستطيع من هنا فحص شبكة الواي فاي…');
        expect(text).not.toMatch(/Owner: افحص$/mu);
        expect(chatTurnsText([], 'x')).toBe('');
        expect(chatTurnsText([{ role: 'user', content: 'x'.repeat(900) }], 'y', 100)).toContain(`${'x'.repeat(100)}…`);
    });

    test('read from the chat\'s own store (the local one in a single-user install)', async () => {
        const { recentChatTurns } = require('../core/engine/chat-history');
        const prev = process.env.PERSISTENCE_MODE;
        process.env.PERSISTENCE_MODE = 'JSON';
        const before = (global as any).mockMessages;
        (global as any).mockMessages = [
            { sessionId: 's-1', role: 'user', content: 'ارسل الى شروق ايميل جديد' },
            { sessionId: 's-2', role: 'user', content: 'another chat' },
            { sessionId: 's-1', role: 'assistant', content: 'هل أكتب لها…؟' },
            { sessionId: 's-1', role: 'system', content: 'not a turn' },
            { sessionId: 's-1', role: 'user', content: 'اجل' },
        ];
        try {
            expect(await recentChatTurns('s-1', 12)).toEqual([
                { role: 'user', content: 'ارسل الى شروق ايميل جديد' },
                { role: 'assistant', content: 'هل أكتب لها…؟' },
                { role: 'user', content: 'اجل' },
            ]);
            expect(await recentChatTurns('', 12)).toEqual([]);
        } finally {
            (global as any).mockMessages = before;
            if (prev === undefined) delete process.env.PERSISTENCE_MODE; else process.env.PERSISTENCE_MODE = prev;
        }
    });
});

describe('Joe asked; the owner\'s next message is the answer', () => {
    test('an ask_owner run leaves its question; «اجل» goes back to that work on that device; a new build does not', async () => {
        const dw = require('../core/engine/device-work');
        const { agentEngineRoute } = require('../core/engine/select');
        const AGENT = { JOE_ENGINE: 'agent' };
        const sid = 'chat-answer-' + Date.now();
        dw.noteOperateResult(sid, { target: 'phone', request: 'ارسل الى شروق ايميل جديد وسالها عن اخر التطورات', summary: 'Joe asked the owner…', ok: false, question: 'هل أرسل إلى shoroq.suwan@gmail.com بنص: «…»؟' });
        expect(dw.pendingQuestion(sid)).toEqual(expect.objectContaining({ target: 'phone', question: expect.stringContaining('shoroq.suwan@gmail.com') }));
        const never = async () => { throw new Error('the model is not asked for an answer'); };
        expect(await agentEngineRoute('اجل', { engine: 'agent', sessionId: sid }, AGENT, { ask: never })).toEqual({ kind: 'operate', target: 'phone' });
        expect(await agentEngineRoute('هذا shoroq.suwan@gmail.com', { engine: 'agent', sessionId: sid }, AGENT, { ask: never })).toEqual({ kind: 'operate', target: 'phone' });
        expect(await agentEngineRoute('ابني لي موقع مطعم', { engine: 'agent', sessionId: sid }, AGENT, { ask: never })).toEqual({ kind: 'build' });
        //  Answered: it waits no more; and after half an hour it is not a pending question.
        dw.answeredQuestion(sid);
        expect(dw.pendingQuestion(sid)).toBeNull();
        dw.noteOperateResult(sid, { target: 'phone', request: 'x', summary: 'y', ok: false, question: 'q?' }, Date.now() - 31 * 60_000);
        expect(dw.pendingQuestion(sid)).toBeNull();
    });

    test('the run is given the chat, the device work and the question it answers; the answerer is told it cannot act', () => {
        const engine = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'AgentEngineTool.ts'), 'utf8');
        expect(engine).toContain('chatTurnsText(await recentChatTurns(o.context.sessionId, 12), o.request)');
        expect(engine).toContain("JOE'S LAST QUESTION, which the owner's message above answers");
        expect(engine).toContain('...(asked ? { question: String(result?.summary || \'\') } : {})');
        const dw = require('../core/engine/device-work');
        const sid = 'chat-facts-' + Date.now();
        dw.noteOperateResult(sid, { target: 'phone', request: 'شغل الكشاف', summary: 'شغّلت الكشاف.', ok: true });
        expect(dw.answererDeviceFacts(sid)).toContain('never say you will send, open or do something on them');
        expect(dw.deviceWorkFacts(sid)).not.toContain('never say you will send');
        const answer = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'CentralAnswerTool.ts'), 'utf8');
        expect(answer).toContain("require('../../../core/engine/device-work').answererDeviceFacts(context?.sessionId)");
    });

    test('the model reading a message sees the chat\'s last turns', () => {
        const { deviceIntentPrompt } = require('../core/engine/understand');
        const p = deviceIntentPrompt('افحص', null, 'THE CHAT SO FAR …\nOwner: هل توجد اجهزة على نفس الواي فاي؟');
        expect(p).toContain('Owner: هل توجد اجهزة على نفس الواي فاي؟');
        expect(p).toContain('scan it, IS device work: answer "computer"');
    });
});

describe('the devices on the Wi-Fi, seen from this computer', () => {
    //  What the owner's laptop answered, 2026-11-08 (trimmed).
    const OUT = [
        'NET\t192.168.1.89\t192.168.1.1\tWi-Fi\tAyla 2 home',
        'DEV\t192.168.1.89\t50-76-AF-48-1B-29\tAyla\tTrue',
        'DEV\t192.168.1.61\t8A-ED-64-71-ED-7B\t192.168.1.61\tTrue',
        'DEV\t192.168.1.1\t24-58-6E-A9-64-C8\tmesh.local\tTrue',
        'DEV\t192.168.1.66\tC8-FE-0F-0C-BD-7B\t192.168.1.66\tFalse',
        'DEV\t192.168.1.70\t50-C7-BF-11-22-33\tHP-LaserJet-M110\tTrue',
        'DEV\t192.168.1.71\t24-0A-C4-00-11-22\t\tTrue',
    ].join('\r\n');

    test('read: the router first, then this computer, then the others by address; names that are only the address are none', () => {
        const { parseNetworkScan, describeNetwork } = require('../core/devices/network-scan');
        const scan = parseNetworkScan(OUT);
        expect(scan.ok).toBe(true);
        expect(scan.network).toBe('Ayla 2 home');
        expect(scan.devices.map((d: any) => d.ip)).toEqual(['192.168.1.1', '192.168.1.89', '192.168.1.61', '192.168.1.66', '192.168.1.70', '192.168.1.71']);
        const byIp = (ip: string) => scan.devices.find((d: any) => d.ip === ip);
        expect(byIp('192.168.1.1').kind).toBe('the router (the Wi-Fi itself)');
        expect(byIp('192.168.1.89').kind).toBe('this computer');
        expect(byIp('192.168.1.61').name).toBe('');
        expect(byIp('192.168.1.61').privateMac).toBe(true);
        expect(byIp('192.168.1.61').kind).toBe('a phone, tablet or laptop (it hides its hardware address)');
        expect(byIp('192.168.1.70').kind).toBe('a printer');
        expect(byIp('192.168.1.71').maker).toBe('Espressif (smart device)');
        expect(byIp('192.168.1.71').kind).toBe('a smart-home device');
        const text = describeNetwork(scan);
        expect(text).toContain('This computer is on «Ayla 2 home» at 192.168.1.89; the router is 192.168.1.1.');
        expect(text).toContain('5 other device(s) on this network now');
        expect(text).toContain('did not answer the ping now');
        expect(parseNetworkScan('NONET')).toEqual({ ok: false, error: 'This computer is not on a network with a router right now.' });
    });

    test('the script reads the gateway from .NET (Get-NetIPConfiguration took 32 s), pings the /24 and reads the neighbour table', () => {
        const { networkScanScript } = require('../core/devices/network-scan');
        const s: string = networkScanScript();
        expect(s).toContain('[System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()');
        expect(s).not.toContain('Get-NetIPConfiguration');
        expect(s).toContain('SendPingAsync("$base.$_", 500)');
        expect(s).toContain('Get-NetNeighbor -AddressFamily IPv4 -InterfaceIndex $if');
        expect(s).toContain("$base = ($ip -split '\\.')[0..2] -join '.'");
    });

    test('the Wi-Fi questions are device work that starts with network_devices, on the computer', () => {
        const op = require('../core/engine/operate');
        for (const t of ['هل توجد اجهزة على نفس الواي فاي؟', 'افحص كم جهاز على شبكة الواي فاي', 'what devices are on my wifi', 'شو الأجهزة الموصولة بالراوتر']) {
            expect([t, op.isOperateRequest(t), op.isPhoneRequest(t), op.operatorFirstTool(t)]).toEqual([t, true, false, 'network_devices']);
        }
        expect(op.isNetworkRequest('ابني موقع لشركة شبكات')).toBe(false);
        const { deviceTools } = require('../core/engine/tools/devices');
        expect(deviceTools.map((t: any) => t.name)).toContain('network_devices');
        expect(op.operatorSystemPrompt({ platform: 'win32', shell: 'powershell' } as any)).toContain('call network_devices');
    });
});
