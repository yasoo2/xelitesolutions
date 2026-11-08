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
import type { CheckResult, EngineResult, EngineTool, ToolContext, ToolOutcome, VerificationReport } from './types';
import type { FinishArgs, Verifier } from './finish';
import { deviceRecordFor } from './tools/devices';
import { clearWorking, getWorking, setWorking } from './device-work';

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
//  Unlinking a computer is about the devices too: «افصل كمبيوتر المكتب نهائياً» (device_forget).
const CONNECT = new RegExp(`(?:اشبك|إشبك|شبّ?ك|اتّ?صل|إتّ?صل|وصّ?ل|اربط|إربط|افصل|إفصل)\\s+(?:على|ب|مع|في|الى|إلى|عن)?\\s*${DEVICE_NOUN}|تحكّ?م\\s+(?:ب|في)\\s*${DEVICE_NOUN}|\\b(?:connect|link|pair|unlink|disconnect)\\s+(?:to\\s+|with\\s+)?(?:my\\s+|the\\s+|another\\s+|a\\s+|this\\s+|that\\s+)?(?:other\\s+|office\\s+|home\\s+|work\\s+)?(?:computer|pc|laptop|phone|device|machine|android)\\b`, 'iu');
const DEVICES_PLURAL = /(?:الأجهزة|الاجهزة|اجهزة|أجهزة|الكمبيوترات|كمبيوترات|الحواسيب|حواسيب|الهواتف|هواتف|الجوالات|جوالات)|\b(?:devices|computers|phones|machines)\b/iu;
const REACH = /(?:تقدر|بتقدر|يمكنك|تستطيع|بتوصل|توصل|متصل|المتصل|مربوط|المربوط|موصول|الموصول|حولي|بالشبكة|على\s+الشبكة|في\s+الشبكة)|\b(?:can\s+you\s+(?:reach|see|control|access)|connected|linked|reachable|on\s+my\s+(?:network|wi-?fi)|nearby)\b/iu;
const TASK_VERB = /(?:افتح|اكتب|اضغط|احفظ|انسخ|احذف|أرسل|ارسل|شغّ?ل\s)|\b(?:open|type|click|press|save|write|run|send|copy|delete)\b/iu;

/**
 * The devices on his Wi-Fi or network (network_devices): «هل توجد أجهزة على نفس
 * الواي فاي؟», «افحص كم جهاز على شبكة الواي فاي», "what is on my wifi".
 */
const NETWORK = /(?:واي\s*فاي|الوايفاي|وايفاي|wi-?fi|الشبكة|شبكة\s+(?:البيت|المنزل|الواي|الانترنت|الإنترنت)|الراوتر|راوتر)|\b(?:network|router|lan)\b/iu;
const ANY_DEVICE = /(?:أجهزة|اجهزة|الأجهزة|الاجهزة|جهاز|اجهزه|أجهزه)|\b(?:devices?|things|connected)\b/iu;

export function isNetworkRequest(text: string): boolean {
    const t = String(text || '');
    return NETWORK.test(t) && ANY_DEVICE.test(t) && !BUILD_VERB.test(t);
}

/** The request asks to connect to a device, which devices Joe can reach, or what is on the network. */
export function isDeviceRequest(text: string): boolean {
    const t = String(text || '');
    return CONNECT.test(t) || (DEVICES_PLURAL.test(t) && REACH.test(t)) || isNetworkRequest(t);
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
 * per chat, on disk (device-work.ts): a restart of Joe forgot it once and
 * sent the owner's email to the computer (2026-11-08).
 */
export type OperateTarget = 'phone' | 'computer';
const FOLLOW_UP_MS = 30 * 60_000;
const LEAD = '^(?:\\s*(?:و?(?:ثم|بعدين|كمان|الآن|هلق|هلا|طيب|ممكن|رجاء|يلا)|لو\\s+سمحت|من\\s+فضلك|يا\\s+جو|and|also|now|then|ok|okay|please|pls|can\\s+you|could\\s+you)[\\s،,]+)*\\s*و?';
//  «حاول مره اخرى», «أعدها», «كرّر» and "try again" are follow-ups too (the owner, 2026-11-08).
const FOLLOW_UP = new RegExp(`${LEAD}(?:(?:${ACT_AR_STEM}|اسحب|كبّ?ر|صغّ?ر|كمّ?ل|حاول|[أا]عد|كرّ?ر)${AR_TAIL}${AR_END}|(?:${ACT_EN}|scroll|swipe|stop|go\\s+back|wake|try|retry|again|redo)\\b)`, 'iu');

export function noteOperate(sessionId: unknown, request: string, target?: OperateTarget): void {
    setWorking(sessionId, { target: target || (isPhoneRequest(request) ? 'phone' : 'computer'), at: Date.now(), request });
}

export function forgetOperate(sessionId: unknown): void { clearWorking(sessionId); }

/** The device this chat worked last, and what was asked, within the follow-up window. */
export function recentOperate(sessionId: unknown, now = Date.now()): { target: OperateTarget; request: string } | null {
    const w = getWorking(sessionId);
    return w && now - w.at <= FOLLOW_UP_MS ? { target: w.target, request: w.request } : null;
}

/** The device a follow-up command in this chat acts on, or null. */
export function operateFollowUp(sessionId: unknown, text: string, now = Date.now()): OperateTarget | null {
    const w = getWorking(sessionId);
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
export function operatorFirstTool(request: string, target?: OperateTarget): 'android_devices' | 'device_computers' | 'device_windows' | 'network_devices' {
    //  The Wi-Fi first: «افحص كم جهاز على شبكة الواي فاي» once counted the devices in a phone app.
    if (isNetworkRequest(request)) return 'network_devices';
    if (target === 'phone' || isPhoneRequest(request)) return 'android_devices';
    if (isDeviceRequest(request)) return 'device_computers';
    return 'device_windows';
}

/**
 * A request only to look (what is on my screen?) needs no action, only a look.
 * «افحص», «تحقق», «تأكد», «كم…», «هل…» and "check", "scan", "how many" are
 * looks too (2026-11-08: «افحص» was held to an action, and failed).
 */
const LOOK_AR = `(?:[اإ]?فحص|تفحّ?ص|تحقّ?ق|تأكّ?د|شيّ?ك)${AR_TAIL}`;
const ONLY_LOOK = new RegExp(
    '^(?:\\s*(?:ما|ماذا|شو|ايش|إيش)\\s+(?:الذي\\s+)?(?:على|في|يظهر)|\\s*(?:what(?:\'s| is)|which)\\b|\\s*(?:اقرأ|صف|describe|read|tell\\s+me)'
    + `|\\s*و?(?:${LOOK_AR}|كم|هل)(?=[\\s،,.؟?!]|$)`
    + '|\\s*(?:check|scan|inspect|verify|look|see|list|show|how\\s+many|is|are|does)\\b)', 'iu');

/**
 * A request that asks for something to be DONE: a command verb (whatever its
 * ending) or its noun («هل يمكنك تشغيل الكشاف؟» asks for an action).
 */
const ACTION_STEM = '(?:[اأ]?شغّ?ل|[اأإ]?طف[يئءّ]|سكّ?ر|[أا]غلق|اضغط|صوّ?ر|ارفع|خفّ?ض|وطّ?ي|فعّ?ل|عطّ?ل|اتّ?صل|ابعث|[أا]رسل|اكتب|ادخل|روح|ارجع|حمّ?ل|نزّ?ل|ولّ?ع|شيل|امسح|احذف|احفظ|افتح|وقّ?ف|افصل|غيّ?ر|ثبّ?ت)';
const ACTION_NOUN = '(?:تشغيل|إطفاء|اطفاء|إغلاق|اغلاق|فتح|إرسال|ارسال|كتابة|حذف|مسح|تغيير|تثبيت|إيقاف|ايقاف|تفعيل|تعطيل|حفظ)';
//  …and its present tense, asked as a question: «هل تقدر ترسل الايميل؟», «بتشغل الكشاف؟».
const ACTION_PRESENT = '(?:ت|ي|ن|بت|بي|بن|رح\\s*ت)(?:رسل|شغّ?ل|طف[يئ]|فتح|سكّ?ر|غلق|كتب|حذف|مسح|بعث|ضغط|صوّ?ر|غيّ?ر|ثبّ?ت|وقّ?ف|فصل|حفظ)';
const ASKS_ACTION = new RegExp(
    `${AR_START}(?:${ACTION_STEM}${AR_TAIL}|${ACTION_NOUN}|${ACTION_PRESENT}${AR_TAIL})${AR_END}`
    + '|\\b(?:turn|switch|open|close|call|text|send|take|play|start|launch|press|tap|click|type|save|enable|disable|toggle|delete|install|reply|write|set|stop)\\b', 'iu');

export function onlyLooks(text: string): boolean {
    return ONLY_LOOK.test(String(text || '')) && !ASKS_ACTION.test(String(text || ''));
}

/**
 * «افحص» ALONE CONTINUES THE CHAT'S LAST DEVICE WORK.
 *
 * The owner, 2026-11-08: «هل توجد أجهزة على الواي فاي؟» was answered (the
 * scan, 15 s), then «افحص»: the run scanned the Wi-Fi again, and Joe's checks
 * refused it four times — they read «افحص» alone, found no action on a
 * screen, and the model went reading the owner's windows until the run
 * failed. A message too short to say what it is about is read with the
 * request it follows; one that names its own device, network, app or
 * flashlight stands alone.
 */
export function continuedRequest(request: string, previous?: string | null): string {
    const t = String(request || '').trim();
    const p = String(previous || '').trim();
    if (!t || !p || t === p) return t;
    if (t.length > 80 || isDeviceRequest(t) || isPhoneRequest(t) || ON_DEVICE.test(t) || DESKTOP_APP.test(t) || FLASH_NOUN.test(t)) return t;
    return `${t}\n(it continues: ${p})`;
}

/**
 * What the checks hold the run to: the devices it reaches, a look, or an
 * action. The message decides when it says so itself; a short one that
 * does not («افحص», «حاول مره اخرى») is read with the work it continues.
 */
export function requestKind(own: string, about: string = own): 'devices' | 'look' | 'act' {
    if (onlyAboutDevices(own)) return 'devices';
    if (onlyLooks(own)) return 'look';
    if (ASKS_ACTION.test(own) || about === own) return 'act';
    const rest = about.slice(own.length);
    if (onlyAboutDevices(rest)) return 'devices';
    if (onlyLooks(rest.replace(/^\s*\(it continues:\s*/u, ''))) return 'look';
    return 'act';
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
        '- When he asks what is on his Wi-Fi or home network (how many devices, which, to check or scan it): call network_devices and tell him, in his language, how many and what each most likely is. Never send him to type a command himself: you can look.',
        '- After an email you sent is checked in its Sent folder, call email_watch_replies once with every recipient address, the name the owner used for the person and the subject: Joe then watches his phone\'s mail, in the background, for their replies and tells him in this chat the moment one arrives. Call it too when he asks to be told when someone writes or replies. Say so in your summary in one short sentence.',
        '- When the owner asks what you can reach, or to connect to a computer or a phone: call device_computers and tell him, by name, what you can reach, and which are on or off. His computers are known by the names he gave them («كمبيوتر المكتب»): «اشبك على كمبيوتر المكتب» is device_use with that name, from anywhere. A computer linked for good that is off cannot be reached until it is on: say so plainly. A computer that is not linked yet: device_link_new WITH the name he calls it (a permanent link: he runs one line on it once, and it calls Joe by itself at every start), then device_wait_link, then device_use it and go on with what he asked. «افصل … نهائياً» is device_forget. A phone on Wi-Fi showing its pairing code: ask him for the six digits (say it in task_finish), then android_pair and android_connect when he gives them. Never ask him to go to the settings for any of this: the chat is where he works.',
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
        '8. When you cannot go on without the owner (what he means is unclear even with the chat\'s history, the phone needs his PIN, something needs his «yes»), call ask_owner once with what you did and your one question. Never ask him in notes and keep going.',
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

export function operatorFirstMessage(request: string, language: string, replyLanguage?: string, target?: OperateTarget, history?: string, about?: string): string {
    return [
        'Request (verbatim):',
        '"""',
        request.trim(),
        '"""',
        '',
        //  What Joe did on the owner's devices earlier in this chat: «حاول مره
        //  اخرى» means the last of these, «اطفيه» the thing turned on.
        ...(history && history.trim() ? [history.trim(), 'A short request («try again», «turn it off», «and now…») refers to these.', ''] : []),
        ...(target === 'phone' && !isPhoneRequest(request) ? ['Joe read this message as being about the owner\'s Android phone (from the chat\'s work on it, or from what the message means): use the android_ tools.', ''] : []),
        ...(target === 'computer' && !isOperateRequest(request) ? ['Joe read this message as being about the owner\'s computer (from the chat\'s work on it, or from what the message means): use the device_ tools.', ''] : []),
        `Request language: ${languageName(language)}.`,
        `Write your notes between tool calls and your task_finish summary in ${languageName(replyLanguage || language)}: that is the language the user set Joe to.`,
        '',
        `Start by calling plan_update with your steps, then ${operatorFirstTool(about || request, target)}.`,
    ].join('\n');
}

/* ───────────────────────── one question to the owner ───────────────────────── */

/**
 * ASK THE OWNER, ONCE, AND END.
 *
 * The owner, 2026-11-08: «حاول مره اخرى» reached a run that knew nothing of
 * the chat; it asked him what to retry in its notes, again and again — the
 * operate tools had no way to end on a question — until the idle limit failed
 * the run after 24 steps. A run that needs something only the owner can give
 * (which thing he means, unlocking a phone with a PIN, a «yes» before
 * sending) asks it here and the run ends; he answers in the chat.
 */
export const askOwnerTool: EngineTool<{ question: string }> = {
    name: 'ask_owner',
    description: 'End the run with ONE question to the owner, when you cannot go on without him: the request is unclear even with the chat\'s history, the phone must be unlocked with his PIN, or he must confirm something you must not do unasked (sending, paying, deleting). Say first, briefly, what you did and saw. Never use it for what the tools can find out.',
    parameters: { type: 'object', properties: { question: { type: 'string', description: 'What you did and saw, then the one question, in the owner\'s language.' } }, required: ['question'] },
    parse: raw => {
        const q = String((raw as any)?.question ?? '').trim();
        return q ? { ok: true, value: { question: q.slice(0, 1500) } } : { ok: false, error: '"question" is what to ask the owner.' };
    },
    async run(a, ctx: ToolContext): Promise<ToolOutcome> {
        const report: VerificationReport = { passed: true, checks: [{ id: 'asked_owner', status: 'passed', detail: a.question }], unproven: [], at: Date.now() };
        ctx.state.verifications.push(report);
        return { ok: true, output: 'Asked. The run ends here; the owner answers in the chat.', facts: { ownerQuestion: a.question, verification: report } };
    },
};

/* ───────────────────────── what proves it was done ───────────────────────── */

/**
 * Done means: something was done on the device (unless the request only asked
 * to look), the last action was followed by a look or a read, and no action
 * the run ended on was refused or failed without a later success.
 */
export function operateVerifier(opts: { about?: string } = {}): Verifier {
    return async (ctx: ToolContext, _claim: FinishArgs): Promise<VerificationReport> => {
        const rec = deviceRecordFor(ctx.runId);
        const checks: CheckResult[] = [];
        //  «افحص» is held to what it continues (continuedRequest), not read alone.
        const about = opts.about || ctx.request;
        const kind = requestKind(ctx.request, about);
        const looking = kind === 'look';
        const done = rec.actions.filter(a => a.ok);
        const lastAction = done.length ? done[done.length - 1].at : 0;
        //  A list of the devices is not a look at a screen.
        const screenLooks = rec.looks.filter(l => l.kind !== 'devices');
        const lastLook = screenLooks.length ? screenLooks[screenLooks.length - 1].at : 0;
        const listed = rec.looks.some(l => l.kind === 'devices');
        if (kind === 'devices') {
            //  Listing what Joe can reach, linking a computer or pairing a phone is the whole of it…
            const linked = done.filter(a => /^(?:device_link_new|device_wait_link|device_forget|android_pair|android_connect)$/u.test(a.tool));
            checks.push(linked.length || listed
                ? { id: 'devices', status: 'passed', detail: linked.length ? linked.map(a => a.what).join('; ') : 'the devices Joe can reach were listed' }
                : { id: 'devices', status: 'failed', detail: 'the request is about the devices Joe can reach, and none were listed, linked or paired: call device_computers' });
            //  …unless it also asks what the screen shows.
            if (asksToLook(ctx.request) || (about !== ctx.request && asksToLook(about) && !onlyAboutDevices(ctx.request))) {
                checks.push(lastLook
                    ? { id: 'looked', status: 'passed', detail: `the screen was looked at (${screenLooks.length} look(s))` }
                    : { id: 'looked', status: 'failed', detail: 'the request also asks what the screen shows, and the screen was not read or looked at' });
            }
        } else if (looking) {
            //  «افحص» after a question about the Wi-Fi or the devices: the scan or the list is the look.
            if (!lastLook && listed && isDeviceRequest(about)) {
                checks.push({ id: 'devices', status: 'passed', detail: 'the devices (or the network) were listed again, as the chat\'s question asked' });
            } else {
                checks.push(lastLook
                    ? { id: 'looked', status: 'passed', detail: `the screen was looked at (${screenLooks.length} look(s))` }
                    : { id: 'looked', status: 'failed', detail: 'the request asks what is on the screen, and no device_look or device_read was made' });
            }
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

const ASKED: Record<string, string> = { ar: '❓ أحتاج جوابك لأكمل: اكتبه هنا في المحادثة.', en: '❓ I need your answer to go on: write it here in the chat.' };

/**
 * An English reason in front of an Arabic reader: the owner read «لم يكتمل
 * التنفيذ على الجهاز: the model stopped calling tools before the checks
 * passed» (2026-11-08). The engine's reasons are English; the owner's are not.
 */
const REASONS_AR: [RegExp, string][] = [
    [/stopped calling tools/iu, 'توقّف النموذج عن العمل قبل أن تنجح الفحوص'],
    [/deadline arrived/iu, 'انتهى الوقت المسموح قبل أن تنجح الفحوص'],
    [/same failing call|refused the same thing/iu, 'تكررت المحاولة نفسها دون نجاح'],
    [/nothing changed in/iu, 'لم يتغيّر شيء على الجهاز رغم المحاولات'],
    [/model call (?:failed|cannot go on)|cut off/iu, 'تعذّر الاتصال بالنموذج'],
    [/cancelled/iu, 'أُلغي التشغيل'],
    [/no device_ action succeeded|nothing was done on the device/iu, 'لم ينجح أي إجراء على الجهاز'],
    [/not followed by a device_look|look at the result/iu, 'لم يُنظر إلى الشاشة بعد آخر إجراء'],
];

/**
 * A run that failed ends with the engine's own account, in English: the owner
 * read «Joe's checks refused the same thing 4 times in a row: acted: …» under
 * the Arabic reason (2026-11-08). For an Arabic reader the English lines go;
 * the Arabic reason above them already says it.
 */
export function ownScript(text: string, language: string): string {
    if (language !== 'ar') return text;
    return String(text || '').split('\n')
        .filter(l => !l.trim() || /[؀-ۿ]/u.test(l) || !/[A-Za-z]{3,}\s+[A-Za-z]{2,}/u.test(l))
        .join('\n').replace(/\n{3,}/gu, '\n\n').trim();
}

function reasonFor(why: string, language: string): string {
    if (language !== 'ar' || /[؀-ۿ]/u.test(why)) return why;
    return REASONS_AR.find(([re]) => re.test(why))?.[1] || 'لم يكتمل العمل على الجهاز';
}

/** The operate run's answer, in the shape the orchestrator's final-outcome rule reads. */
export function operateOutput(result: EngineResult | undefined, language: string): { ok: boolean; error?: string; output: Record<string, any> } {
    const words = OPERATE_WORDS[language === 'ar' ? 'ar' : 'en'];
    const verified = !!result && result.status === 'delivered' && result.verification?.passed === true;
    const failed = (result?.verification?.checks || []).filter(c => c.status === 'failed').map(c => c.detail);
    const why = verified ? '' : reasonFor(failed[0] || String(result?.reason || '').trim() || 'the run ended before it was done', language === 'ar' ? 'ar' : 'en');
    const receipts = (result?.verification?.checks || []).map(c => ({ tool: `operate:${c.id}`, ok: c.status === 'passed', ...(c.status === 'passed' ? {} : { error: c.detail }) }));
    const seconds = Math.round((result?.durationMs || 0) / 1000);
    const ids = new Set((result?.verification?.checks || []).map(c => c.id));
    const closing = ids.has('asked_owner') ? ASKED[language === 'ar' ? 'ar' : 'en']
        : ids.has('acted') ? words.done : ids.has('looked') ? words.looked : ids.has('devices') ? words.devices : words.done;
    const summary = verified
        ? [String(result!.summary || '').trim(), closing, words.took(seconds, result!.costUsd)].filter(Boolean).join('\n\n')
        : [words.notDone(why), ownScript(String(result?.summary || '').trim(), language)].filter(Boolean).join('\n\n');
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
