/**
 * «افحص» ALONE CONTINUES THE CHAT'S LAST DEVICE WORK.
 *
 * The owner, 2026-11-08, in front of him: «هل توجد أجهزة على الواي فاي؟» was
 * answered in 15 s; then «افحص». The run scanned the Wi-Fi again — and Joe's
 * checks refused it four times («acted, looked_after»): they read «افحص»
 * alone, as an action never done. The model went reading the owner's own
 * windows to please them, failed after 11 steps, and the owner read the
 * engine's English under the Arabic reason.
 *
 * Pinned: a short message is read with the request it follows; a check, a
 * scan, «كم» and «هل» are looks; an action asked by its noun is an action;
 * a scan is the look a devices question needs; the English lines of a
 * failed run never reach an Arabic reader; Joe's Arabic name is «جو».
 */
import { continuedRequest, onlyLooks, operateOutput, operateVerifier, ownScript, requestKind, operatorFirstMessage } from '../core/engine/operate';
import { deviceRecordFor, forgetDeviceRecord } from '../core/engine/tools/devices';
import { languageSection } from '../core/engine/prompt';
import type { ToolContext } from '../core/engine/types';

const WIFI = 'هل توجد أجهزة على الواي فاي؟';

describe('a short message is read with the work it continues', () => {
    test('«افحص» after the Wi-Fi question continues it; a message that names its own thing stands alone', () => {
        expect(continuedRequest('افحص', WIFI)).toBe(`افحص\n(it continues: ${WIFI})`);
        expect(continuedRequest('حاول مره اخرى', 'شغل الكشاف في الهاتف')).toContain('(it continues: شغل الكشاف في الهاتف)');
        expect(continuedRequest('شغل الكشاف', WIFI)).toBe('شغل الكشاف');
        expect(continuedRequest('افتح المفكرة على جهازي', WIFI)).toBe('افتح المفكرة على جهازي');
        expect(continuedRequest('افحص', null)).toBe('افحص');
    });

    test('checks, scans, «كم» and «هل» are looks; an action asked by its verb or its noun is not', () => {
        for (const t of ['افحص', 'افحصها', 'تحقق من الكشاف', 'تأكد', 'كم جهاز على الشبكة؟', 'هل الكشاف شغال؟', 'check', 'scan it again', 'how many are there?'])
            expect([t, onlyLooks(t)]).toEqual([t, true]);
        for (const t of ['هل يمكنك تشغيل الكشاف؟', 'افحص وبعدين اطفي الكشاف', 'check it and turn it off', 'هل تقدر ترسل الايميل؟'])
            expect([t, onlyLooks(t)]).toEqual([t, false]);
    });

    test('what the checks hold the run to', () => {
        expect(requestKind('افحص', continuedRequest('افحص', WIFI))).toBe('look');
        expect(requestKind(WIFI)).toBe('devices');
        expect(requestKind('اطفيه', continuedRequest('اطفيه', 'شغل الكشاف في الهاتف'))).toBe('act');
        expect(requestKind('حاول مره اخرى', continuedRequest('حاول مره اخرى', WIFI))).toBe('devices');
        expect(requestKind('اجل', continuedRequest('اجل', 'ارسل ايميل لشروق'))).toBe('act');
    });

    test('the first tool of «افحص» after the Wi-Fi question is the scan', () => {
        const about = continuedRequest('افحص', WIFI);
        expect(operatorFirstMessage('افحص', 'ar', 'ar', undefined, '', about)).toMatch(/then network_devices\.$/u);
        expect(operatorFirstMessage('افحص', 'ar', 'ar')).toMatch(/then device_windows\.$/u);
    });
});

describe('the checks pass the scan «افحص» asked for, and nothing less', () => {
    const ctx = (runId: string, request: string) => ({ runId, request } as unknown as ToolContext);
    afterEach(() => { for (const id of ['s1', 's2', 's3', 's4']) forgetDeviceRecord(id); });

    test('the Wi-Fi scanned again is done (it failed four times on 2026-11-08)', async () => {
        const rec = deviceRecordFor('s1');
        rec.looks.push({ at: 1, kind: 'devices' });
        const r = await operateVerifier({ about: continuedRequest('افحص', WIFI) })(ctx('s1', 'افحص'), { summary: 'أعدت الفحص' });
        expect(r.passed).toBe(true);
        expect(r.checks.map(c => c.id)).toEqual(['devices']);
    });

    test('nothing scanned or looked at is not done', async () => {
        deviceRecordFor('s2');
        const r = await operateVerifier({ about: continuedRequest('افحص', WIFI) })(ctx('s2', 'افحص'), { summary: 'تم' });
        expect(r.passed).toBe(false);
    });

    test('a list of devices is not a look at a screen when the chat was about the screen', async () => {
        const rec = deviceRecordFor('s3');
        rec.looks.push({ at: 1, kind: 'devices' });
        const r = await operateVerifier({ about: continuedRequest('افحص', 'شو الظاهر على شاشة هاتفي') })(ctx('s3', 'افحص'), { summary: 'x' });
        expect(r.passed).toBe(false);
    });

    test('«اطفيه» after the flashlight is still held to an action and a look after it', async () => {
        const rec = deviceRecordFor('s4');
        rec.looks.push({ at: 1, kind: 'read' });
        const r = await operateVerifier({ about: continuedRequest('اطفيه', 'شغل الكشاف في الهاتف') })(ctx('s4', 'اطفيه'), { summary: 'أطفأته' });
        expect(r.passed).toBe(false);
        expect(r.checks.find(c => c.id === 'acted')?.status).toBe('failed');
    });

    test('a scan that passes is told with the devices words, not «I read the screen»', () => {
        const out = operateOutput({ status: 'delivered', summary: 'على الشبكة 11 جهازاً.', verification: { passed: true, checks: [{ id: 'devices', status: 'passed', detail: 'x' }], unproven: [], at: 1 }, filesChanged: [], served: [], steps: 3, model: 'm', durationMs: 15_000 } as any, 'ar');
        expect(out.output.summary).toContain('هذا ما أصل إليه الآن من أجهزتك');
    });
});

/*
 * HIS OWN WORDS, NOT HIS WORDS WITH A FILE'S BLOCK.
 *
 * Found on 2026-11-08: a message with a file reaches the run as the message
 * and then «[ATTACHED FILES — …]» (AgentLoopService), and a resumed run as the
 * earlier goal. THE CHAT SO FAR then showed his message twice, the 400
 * characters an answer to Joe's question may have were measured with the
 * file in them, and «افحص» with a picture was never short enough to continue
 * the chat's last device work.
 */
describe('a message with a file is read on the words the owner typed', () => {
    const FILE = '\n\n[ATTACHED FILES — the user attached 1 file(s) to this message. Read them; the message refers to them.]\n--- (1) router.png — image/png, 40 KB\n' + 'وصف الصورة '.repeat(120);

    test('his words are the run\'s ownerText, else the request without the file block', () => {
        const { ownerWords } = require('../core/engine/chat-history');
        expect(ownerWords(`اجل${FILE}`)).toBe('اجل');
        expect(ownerWords('افحص')).toBe('افحص');
        expect(ownerWords('the resumed goal: build the store', 'كمل')).toBe('كمل');
        expect(ownerWords(`اجل${FILE}`, '  ')).toBe('اجل');
    });

    test('THE CHAT SO FAR leaves his message out once, with its file or without', () => {
        const { chatTurnsText } = require('../core/engine/chat-history');
        const turns = [
            { role: 'user', content: WIFI },
            { role: 'assistant', content: 'على الشبكة 11 جهازاً.' },
            { role: 'user', content: 'افحص' },
        ];
        expect(chatTurnsText(turns as any, `افحص${FILE}`)).not.toMatch(/Owner: افحص$/mu);
        expect(chatTurnsText(turns as any, 'افحص')).not.toMatch(/Owner: افحص$/mu);
        //  A request that only begins with the same letters is another message: it stays.
        expect(chatTurnsText(turns as any, 'افحصها مرة أخرى')).toMatch(/Owner: افحص$/mu);
    });

    test('the answer to Joe\'s question is measured on his words; a resumed goal is not an answer', async () => {
        const dw = require('../core/engine/device-work');
        const { agentEngineRoute } = require('../core/engine/select');
        const AGENT = { JOE_ENGINE: 'agent' };
        const never = async () => { throw new Error('the model is not asked'); };
        const question = { target: 'phone', request: 'ارسل لشروق ايميل', summary: 'Joe asked…', ok: false, question: 'هل أرسلها؟' };
        const sid = 'chat-file-answer-' + Date.now();
        dw.noteOperateResult(sid, question);
        expect(`اجل${FILE}`.length).toBeGreaterThan(400);
        expect(await agentEngineRoute(`اجل${FILE}`, { engine: 'agent', sessionId: sid, runId: 'run-file' }, AGENT, { ask: never })).toEqual({ kind: 'operate', target: 'phone', answers: true });
        expect(await agentEngineRoute(`اجل${FILE}`, { engine: 'agent', sessionId: sid, runId: 'run-file-2', ownerText: 'اجل' }, AGENT, { ask: never })).toEqual({ kind: 'operate', target: 'phone', answers: true });
        //  «كمل» resumed an earlier goal: what it continues was decided by the resume, not by Joe's question.
        const sid2 = 'chat-resumed-' + Date.now();
        dw.noteOperateResult(sid2, question);
        const route = await agentEngineRoute('لخص التقرير الطويل عن مبيعات الربع الأخير', { engine: 'agent', sessionId: sid2, runId: 'run-resumed', ownerText: 'كمل' }, AGENT, { ask: async () => '{"device":"none"}' });
        expect(route?.answers).toBeUndefined();
        expect(dw.pendingQuestion(sid2)).toBeNull();
    }, 60_000);

    test('«افحص» with a picture still continues the chat\'s last device work, and the checks read it after the whole request', () => {
        const { operateAboutFor } = require('../modules/tools/definitions/AgentEngineTool');
        const request = `افحص${FILE}`;
        const about = operateAboutFor(request, 'افحص', WIFI);
        expect(about).toBe(`${request}\n(it continues: ${WIFI})`);
        expect(about.slice(request.length)).toBe(`\n(it continues: ${WIFI})`);
        expect(operateAboutFor('افحص', 'افحص', WIFI)).toBe(continuedRequest('افحص', WIFI));
        expect(operateAboutFor('شغل الكشاف', 'شغل الكشاف', WIFI)).toBe('شغل الكشاف');
        expect(operateAboutFor('افحص', 'افحص', null)).toBe('افحص');
    }, 120_000);
});

describe('an Arabic reader never gets the engine\'s English', () => {
    test('the English lines of a failed run go; Arabic, names and numbers stay', () => {
        const tail = 'أعدت فحص شبكة الواي فاي «Ayla 2 home».\n\nJoe\'s checks refused the same thing 4 times in a row: acted: nothing was done on the device\n192.168.1.1';
        expect(ownScript(tail, 'ar')).toBe('أعدت فحص شبكة الواي فاي «Ayla 2 home».\n\n192.168.1.1');
        expect(ownScript(tail, 'en')).toBe(tail);
        const out = operateOutput({ status: 'failed', summary: tail, reason: 'refused the same thing', verification: { passed: false, checks: [{ id: 'acted', status: 'failed', detail: 'nothing was done on the device: no device_ action succeeded' }], unproven: [], at: 1 } } as any, 'ar');
        expect(out.output.summary).not.toMatch(/Joe's checks/u);
        expect(out.output.summary).toContain('لم ينجح أي إجراء على الجهاز');
    });

    test('Joe\'s own name in Arabic is «جو», never «جوي»', () => {
        expect(languageSection('ar')).toContain('«جو»');
        expect(languageSection('en')).not.toContain('«جو»');
    });
});
