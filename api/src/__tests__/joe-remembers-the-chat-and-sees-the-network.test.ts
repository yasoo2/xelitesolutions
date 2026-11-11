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
    const AGENT = { JOE_ENGINE: 'agent' };
    const never = async () => { throw new Error('the model is not asked for an answer'); };
    const SHOROQ = { target: 'phone', request: 'ارسل الى شروق ايميل جديد وسالها عن اخر التطورات', summary: 'Joe asked the owner…', ok: false, question: 'هل أرسل إلى shoroq.suwan@gmail.com بنص: «…»؟' };

    test('an ask_owner run leaves its question; «اجل» goes back to that work on that device, given to that run only; a new build does not', async () => {
        const dw = require('../core/engine/device-work');
        const { agentEngineRoute } = require('../core/engine/select');
        const sid = 'chat-answer-' + Date.now();
        dw.noteOperateResult(sid, SHOROQ);
        expect(dw.pendingQuestion(sid)).toEqual(expect.objectContaining({ target: 'phone', question: expect.stringContaining('shoroq.suwan@gmail.com') }));
        expect(await agentEngineRoute('اجل', { engine: 'agent', sessionId: sid, runId: 'run-yes' }, AGENT, { ask: never })).toEqual({ kind: 'operate', target: 'phone', answers: true });
        //  The route gives the question to the run it routed, and to no other (AgentEngineTool reads it by its id).
        expect(dw.questionTakenBy(sid, 'run-yes')).toBe(true);
        expect(dw.questionTakenBy(sid, 'run-other')).toBe(false);
        expect(await agentEngineRoute('هذا shoroq.suwan@gmail.com', { engine: 'agent', sessionId: sid, runId: 'run-address' }, AGENT, { ask: never })).toEqual({ kind: 'operate', target: 'phone', answers: true });
        expect(dw.questionTakenBy(sid, 'run-address')).toBe(true);
        expect(await agentEngineRoute('ابني لي موقع مطعم', { engine: 'agent', sessionId: sid }, AGENT, { ask: never })).toEqual({ kind: 'build' });
        //  The build was not its answer, and it waits no more: the message after it is not taken either.
        expect(dw.pendingQuestion(sid)).toBeNull();
        expect(dw.questionTakenBy(sid, 'run-address')).toBe(false);
        //  …and after half an hour a question is not pending, nor given to a run.
        dw.noteOperateResult(sid, { target: 'phone', request: 'x', summary: 'y', ok: false, question: 'q?' }, Date.now() - 31 * 60_000);
        expect(dw.pendingQuestion(sid)).toBeNull();
        dw.takeQuestion(sid, 'run-late');
        expect(dw.questionTakenBy(sid, 'run-late')).toBe(false);
    });

    test('«اجل», «نعم», «ارسلها», «لا», «افحص» and a short reply answer it; a build, small talk and a question about something else do not, and leave it answered', async () => {
        const dw = require('../core/engine/device-work');
        const { agentEngineRoute, answersWaitingQuestion } = require('../core/engine/select');
        for (const t of ['اجل', 'نعم', 'ارسلها', 'لا', 'افحص', 'هذا shoroq.suwan@gmail.com', 'ok, go ahead', 'لا، أرسلها لاحقاً', 'الرمز 482913', 'شو كتبت فيها؟']) {
            const sid = `chat-yes-${t}-${Date.now()}`;
            dw.noteOperateResult(sid, SHOROQ);
            expect([t, await agentEngineRoute(t, { engine: 'agent', sessionId: sid, runId: `run-${t}` }, AGENT, { ask: never })]).toEqual([t, { kind: 'operate', target: 'phone', answers: true }]);
        }
        const none = async () => '{"device":"none"}';
        for (const [t, route] of [['ابني لي موقع مطعم', { kind: 'build' }], ['Build me a booking app for a salon', { kind: 'build' }], ['شكرا', null], ['مرحبا', null],
            ['ما هي عاصمة فرنسا؟', null], ['what is the capital of France?', null],
            ['اريد ان اعرف المزيد عن تاريخ الأندلس وأهم المدن التي بقيت منها حتى اليوم', null]] as const) {
            const sid = `chat-no-${t}-${Date.now()}`;
            dw.noteOperateResult(sid, SHOROQ);
            expect([t, await agentEngineRoute(t, { engine: 'agent', sessionId: sid }, AGENT, { ask: none })]).toEqual([t, route]);
            expect([t, dw.pendingQuestion(sid)]).toEqual([t, null]);
        }
        //  Read on the message alone, with no project in the chat.
        expect(answersWaitingQuestion('ابن لي متجراً', 'ابن لي متجراً', 's', null)).toBe(false);
        expect(answersWaitingQuestion('اجل', 'اجل', 's', null)).toBe(true);
    }, 60_000);

    /*
     * Found by the verifiers on 2026-11-08: «طيب», «تمام», "ok" counted as a yes and
     * were read before the chat's project, so a change of the project went to the
     * email Joe had asked about. The project is read first; only a real yes or no leads.
     */
    test('in a chat that has a project, a change of it is a change, whatever word leads it; the question waits no more', async () => {
        const dw = require('../core/engine/device-work');
        const { agentEngineRoute } = require('../core/engine/select');
        const { writeJoeProject } = require('../api/page-store');
        const { previewKey } = require('../modules/tools/preview-site');
        const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-answer-project-'));
        try {
            fs.writeFileSync(path.join(dir, 'index.html'), '<html><body>v1</body></html>');
            for (const t of ['طيب غير لون الزر للأحمر', 'تمام، الآن أضف زر تسجيل الدخول', 'ok add a login button', 'عدّل الصفحة الرئيسية واجعل الزر أخضر', 'نعم، وأضف في النص أني سأتأخر ساعة']) {
                const sid = `chat-answer-project-${t}-${Date.now()}`;
                writeJoeProject(previewKey(sid), { dir, type: 'agent', updatedAt: Date.now() }, 'run-built');
                dw.noteOperateResult(sid, SHOROQ);
                expect([t, await agentEngineRoute(t, { engine: 'agent', sessionId: sid, runId: `run-${t}` }, AGENT, { ask: never })]).toEqual([t, { kind: 'change', path: dir }]);
                expect([t, dw.pendingQuestion(sid)]).toEqual([t, null]);
                expect([t, dw.questionTakenBy(sid, `run-${t}`)]).toEqual([t, false]);
            }
            //  A plain yes in the same chat still answers it.
            const sid = 'chat-answer-project-yes-' + Date.now();
            writeJoeProject(previewKey(sid), { dir, type: 'agent', updatedAt: Date.now() }, 'run-built');
            dw.noteOperateResult(sid, SHOROQ);
            expect(await agentEngineRoute('نعم، ارسلها', { engine: 'agent', sessionId: sid, runId: 'run-yes-p' }, AGENT, { ask: never })).toEqual({ kind: 'operate', target: 'phone', answers: true });
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    }, 120_000);

    test('a lead is a real yes or no; «اي» only alone or before a comma; without a project a yes with more in it still answers', () => {
        const { answersWaitingQuestion } = require('../core/engine/select');
        for (const t of ['طيب غير لون الزر للأحمر', 'تمام، الآن أضف زر تسجيل الدخول', 'ok add a login button', 'نعم، غير لون الزر للأحمر', 'sure, change the header to blue']) {
            expect([t, answersWaitingQuestion(t, t, 'no-such-chat', '/a/project')]).toEqual([t, false]);
        }
        for (const t of ['نعم، وأضف في النص أني سأتأخر ساعة', 'اي', 'اي، ارسلها', 'إي.', 'لا، أرسلها لاحقاً', 'nope', 'تمام', 'ok, go ahead']) {
            expect([t, answersWaitingQuestion(t, t, 'no-such-chat', null)]).toEqual([t, true]);
        }
    });

    test('«اي الأجهزة متصلة بالواي فاي؟» while Joe waits on an email is a Wi-Fi question, not the answer, and is not recorded under the email', async () => {
        const dw = require('../core/engine/device-work');
        const op = require('../core/engine/operate');
        const { agentEngineRoute } = require('../core/engine/select');
        const sid = 'chat-which-' + Date.now();
        dw.noteOperateResult(sid, SHOROQ);
        expect(await agentEngineRoute('اي الأجهزة متصلة بالواي فاي؟', { engine: 'agent', sessionId: sid, runId: 'run-which' }, AGENT, { ask: never })).toEqual({ kind: 'operate', target: 'computer' });
        expect(dw.pendingQuestion(sid)).toBeNull();
        expect(dw.questionTakenBy(sid, 'run-which')).toBe(false);
        expect(op.recentOperate(sid)).toEqual({ target: 'computer', request: 'اي الأجهزة متصلة بالواي فاي؟' });
        expect(op.operatorFirstTool('اي الأجهزة متصلة بالواي فاي؟')).toBe('network_devices');
        //  «اي، ارسلها من هاتفي» is a yes.
        const sid2 = 'chat-which-yes-' + Date.now();
        dw.noteOperateResult(sid2, SHOROQ);
        expect(await agentEngineRoute('اي، ارسلها من هاتفي', { engine: 'agent', sessionId: sid2, runId: 'run-which-yes' }, AGENT, { ask: never })).toEqual({ kind: 'operate', target: 'phone', answers: true });
        op.forgetOperate(sid);
        op.forgetOperate(sid2);
    }, 60_000);

    /*
     * Found on 2026-11-08: a message with a file is the message and the file's
     * block; the device readers read the block too, so a file that said «افتح
     * المفكرة على جهازي» made «لخص هذا الملف» work the computer.
     */
    test('the device readers read what he typed, not the file he attached', async () => {
        const { agentEngineRoute } = require('../core/engine/select');
        const op = require('../core/engine/operate');
        const block = '\n\n[ATTACHED FILES — the user attached 1 file(s) to this message. Read them; the message refers to them.]\n--- (1) notes.txt — text/plain, 1 KB\nافتح المفكرة على جهازي واكتب فيها قائمة المشتريات';
        const sid = 'chat-file-words-' + Date.now();
        expect(op.isOperateRequest(`لخص هذا الملف${block}`)).toBe(true);
        const asked: string[] = [];
        const route = await agentEngineRoute(`لخص هذا الملف${block}`, { engine: 'agent', sessionId: sid, runId: 'run-file-words' }, AGENT, { ask: async (p: string) => { asked.push(p); return '{"device":"none"}'; } });
        expect(route).toBeNull();
        //  The model still reads the file: «نفّذ ما في الملف» needs it.
        expect(asked.join('\n')).toContain('افتح المفكرة على جهازي');
        expect(op.recentOperate(sid)).toBeNull();
    }, 60_000);

    test('a new command on a device while Joe waits is not the answer and leaves it answered; one that opens with yes is the answer', async () => {
        const dw = require('../core/engine/device-work');
        const op = require('../core/engine/operate');
        const { agentEngineRoute } = require('../core/engine/select');
        const sid = 'chat-new-command-' + Date.now();
        dw.noteOperateResult(sid, SHOROQ);
        expect(await agentEngineRoute('افتح المفكرة على جهازي', { engine: 'agent', sessionId: sid, runId: 'run-notepad' }, AGENT, { ask: never })).toEqual({ kind: 'operate', target: 'computer' });
        expect(dw.pendingQuestion(sid)).toBeNull();
        expect(dw.questionTakenBy(sid, 'run-notepad')).toBe(false);
        //  …so «اجل» after it is not taken back to the email: nothing waits any more.
        const route = await agentEngineRoute('اجل', { engine: 'agent', sessionId: sid, runId: 'run-after' }, AGENT, { ask: async () => '{"device":"none"}' });
        expect(route?.answers).toBeUndefined();
        expect(dw.questionTakenBy(sid, 'run-after')).toBe(false);
        op.forgetOperate(sid);
        const sid2 = 'chat-yes-phone-' + Date.now();
        dw.noteOperateResult(sid2, SHOROQ);
        expect(await agentEngineRoute('اجل، ارسلها من هاتفي', { engine: 'agent', sessionId: sid2, runId: 'run-send' }, AGENT, { ask: never })).toEqual({ kind: 'operate', target: 'phone', answers: true });
        expect(dw.questionTakenBy(sid2, 'run-send')).toBe(true);
        op.forgetOperate(sid2);
    }, 60_000);

    test('the run is given the chat, the device work and the question only when the route read its message as the answer; the answerer is told it cannot act', () => {
        const engine = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'AgentEngineTool.ts'), 'utf8');
        expect(engine).toContain('chatTurnsText(await recentChatTurns(o.context.sessionId, 12), own)');
        expect(engine).toContain('const pending = o.answersQuestion ? pendingQuestion(o.context.sessionId) : null;');
        expect(engine).toContain('const answersQuestion = input?.answersQuestion === true || questionTakenBy(context.sessionId, runId);');
        expect(engine).toContain("JOE'S LAST QUESTION, which the owner's message above was read as answering");
        expect(engine).toContain('If his message asks for something else instead, do that, and do not do what the question was about.');
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
        //  What the lists miss of a watch on the mail, or of a page that shows the devices, the model is told too (2026-11-08).
        expect(p).toContain('watch his email and tell him when someone writes or replies IS device work: answer "phone"');
        expect(p).toContain('(even a page or a table that shows the devices)');
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

    test('the script reads the interfaces from .NET (Get-NetIPConfiguration took 32 s), pings around this computer and reads the neighbour table', () => {
        const { networkScanScript } = require('../core/devices/network-scan');
        const s: string = networkScanScript();
        expect(s).toContain('[System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()');
        expect(s).not.toContain('Get-NetIPConfiguration');
        expect(s).toContain('SendPingAsync($a, 500)');
        expect(s).toContain('Get-NetNeighbor -AddressFamily IPv4 -InterfaceIndex $idx');
        //  Not a /24 guessed from the address any more (joe-scans-the-right-network.test.ts).
        expect(s).not.toContain('$base');
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

    //  Found on 2026-11-08: «جهاز» inside «جهازي», and "things"/"connected", sent
    //  ordinary requests that name the network to a Wi-Fi scan, and the scan's checks passed them.
    test('a question about the devices on the network is one: a cue to count, name, list or scan them, near a device word that stands alone', () => {
        const op = require('../core/engine/operate');
        for (const t of ['كم عدد الأجهزة المتصلة بالراوتر؟', 'هل في اجهزة غريبة على الواي فاي؟', 'كم جهازاً على الشبكة؟', 'اعرض لي كل الأجهزة المتصلة بالواي فاي',
            'الأجهزة المتصلة بالواي فاي؟', 'مين متصل على الواي فاي؟', 'ما هي الأجهزة على شبكة البيت؟',
            'how many devices are on my wifi?', 'which devices are connected to my router', 'scan my wifi for devices', 'list the devices on my network',
            "what's on my wifi?", 'are there any devices on my network I do not know?', 'هل فعلاً في أجهزة على الواي فاي؟']) {
            expect([t, op.isNetworkRequest(t)]).toEqual([t, true]);
        }
        for (const t of ['اطفي الواي فاي في جهازي', 'شغل الواي فاي على جهازي', 'turn on wifi on my device', 'disable the wifi on this device',
            'ابحث عن تحديث لجهاز الراوتر', 'my things are connected to the wifi', 'is my laptop connected to the network?',
            'أضف صفحة تعرض الأجهزة المتصلة بالشبكة', 'اضف للتطبيق قائمة بالأجهزة على الواي فاي', 'fix the network page so it shows which devices are connected',
            'add a list of the devices on the network to the dashboard', 'build an app that lists the devices on my network', 'اعمل موقع يعرض كم جهاز متصل بالواي فاي',
            'ابني تطبيق يعرض الأجهزة المتصلة بالشبكة', 'اجعل الصفحة تعرض كم جهاز على الشبكة',
            'كم جهاز يتحمل الراوتر؟', 'ما هي أفضل طريقة لحماية الأجهزة على الشبكة؟', 'which router is best for many devices on wifi?', 'كيف أحمي جهازي على شبكة الواي فاي؟']) {
            expect([t, op.isNetworkRequest(t)]).toEqual([t, false]);
        }
    });

    //  Found by the verifiers on 2026-11-08: these went to device_computers, or to no device at all.
    test('to search, look for, find or check the devices on the Wi-Fi is the scan', () => {
        const op = require('../core/engine/operate');
        for (const t of ['ابحث عن الأجهزة المتصلة بالواي فاي', 'دور على الاجهزة اللي على الواي فاي', 'دوّر على الأجهزة الموصولة بالراوتر', 'فتش عن اجهزة غريبة على الواي فاي', 'شوف الأجهزة على الواي فاي',
            'search for devices on my network', 'find all devices connected to my wifi', 'check my wifi for devices', 'look for devices on my network']) {
            expect([t, op.isNetworkRequest(t), op.isOperateRequest(t), op.isPhoneRequest(t), op.operatorFirstTool(t), op.requestKind(t)]).toEqual([t, true, true, false, 'network_devices', 'devices']);
        }
        //  «بحث» alone is a research paper and «دور» alone a role: not the verb.
        for (const t of ['اكتب بحث عن الأجهزة على الشبكة', 'ما دور الأجهزة على الشبكة؟']) expect([t, op.isNetworkRequest(t)]).toEqual([t, false]);
    });

    //  Found by the verifiers on 2026-11-08: «افضل» anywhere was advice, even «افضل لو…» (better if…).
    test('advice is the question itself; a polite «better if» after the question is not advice', () => {
        const op = require('../core/engine/operate');
        for (const t of ['كم جهاز على الواي فاي؟ افضل لو تعطيني اسماءها', 'كم جهاز على الواي فاي، من الأفضل أن تعطيني الأسماء', 'how many devices are on my wifi? best if you list their names']) {
            expect([t, op.isNetworkRequest(t), op.operatorFirstTool(t)]).toEqual([t, true, 'network_devices']);
        }
        for (const t of ['كم جهاز يتحمل الراوتر؟', 'كم جهاز يتحمل الراوتر؟ الأجهزة عندي كثيرة', 'ما أفضل راوتر لعدد كبير من الأجهزة على الواي فاي؟', 'how many devices does my router support?', 'find out how many devices my router supports']) {
            expect([t, op.isNetworkRequest(t)]).toEqual([t, false]);
        }
    });

    /*
     * Found by the verifiers on 2026-11-08: a page that lists the devices named the
     * devices and the network, and went to device_computers through the devices
     * reader. A build, a site, a page, the code or the project, or an edit leading
     * the message, is software: never work on the devices.
     */
    test('a request about a page, a site, a table or a project is never device work, even when it names the devices on the network', () => {
        const op = require('../core/engine/operate');
        for (const t of ['أضف صفحة تعرض الأجهزة المتصلة بالشبكة', 'اصلح الصفحة التي تعرض الأجهزة على الشبكة', 'رتب الأجهزة على الشبكة في جدول',
            'ممكن تضيف صفحة تعرض الأجهزة المتصلة بالواي فاي', 'طيب، أضف للتطبيق قائمة بالأجهزة على الشبكة', 'add a table of the devices connected to my network',
            'اجعل الموقع يظهر جيداً على هاتفي', 'عدل المشروع ليعرض الهواتف المتصلة']) {
            expect([t, op.isDeviceRequest(t), op.isOperateRequest(t), op.isPhoneRequest(t)]).toEqual([t, false, false, false]);
        }
        //  A device named with a site still works the device; a table to answer in is not software.
        expect(op.isOperateRequest('افتح الموقع على جهازي')).toBe(true);
        expect(op.isDeviceRequest('اشبك على كمبيوتر المكتب وافتح الموقع')).toBe(true);
        expect(op.isNetworkRequest('اعرض الأجهزة على الواي فاي في جدول')).toBe(true);
    });

    test('…so in a chat that has a project, it changes the project', async () => {
        const { agentEngineRoute } = require('../core/engine/select');
        const { writeJoeProject } = require('../api/page-store');
        const { previewKey } = require('../modules/tools/preview-site');
        const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-devices-page-'));
        try {
            fs.writeFileSync(path.join(dir, 'index.html'), '<html><body>devices</body></html>');
            for (const t of ['أضف صفحة تعرض الأجهزة المتصلة بالشبكة', 'اصلح الصفحة التي تعرض الأجهزة على الشبكة', 'رتب الأجهزة على الشبكة في جدول']) {
                const sid = `chat-devices-page-${t}-${Date.now()}`;
                writeJoeProject(previewKey(sid), { dir, type: 'agent', updatedAt: Date.now() }, 'run-built');
                expect([t, await agentEngineRoute(t, { engine: 'agent', sessionId: sid }, { JOE_ENGINE: 'agent' }, { ask: async () => { throw new Error('not asked'); } })]).toEqual([t, { kind: 'change', path: dir }]);
            }
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    }, 120_000);

    test('turning the Wi-Fi on or off is an action, never a listing; on the phone it starts on the phone', () => {
        const op = require('../core/engine/operate');
        //  The Wi-Fi of his computer: an action held to an action and a look after it, not «the devices were listed».
        for (const t of ['اطفي الواي فاي في جهازي', 'شغّل الواي فاي على جهازي']) {
            expect([t, op.isOperateRequest(t), op.requestKind(t), op.operatorFirstTool(t)]).toEqual([t, true, 'act', 'device_windows']);
        }
        expect(op.requestKind('turn on wifi on my device')).toBe('act');
        //  The phone's own Wi-Fi starts with the phone, whatever the message says of the network.
        for (const t of ['اطفي الواي فاي في هاتفي', 'turn on wifi on my phone']) {
            expect([t, op.isPhoneRequest(t), op.operatorFirstTool(t)]).toEqual([t, true, 'android_devices']);
        }
        expect(op.operatorFirstTool('كم جهاز على الواي فاي؟', 'phone')).toBe('android_devices');
        expect(op.operatorFirstTool('كم جهاز على الواي فاي؟', 'computer')).toBe('network_devices');
        expect(op.operatorFirstTool('كم جهاز على الواي فاي؟')).toBe('network_devices');
    });
});

/*
 * «TELL ME WHEN SHE REPLIES» IS WORK ON THE PHONE'S MAIL.
 *
 * Found on 2026-11-08: «انتظر حتى ترد واعلمني», «اذا رد عليك اخبرني», «خبرني لما
 * يوصلني ايميل من احمد», «تابع ردود شروق» named no device and reached the chat's
 * answerer, which cannot watch anything. They go to the operate engine on the
 * phone, whose run has email_watch_replies and the chat's last turns.
 */
describe('a watch on the mail goes to the phone, before the answerer', () => {
    const AGENT = { JOE_ENGINE: 'agent' };
    const never = async () => { throw new Error('the model is not asked: the readers know these'); };
    const WATCHES = ['انتظر حتى ترد واعلمني', 'اذا رد عليك اخبرني', 'خبرني لما يوصلني ايميل من احمد', 'تابع ردود شروق', 'let me know when she replies'];

    test('routed to the phone without asking the model; a site that sends email is a build', async () => {
        const { agentEngineRoute } = require('../core/engine/select');
        const op = require('../core/engine/operate');
        for (const t of WATCHES) {
            const sid = `chat-watch-${t}-${Date.now()}`;
            expect([t, await agentEngineRoute(t, { engine: 'agent', sessionId: sid }, AGENT, { ask: never })]).toEqual([t, { kind: 'operate', target: 'phone' }]);
            expect([t, op.operatorFirstTool(t), op.requestKind(t)]).toEqual([t, 'email_watch_replies', 'watch']);
            op.forgetOperate(sid);
        }
        //  To send and then watch is sending first, on the phone.
        expect(op.isPhoneRequest('ارسل ايميل لشروق واخبرني اذا ردت')).toBe(true);
        expect([op.operatorFirstTool('ارسل ايميل لشروق واخبرني اذا ردت'), op.requestKind('ارسل ايميل لشروق واخبرني اذا ردت')]).toEqual(['android_devices', 'act']);
        //  Software that sends or reads email is software.
        expect(await agentEngineRoute('ابني موقع فيه نموذج يرسل ايميل', { engine: 'agent', sessionId: 'chat-watch-build-' + Date.now() }, AGENT, { ask: never })).toEqual({ kind: 'build' });
        for (const t of ['ابني موقع فيه نموذج يرسل ايميل', 'اضف للموقع زر يخبرني لما يوصل ايميل']) expect([t, op.isOperateRequest(t), op.isPhoneRequest(t)]).toEqual([t, false, false]);
    }, 60_000);

    test('in a chat that has a project, a watch is still the phone\'s, not a change', async () => {
        const { agentEngineRoute } = require('../core/engine/select');
        const { writeJoeProject } = require('../api/page-store');
        const { previewKey } = require('../modules/tools/preview-site');
        const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-watch-project-'));
        try {
            fs.writeFileSync(path.join(dir, 'index.html'), '<html><body>v1</body></html>');
            const sid = 'chat-watch-project-' + Date.now();
            writeJoeProject(previewKey(sid), { dir, type: 'agent', updatedAt: Date.now() }, 'run-built');
            expect(await agentEngineRoute('تابع ردود شروق', { engine: 'agent', sessionId: sid }, AGENT, { ask: never })).toEqual({ kind: 'operate', target: 'phone' });
            require('../core/engine/operate').forgetOperate(sid);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    }, 60_000);

    test('the run is told where the address is, and the checks pass a watch it made, not one from before, not nothing', async () => {
        const op = require('../core/engine/operate');
        const mw = require('../core/devices/mail-watch');
        const first = op.operatorFirstMessage('تابع ردود شروق', 'ar', 'ar', 'phone', 'THE CHAT SO FAR …');
        expect(first).toContain('call email_watch_replies with that person\'s address');
        expect(first).toContain('Never guess an address.');
        expect(first).toMatch(/then email_watch_replies\.$/u);
        expect(op.operatorFirstMessage('افتح واتساب على هاتفي', 'ar', 'ar', 'phone')).not.toContain('email_watch_replies');
        const sid = 'chat-watch-check-' + Date.now();
        const ctx = { runId: 'watch-run-' + Date.now(), request: 'تابع ردود شروق', joe: { sessionId: sid } } as any;
        //  A watch made before this run began is not this run's.
        mw.watchReplies(sid, { to: ['old.friend@example.com'], request: 'x' }, Date.now() - 60_000);
        const since = Date.now();
        const before = await op.operateVerifier({ own: 'تابع ردود شروق', since })(ctx, { summary: 'سأتابع' });
        expect(before.passed).toBe(false);
        expect(before.checks.map((c: any) => c.id)).toEqual(['watching']);
        const told = op.operateOutput({ status: 'failed', summary: 'x', verification: before } as any, 'ar');
        expect(told.output.summary).toContain('لم تبدأ مراقبة البريد');
        mw.watchReplies(sid, { to: ['shoroq.suwan@gmail.com'], name: 'شروق', request: 'تابع ردود شروق' });
        const after = await op.operateVerifier({ own: 'تابع ردود شروق', since })(ctx, { summary: 'أراقب' });
        expect(after.passed).toBe(true);
        expect(after.checks[0].detail).toContain('shoroq.suwan@gmail.com');
        //  …and it is told as a watch, never «I looked at the screen».
        const out = op.operateOutput({ status: 'delivered', summary: 'سأخبرك عند ردّ شروق.', verification: after, filesChanged: [], served: [], steps: 2, model: 'm', durationMs: 4_000 } as any, 'ar');
        expect(out.output.summary).toContain('أراقب بريدك الآن');
        expect(out.output.summary).not.toContain('نظرتُ إلى الشاشة');
        mw.stopWatching(sid);
    });

    test('in the real loop: the run calls email_watch_replies with the chat\'s address and is delivered on that alone', async () => {
        //  The tool wakes the background reader of the phone; under a test it must not reach for adb.
        jest.doMock('../modules/services/MailWatchService', () => ({ mailWatchService: { wake: () => undefined } }));
        const { runEngine } = require('../core/engine/loop');
        const { finishTool } = require('../core/engine/finish');
        const { emailWatchTool } = require('../core/engine/tools/mail');
        const op = require('../core/engine/operate');
        const mw = require('../core/devices/mail-watch');
        const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-watch-loop-'));
        const sid = 'chat-watch-loop-' + Date.now();
        const turns = [
            { name: 'email_watch_replies', args: { to: ['shoroq.suwan@gmail.com'], name: 'شروق', subject: 'آخر التطورات' } },
            { name: 'task_finish', args: { summary: 'سأخبرك هنا فور وصول ردّ من شروق.' } },
        ];
        let i = 0;
        const model = {
            label: 'scripted:watch', vision: false, contextTokens: () => 64_000,
            async step() { const t = turns[Math.min(i, turns.length - 1)]; i++; return { text: '', toolCalls: [{ id: `c${i}`, name: t.name, arguments: JSON.stringify(t.args) }], durationMs: 1 }; },
        };
        try {
            const since = Date.now();
            const result = await runEngine({
                runId: 'watch-loop', request: 'تابع ردود شروق', language: 'ar', replyLanguage: 'ar', projectDir: dir, operate: true, operateTarget: 'phone',
                deadlineAt: Date.now() + 60_000, signal: new AbortController().signal, emit: () => undefined, joe: { sessionId: sid },
            }, {
                model, tools: [emailWatchTool, finishTool(op.operateVerifier({ own: 'تابع ردود شروق', since }))],
                processes: { async start() { throw new Error('none'); }, logs: () => undefined, stop: async () => true, list: () => [], stopAll: async () => undefined },
                browser: () => { throw new Error('no browser'); },
                machine: { platform: 'win32', shell: 'Windows PowerShell 5.1' },
            });
            expect(result.status).toBe('delivered');
            expect(result.verification?.checks.map((c: any) => [c.id, c.status])).toEqual([['watching', 'passed']]);
            expect(mw.activeWatches().filter((w: any) => w.sessionId === sid).map((w: any) => [w.to, w.name])).toEqual([['shoroq.suwan@gmail.com', 'شروق']]);
        } finally {
            mw.stopWatching(sid);
            jest.dontMock('../modules/services/MailWatchService');
            fs.rmSync(dir, { recursive: true, force: true });
        }
    }, 120_000);
});

//  Found on 2026-11-08: on a server with Mongo the run path kept neither turn in
//  the Message collection, which the web and recentChatTurns both read.
describe('on a server with Mongo the chat is kept where it is read', () => {
    function memoryMessages() {
        const rows: any[] = [];
        let clock = Date.parse('2026-11-08T10:00:00Z');
        const Message = {
            rows,
            create: jest.fn(async (doc: any) => { const row = { _id: `m${rows.length + 1}`, ...doc, createdAt: new Date(clock += 1000) }; rows.push(row); return row; }),
            find: jest.fn((q: any) => {
                let out = rows.filter(r => r.sessionId === q.sessionId);
                const chain: any = {
                    sort: (s: any) => { out = [...out].sort((a, b) => (a.createdAt - b.createdAt) * (s.createdAt < 0 ? -1 : 1)); return chain; },
                    limit: (n: number) => { out = out.slice(0, n); return chain; },
                    lean: async () => out.map(r => ({ ...r })),
                };
                return chain;
            }),
        };
        return Message;
    }

    //  chat-history reads the store when it is called, so the mocks stand for the whole test and go after it.
    afterEach(() => {
        jest.dontMock('../api/chat-store');
        jest.dontMock('../shared/models/message');
        jest.resetModules();
    });

    test('the owner\'s message and Joe\'s answer go to Message once each, and the next run reads them back, oldest first', async () => {
        const Message = memoryMessages();
        jest.resetModules();
        jest.doMock('../api/chat-store', () => ({ usesLocalChatStore: () => false }));
        jest.doMock('../shared/models/message', () => ({ Message }));
        const history = require('../core/engine/chat-history');
        const before = (global as any).mockMessages;
        (global as any).mockMessages = [];
        try {
            expect(await history.keepChatTurnInDatabase({ sessionId: 'mongo-1', role: 'user', content: 'هل توجد أجهزة على الواي فاي؟', attachments: [{ id: 'f1', name: 'router.png', size: 10 } as any] })).toBe(true);
            expect(await history.keepChatTurnInDatabase({ sessionId: 'mongo-1', role: 'assistant', content: 'على الشبكة 11 جهازاً.', runId: 'run-1' })).toBe(true);
            expect(await history.keepChatTurnInDatabase({ sessionId: 'mongo-2', role: 'user', content: 'another chat' })).toBe(true);
            expect(await history.keepChatTurnInDatabase({ sessionId: 'mongo-1', role: 'user', content: '   ' })).toBe(false);
            expect(Message.create).toHaveBeenCalledTimes(3);
            expect(Message.rows[0]).toEqual(expect.objectContaining({ sessionId: 'mongo-1', role: 'user', attachments: [{ name: 'router.png' }] }));
            expect(Message.rows[1]).toEqual(expect.objectContaining({ role: 'assistant', runId: 'run-1' }));
            //  The local store is not written in this mode: nothing shown twice.
            expect((global as any).mockMessages).toEqual([]);
            expect(await history.recentChatTurns('mongo-1', 12)).toEqual([
                { role: 'user', content: 'هل توجد أجهزة على الواي فاي؟' },
                { role: 'assistant', content: 'على الشبكة 11 جهازاً.' },
            ]);
            //  The newest turns when there are more than asked for, still oldest first.
            expect(await history.recentChatTurns('mongo-1', 1)).toEqual([{ role: 'assistant', content: 'على الشبكة 11 جهازاً.' }]);
        } finally {
            (global as any).mockMessages = before;
        }
    });

    test('a database that fails never stops the run', async () => {
        jest.resetModules();
        jest.doMock('../shared/models/message', () => ({ Message: { create: async () => { throw new Error('no primary'); } } }));
        const history = require('../core/engine/chat-history');
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        try {
            expect(await history.keepChatTurnInDatabase({ sessionId: 's', role: 'user', content: 'x' })).toBe(false);
        } finally {
            warn.mockRestore();
        }
    });

    test('the run path writes each turn in the other branch of the local store, the same collection the web lists', () => {
        const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
        const run = read('api', 'routes', 'run.ts');
        const local = run.indexOf("role: 'user', content: submittedText, attachments: attachmentMeta(), createdAt: new Date()");
        expect(local).toBeGreaterThan(0);
        const userSave = run.slice(local, run.indexOf('} catch { /* non-fatal */ }', local));
        expect(userSave).toMatch(/persistChatStores\(\);\s*\} else \{[\s\S]*void keepChatTurnInDatabase\(\{ sessionId: runSessionId, role: 'user', content: submittedText, attachments: attachmentMeta\(\) \}\);/u);
        expect((run.match(/keepChatTurnInDatabase\(/gu) || []).length).toBe(1);
        expect(run).toContain('ownerText: submittedText,');
        const loop = read('modules', 'services', 'AgentLoopService.ts');
        expect((loop.match(/await keepChatTurnInDatabase\(/gu) || []).length).toBe(3);
        for (const said of ['content: text, runId', 'content: finalText, runId', 'content: failText, runId']) {
            const at = loop.indexOf(`await keepChatTurnInDatabase({ sessionId, role: 'assistant', ${said} })`);
            expect([said, at > 0]).toEqual([said, true]);
            //  …in the else of the local store's write, before the run is told finished.
            expect(loop.lastIndexOf('} else {', at)).toBeGreaterThan(loop.lastIndexOf('if (usesLocalChatStore()) {', at));
            expect(loop.indexOf("type: 'run_finished'", at)).toBeGreaterThan(at);
        }
        expect(loop).toContain('ownerText: String(options.ownerText ?? goal).trim() || undefined,');
        const sessions = read('api', 'controllers', 'sessionController.ts');
        expect(sessions).toContain('Message.find({ sessionId: queryId }).sort({ createdAt: 1 }).lean()');
        expect(read('core', 'engine', 'chat-history.ts')).toContain('Message.find({ sessionId: id }).sort({ createdAt: -1 }).limit(limit).lean()');
    });
});
