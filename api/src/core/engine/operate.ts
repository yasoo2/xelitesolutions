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
import { isMailWatchRequest } from './tools/mail';
import { activeWatches } from '../devices/mail-watch';
import { clearWorking, getWorking, setWorking } from './device-work';
import { IS_NEW_BUILD } from './select';

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
 * A REQUEST ABOUT SOFTWARE IS NEVER WORK ON THE DEVICES.
 *
 * Found by the verifiers on 2026-11-08: «أضف صفحة تعرض الأجهزة المتصلة
 * بالشبكة», «اصلح الصفحة التي تعرض الأجهزة على الشبكة» and «رتب الأجهزة على
 * الشبكة في جدول» name the devices and the network, so the devices reader
 * (DEVICES_PLURAL with REACH) sent them to device_computers: a change to the
 * chat's project became a list of the owner's computers. A request that
 * builds, that is about a site, a page, the code or the project, or that
 * leads with an edit (أضف، اصلح، عدّل، رتّب…, "add", "fix"…) is software: it
 * goes to the project, never to the devices. The edit is read where it leads
 * the message, after the words people put before it («طيب»، «لو سمحت»، "ok").
 */
const SOFT_FILLER = '(?:(?:و?(?:ثم|بعدين|كمان|الآن|الان|هلق|هلا|طيب|تمام|ماشي|رجاء|يلا)|لو\\s+سمحت|من\\s+فضلك|يا\\s+جو|and|also|now|then|ok|okay|sure|please|pls|can\\s+you|could\\s+you|would\\s+you)[\\s،,]+)*';
//  «حسن» alone is «good» or a name, and «حول» is «around»: only the edit verbs that mean nothing else.
const EDIT_STEM = '(?:أضف|اضف|إضف|ضيف|ضف|زيد|زد|أصلح|اصلح|إصلح|صلح|صلّح|عدّل|عدل|رتّب|رتب|غيّر|غير|حسّن|استبدل|انقل|ترجم|نسّق|نسق|صمّم|صمم)';
//  The present tense is a request only after the words that ask: «ممكن تضيف صفحة…», «بدي ترتب…».
const EDIT_PRESENT = '(?:ممكن|تقدر|بتقدر|بدي|بدّي|اريد|أريد|ابغى|أبغى|ابي|أبي)\\s+(?:[أا]ن(?:ك)?\\s+)?ت(?:ضيف|زيد|صلح|صلّح|عدّل|عدل|رتّب|رتب|غيّر|غير|حسّن|ستبدل|نقل|ترجم|نسّق|نسق|صمّم|صمم)';
const EDIT_TAIL = '[\\u0621-\\u064A\\u064B-\\u0652]*';
const EDIT_LEAD = new RegExp(
    `^\\s*${SOFT_FILLER}[وف]?(?:${EDIT_STEM}(?:ها|هم|ه|لي|لنا|و|وا|ي)?(?=[\\s،,.؟?!:]|$)|${EDIT_PRESENT}${EDIT_TAIL}(?=[\\s،,.؟?!:]|$)`
    + '|(?:add|fix|change|edit|update|rename|refactor|redesign|restyle|rewrite|improve|arrange|sort|style)\\b)', 'iu');
//  «اجعل», «خلي», "make" lead a change only when what they change is software: «اجعل الموقع يظهر جيداً على هاتفي».
const MAKE_LEAD = new RegExp(`^\\s*${SOFT_FILLER}[وف]?(?:اجعل|إجعل|خلي|خلّي|make)(?=\\s)`, 'iu');
//  The code, the project, «the table» of an app: what a project has («في جدول», a table to answer in, is not one).
const SOFTWARE_THING = /(?:الجدول|بالجدول|للجدول|الكود\s+البرمجي|كود\s+(?:البرنامج|التطبيق|الموقع)|الشيفرة|المشروع|مشروع(?:ي|نا)?(?=[\s،,.؟?!]|$)|الداشبورد|لوحة\s+(?:البيانات|المعلومات))|\b(?:the\s+table|source\s+code|codebase|the\s+code|project|repo(?:sitory)?|component|dashboard|html|frontend|backend|endpoint)\b/iu;

function aboutSoftwareThing(t: string): boolean {
    return ABOUT_A_SITE.test(t) || SOFTWARE_THING.test(t);
}

/** Software, not the devices: a build, a site, a page, the code or the project, or a request that leads with an edit. */
export function isAboutSoftware(text: string): boolean {
    const t = String(text || '');
    return BUILD_VERB.test(t) || IS_NEW_BUILD.test(t) || EDIT_LEAD.test(t) || aboutSoftwareThing(t);
}

/** An edit of software, wherever it is meant to show: «اجعل الموقع يظهر جيداً على هاتفي» changes a site, it does not work the phone. */
function editsSoftware(t: string): boolean {
    return (EDIT_LEAD.test(t) || MAKE_LEAD.test(t)) && aboutSoftwareThing(t);
}

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
 * الواي فاي؟», «افحص كم جهاز على شبكة الواي فاي», "what devices are on my wifi".
 *
 * A QUESTION ABOUT THE DEVICES, NOT A MESSAGE THAT NAMES THE NETWORK.
 *
 * Found on 2026-11-08: «جهاز» matched inside «جهازي» and «لجهاز», and
 * "things" and "connected" counted as devices, so «اطفي الواي فاي في جهازي»,
 * "turn on wifi on my device", «أضف صفحة تعرض الأجهزة المتصلة بالشبكة» and
 * advice about the router went to a Wi-Fi scan, and the scan's checks passed
 * them. Now it takes three things together: the network, a device word
 * standing alone, and a cue that asks to count, name, list or scan them,
 * close to that word («كم جهاز», «شو الأجهزة», «هل توجد أجهزة», "how many
 * devices", "scan my wifi for devices"). Turning the Wi-Fi on or off, a build,
 * a fix or an addition to a project, a site, and advice are not this question.
 */
const NETWORK = /(?:واي\s*فاي|الوايفاي|وايفاي|wi-?fi|الشبكة|شبكة\s+(?:البيت|المنزل|الواي|الانترنت|الإنترنت)|الراوتر|راوتر)|\b(?:network|router|lan)\b/iu;
//  JavaScript's \b knows no Arabic letter: an Arabic word starts after a space or a mark and ends before one.
const NET_START = '(?:^|[\\s،,.؟?!:;(«"\'])';
const NET_TAIL = '[\\u0621-\\u064A\\u064B-\\u0652]*';
const NET_END = '(?=[\\s،,.؟?!:;)»"\']|$)';
//  «جهاز», «جهازاً», «أجهزة», «الأجهزة», «والأجهزة» — never «جهازي» (my device) or «لجهاز».
const DEVICE_WORD = `(?:(?:و?(?:ال)?(?:أجهزة|اجهزة|اجهزه|أجهزه)|جهاز(?:اً|ًا|ا)?)${NET_END}|devices?\\b)`;
const COUNT_CUE = '(?:و?(?:كم|شو|ايش|إيش|مين)|أي|أيّ|اي|ما\\s+(?:هي|هو)|ماهي|which|how\\s+many|what)';
const THERE_CUE = '(?:و?هل(?:\\s+\\S+)?\\s+(?:توجد|يوجد|في|فيه|هناك)|are\\s+there|is\\s+there)';
/*
 * …and to look for them: «ابحث عن الأجهزة المتصلة بالواي فاي», «دور على الاجهزة
 * اللي على الواي فاي», "search for devices on my network", "find all devices
 * connected to my wifi", "check my wifi for devices" (2026-11-08: they went to
 * device_computers, the owner's linked computers, or to no device at all).
 * «بحث» alone is a research paper and «دور» alone a role or a turn: the verb
 * only — «ابحث», «دوّر», «دور على».
 */
const LIST_CUE = `(?:[اإ]?فحص${NET_TAIL}|اعرض${NET_TAIL}|[اإ]بحث${NET_TAIL}|دوّر${NET_TAIL}|دور(?:لي|ي|وا)?\\s+(?:على|عن|لي)|فتّ?ش${NET_TAIL}|شوف${NET_TAIL}|قائمة|list|scan|show|check|find|search|look)`;
const NETWORK_QUESTION = new RegExp(
    `${NET_START}(?:${COUNT_CUE}|${THERE_CUE})(?:\\s+\\S+){0,2}?\\s+${DEVICE_WORD}`
    + `|${NET_START}ما\\s+${DEVICE_WORD}`
    //  Asked as a bare noun, the device word first: «الأجهزة المتصلة بالواي فاي؟», "devices on my wifi?".
    + `|^\\s*${DEVICE_WORD}`
    + `|${NET_START}${LIST_CUE}(?:\\s+\\S+){0,4}?\\s+${DEVICE_WORD}`
    //  …and who or what is on it, asked of the network itself: "what's on my wifi", «مين متصل على الواي فاي».
    + '|\\bwhat(?:\'s|\\s+is)\\s+(?:on|connected\\s+to)\\s+(?:my|our|the)\\s+(?:home\\s+)?(?:wi-?fi|network|router|lan)\\b'
    + '|\\bwho(?:\'s|\\s+is)\\s+(?:on|connected\\s+to|using)\\s+(?:my|our|the)\\s+(?:home\\s+)?(?:wi-?fi|network|router)\\b'
    + `|${NET_START}(?:شو|ايش|إيش|مين)\\s+(?:(?:في|فيه|موجود|متصل|المتصل|بيستخدم|يستخدم)\\s+)?(?:على|ب|في)\\s*(?:ال)?(?:واي\\s*فاي|وايفاي|شبكة|راوتر)`, 'iu');
//  On or off is an action on the Wi-Fi, never a list of what is on it: «اطفي الواي فاي في جهازي», "turn on wifi on my device".
//  «فعلاً» (really) is not «فعّل».
const NET_TOGGLE = new RegExp(`${NET_START}[وف]?(?:[اأ]?شغّ?ل|[اأإ]?طف[يئءّ]|سكّ?ر|فعّ?ل(?!ا)|عطّ?ل|[اأإ]?فصل|وقّ?ف)${NET_TAIL}${NET_END}|\\b(?:turn|switch|enable|disable|toggle)\\b`, 'iu');
/*
 * Advice about the network is answered, not scanned: «كم جهاز يتحمل الراوتر؟»,
 * "the best router for many devices". THE ADVICE IS THE QUESTION ITSELF: found
 * on 2026-11-08, «كم جهاز على الواي فاي؟ افضل لو تعطيني اسماءها» («better if
 * you give me their names») was no scan any more, because «افضل» anywhere was
 * advice. It is read in the sentence that asks about the devices, and «أفضل
 * لو/أن/إذا», "best if" (a polite «better if») is not advice.
 */
const NET_ADVICE = /(?:يتحمّ?ل|يستوعب|[أا]قصى|[أا]نصح|نصيحة|نصائح)|[أا]فضل(?![\s،,]+(?:لو|اذا|إذا|[أاإ]ن|[أا]نك|لك|لي|عندي)(?=[\s،,.؟?!]|$))|\b(?:best(?!\s+(?:if|to\s+(?:give|tell|show|list|name)))|recommend\w*|advice|maximum|max|support(?:s|ed)?|handles?)\b/iu;
const NETWORK_QUESTIONS = new RegExp(NETWORK_QUESTION.source, 'giu');
const SENTENCE_END = /[.؟?!\n]/u;

/** The sentences of the message that ask about the devices on the network. */
function networkQuestionSentences(t: string): string[] {
    const out: string[] = [];
    for (const m of t.matchAll(NETWORK_QUESTIONS)) {
        //  The match may begin on the mark that ended the sentence before it («…؟كم»): start at its first letter.
        const at = (m.index ?? 0) + Math.max(0, m[0].search(/[^\s،,.؟?!:;(«"']/u));
        let start = at;
        while (start > 0 && !SENTENCE_END.test(t[start - 1])) start--;
        let end = at;
        while (end < t.length && !SENTENCE_END.test(t[end])) end++;
        out.push(t.slice(start, end));
    }
    return out;
}

export function isNetworkRequest(text: string): boolean {
    const t = String(text || '');
    if (!NETWORK.test(t) || NET_TOGGLE.test(t) || isAboutSoftware(t)) return false;
    return networkQuestionSentences(t).some(s => !NET_ADVICE.test(s));
}

/**
 * The request asks to connect to a device, which devices Joe can reach, or
 * what is on the network — and is not about software (isAboutSoftware): a
 * page that lists the devices is a change to a project. Connecting still
 * reads a site named after it: «اشبك على كمبيوتر المكتب وافتح الموقع» works a
 * computer; one that builds or leads with an edit does not.
 */
export function isDeviceRequest(text: string): boolean {
    const t = String(text || '');
    return (CONNECT.test(t) && !BUILD_VERB.test(t) && !IS_NEW_BUILD.test(t) && !EDIT_LEAD.test(t))
        || (DEVICES_PLURAL.test(t) && REACH.test(t) && !isAboutSoftware(t))
        || isNetworkRequest(t);
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

/**
 * THE OWNER ASKS TO BE TOLD WHEN SOMEONE WRITES: WORK ON HIS PHONE'S MAIL.
 *
 * Found on 2026-11-08: «انتظر حتى ترد واعلمني», «اذا رد عليك اخبرني», «خبرني
 * لما يوصلني ايميل من احمد», «تابع ردود شروق» (tools/mail.ts isMailWatchRequest)
 * named no device, so the chat's answerer took them and promised to watch —
 * it cannot. They are operate work on the phone: the run has
 * email_watch_replies and the chat's last turns, where the address is. A
 * site or an app that sends or reads email is software, not a watch: «ابني
 * موقع فيه نموذج يرسل ايميل».
 */
function isMailWatch(t: string): boolean {
    return isMailWatchRequest(t) && !isAboutSoftware(t);
}
//  …and nothing to write first: «ارسل ايميل لشروق واخبرني اذا ردت» sends, then watches.
const SENDS_MAIL = new RegExp(`(?:^|[\\s،,.؟?!])[وف]?(?:[اأإ]رسل|ابعث|ابعت|اكتب|راسل)[\\u0621-\\u064A\\u064B-\\u0652]*(?=[\\s،,.؟?!]|$)|\\b(?:send|write|compose|draft)\\b`, 'iu');

/** The message asks only to watch the mail for someone's reply: the watch is the whole of it. */
export function watchesMailOnly(text: string): boolean {
    const t = String(text || '');
    return isMailWatch(t) && !SENDS_MAIL.test(t);
}

export function isOperateRequest(text: string): boolean {
    const t = String(text || '');
    if (!t.trim() || BUILD_VERB.test(t) || editsSoftware(t)) return false;
    return ON_DEVICE.test(t) || ON_PHONE.test(t) || phoneAction(t) || DESKTOP_APP.test(t) || isDeviceRequest(t) || isMailWatch(t);
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
    if (BUILD_VERB.test(t) || editsSoftware(t)) return false;
    //  Watching his mail is the phone's: Joe reads its mail notifications (isMailWatch).
    return ON_PHONE.test(t) || PHONE_CONNECT.test(t) || phoneAction(t) || (PHONES_PLURAL.test(t) && REACH.test(t) && !isAboutSoftware(t)) || isMailWatch(t);
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
export function operatorFirstTool(request: string, target?: OperateTarget): 'android_devices' | 'device_computers' | 'device_windows' | 'network_devices' | 'email_watch_replies' {
    //  «تابع ردود شروق», «اذا رد عليك اخبرني»: the watch is the work, and the address
    //  is in the chat; the phone's screen has nothing to show for it (2026-11-08).
    if (watchesMailOnly(request)) return 'email_watch_replies';
    //  The phone first: «اطفي الواي فاي في هاتفي» and "turn on wifi on my phone" are
    //  the phone's own Wi-Fi (2026-11-08: they were pointed at a scan). A question
    //  about the devices on the Wi-Fi is routed to the computer (select.ts), so
    //  «افحص كم جهاز على شبكة الواي فاي» is not counted in a phone app again.
    if (target === 'phone' || isPhoneRequest(request)) return 'android_devices';
    if (isNetworkRequest(request)) return 'network_devices';
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
/** The message says what it is about: its own device, network, phone, app, flashlight or mail, or it is long. */
function standsAlone(t: string): boolean {
    return t.length > 80 || isDeviceRequest(t) || isPhoneRequest(t) || ON_DEVICE.test(t) || DESKTOP_APP.test(t) || FLASH_NOUN.test(t);
}

/** Whether a message says by itself what it is about («شغل الكشاف»), or only continues («تحقق مرة اخرى», «افحص»). */
export function standsAloneRequest(t: string): boolean {
    return standsAlone(String(t || '').trim());
}

export function continuedRequest(request: string, previous?: string | null): string {
    const t = String(request || '').trim();
    const p = String(previous || '').trim();
    if (!t || !p || t === p) return t;
    if (standsAlone(t)) return t;
    return `${t}\n(it continues: ${p})`;
}

/**
 * WHAT A SHORT MESSAGE CONTINUES: THE LAST DEVICE WORK THAT STANDS ALONE.
 *
 * The owner's engineer, 2026-11-08: «افحص» after a failed «افحص» continued
 * «افحص» — the chat's last device work — and lost «هل توجد أجهزة على الواي
 * فاي؟» before it: the run looked at the owner's screen for nothing and
 * closed with «I read the screen». A short message continues the most recent
 * request that says what it is about. A run that continued one is recorded
 * as «X — Y» (AgentEngineTool): Y, what X continued, is that request. A
 * request the owner wrote with a dash in it is his own when what comes before
 * the dash already stands alone. Null when nothing recorded stands alone.
 */
export const CONTINUED_MARK = ' — ';

export function deviceWorkAnchor(recorded: string): string | null {
    const t = String(recorded || '').trim();
    if (!t) return null;
    const cut = t.indexOf(CONTINUED_MARK);
    if (cut > 0 && !standsAlone(t.slice(0, cut).trim())) {
        for (let at = cut; at >= 0; at = t.indexOf(CONTINUED_MARK, at + CONTINUED_MARK.length)) {
            const tail = t.slice(at + CONTINUED_MARK.length).trim();
            if (tail && standsAlone(tail)) return tail;
        }
    }
    return standsAlone(t) ? t : null;
}

/**
 * What the checks hold the run to: the devices it reaches, a look, an action,
 * or a watch on the mail. The message decides when it says so itself; a short
 * one that does not («افحص», «حاول مره اخرى», an address Joe asked for) is
 * read with the work it continues.
 */
export function requestKind(own: string, about: string = own): 'devices' | 'look' | 'act' | 'watch' {
    if (watchesMailOnly(own)) return 'watch';
    if (onlyAboutDevices(own)) return 'devices';
    if (onlyLooks(own)) return 'look';
    if (ASKS_ACTION.test(own) || about === own) return 'act';
    const rest = about.slice(own.length).replace(/^\s*\(it continues:\s*/u, '');
    if (watchesMailOnly(rest)) return 'watch';
    if (onlyAboutDevices(rest)) return 'devices';
    if (onlyLooks(rest)) return 'look';
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
        '- A fact from the world the work needs (a price, an address, news, how something is done): web_search and web_read find it without touching his screen; open it on his device only when he asks to see it there.',
        '- device_windows lists the open windows by handle number; every other device_ tool names its window by that number.',
        '- The owner\'s Android phone is worked with the android_ tools (through adb): android_devices first, then android_read (numbered controls) or android_look, android_tap by number, android_type, android_key (back, home, wakeup…), android_scroll, android_open by package name, android_panel for the quick settings (flashlight/torch, Wi-Fi, Bluetooth, airplane mode, mobile data, rotation, do not disturb) and the notifications. When the request is about his phone, use these, not the device_ tools.',
        '- android_read and android_look say first when the phone\'s screen is OFF or the phone is LOCKED. A screen that is off: android_key "wakeup", then read again. A phone locked with a PIN: the quick settings and the notifications still work; for anything else tell the owner to unlock it, and never type a PIN, pattern or password.',
        '- The flashlight: android_torch first (on a phone with the Joe app it turns it on or off directly). When it says the phone is reached by adb alone, the flashlight is a tile in the quick settings (android_panel "quick_settings", android_read, tap the tile whose name is the flashlight in the phone\'s language: «الكشاف», «Flashlight», «Torch», «Lampe de poche»…, then read again: an «on» or checked tile, or a changed description, shows it worked).',
        '- The phone\'s sound («ارفع الصوت», «اخفض صوت الرنين», «اكتم»): android_volume with the stream (media by default, ring, notification, alarm, call) and a level or a change; it says the level after.',
        '- When he asks what is on his Wi-Fi or home network (how many devices, which, to check or scan it): call network_devices and tell him, in his language, how many and what each most likely is. Never send him to type a command himself: you can look.',
        '- A phone or tablet linked through the Joe app shows in android_devices as app:<id>: every android_ tool works on it from anywhere. When he asks to link his phone through the app, or a phone on the cable cannot be reached (a missing driver), offer android_link_app: a six-digit code and the steps, for any Android of any maker.',
        '- When he asks to install or put the Joe app on his phone, or to link his phone wirelessly (by Wi-Fi) or for good, and the phone is connected by adb (the cable, or paired and connected by Wireless debugging): call android_link_app yourself — Joe installs the app on it, opens a private tunnel and opens the app with the code filled in. Then tell him the little that is left on the phone: tap «اربط» and allow the two permissions the app lists. A phone that is not connected yet: pair it first (android_devices, ask him for the six digits, android_pair, android_connect), then android_link_app.',
        //  2026-11-08: Joe asked the owner for «IP:port» and named «Pair device with pairing code» and «Driver» in English to an Arabic reader.
        '- Pairing by Wi-Fi: ask him ONLY for the six digits. Joe finds the phone\'s pairing address himself (android_devices shows it while the pairing window is open on the phone). Ask for the address (numbers like 192.168.1.5:37123, shown in the same window) only when android_devices still does not show the phone after he says the window is open.',
        '- His phone shows its settings in its own language: when you tell him where to tap, use the names his phone shows in his language, never the English ones. On an Arabic phone: «الإعدادات» › «خيارات المطور» › «تصحيح الأخطاء اللاسلكي» › «إقران الجهاز باستخدام رمز الإقران»; USB debugging is «تصحيح أخطاء USB»; hidden Developer options: «حول الهاتف» › «معلومات البرنامج» › tap «رقم الإصدار» seven times; Allow is «سماح». A driver is «تعريف»; Wi-Fi is «الواي فاي»; a phone\'s model name may stay as the phone writes it.',
        '- To write an email on his phone, call android_email with the recipients, the subject and the text, in gmail or outlook (the app it is sent from): it opens a new email already filled. Then android_read, check To, Subject and the text, tap Send, and check the Sent folder. Never tap and type into an email\'s To field by hand. His own accounts are in the facts («my Outlook», «my Gmail»): never ask him for them. A field that holds the wrong text: tap it, android_clear, then type again. A web page, a call, an SMS, a map place or a WhatsApp chat opens with android_link.',
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

/*
 * `about`: his words and what they continue, never the block of a file he
 * attached — the hints and the first tool read it (2026-11-08: a picture
 * described as "turn off the guest network" turned «افحص» from the Wi-Fi
 * scan to device_computers).
 */
export function operatorFirstMessage(request: string, language: string, replyLanguage?: string, target?: OperateTarget, history?: string, about?: string): string {
    const read = about || request;
    return [
        'Request (verbatim):',
        '"""',
        request.trim(),
        '"""',
        '',
        //  What Joe did on the owner's devices earlier in this chat: «حاول مره
        //  اخرى» means the last of these, «اطفيه» the thing turned on.
        ...(history && history.trim() ? [history.trim(), 'A short request («try again», «turn it off», «and now…») refers to these.', ''] : []),
        ...(target === 'phone' && !isPhoneRequest(read) ? ['Joe read this message as being about the owner\'s Android phone (from the chat\'s work on it, or from what the message means): use the android_ tools.', ''] : []),
        ...(target === 'computer' && !isOperateRequest(read) ? ['Joe read this message as being about the owner\'s computer (from the chat\'s work on it, or from what the message means): use the device_ tools.', ''] : []),
        //  «تابع ردود شروق», «اذا رد عليك اخبرني»: whom is in the chat, not in the message (2026-11-08).
        ...(watchesMailOnly(read) ? ['The owner asks to be told when someone writes or replies: call email_watch_replies with that person\'s address and the name he used. The address is in THE CHAT SO FAR or in the device work above (the email Joe sent). When it is in neither, read it off his phone\'s mail with the android_ tools, or ask_owner. Never guess an address.', ''] : []),
        `Request language: ${languageName(language)}.`,
        `Write your notes between tool calls and your task_finish summary in ${languageName(replyLanguage || language)}: that is the language the user set Joe to.`,
        '',
        `Start by calling plan_update with your steps, then ${operatorFirstTool(read, target)}.`,
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
/*
 * `own`: what the owner typed, without the block of a file he attached — the
 * checks read his words, never a file's description (2026-11-08: «افحص» with a
 * picture that said "turn off the guest network" was held to a toggle).
 * `since`: when the run began, so a watch on the mail counts only when this
 * run made it.
 */
export function operateVerifier(opts: { about?: string; own?: string; since?: number } = {}): Verifier {
    return async (ctx: ToolContext, _claim: FinishArgs): Promise<VerificationReport> => {
        const rec = deviceRecordFor(ctx.runId);
        const checks: CheckResult[] = [];
        //  «افحص» is held to what it continues (continuedRequest), not read alone.
        const own = opts.own || ctx.request;
        const about = opts.about || own;
        const kind = requestKind(own, about);
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
            if (asksToLook(own) || (about !== own && asksToLook(about) && !onlyAboutDevices(own))) {
                checks.push(lastLook
                    ? { id: 'looked', status: 'passed', detail: `the screen was looked at (${screenLooks.length} look(s))` }
                    : { id: 'looked', status: 'failed', detail: 'the request also asks what the screen shows, and the screen was not read or looked at' });
            }
        } else if (kind === 'watch') {
            //  «تابع ردود شروق»: a watch this run made for this chat is the whole of it. Without
            //  it the run was held to an action on a screen it had no reason to touch.
            const sid = String(ctx.joe?.sessionId || '');
            const since = opts.since ?? 0;
            const made = activeWatches().filter(w => (!sid || w.sessionId === sid) && w.sentAt >= since);
            checks.push(made.length
                ? { id: 'watching', status: 'passed', detail: `Joe watches the mail for ${made.map(w => w.to).join(', ')}` }
                : { id: 'watching', status: 'failed', detail: 'the owner asked to be told when someone writes or replies, and no watch was made: call email_watch_replies with the person\'s address (from the chat or the email Joe sent; read it off his phone\'s mail, or ask_owner when it is nowhere)' });
        } else if (looking) {
            //  «افحص» after a question about the Wi-Fi or the devices: the scan or the list is the look.
            if (!lastLook && listed && isDeviceRequest(about)) {
                checks.push({ id: 'devices', status: 'passed', detail: 'the devices (or the network) were listed again, as the chat\'s question asked' });
            } else {
                checks.push(lastLook
                    ? { id: 'looked', status: 'passed', detail: `the screen was looked at (${screenLooks.length} look(s))` }
                    : { id: 'looked', status: 'failed', detail: 'the request asks what is on the screen, and no device_look or device_read was made' });
            }
            /*
             * A look that also changed something says so. The owner, 2026-11-08: «تحقق الان
             * مرة اخرى» — the run found his phone, turned the flashlight on (what the chat had
             * asked before), said so, and closed with «I read the screen and changed nothing».
             */
            if (done.length) checks.push({ id: 'acted_too', status: 'passed', detail: `besides looking, ${done.length} action(s) were done on the device: ${done.slice(-5).map(a => a.what).join('; ')}` });
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

//  `watching`: a watch on the mail touched no screen, so «I looked at the screen after it» would be untrue.
const OPERATE_WORDS: Record<string, { done: string; devices: string; looked: string; lookedActed: string; watching: string; notDone: (why: string) => string; took: (s: number, usd?: number) => string }> = {
    ar: {
        done: '✅ نفّذتُه على جهازك ونظرتُ إلى الشاشة بعده للتأكد.',
        devices: '✅ هذا ما أصل إليه الآن من أجهزتك.',
        looked: '✅ قرأتُ الشاشة كما هي، ولم أغيّر فيها شيئاً.',
        lookedActed: '✅ قرأتُ الشاشة، ونفّذتُ على جهازك ما ذكرتُه أعلاه.',
        watching: '✅ أراقب بريدك الآن، وسأخبرك هنا في المحادثة فور وصول الردّ.',
        notDone: why => `⚠️ لم يكتمل التنفيذ على الجهاز: ${why}`,
        took: (s, usd) => `⏱️ استغرق ${s < 60 ? `${s} ثانية` : `${Math.round(s / 60)} دقيقة`}${usd != null ? `، كلفة ${usd.toFixed(3)}$` : ''}`,
    },
    en: {
        done: '✅ Done on your computer, and the screen was checked afterwards.',
        devices: '✅ That is what I can reach of your devices now.',
        looked: '✅ I read the screen as it is and changed nothing.',
        lookedActed: '✅ I read the screen, and did on your device what is said above.',
        watching: '✅ I am watching your mail now and will tell you here the moment the reply arrives.',
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
    [/no watch was made/iu, 'لم تبدأ مراقبة البريد: لم يُعرف عنوان من تنتظر ردّه'],
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
        : ids.has('acted') ? words.done : ids.has('watching') ? words.watching : ids.has('acted_too') ? words.lookedActed
        : ids.has('looked') ? words.looked : ids.has('devices') ? words.devices : words.done;
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
