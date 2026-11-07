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

export function isOperateRequest(text: string): boolean {
    const t = String(text || '');
    if (!t.trim() || BUILD_VERB.test(t)) return false;
    return ON_DEVICE.test(t) || ON_PHONE.test(t) || DESKTOP_APP.test(t) || isDeviceRequest(t);
}

/** The request is about the owner's phone (the android_ tools), not a computer. */
export function isPhoneRequest(text: string): boolean {
    return ON_PHONE.test(String(text || ''));
}

/** A request only to look (what is on my screen?) needs no action, only a look. */
const ONLY_LOOK = /^(?:\s*(?:ما|ماذا|شو|ايش|إيش)\s+(?:الذي\s+)?(?:على|في|يظهر)|\s*(?:what(?:'s| is)|which)\b|\s*(?:اقرأ|صف|describe|read|tell\s+me))/iu;

export function onlyLooks(text: string): boolean {
    return ONLY_LOOK.test(String(text || '')) && !/(?:افتح|اكتب|اضغط|احفظ|أغلق|اغلق|open|type|click|press|save|close)/iu.test(String(text || ''));
}

/* ───────────────────────── what the model is told ───────────────────────── */

export function operatorSystemPrompt(machine: MachineFacts): string {
    return [
        'You are Joe, an agent that works the owner\'s computer for him, the way a careful person at the keyboard does, and keeps going until what he asked is done and seen on the screen.',
        '',
        '# Environment',
        `- This computer runs ${machine.platform === 'win32' ? 'Windows' : machine.platform}. You act on it only through the device_ tools.`,
        '- device_windows lists the open windows by handle number; every other device_ tool names its window by that number.',
        '- The owner\'s Android phone is worked with the android_ tools (through adb): android_devices first, then android_read (numbered controls) or android_look, android_tap by number, android_type, android_key (back, home…), android_scroll, android_open by package name. When the request is about his phone, use these, not the device_ tools.',
        '- When the owner asks what you can reach, or to connect to a computer or a phone: call device_computers and tell him, by name, what you can reach. A computer that is not linked yet: device_link_new shows him the one line to run on it, then device_wait_link waits for it, then device_use it and go on with what he asked. A phone on Wi-Fi showing its pairing code: ask him for the six digits (say it in task_finish), then android_pair and android_connect when he gives them. Never ask him to go to the settings for any of this: the chat is where he works.',
        '- The owner may have linked other computers to Joe. When the request names another computer (the office PC, the laptop, «حاسوب المكتب»…), call device_computers, then device_use with its name; every device_ tool then works there until device_use "this".',
        '',
        '# Method',
        '1. Call plan_update with your steps.',
        '2. Look first: device_windows, then device_look or device_read of the window you need. If the program is not open, device_open it, then device_windows again to find its new window.',
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

export function operatorFirstMessage(request: string, language: string, replyLanguage?: string): string {
    return [
        'Request (verbatim):',
        '"""',
        request.trim(),
        '"""',
        '',
        `Request language: ${languageName(language)}.`,
        `Write your notes between tool calls and your task_finish summary in ${languageName(replyLanguage || language)}: that is the language the user set Joe to.`,
        '',
        'Start by calling plan_update with your steps, then device_windows.',
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
        const lastLook = rec.looks.length ? rec.looks[rec.looks.length - 1].at : 0;
        if (onlyAboutDevices(ctx.request)) {
            //  Listing what Joe can reach, linking a computer or pairing a phone is the whole of it.
            const linked = done.filter(a => /^(?:device_link_new|device_wait_link|android_pair|android_connect)$/u.test(a.tool));
            const listed = rec.looks.some(l => l.kind === 'devices');
            checks.push(linked.length || listed
                ? { id: 'devices', status: 'passed', detail: linked.length ? linked.map(a => a.what).join('; ') : 'the devices Joe can reach were listed' }
                : { id: 'devices', status: 'failed', detail: 'the request is about the devices Joe can reach, and none were listed, linked or paired: call device_computers' });
        } else if (looking) {
            checks.push(lastLook
                ? { id: 'looked', status: 'passed', detail: `the screen was looked at (${rec.looks.length} look(s))` }
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

const OPERATE_WORDS: Record<string, { done: string; devices: string; notDone: (why: string) => string; took: (s: number, usd?: number) => string }> = {
    ar: {
        done: '✅ نفّذتُه على جهازك ونظرتُ إلى الشاشة بعده للتأكد.',
        devices: '✅ هذا ما أصل إليه الآن من أجهزتك.',
        notDone: why => `⚠️ لم يكتمل التنفيذ على الجهاز: ${why}`,
        took: (s, usd) => `⏱️ استغرق ${s < 60 ? `${s} ثانية` : `${Math.round(s / 60)} دقيقة`}${usd != null ? `، كلفة ${usd.toFixed(3)}$` : ''}`,
    },
    en: {
        done: '✅ Done on your computer, and the screen was checked afterwards.',
        devices: '✅ That is what I can reach of your devices now.',
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
    const summary = verified
        ? [String(result!.summary || '').trim(), (result!.verification?.checks || []).some(c => c.id === 'devices') ? words.devices : words.done, words.took(seconds, result!.costUsd)].filter(Boolean).join('\n\n')
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
