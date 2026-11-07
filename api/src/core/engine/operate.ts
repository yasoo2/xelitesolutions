/**
 * OPERATE: THE ENGINE'S THIRD KIND OF WORK.
 *
 * Build makes a project, change changes one; operate does something on the
 * owner's computer: «افتح المفكرة واكتب فيها قائمة المشتريات», «open Excel and
 * sum column B», «اضغط زر الحفظ في البرنامج المفتوح». The same loop and the same
 * model, with the device tools (tools/devices.ts) instead of the project's, a
 * brief written for acting rather than building, and a verifier that asks for
 * what acting proves: something was done, and it was looked at afterwards.
 *
 * Safety is part of the brief and of the driver: input reaches only the
 * window named and only while it is in front (windows-desktop.ts THE GUARD),
 * and the brief forbids sending, paying, buying, deleting or publishing unless
 * the request itself asked for exactly that.
 */
import type { MachineFacts } from './prompt';
import { languageName } from './prompt';
import type { CheckResult, EngineResult, ToolContext, VerificationReport } from './types';
import type { FinishArgs, Verifier } from './finish';
import { deviceRecordFor } from './tools/devices';

/* ───────────────────────── which requests are operate ───────────────────────── */

/**
 * The request asks Joe to act ON a device: a device named as the place
 * («على جهازي», «في الكمبيوتر», «on my computer», «on my screen»), or a
 * desktop program named to be opened or used. A request to BUILD a program is
 * never operate: «ابني برنامجاً» is a build even when it mentions the computer.
 */
const ON_DEVICE = /(?:على|في|ب|من)\s*(?:جهاز(?:ي|ك)?|الجهاز|حاسوب(?:ي|ك)?|الحاسوب|كمبيوتر(?:ي|ك)?|الكمبيوتر|الكومبيوتر|لابتوب(?:ي)?|اللابتوب|شاشت(?:ي|ك)|الشاشة|سطح\s+المكتب)|\bon\s+(?:my|this|the)\s+(?:computer|pc|laptop|desktop|screen|machine)\b|\bon\s+my\s+windows\b/iu;
/**
 * The owner's own phone, said as his («على هاتفي», «on my phone»). The bare
 * «على الجوال» is left out on purpose: «اجعل الموقع يظهر جيداً على الجوال» is
 * a change to a site, not an action on a phone.
 */
const ON_PHONE = /(?:على|في|ب|من)\s*(?:هاتفي|جوالي|جوّالي|موبايلي|تلفوني|تليفوني|تلفوني|الأندرويد\s+تبعي|اندرويدي)|\bon\s+my\s+(?:phone|android|mobile|cell(?:phone)?)\b/iu;
const DESKTOP_APP = /(?:افتح|شغّ?ل|استخدم|اكتب\s+في|ادخل\s+(?:على|الى|إلى))\s+(?:برنامج\s+|تطبيق\s+)?(?:المفكرة|مفكرة|notepad|الآلة\s+الحاسبة|الحاسبة|calc(?:ulator)?|الرسام|paint|mspaint|إكسل|اكسل|excel|وورد|word|باوربوينت|powerpoint|مستكشف\s+الملفات|explorer|الإعدادات|لوحة\s+التحكم|cmd|الطرفية)|\b(?:open|launch|start|use)\s+(?:the\s+)?(?:notepad|calculator|calc|paint|mspaint|excel|word|powerpoint|file\s+explorer|settings|control\s+panel)\b/iu;
const BUILD_VERB = /\b(?:build|create|make|develop|write|code|implement)\s+(?:a|an|me\s+a|the)?\s*(?:app|application|website|site|program|tool|script|api|game|system|page)\b|ابن[يِ]?\s|ابني|أنشئ|انشئ|اكتب\s+(?:برنامج|كود|سكربت|أداة)|طوّ?ر\s|صمّ?م\s/iu;

/**
 * THE DEVICES THEMSELVES, ASKED FOR IN THE CHAT.
 *
 * The owner, 2026-11-07: «I give the orders from the command box… I tell it
 * connect to computer such-and-such, search which computers you can reach…
 * and the same for phones» — not a button in the settings. A request that
 * names connecting to a device, or asks which devices Joe can reach, is
 * operate work: Joe lists them (device_computers), offers the line that links
 * a new computer (device_link_new), pairs a phone with the code it shows.
 */
const DEVICE_NOUN = '(?:ال)?(?:كمبيوتر|كومبيوتر|حاسوب|جهاز|لابتوب|هاتف|جوال|جوّال|موبايل|تلفون|تليفون)';
const CONNECT = new RegExp(`(?:اشبك|إشبك|شبّ?ك|اتّ?صل|إتّ?صل|وصّ?ل|اربط|إربط)\\s+(?:على|ب|مع|في|الى|إلى)?\\s*${DEVICE_NOUN}|تحكّ?م\\s+(?:ب|في)\\s*${DEVICE_NOUN}|\\b(?:connect|link|pair)\\s+(?:to\\s+|with\\s+)?(?:my\\s+|the\\s+|another\\s+|a\\s+|this\\s+|that\\s+)?(?:other\\s+)?(?:computer|pc|laptop|phone|device|machine|android)\\b`, 'iu');
const DEVICES_PLURAL = /(?:الأجهزة|الاجهزة|اجهزة|أجهزة|الكمبيوترات|كمبيوترات|الحواسيب|حواسيب|الهواتف|هواتف|الجوالات|جوالات)|\b(?:devices|computers|phones|machines)\b/iu;
const REACH = /(?:تقدر|بتقدر|يمكنك|تستطيع|بتوصل|توصل|متصل|المتصل|مربوط|المربوط|موصول|الموصول|حولي|بالشبكة|على\s+الشبكة|في\s+الشبكة)|\b(?:can\s+you\s+(?:reach|see|control|access)|connected|linked|reachable|on\s+my\s+(?:network|wi-?fi)|nearby)\b/iu;
const TASK_VERB = /(?:افتح|اكتب|اضغط|احفظ|انسخ|احذف|أرسل|ارسل|شغّ?ل\s)|\b(?:open|type|click|press|save|write|run|send|copy|delete)\b/iu;

/** The request asks to connect to a device, or which devices Joe can reach. */
export function isDeviceRequest(text: string): boolean {
    const t = String(text || '');
    return CONNECT.test(t) || (DEVICES_PLURAL.test(t) && REACH.test(t));
}

/** …and nothing more is to be done on it: listing, linking or pairing is the whole of it. */
export function onlyAboutDevices(text: string): boolean {
    return isDeviceRequest(text) && !TASK_VERB.test(String(text || ''));
}

/**
 * AN ACTION ON «THE PHONE», WITHOUT «MY».
 *
 * The owner, 2026-11-07, right after Joe had read his phone over the cable:
 * «شغل الكشاف في الهاتف». Without «هاتفي» it was not an action on a device;
 * the chat answered with advice to pull the panel down himself. A command
 * verb, then «في/على/ب/من الهاتف» (or الجوال، الموبايل…), is an action on the
 * phone, unless the sentence is about a site or a page («اجعل الموقع يظهر
 * جيداً على الجوال» is a change to a site). And the flashlight is a phone's
 * own: «شغّل الكشاف» needs no place.
 */
/*
 * A command verb is read by its stem, whatever ending and spelling follow:
 * the owner typed «اطفيئ الكشاف» (2026-11-07) and the list knew «اطفي» and
 * «أطفئ» only, so the chat answered with advice. People write اطفي، اطفئ،
 * اطفيء، اطفيئ، طفّي، اطفيه، شغله، شغلي، سكّره… The stem «طف» needs the
 * letter after it (ي، ئ، ء، ّ) so «طفل» is not one.
 */
const AR_TAIL = '[\\u0621-\\u064A\\u064B-\\u0652]*';
const ACT_AR_STEM = '(?:[اأ]?شغّ?ل|[اأإ]?طف[يئءّ]|سكّ?ر|[أا]غلق|اضغط|صوّ?ر|ارفع|خفّ?ض|وطّ?ي|فعّ?ل|عطّ?ل|اتّ?صل|ابعث|[أا]رسل|اكتب|ابحث|شوف|اقر[أا]|ادخل|روح|ارجع|حمّ?ل|نزّ?ل|ولّ?ع|شيل|امسح|افتح|وقّ?ف|افصل)';
const ACT_AR = `${ACT_AR_STEM}${AR_TAIL}`;
const ACT_EN = '(?:turn|switch|open|close|call|text|send|take|play|start|launch|press|tap|type|search|go|read|check|enable|disable|toggle)';
const AR_START = '(?:^|[\\s،,.؟?!])[وف]?';
const AR_END = '(?=[\\s،,.؟?!]|$)';
const PHONE_PLACE = '(?:في|على|ب|من|عال)\\s*(?:ال)?(?:هاتف|جوال|جوّال|موبايل|تلفون|تليفون|أندرويد|اندرويد)';
const PHONE_ACTION = new RegExp(
    `${AR_START}${ACT_AR}${AR_END}[^\\n.؟?!]{0,80}?${PHONE_PLACE}`
    + `|\\b${ACT_EN}\\b[^\\n.?!]{0,80}?\\bon\\s+(?:the|this|that)\\s+(?:phone|android|mobile|cell(?:phone)?)\\b`, 'iu');
const ABOUT_A_SITE = /(?:الموقع|موقع|الصفحة|صفحة|التصميم|الواجهة|المتجر\s+الإلكتروني|responsive)|\b(?:site|website|web\s*page|page|layout|css)\b/iu;
/** The flashlight, on or off, the verb before the noun or after it: «اطفي الكشاف», «الكشاف طفيه», "turn the torch off". */
const FLASH_NOUN = new RegExp(`${AR_START}(?:ال)?(?:كشّ?اف|فلاش|فلاشة)${AR_TAIL}${AR_END}|\\b(?:flashlight|torch)\\b`, 'iu');
const ON_OFF = new RegExp(`${AR_START}(?:${ACT_AR}|خلّ?ي${AR_TAIL}|ضوّ?ي${AR_TAIL}|يشتغل|ينطفي|ينطفئ)${AR_END}|\\b(?:turn|switch|toggle|put)\\b|\\b(?:on|off)\\b`, 'iu');
//  JavaScript's \b knows no Arabic letter: the Arabic words end at a space or a mark.
const HOW_TO = /^\s*(?:كيف|ليش|لماذا|ليه)(?=[\s،,؟?]|$)|^\s*(?:how|why)\b/iu;

function phoneAction(t: string): boolean {
    if (HOW_TO.test(t)) return false;
    return (PHONE_ACTION.test(t) && !ABOUT_A_SITE.test(t)) || (FLASH_NOUN.test(t) && ON_OFF.test(t));
}

export function isOperateRequest(text: string): boolean {
    const t = String(text || '');
    if (!t.trim() || BUILD_VERB.test(t)) return false;
    return ON_DEVICE.test(t) || ON_PHONE.test(t) || phoneAction(t) || DESKTOP_APP.test(t) || isDeviceRequest(t);
}

/**
 * Connecting to a phone, or asking which phones Joe reaches, is about a phone
 * even without «my»: «اشبك على الهاتف», «connect to the phone», «شو الهواتف
 * اللي بتوصلها».
 */
const PHONE_NOUN = '(?:ال)?(?:هاتف|جوال|جوّال|موبايل|تلفون|تليفون|اندرويد|أندرويد)';
const PHONE_CONNECT = new RegExp(`(?:اشبك|إشبك|شبّ?ك|اتّ?صل|إتّ?صل|وصّ?ل|اربط|إربط)\\s+(?:على|ب|مع|في|الى|إلى)?\\s*${PHONE_NOUN}|تحكّ?م\\s+(?:ب|في)\\s*${PHONE_NOUN}|\\b(?:connect|link|pair)\\s+(?:to\\s+|with\\s+)?(?:my\\s+|the\\s+|a\\s+|this\\s+|that\\s+)?(?:phone|android|mobile)\\b`, 'iu');
const PHONES_PLURAL = /(?:الهواتف|هواتف|الجوالات|جوالات|الموبايلات|موبايلات)|\bphones\b/iu;

/** The request is about the owner's phone (the android_ tools), not a computer. */
export function isPhoneRequest(text: string): boolean {
    const t = String(text || '');
    if (BUILD_VERB.test(t)) return false;
    return ON_PHONE.test(t) || PHONE_CONNECT.test(t) || phoneAction(t) || (PHONES_PLURAL.test(t) && REACH.test(t));
}

/* ───────────── the device this chat is working on ───────────── */

/**
 * A FOLLOW-UP IN A CHAT THAT IS WORKING A DEVICE ACTS ON THAT DEVICE.
 *
 * The owner, 2026-11-07: Joe read his phone, then «شغل الكشاف…» went to the
 * chat's answerer, which said «I did nothing on the phone in this chat» and
 * gave advice. Once a chat has worked a device, a short command that follows
 * it («افتح واتساب», «اطفيه», «ارجع للرئيسية», "now open YouTube") goes on
 * that device, until the chat asks for something else. Kept for 30 minutes
 * per chat, in this process (a restart forgets it: the next message then
 * names the device again).
 */
export type OperateTarget = 'phone' | 'computer';
const WORKING = new Map<string, { target: OperateTarget; at: number; request: string }>();
const FOLLOW_UP_MS = 30 * 60_000;
const LEAD = '^(?:\\s*(?:و?(?:ثم|بعدين|كمان|الآن|هلق|هلا|طيب|ممكن|رجاء|يلا)|لو\\s+سمحت|من\\s+فضلك|يا\\s+جو|and|also|now|then|ok|okay|please|pls|can\\s+you|could\\s+you)[\\s،,]+)*\\s*و?';
const FOLLOW_UP = new RegExp(`${LEAD}(?:(?:${ACT_AR_STEM}|اسحب|كبّ?ر|صغّ?ر|كمّ?ل)${AR_TAIL}${AR_END}|(?:${ACT_EN}|scroll|swipe|stop|go\\s+back|wake)\\b)`, 'iu');

export function noteOperate(sessionId: unknown, request: string, target?: OperateTarget): void {
    const id = String(sessionId || '');
    if (!id) return;
    WORKING.set(id, { target: target || (isPhoneRequest(request) ? 'phone' : 'computer'), at: Date.now(), request: String(request || '').slice(0, 300) });
}

export function forgetOperate(sessionId: unknown): void { WORKING.delete(String(sessionId || '')); }

/** The device this chat worked last, and what was asked, within the follow-up window. */
export function recentOperate(sessionId: unknown, now = Date.now()): { target: OperateTarget; request: string } | null {
    const w = WORKING.get(String(sessionId || ''));
    return w && now - w.at <= FOLLOW_UP_MS ? { target: w.target, request: w.request } : null;
}

/** The device a follow-up command in this chat acts on, or null. */
export function operateFollowUp(sessionId: unknown, text: string, now = Date.now()): OperateTarget | null {
    const w = WORKING.get(String(sessionId || ''));
    if (!w || now - w.at > FOLLOW_UP_MS) return null;
    const t = String(text || '').trim();
    if (!t || t.length > 160 || BUILD_VERB.test(t) || ABOUT_A_SITE.test(t)) return null;
    return FOLLOW_UP.test(t) ? w.target : null;
}

/**
 * The first tool the run is pointed at. A phone is reached with android_devices
 * and a request about the devices themselves with device_computers: pointing
 * either at device_windows sent the model through the computer's windows first.
 */
export function operatorFirstTool(request: string, target?: OperateTarget): 'android_devices' | 'device_computers' | 'device_windows' {
    if (target === 'phone' || isPhoneRequest(request)) return 'android_devices';
    if (isDeviceRequest(request)) return 'device_computers';
    return 'device_windows';
}

/** A request only to look (what is on my screen?) needs no action, only a look. */
const ONLY_LOOK = /^(?:\s*(?:ما|ماذا|شو|ايش|إيش)\s+(?:الذي\s+)?(?:على|في|يظهر)|\s*(?:what(?:'s| is)|which)\b|\s*(?:اقرأ|صف|describe|read|tell\s+me))/iu;

export function onlyLooks(text: string): boolean {
    return ONLY_LOOK.test(String(text || '')) && !/(?:افتح|اكتب|اضغط|احفظ|أغلق|اغلق|open|type|click|press|save|close)/iu.test(String(text || ''));
}

/**
 * The request asks, anywhere in it, what the screen shows: «اشبك على هاتفي وقل
 * لي شو الظاهر على شاشته» connects AND asks to look (2026-11-07), so a list of
 * the devices alone does not answer it.
 */
const ASKS_TO_LOOK = /(?:شو|ما|ماذا|ايش|إيش)\s+(?:هو\s+)?(?:الظاهر|اللي\s+(?:ظاهر|بيظهر|على)|الذي\s+(?:يظهر|على)|يظهر|بيظهر|على\s+(?:ال)?شاش)|(?:اقرأ|اقرا|صف|صوّ?ر)\s+(?:لي\s+)?(?:ال)?شاش|\bwhat(?:'s| is)\s+(?:on|showing)\b|\b(?:read|describe)\s+(?:its|the|my)\s+screen\b/iu;

export function asksToLook(text: string): boolean {
    return ASKS_TO_LOOK.test(String(text || ''));
}

/* ───────────────────────── what the model is told ───────────────────────── */

export function operatorSystemPrompt(machine: MachineFacts): string {
    return [
        'You are Joe, an agent that works the owner\'s computer for him, the way a careful person at the keyboard does, and keeps going until what he asked is done and seen on the screen.',
        '',
        '# Environment',
        `- This computer runs ${machine.platform === 'win32' ? 'Windows' : machine.platform}. You act on it only through the device_ tools.`,
        '- device_windows lists the open windows by handle number; every other device_ tool names its window by that number.',
        '- The owner\'s Android phone is worked with the android_ tools (through adb): android_devices first, then android_read (numbered controls) or android_look, android_tap by number, android_type, android_key (back, home, wakeup…), android_scroll, android_open by package name, android_panel for the quick settings (flashlight/torch, Wi-Fi, Bluetooth, airplane mode, mobile data, rotation, do not disturb) and the notifications. When the request is about his phone, use these, not the device_ tools.',
        '- android_read and android_look say first when the phone\'s screen is OFF or the phone is LOCKED. A screen that is off: android_key "wakeup", then read again. A phone locked with a PIN: the quick settings and the notifications still work; for anything else tell the owner to unlock it, and never type a PIN, pattern or password.',
        '- Some things have no app on a phone: the flashlight is a tile in the quick settings (android_panel "quick_settings", android_read, tap the tile whose name is the flashlight in the phone\'s language: «الكشاف», «Flashlight», «Torch», «Lampe de poche»…, then read again: an «on» or checked tile, or a changed description, shows it worked).',
        '- When the owner asks what you can reach, or to connect to a computer or a phone: call device_computers and tell him, by name, what you can reach. A computer that is not linked yet: device_link_new shows him the one line to run on it, then device_wait_link waits for it, then device_use it and go on with what he asked. A phone on Wi-Fi showing its pairing code: ask him for the six digits (say it in task_finish), then android_pair and android_connect when he gives them. Never ask him to go to the settings for any of this: the chat is where he works.',
        '- The owner may have linked other computers to Joe. When the request names another computer (the office PC, the laptop, «حاسوب المكتب»…), call device_computers, then device_use with its name; every device_ tool then works there until device_use "this".',
        '',
        '# Method',
        '1. Call plan_update with your steps.',
        '2. Look first: device_windows, then device_look or device_read of the window you need. If the program is not open, device_open it, then device_windows again to find its new window. On the phone: android_devices, then android_read or android_look.',
        '3. Act on controls by their number when device_read names them (device_press: press, set, focus, toggle, select). It is surer than a click.',
        '4. When a control has no name to act on, read the point off a fresh device_look picture of that window and device_click it. Points are always read off the LAST picture of the same window.',
        '5. Before typing or pressing keys, bring the window to the front (device_focus) and put the cursor in the right field (device_press focus, or a click). Then device_type / device_keys.',
        '6. After every action that should change something, look again (device_look or device_read) and check that it did. If it did not, find out why and try another way.',
        '7. When it is done and you have SEEN it done, call task_finish: what you did, and what the screen shows now.',
        '',
        '# Rules',
        '- Act only on windows the request is about. Never type into, click on or close a window you did not look at in this run.',
        '- Never send a message or an email, pay, buy, transfer money, delete files or data, publish or post, change system settings or passwords, unless the request asked for exactly that action. When the request needs one of these and did not ask for it plainly, stop and say so in task_finish.',
        '- Never type a password or a secret that the request did not give you.',
        '- Only claim what a tool showed you. If something could not be done, say what stopped it.',
        '- A tool that is refused because the point is not on the window, or the window is not in front, sent NOTHING: look again, fix the window or the point, and try again.',
        '- Write your notes and your task_finish summary in the language the first message names for them.',
    ].join('\n');
}

export function operatorFirstMessage(request: string, language: string, replyLanguage?: string, target?: OperateTarget): string {
    return [
        'Request (verbatim):',
        '"""',
        request.trim(),
        '"""',
        '',
        ...(target === 'phone' && !isPhoneRequest(request) ? ['Joe read this message as being about the owner\'s Android phone (from the chat\'s work on it, or from what the message means): use the android_ tools.', ''] : []),
        ...(target === 'computer' && !isOperateRequest(request) ? ['Joe read this message as being about the owner\'s computer (from the chat\'s work on it, or from what the message means): use the device_ tools.', ''] : []),
        `Request language: ${languageName(language)}.`,
        `Write your notes between tool calls and your task_finish summary in ${languageName(replyLanguage || language)}: that is the language the user set Joe to.`,
        '',
        `Start by calling plan_update with your steps, then ${operatorFirstTool(request, target)}.`,
    ].join('\n');
}

/* ───────────────────────── what proves it was done ───────────────────────── */

/**
 * Done means: something was done on the device (unless the request only asked
 * to look), the last action was followed by a look or a read, and no action
 * the run ended on was refused or failed without a later success.
 */
export function operateVerifier(): Verifier {
    return async (ctx: ToolContext, _claim: FinishArgs): Promise<VerificationReport> => {
        const rec = deviceRecordFor(ctx.runId);
        const checks: CheckResult[] = [];
        const looking = onlyLooks(ctx.request);
        const done = rec.actions.filter(a => a.ok);
        const lastAction = done.length ? done[done.length - 1].at : 0;
        //  A list of the devices is not a look at a screen.
        const screenLooks = rec.looks.filter(l => l.kind !== 'devices');
        const lastLook = screenLooks.length ? screenLooks[screenLooks.length - 1].at : 0;
        if (onlyAboutDevices(ctx.request)) {
            //  Listing what Joe can reach, linking a computer or pairing a phone is the whole of it…
            const linked = done.filter(a => /^(?:device_link_new|device_wait_link|android_pair|android_connect)$/u.test(a.tool));
            const listed = rec.looks.some(l => l.kind === 'devices');
            checks.push(linked.length || listed
                ? { id: 'devices', status: 'passed', detail: linked.length ? linked.map(a => a.what).join('; ') : 'the devices Joe can reach were listed' }
                : { id: 'devices', status: 'failed', detail: 'the request is about the devices Joe can reach, and none were listed, linked or paired: call device_computers' });
            //  …unless it also asks what the screen shows.
            if (asksToLook(ctx.request)) {
                checks.push(lastLook
                    ? { id: 'looked', status: 'passed', detail: `the screen was looked at (${screenLooks.length} look(s))` }
                    : { id: 'looked', status: 'failed', detail: 'the request also asks what the screen shows, and the screen was not read or looked at' });
            }
        } else if (looking) {
            checks.push(lastLook
                ? { id: 'looked', status: 'passed', detail: `the screen was looked at (${screenLooks.length} look(s))` }
                : { id: 'looked', status: 'failed', detail: 'the request asks what is on the screen, and no device_look or device_read was made' });
        } else {
            checks.push(done.length
                ? { id: 'acted', status: 'passed', detail: `${done.length} action(s) done on the device: ${done.slice(-5).map(a => a.what).join('; ')}` }
                : { id: 'acted', status: 'failed', detail: 'nothing was done on the device: no device_ action succeeded' });
            checks.push(done.length && lastLook > lastAction
                ? { id: 'looked_after', status: 'passed', detail: 'the result of the last action was looked at' }
                : { id: 'looked_after', status: 'failed', detail: 'the last action was not followed by a device_look or device_read: look at the result before finishing' });
        }
        const last = rec.actions[rec.actions.length - 1];
        if (last && !last.ok && !rec.actions.some(a => a.ok && a.at > last.at)) {
            checks.push({ id: 'last_action', status: 'failed', detail: `the last action failed and was not redone: ${last.tool} ${last.what}` });
        }
        const passed = checks.every(c => c.status === 'passed');
        return { passed, checks, unproven: [], at: Date.now() };
    };
}

/* ───────────────────────── what the owner is told ───────────────────────── */

const OPERATE_WORDS: Record<string, { done: string; devices: string; looked: string; notDone: (why: string) => string; took: (s: number, usd?: number) => string }> = {
    ar: {
        done: '✅ نفّذتُه على جهازك ونظرتُ إلى الشاشة بعده للتأكد.',
        devices: '✅ هذا ما أصل إليه الآن من أجهزتك.',
        looked: '✅ قرأتُ الشاشة كما هي، ولم أغيّر فيها شيئاً.',
        notDone: why => `⚠️ لم يكتمل التنفيذ على الجهاز: ${why}`,
        took: (s, usd) => `⏱️ استغرق ${s < 60 ? `${s} ثانية` : `${Math.round(s / 60)} دقيقة`}${usd != null ? `، كلفة ${usd.toFixed(3)}$` : ''}`,
    },
    en: {
        done: '✅ Done on your computer, and the screen was checked afterwards.',
        devices: '✅ That is what I can reach of your devices now.',
        looked: '✅ I read the screen as it is and changed nothing.',
        notDone: why => `⚠️ Not completed on the device: ${why}`,
        took: (s, usd) => `⏱️ Took ${s < 60 ? `${s} s` : `${Math.round(s / 60)} min`}${usd != null ? `, cost $${usd.toFixed(3)}` : ''}`,
    },
};

/** The operate run's answer, in the shape the orchestrator's final-outcome rule reads. */
export function operateOutput(result: EngineResult | undefined, language: string): { ok: boolean; error?: string; output: Record<string, any> } {
    const words = OPERATE_WORDS[language === 'ar' ? 'ar' : 'en'];
    const verified = !!result && result.status === 'delivered' && result.verification?.passed === true;
    const failed = (result?.verification?.checks || []).filter(c => c.status === 'failed').map(c => c.detail);
    const why = verified ? '' : (failed[0] || String(result?.reason || '').trim() || 'the run ended before it was done');
    const receipts = (result?.verification?.checks || []).map(c => ({ tool: `operate:${c.id}`, ok: c.status === 'passed', ...(c.status === 'passed' ? {} : { error: c.detail }) }));
    const seconds = Math.round((result?.durationMs || 0) / 1000);
    const ids = new Set((result?.verification?.checks || []).map(c => c.id));
    const closing = ids.has('acted') ? words.done : ids.has('looked') ? words.looked : ids.has('devices') ? words.devices : words.done;
    const summary = verified
        ? [String(result!.summary || '').trim(), closing, words.took(seconds, result!.costUsd)].filter(Boolean).join('\n\n')
        : [words.notDone(why), String(result?.summary || '').trim()].filter(Boolean).join('\n\n');
    return {
        ok: verified,
        ...(verified ? {} : { error: why }),
        output: {
            verified,
            executionStatus: verified ? 'completed' : 'failed',
            verificationStatus: verified ? 'passed' : 'not_verified',
            deliveryStatus: verified ? 'delivered' : 'not_verified',
            engineStatus: result?.status || 'failed',
            pipelineFinal: true,
            ...(verified ? {} : { firstError: why, verificationFailed: true, honestBlocker: true }),
            summary,
            results: [{ phaseNumber: 1, phaseName: 'operate', status: verified ? 'completed' : 'failed', taskReceipts: receipts, ...(verified ? {} : { primaryError: why }) }],
        },
    };
}
