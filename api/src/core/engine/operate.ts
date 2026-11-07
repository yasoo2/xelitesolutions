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
const DESKTOP_APP = /(?:افتح|شغّ?ل|استخدم|اكتب\s+في|ادخل\s+(?:على|الى|إلى))\s+(?:برنامج\s+|تطبيق\s+)?(?:المفكرة|مفكرة|notepad|الآلة\s+الحاسبة|الحاسبة|calc(?:ulator)?|الرسام|paint|mspaint|إكسل|اكسل|excel|وورد|word|باوربوينت|powerpoint|مستكشف\s+الملفات|explorer|الإعدادات|لوحة\s+التحكم|cmd|الطرفية)|\b(?:open|launch|start|use)\s+(?:the\s+)?(?:notepad|calculator|calc|paint|mspaint|excel|word|powerpoint|file\s+explorer|settings|control\s+panel)\b/iu;
const BUILD_VERB = /\b(?:build|create|make|develop|write|code|implement)\s+(?:a|an|me\s+a|the)?\s*(?:app|application|website|site|program|tool|script|api|game|system|page)\b|ابن[يِ]?\s|ابني|أنشئ|انشئ|اكتب\s+(?:برنامج|كود|سكربت|أداة)|طوّ?ر\s|صمّ?م\s/iu;

export function isOperateRequest(text: string): boolean {
    const t = String(text || '');
    if (!t.trim() || BUILD_VERB.test(t)) return false;
    return ON_DEVICE.test(t) || DESKTOP_APP.test(t);
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
        if (looking) {
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

const OPERATE_WORDS: Record<string, { done: string; notDone: (why: string) => string; took: (s: number, usd?: number) => string }> = {
    ar: {
        done: '✅ نفّذتُه على جهازك ونظرتُ إلى الشاشة بعده للتأكد.',
        notDone: why => `⚠️ لم يكتمل التنفيذ على الجهاز: ${why}`,
        took: (s, usd) => `⏱️ استغرق ${s < 60 ? `${s} ثانية` : `${Math.round(s / 60)} دقيقة`}${usd != null ? `، كلفة ${usd.toFixed(3)}$` : ''}`,
    },
    en: {
        done: '✅ Done on your computer, and the screen was checked afterwards.',
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
        ? [String(result!.summary || '').trim(), words.done, words.took(seconds, result!.costUsd)].filter(Boolean).join('\n\n')
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
