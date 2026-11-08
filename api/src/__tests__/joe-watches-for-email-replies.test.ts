/**
 * JOE WATCHES FOR THE REPLIES TO THE EMAILS HE SENT, AND TELLS THE OWNER.
 *
 * The owner, 2026-11-08: «I want Joe to follow, in the background, whether a
 * reply arrives from the people he emailed, and tell me» — «Joe himself».
 *
 * Pinned here, against the real shape of «dumpsys notification --noredact»
 * on the owner's phone (Android 13, Arabic digits in the ids):
 *  - the mail notices are read (sender, subject, first lines, time), every
 *    other app is skipped, and an icon entry never leaks into the title;
 *  - a notice answers a watch by the address, a part of it, the owner's name
 *    for the person, or the subject — and never mail from before the email;
 *  - each reply is told once, in the owner's language;
 *  - the watch list is kept on disk and lasts 14 days.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const record = (o: { pkg: string; id?: string; created: number; extras: string[]; flags?: string }) => [
    `    NotificationRecord(0x0c19${Math.floor(Math.random() * 9000 + 1000)}: pkg=${o.pkg} user=UserHandle{0} id=${o.id || '١٠٠١٠'} tag=null importance=٣ key=0|${o.pkg}|10010|null|10241: Notification(channel=mail shortcut=null contentView=null vibrate=null sound=null defaults=0x0 flags=0x10 color=0x00000000 vis=PRIVATE)`,
    '      uid=10241 userId=0',
    `      opPkg=${o.pkg}`,
    `      flags=${o.flags || '0x10'}`,
    `      key=0|${o.pkg}|${o.created}|null|10241`,
    '      seen=false',
    '      notification=',
    '            fullscreenIntent=null',
    '            when=0',
    '            tickerText=null',
    '            extras={',
    ...o.extras.map(e => (e.startsWith('|') ? e.slice(1) : `                ${e}`)),
    '            }',
    '      publicNotification=',
    '            extras={',
    '                android.title=String (رسالة جديدة)',
    '            }',
    `      mCreationTimeMs=${o.created}`,
    `      mUpdateTimeMs=${o.created}`,
    '      mSuppressedVisualEffects= 0',
].join('\n');

const T0 = 1794088934483;
const dump = (records: string[]) => ['Current Notification Manager state:', '  Notification List:', ...records, '  mUseAttentionLight=false', '  mArchive=Archive (0 notifications)', 'PackagePreferences:', '  AppSettings: com.google.android.gm (10129)'].join('\n');

const outlookReply = record({
    pkg: 'com.microsoft.office.outlook',
    created: T0 + 5 * 60_000,
    extras: [
        'android.title=String (Shoroq Suwan)',
        'android.largeIcon=Icon(typ=BITMAP size=96x96)',
        'android.reduced.images=Boolean (true)',
        'android.text=String (RE: Meeting tomorrow (Monday))',
        'android.bigText=String (RE: Meeting tomorrow (Monday)',
        // A mail's own lines are printed raw, at column 0.
        '|Hi Younes, yes 10 am works for me.',
        '|See you then)',
        'android.subText=String (Younis.Soudi@inovar.com)',
        'android.appInfo=ApplicationInfo (ApplicationInfo{6586011 com.microsoft.office.outlook})',
    ],
});
const whatsapp = record({ pkg: 'com.whatsapp', created: T0 + 6 * 60_000, extras: ['android.title=String (Shoroq Suwan)', 'android.text=String (مرحبا)'] });
const gmailGroup = record({
    pkg: 'com.google.android.gm',
    id: '٢٦',
    created: T0 + 7 * 60_000,
    extras: [
        'android.title=String (2 new messages)',
        'android.text=String (younes.sowady2011@gmail.com)',
        'android.textLines=CharSequence[] (2)',
        '  [0] Ahmad Odeh   عرض السعر',
        '  [1] Amazon   Your order has shipped',
        'android.subText=String (younes.sowady2011@gmail.com)',
    ],
});

let mw: typeof import('../core/devices/mail-watch');
let dir: string;
beforeEach(() => {
    jest.resetModules();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-mail-watch-'));
    process.env.JOE_MAIL_WATCH_FILE = path.join(dir, 'mail-watch.json');
    mw = require('../core/devices/mail-watch');
    mw.reloadMailWatch();
});
afterEach(() => {
    delete process.env.JOE_MAIL_WATCH_FILE;
    fs.rmSync(dir, { recursive: true, force: true });
});

describe('Joe reads the mail notices on the owner\'s phone', () => {
    test('only the mail apps, with sender, subject, the first lines and the time; an icon never leaks', () => {
        const notices = mw.parseMailNotices(dump([outlookReply, whatsapp, gmailGroup]));
        expect(notices.map(n => n.app)).toEqual(['Outlook', 'Gmail']);
        const o = notices[0];
        expect(o.title).toBe('Shoroq Suwan');
        expect(o.text).toBe('RE: Meeting tomorrow (Monday)');
        expect(o.bigText).toBe('RE: Meeting tomorrow (Monday)\nHi Younes, yes 10 am works for me.\nSee you then');
        expect(o.subText).toBe('Younis.Soudi@inovar.com');
        expect(o.at).toBe(T0 + 5 * 60_000);
        expect(notices[1].lines).toEqual(['Ahmad Odeh   عرض السعر', 'Amazon   Your order has shipped']);
        expect(notices[1].title).toBe('2 new messages');
    });

    test('the real phone\'s dump with no mail in it gives nothing', () => {
        const real = record({ pkg: 'android', id: '٢٦', created: T0, extras: ['android.title=String (‏تم توصيل تصحيح أخطاء USB)', 'android.text=String (‏انقر لإيقاف)'] });
        expect(mw.parseMailNotices(dump([real]))).toEqual([]);
    });
});

describe('a notice answers a person Joe emailed', () => {
    const sentAt = T0;
    test('by a part of the address: shoroq.suwan@gmail.com → «Shoroq Suwan»', () => {
        const [w] = mw.watchReplies('chat-1', { to: ['Shoroq.Suwan@gmail.com'], name: 'شروق', subject: 'Meeting tomorrow (Monday)', request: 'ارسل ايميل لشروق' }, sentAt);
        expect(w.lang).toBe('ar');
        const r = mw.newReplies(mw.parseMailNotices(dump([outlookReply])), T0 + 6 * 60_000);
        expect(r).toHaveLength(1);
        expect(r[0].why).toBe('sender');
        expect(r[0].watch.sessionId).toBe('chat-1');
        // Told once.
        expect(mw.newReplies(mw.parseMailNotices(dump([outlookReply])), T0 + 7 * 60_000)).toHaveLength(0);
    });

    test('by the owner\'s name for the person, inside a grouped Gmail notice', () => {
        mw.watchReplies('chat-2', { to: ['a.odeh@company.jo'], name: 'Ahmad Odeh' }, sentAt);
        const r = mw.newReplies(mw.parseMailNotices(dump([gmailGroup])), T0 + 8 * 60_000);
        expect(r).toHaveLength(1);
        expect(['sender', 'name']).toContain(r[0].why);
    });

    test('by the subject when the sender\'s name is unlike the address', () => {
        mw.watchReplies('chat-3', { to: ['x7@firm.com'], subject: 'Meeting tomorrow (Monday)' }, sentAt);
        const r = mw.newReplies(mw.parseMailNotices(dump([outlookReply])), T0 + 6 * 60_000);
        expect(r.map(x => x.why)).toEqual(['subject']);
    });

    test('never mail from before Joe\'s email, never an unrelated sender, never a part of a word', () => {
        mw.watchReplies('chat-4', { to: ['ali@x.com'], name: 'Ali' }, T0 + 60 * 60_000);
        expect(mw.newReplies(mw.parseMailNotices(dump([outlookReply])), T0 + 61 * 60_000)).toHaveLength(0);
        const natalie = record({ pkg: 'com.google.android.gm', created: T0 + 62 * 60_000, extras: ['android.title=String (Natalie)', 'android.text=String (Hello)'] });
        expect(mw.newReplies(mw.parseMailNotices(dump([natalie])), T0 + 63 * 60_000)).toHaveLength(0);
        const ali = record({ pkg: 'com.google.android.gm', created: T0 + 64 * 60_000, extras: ['android.title=String (Ali Saleh)', 'android.text=String (Re: hello)'] });
        expect(mw.newReplies(mw.parseMailNotices(dump([ali])), T0 + 65 * 60_000)).toHaveLength(1);
    });

    test('generic parts of an address are not a name: info@ does not match every «Info» mail', () => {
        expect(mw.addressParts('info@shop.com')).toEqual([]);
        expect(mw.addressParts('shoroq.suwan2011@gmail.com')).toEqual(['shoroq', 'suwan']);
    });
});

describe('what Joe tells the owner, and what he keeps', () => {
    test('in Arabic for an Arabic chat: who, the subject, how it begins, and what to say next', () => {
        mw.watchReplies('chat-1', { to: ['shoroq.suwan@gmail.com'], name: 'شروق', subject: 'Meeting tomorrow (Monday)', request: 'ارسل ايميل لشروق' }, T0);
        const [r] = mw.newReplies(mw.parseMailNotices(dump([outlookReply])), T0 + 6 * 60_000);
        const text = mw.replyMessage(r);
        expect(text).toContain('وصل إيميل من **Shoroq Suwan** (شروق)');
        expect(text).toContain('العنوان: RE: Meeting tomorrow (Monday)');
        expect(text).toContain('بدايته: Hi Younes, yes 10 am works for me. See you then');
        expect(text).toContain('Outlook');
        expect(text).toContain('«اقرأ الرد»');
    });

    test('in English for an English chat', () => {
        mw.watchReplies('chat-en', { to: ['shoroq.suwan@gmail.com'], request: 'send an email to shoroq' }, T0);
        const [r] = mw.newReplies(mw.parseMailNotices(dump([outlookReply])), T0 + 6 * 60_000);
        expect(mw.replyMessage(r)).toMatch(/^📩 An email arrived from \*\*Shoroq Suwan\*\*/u);
    });

    test('kept on disk, renewed by a new email, gone after 14 days; the facts name whom Joe watches', () => {
        mw.watchReplies('chat-1', { to: ['shoroq.suwan@gmail.com', 'not-an-address'], subject: 'Hello' }, T0);
        mw.reloadMailWatch();
        expect(mw.activeWatches(T0 + 1000).map(w => w.to)).toEqual(['shoroq.suwan@gmail.com']);
        expect(mw.mailWatchFacts(T0 + 1000)).toContain('shoroq.suwan@gmail.com, about «Hello»: watching for 14 more day(s)');
        mw.watchReplies('chat-9', { to: ['shoroq.suwan@gmail.com'] }, T0 + 10 * 24 * 60 * 60_000);
        expect(mw.activeWatches(T0 + 20 * 24 * 60 * 60_000)).toHaveLength(1);
        expect(mw.activeWatches(T0 + 25 * 24 * 60 * 60_000)).toHaveLength(0);
        expect(mw.stopWatching('chat-9', [], T0 + 11 * 24 * 60 * 60_000)).toBe(1);
    });

    test('addresses are found in a request or a summary', () => {
        expect(mw.emailAddresses('ارسل ايميل الى shoroq.suwan@gmail.com و Ahmad <a.odeh@company.jo>.')).toEqual(['shoroq.suwan@gmail.com', 'a.odeh@company.jo']);
    });
});

describe('Joe watches by himself, in the background', () => {
    const phone = (records: string[]) => async () => ({ ok: true as const, dumps: [{ serial: 'TECNO', text: dump(records) }] });

    test('one look tells the owner once, in the chat the email came from; a second look tells nothing new', async () => {
        const { MailWatchService } = require('../modules/services/MailWatchService');
        mw.watchReplies('chat-1', { to: ['shoroq.suwan@gmail.com'], name: 'شروق', subject: 'Meeting tomorrow (Monday)', request: 'ارسل ايميل لشروق', userId: 'owner-1' }, T0);
        const told: Array<{ chat: string; user?: string; text: string }> = [];
        const read = jest.fn(phone([outlookReply, whatsapp]));
        const svc = new MailWatchService(read, async (r: any, text: string) => { told.push({ chat: r.watch.sessionId, user: r.watch.userId, text }); });
        expect(await svc.tick(T0 + 6 * 60_000)).toHaveLength(1);
        expect(told).toHaveLength(1);
        expect(told[0].chat).toBe('chat-1');
        expect(told[0].user).toBe('owner-1');
        expect(told[0].text).toContain('وصل إيميل من **Shoroq Suwan**');
        expect(await svc.tick(T0 + 7 * 60_000)).toHaveLength(0);
        expect(told).toHaveLength(1);
        expect(read).toHaveBeenCalledTimes(2);
    });

    test('nobody watched: the phone is not even read', async () => {
        const { MailWatchService } = require('../modules/services/MailWatchService');
        const read = jest.fn(phone([outlookReply]));
        const svc = new MailWatchService(read, async () => { /* nothing */ });
        expect(await svc.tick(T0)).toEqual([]);
        expect(read).not.toHaveBeenCalled();
    });

    test('no phone connected: nothing told, nothing thrown, the watch kept for later', async () => {
        const { MailWatchService } = require('../modules/services/MailWatchService');
        mw.watchReplies('chat-1', { to: ['shoroq.suwan@gmail.com'] }, T0);
        const svc = new MailWatchService(async () => ({ ok: false, code: 'no_phone', error: 'No phone' }), async () => { throw new Error('must not tell'); });
        expect(await svc.tick(T0 + 1000)).toEqual([]);
        expect(mw.activeWatches(T0 + 1000)).toHaveLength(1);
    });

    test('the owner\'s own account (the mail\'s «to»), read off a run\'s summary, is never a person to watch', () => {
        mw.watchReplies('chat-1', { to: ['younis.soudi@inovar.com', 'shoroq.suwan@gmail.com'], auto: true }, T0);
        mw.newReplies(mw.parseMailNotices(dump([outlookReply])), T0 + 6 * 60_000);
        expect(mw.activeWatches(T0 + 7 * 60_000).map(w => w.to)).toEqual(['shoroq.suwan@gmail.com']);
        expect(mw.watchReplies('chat-1', { to: ['Younis.Soudi@inovar.com'], auto: true }, T0 + 8 * 60_000)).toEqual([]);
    });

    test('his own account named by HIM is watched as he asked; mail from it is known by its sender, not by the account in a grouped notice', () => {
        const [w] = mw.watchReplies('chat-me', { to: ['younes.sowady2011@gmail.com'], userId: 'owner-1' }, T0);
        expect(w.auto).toBeUndefined();
        //  The grouped Gmail notice names his account in its text: that is not mail from him.
        expect(mw.newReplies(mw.parseMailNotices(dump([gmailGroup])), T0 + 8 * 60_000)).toHaveLength(0);
        expect(mw.activeWatches(T0 + 9 * 60_000).map(x => x.to)).toEqual(['younes.sowady2011@gmail.com']);
        const fromHim = record({ pkg: 'com.microsoft.office.outlook', created: T0 + 10 * 60_000, extras: ['android.title=String (Younes Sowady)', 'android.text=String (test from my Gmail)', 'android.subText=String (Younis.Soudi@inovar.com)'] });
        const r = mw.newReplies(mw.parseMailNotices(dump([fromHim])), T0 + 11 * 60_000);
        expect(r.map(x => x.why)).toEqual(['sender']);
    });
});

describe('the run tells Joe whom it emailed', () => {
    const ctx = (request: string) => ({ request, language: 'ar', replyLanguage: 'ar', joe: { sessionId: 'chat-7', userId: 'owner-7' } } as any);

    test('email_watch_replies keeps every address, the name and the subject; without an address it asks for one', async () => {
        const { emailWatchTool } = require('../core/engine/tools/mail');
        expect(emailWatchTool.parse({ to: [] }).ok).toBe(false);
        const p = emailWatchTool.parse({ to: ['Shoroq <shoroq.suwan@gmail.com>'], name: 'شروق', subject: 'Meeting' });
        expect(p).toEqual({ ok: true, value: { to: ['shoroq.suwan@gmail.com'], name: 'شروق', subject: 'Meeting' } });
        const out = await emailWatchTool.run(p.value, ctx('ارسل ايميل لشروق'));
        expect(out.ok).toBe(true);
        const [w] = mw.activeWatches();
        expect(w).toMatchObject({ to: 'shoroq.suwan@gmail.com', sessionId: 'chat-7', userId: 'owner-7', name: 'شروق', subject: 'Meeting', lang: 'ar' });
        const stop = await emailWatchTool.run({ to: ['shoroq.suwan@gmail.com'], stop: true }, ctx('توقف'));
        expect(stop.output).toMatch(/Stopped watching 1/u);
        expect(mw.activeWatches()).toHaveLength(0);
    });

    test('a run asked to SEND an email leaves a watch even when it forgot the tool; a run that only read mail does not', () => {
        const { watchAfterSentEmail } = require('../core/engine/tools/mail');
        expect(watchAfterSentEmail('chat-8', 'ارسل ايميل الى shoroq.suwan@gmail.com وقل لها مرحبا', 'أرسلته وتأكدت أنه في المرسل', 'ar', 'owner-8', T0)).toEqual(['shoroq.suwan@gmail.com']);
        expect(watchAfterSentEmail('chat-8', 'لخص لي آخر الايميلات', 'من a.odeh@company.jo: عرض السعر', 'ar', 'owner-8', T0)).toEqual([]);
        //  The run's own tool made it a minute ago: not made twice.
        expect(watchAfterSentEmail('chat-8', 'ارسل ايميل الى shoroq.suwan@gmail.com', '', 'ar', 'owner-8', T0 + 60_000)).toEqual([]);
    });
});

describe('the notice reaches the owner in any chat, and only him', () => {
    test('«joe_notice» names no session, so no subscription holds it back; it is not a run event', () => {
        const ws = require('../api/ws');
        expect(ws.eventRequiresSession({ type: 'joe_notice' })).toBe(false);
        expect(ws.canDeliverLiveEventToSession({ type: 'joe_notice', userId: 'owner-1', data: { chatId: 'chat-1' } }, ['another-chat'])).toBe(true);
        expect(ws.liveEventSessionId({ type: 'joe_notice', data: { chatId: 'chat-1' } })).toBe('');
    });
});

describe('the owner asks Joe to tell him when someone writes', () => {
    test.each([
        'انتظر حتى ترد واعلمني',
        'اذا رد عليك اخبرني',
        'خبرني لما يوصلني ايميل من احمد',
        'تابع ردود شروق',
        'راقب بريدي واذا وصل شي من المدير نبهني',
        'ارسل ايميل لشروق واخبرني اذا ردت',
        'let me know when she replies',
        'watch for an email from Ahmad',
    ])('«%s» is a watch on the mail', t => {
        const { isMailWatchRequest } = require('../core/engine/tools/mail');
        expect(isMailWatchRequest(t)).toBe(true);
    });

    test.each([
        'تابع',
        'تابع كتابة الإيميل',
        'اخبرني ما الرد المناسب على رسالتها',
        'اكتب لي ايميل لشروق',
        'tell me the answer',
        'write an email to Ahmad',
        'ابني موقع فيه نموذج يرسل ايميل',
    ])('«%s» is not', t => {
        const { isMailWatchRequest } = require('../core/engine/tools/mail');
        expect(isMailWatchRequest(t)).toBe(false);
    });
});
