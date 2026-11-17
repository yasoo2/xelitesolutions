/**
 * THE DELIVERY, SAID IN HIS WORDS: WHAT WAS CHECKED, HOW TO RUN IT, WHAT IT COST.
 *
 * Read on 2026-11-05: a verified delivery ended with «✅ تحقّقت فحوص جو من
 * التسليم (live، acceptance، browser)» — instrument ids a reader of Arabic
 * cannot read — and nothing else: the `how_to_run` the model handed
 * task_finish was dropped, the run's time and cost stayed in `.joe/result.json`,
 * and nothing in the project said how it was proven. So:
 *   - every instrument has a name in the interface's language, short for the
 *     reply's verdict line and whole for the certificate;
 *   - the reply carries how to run the project and the run's time and cost;
 *   - a verified project gets JOE-DELIVERY.md: the request, what was built,
 *     each check that proved it, what is not proven, how to run it, its live
 *     address, the time, the cost, and how to take a later change back.
 * Only measured facts are written: a check that did not run is never named
 * as passed, and an unknown cost is left out rather than guessed.
 */
import fs from 'fs';
import path from 'path';
import type { QaPath } from '../quality/qa-target';

type Words = { short: string; whole: string };
const INSTRUMENTS: Record<'ar' | 'en', Record<string, Words>> = {
    ar: {
        live: { short: 'التشغيل الحي', whole: 'شُغّل المشروع فعلاً وأجاب على عنوانه الحي.' },
        quality: { short: 'عقد الجودة', whole: 'أوامر المشروع (التثبيت والتشغيل والبناء) صادقة وتعمل كما تقول.' },
        scope: { short: 'اكتمال الأقسام', whole: 'كل قسم أو صفحة ذكرتها في طلبك موجودة في المشروع.' },
        coverage: { short: 'تغطية طلبك', whole: 'كل سجل أو ميزة سمّيتها موجودة، وما يحتاج خادماً يُخدم منه.' },
        tests: { short: 'الاختبارات', whole: 'اختبارات المشروع شُغّلت ونجحت.' },
        browser: { short: 'التجربة في المتصفح', whole: 'فُتح المشروع في متصفح حقيقي وجُرّبت أزراره ونماذجه على شاشة الحاسوب والجوال.' },
        spec: { short: 'المواصفات', whole: 'طابق المشروع المواصفات التي قرأها جو من طلبك.' },
        program: { short: 'تشغيل البرنامج', whole: 'شُغّل البرنامج وأعطى النتيجة المطلوبة.' },
        service: { short: 'الخادم', whole: 'طلبك يحتاج خادماً، والمشروع يسجّل مسارات خادم حقيقية.' },
        source: { short: 'سلامة الشيفرة', whole: 'قُرئت الشيفرة كلها: لا خطأ في صياغتها ولا اسم يُستعمل دون تعريف.' },
        build: { short: 'البناء', whole: 'بُني المشروع دون أخطاء.' },
        acceptance: { short: 'حكم مستقل', whole: 'قرأ حَكَم مستقل الشيفرة ونتائج التجربة، وطابق كل متطلب بكلماتك.' },
        roles: { short: 'الصلاحيات', whole: 'دخل جو بحساب كل دور، وطلب من الخادم بحساب كل دور بيانات الشاشات المخفية عنه، فرفضها الخادم كلها.' },
    },
    en: {
        live: { short: 'live run', whole: 'The project was started for real and answered at its live address.' },
        quality: { short: 'quality contract', whole: 'The project\'s install, start and build commands are truthful and work as they say.' },
        scope: { short: 'scope', whole: 'Every section or page your request named is in the project.' },
        coverage: { short: 'request coverage', whole: 'Every record or feature you named exists, and what needs a server is served by it.' },
        tests: { short: 'tests', whole: 'The project\'s tests were run and passed.' },
        browser: { short: 'browser test', whole: 'The project was opened in a real browser and its buttons and forms were used, at desktop and phone sizes.' },
        spec: { short: 'spec', whole: 'The project matches the specification Joe read from your request.' },
        program: { short: 'program run', whole: 'The program was run and gave the result asked for.' },
        service: { short: 'server', whole: 'Your request needs a server, and the project registers real server routes.' },
        source: { short: 'source check', whole: 'All the source was read: it parses, and it uses no name it never declares.' },
        build: { short: 'build', whole: 'The project builds without errors.' },
        acceptance: { short: 'independent review', whole: 'An independent judge read the code and the test results and matched every requirement to your words.' },
        roles: { short: 'permissions', whole: 'Joe signed in as every role, asked the server — as each role — for the data of the screens hidden from it, and the server refused all of it.' },
    },
};

const wordsFor = (language: string) => INSTRUMENTS[String(language || '').toLowerCase().startsWith('ar') ? 'ar' : 'en'];

/** The instrument's short name in the interface's language («live» → «التشغيل الحي»); an unknown one keeps its id. */
export function instrumentName(id: string, language: string): string {
    return wordsFor(language)[id]?.short || id;
}

/** «4 دقائق» / "4 min"; under a minute in seconds. */
export function durationText(ms: number | undefined, language: string): string {
    if (!Number.isFinite(ms) || (ms as number) <= 0) return '';
    const ar = wordsFor(language) === INSTRUMENTS.ar;
    const seconds = Math.round((ms as number) / 1000);
    if (seconds < 60) return ar ? `${seconds} ثانية` : `${seconds} s`;
    const minutes = Math.round(seconds / 60);
    return ar ? `${minutes} ${minutes >= 3 && minutes <= 10 ? 'دقائق' : 'دقيقة'}` : `${minutes} min`;
}

export function costText(usd: number | undefined): string {
    return Number.isFinite(usd) && (usd as number) >= 0 ? `$${(usd as number).toFixed((usd as number) < 1 ? 3 : 2)}` : '';
}

/** The reply's lines after its verdict: how to run it, and what the run took. */
export function deliveryFooter(input: { howToRun?: string; durationMs?: number; costUsd?: number; language: string }): string[] {
    const ar = wordsFor(input.language) === INSTRUMENTS.ar;
    const lines: string[] = [];
    const run = String(input.howToRun || '').trim();
    if (run) lines.push(`${ar ? '▶️ طريقة التشغيل:' : '▶️ How to run it:'}\n${run}`);
    const took = durationText(input.durationMs, input.language);
    const cost = costText(input.costUsd);
    if (took || cost) {
        lines.push(ar
            ? `⏱️ ${[took && `استغرق ${took}`, cost && `وكلّف ${cost}`].filter(Boolean).join(' ')}`
            : `⏱️ ${[took && `Took ${took}`, cost && `cost ${cost}`].filter(Boolean).join(', ')}`);
    }
    return lines;
}

export interface CertificateInput {
    request: string;
    /** For a change: the requests the project was delivered for before it, oldest first. */
    earlier?: string[];
    summary: string;
    language: string;
    /** Instruments that measured and passed, in the verdict's order. */
    passed: string[];
    /** Requirements the run could not prove, in the run's words. */
    unproven?: string[];
    howToRun?: string;
    liveUrl?: string;
    durationMs?: number;
    costUsd?: number;
    model?: string;
    at?: number;
    /** The landing view the browser check saw, relative to the project (deliveryProof). */
    screenshots?: { desktop?: string; phone?: string };
    /** The account the browser check signed in with (its name only). */
    signedInAs?: string;
    /** What each role's menu offered, when the permissions were measured (role-probe.ts). */
    roles?: Array<{ role: string; screens: string[] }>;
    /** What the browser check tried, counted (qaCoverageOf). */
    qaCoverage?: QaCoverage;
    /**
     * How Joe's checks treated the owner's data on a change run (design v13.3 §9, verify.ts DeliveryRecord.qaPath):
     * the browser line is followed by what that way was, and on the no-write walk what was not tried is listed
     * under «Not proven yet». None (a new build): as before.
     */
    qaPath?: { path: QaPath | string; notTried?: string[]; putBack?: string[]; leftChanged?: { files: string[]; why?: string }; putBackFailed?: string[] };
}

/**
 * The browser line on the no-write walk (review 7, H1): its forms were never sent and what saves was not pressed, so
 * the certificate never says «its buttons and forms were used» there.
 */
const BROWSER_NO_WRITE: Record<'ar' | 'en', string> = {
    ar: 'فُتح المشروع في متصفح حقيقي على شاشة الحاسوب والجوال، وقُرئت صفحاته وروابطه دون الضغط على ما يحفظ بيانات.',
    en: 'The project was opened in a real browser at desktop and phone sizes; its pages and links were read, and nothing that saves data was pressed.',
};

/**
 * The certificate's line after the browser check (design v13.3 §9; six languages in owner-lines13.json, the
 * certificate itself is written in Arabic or English): a private window that reached only his app (path 1), as
 * always with his data put back (2T), or his live app with nothing saved in it (path 3).
 */
const QA_CERT_LINES: Record<'ar' | 'en' | 'es' | 'fr' | 'de' | 'ru', { certPrivate: string; certAsBefore: string; certAsBeforeLeft: string; certAsBeforeFailed: string; certNoWrite: string; certNoWriteChanged: string; certPutBack: string; notTried: string }> = {
    ar: {
        certPrivate: 'جُرّب في المتصفح في نافذة خاصة لم تصل إلا إلى عنوان تطبيقك.',
        certAsBefore: 'جُرّب في المتصفح على تطبيقك كما يجري دائمًا، ثم أُعيدت ملفات بياناته كما من قبل.',
        certAsBeforeLeft: "جُرّب في المتصفح على تطبيقك كما يجري دائمًا؛ وتغيّرت أثناءها ملفات بيانات فيه ولم تُعَد، لأن خادم تطبيقك لم يتوقف: {files}.",
        certAsBeforeFailed: "جُرّب في المتصفح على تطبيقك كما يجري دائمًا؛ وبعدها لم يُعَد بعض ملفات بياناته: {files}.",
        certNoWrite: 'جُرّب في المتصفح على تطبيقك الحي دون حفظ شيء فيه؛ لم يُجرَّب {n} مما يحفظ بيانات.',
        certNoWriteChanged: 'جُرّب في المتصفح على تطبيقك الحي دون الضغط على ما يحفظ؛ لم يُجرَّب {n} مما يحفظ بيانات.',
        certPutBack: 'ملفات بيانات تغيّرت أثناء الفحوص وأُعيدت كما كانت قبلها: {files}.',
        notTried: 'لم يُجرَّب',
    },
    en: {
        certPrivate: 'Tried in the browser, in a private window that reached only your app\'s address.',
        certAsBefore: 'Tried in the browser on your app as always, then its data files were put back as before.',
        certAsBeforeLeft: "Tried in the browser on your app as always; data files it changed were not put back, because your app's server did not stop: {files}.",
        certAsBeforeFailed: "Tried in the browser on your app as always; afterwards some of its data files could not be put back: {files}.",
        certNoWrite: 'Tried in the browser on your live app without saving anything in it; {n} things that save data were not tried.',
        certNoWriteChanged: 'Tried in the browser on your live app without pressing what saves; {n} things that save data were not tried.',
        certPutBack: 'Data files that changed during the checks and were put back as they were before them: {files}.',
        notTried: 'not tried',
    },
    es: {
        certPrivate: 'Probado en el navegador, en una ventana privada que solo llegó a la dirección de tu aplicación.',
        certAsBefore: 'Probado en el navegador en tu aplicación como siempre; después sus archivos de datos se restauraron como antes.',
        certAsBeforeLeft: "Probado en el navegador en tu aplicación como siempre; los archivos de datos que cambió no se restauraron, porque el servidor de tu aplicación no se detuvo: {files}.",
        certAsBeforeFailed: "Probado en el navegador en tu aplicación como siempre; después algunos de sus archivos de datos no se pudieron restaurar: {files}.",
        certNoWrite: 'Probado en el navegador en tu aplicación real sin guardar nada; {n} cosas que guardan datos no se probaron.',
        certNoWriteChanged: 'Probado en el navegador en tu aplicación real sin pulsar lo que guarda; {n} cosas que guardan datos no se probaron.',
        certPutBack: 'Archivos de datos que cambiaron durante las comprobaciones y se restauraron como estaban antes: {files}.',
        notTried: 'sin probar',
    },
    fr: {
        certPrivate: 'Essayé dans le navigateur, dans une fenêtre privée qui n\'a joint que l\'adresse de votre application.',
        certAsBefore: 'Essayé dans le navigateur sur votre application comme toujours, puis ses fichiers de données ont été remis comme avant.',
        certAsBeforeLeft: "Essayé dans le navigateur sur votre application comme toujours ; les fichiers de données modifiés n'ont pas été remis, car le serveur de votre application ne s'est pas arrêté : {files}.",
        certAsBeforeFailed: "Essayé dans le navigateur sur votre application comme toujours ; ensuite certains de ses fichiers de données n'ont pas pu être remis : {files}.",
        certNoWrite: 'Essayé dans le navigateur sur votre application réelle sans rien y enregistrer ; {n} éléments qui enregistrent des données n\'ont pas été essayés.',
        certNoWriteChanged: 'Essayé dans le navigateur sur votre application réelle sans appuyer sur ce qui enregistre ; {n} éléments qui enregistrent des données n\'ont pas été essayés.',
        certPutBack: 'Fichiers de données qui ont changé pendant les vérifications et ont été remis comme avant : {files}.',
        notTried: 'non essayé',
    },
    de: {
        certPrivate: 'Im Browser ausprobiert, in einem privaten Fenster, das nur die Adresse Ihrer App erreichte.',
        certAsBefore: 'Im Browser wie immer auf Ihrer App ausprobiert, danach wurden ihre Datendateien wie bisher zurückgelegt.',
        certAsBeforeLeft: "Im Browser wie immer auf Ihrer App ausprobiert; geänderte Datendateien wurden nicht zurückgelegt, weil der Server Ihrer App nicht anhielt: {files}.",
        certAsBeforeFailed: "Im Browser wie immer auf Ihrer App ausprobiert; danach konnten einige ihrer Datendateien nicht zurückgelegt werden: {files}.",
        certNoWrite: 'Im Browser auf Ihrer echten App ausprobiert, ohne etwas zu speichern; {n} Dinge, die Daten speichern, wurden nicht ausprobiert.',
        certNoWriteChanged: 'Im Browser auf Ihrer echten App ausprobiert, ohne zu drücken, was speichert; {n} Dinge, die Daten speichern, wurden nicht ausprobiert.',
        certPutBack: 'Datendateien, die sich während der Prüfungen änderten und wie vorher zurückgelegt wurden: {files}.',
        notTried: 'nicht ausprobiert',
    },
    ru: {
        certPrivate: 'Опробовано в браузере, в приватном окне, обращавшемся только к адресу вашего приложения.',
        certAsBefore: 'Опробовано в браузере на вашем приложении как обычно, затем файлы данных возвращены, как раньше.',
        certAsBeforeLeft: "Опробовано в браузере на вашем приложении как обычно; изменённые файлы данных не возвращены, потому что сервер приложения не остановился: {files}.",
        certAsBeforeFailed: "Опробовано в браузере на вашем приложении как обычно; затем некоторые файлы данных не удалось вернуть: {files}.",
        certNoWrite: 'Опробовано в браузере на рабочем приложении без сохранения данных; {n} действий, сохраняющих данные, не опробовано.',
        certNoWriteChanged: 'Опробовано в браузере на рабочем приложении, не нажимая то, что сохраняет; {n} действий, сохраняющих данные, не опробовано.',
        certPutBack: 'Файлы данных, изменившиеся во время проверок и возвращённые в прежнее состояние: {files}.',
        notTried: 'не опробовано',
    },
};

/** The certificate's line for the way the browser check treated his data, in the given language ('' when none). */
export function qaCertificateLine(qaPath: CertificateInput['qaPath'], language: string): string {
    if (!qaPath) return '';
    const lang = String(language || '').toLowerCase().slice(0, 2) as keyof typeof QA_CERT_LINES;
    const w = QA_CERT_LINES[lang] || QA_CERT_LINES.en;
    if (qaPath.path === 'private-live') return w.certPrivate;
    //  M2 (review 8): «put back as before» only when it is true — files left changed, or not put back, are named.
    if (qaPath.path === '2t') {
        const list = (xs: string[]) => xs.slice(0, 6).join(lang === 'ar' ? '، ' : ', ') + (xs.length > 6 ? '…' : '');
        if (qaPath.leftChanged?.files?.length && qaPath.leftChanged.why === 'serverRunning') return w.certAsBeforeLeft.replace('{files}', list(qaPath.leftChanged.files));
        if (qaPath.putBackFailed?.length) return w.certAsBeforeFailed.replace('{files}', list(qaPath.putBackFailed));
        return w.certAsBefore;
    }
    const n = String((qaPath.notTried || []).length);
    if (qaPath.path === 'no-write') return (qaPath.putBack?.length ? w.certNoWriteChanged : w.certNoWrite).replace('{n}', n);
    return '';
}

/** The certificate's line naming the data files the checks changed and put back (review 7, B1): '' when none. */
export function qaCertificatePutBackLine(qaPath: CertificateInput['qaPath'], language: string): string {
    const files = (qaPath?.putBack || []).filter(Boolean);
    if (!files.length) return '';
    const lang = String(language || '').toLowerCase().slice(0, 2) as keyof typeof QA_CERT_LINES;
    const w = QA_CERT_LINES[lang] || QA_CERT_LINES.en;
    return w.certPutBack.replace('{files}', files.slice(0, 6).join(lang === 'ar' ? '، ' : ', ') + (files.length > 6 ? '…' : ''));
}

/**
 * ⛔ WHAT THE BROWSER CHECK TRIED, SAID IN NUMBERS.
 *
 * The owner, 2026-11-10, after watching it: «حاسس انه فحص فاشل». «فُتح المشروع في
 * متصفح حقيقي وجُرّبت أزراره ونماذجه» says nothing a reader can weigh. The
 * certificate now says how many screens were walked, how many controls were
 * pressed one by one, how many forms and fields were filled and how many
 * wrong and valid values were tried in them, and how many controls were
 * checked within reach at the tablet and phone widths. Only measured counts;
 * a count of zero is not said.
 */
export interface QaCoverage { screens: number; pressed: number; formsFilled: number; fieldsFilled: number; cases: number; casesSent: number; reached: number; jobs?: number; product?: { ar: string; en: string }; journeys?: Array<{ ar: string; en: string; proven: boolean }> }

/** The counts of a browser audit (app-audit AppAudit), or nothing when it walked nothing. */
export function qaCoverageOf(audit: any): QaCoverage | undefined {
    if (!audit || audit.skipped) return undefined;
    const n = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
    const c: QaCoverage = {
        screens: Array.isArray(audit.routes) ? new Set(audit.routes).size : 0,
        pressed: n(audit.pressed), formsFilled: n(audit.formsFilled), fieldsFilled: n(audit.fieldsFilled),
        cases: n(audit.fieldCasesTried), casesSent: n(audit.fieldCasesSubmitted), reached: n(audit.reachedAtOtherWidths),
        ...(n(audit.intentsMet) ? { jobs: n(audit.intentsMet) } : {}),
        ...(audit.product && audit.product.kind !== 'other' ? { product: { ar: String(audit.product.ar), en: String(audit.product.en) } } : {}),
        ...(Array.isArray(audit.journeys) && audit.journeys.length ? { journeys: audit.journeys.map((j: any) => ({ ar: String(j.ar), en: String(j.en), proven: !!j.proven })) } : {}),
    };
    return c.screens || c.pressed || c.formsFilled ? c : undefined;
}

/** One sentence of what was tried, in the interface's language. */
/**
 * A number and what it counts, as Arabic counts them: «شاشة واحدة», «شاشتين»,
 * «3 شاشات» (3–10 take the plural), «12 شاشة» (11–99 the singular), «100 شاشة».
 * The live check, 2026-11-10: «مرّ على 1 شاشة، وضغط 7 زراً، وملأ 1 نموذجاً (4 حقلاً)»
 * — the owner reads Arabic, and a sentence that counts wrongly reads as careless.
 */
export function arabicCount(n: number, w: { one: string; two: string; plural: string; single: string; hundred?: string }): string {
    if (n === 1) return w.one;
    if (n === 2) return w.two;
    const r = n % 100;
    if (n >= 100 && r <= 2) return `${n} ${w.hundred || w.single}`;
    const k = n >= 100 ? r : n;
    return k >= 3 && k <= 10 ? `${n} ${w.plural}` : `${n} ${w.single}`;
}

const AR_SCREEN = { one: 'شاشة واحدة', two: 'شاشتين', plural: 'شاشات', single: 'شاشة', hundred: 'شاشة' };
const AR_ELEMENT = { one: 'عنصراً واحداً', two: 'عنصرين', plural: 'عناصر', single: 'عنصراً', hundred: 'عنصر' };
const AR_FORM = { one: 'نموذجاً واحداً', two: 'نموذجين', plural: 'نماذج', single: 'نموذجاً', hundred: 'نموذج' };
const AR_FIELD = { one: 'حقل واحد', two: 'حقلان', plural: 'حقول', single: 'حقلاً', hundred: 'حقل' };
const AR_VALUE = { one: 'قيمة واحدة', two: 'قيمتين', plural: 'قيم', single: 'قيمة', hundred: 'قيمة' };
const AR_BUTTON = { one: 'زراً واحداً', two: 'زرّين', plural: 'أزرار', single: 'زراً', hundred: 'زر' };

export function qaCoverageLine(c: QaCoverage | undefined, language: string): string {
    if (!c) return '';
    const ar = wordsFor(language) === INSTRUMENTS.ar;
    const parts: string[] = [];
    if (ar) {
        if (c.screens) parts.push(`مرّ على ${arabicCount(c.screens, AR_SCREEN)}`);
        if (c.pressed) parts.push(`وضغط ${arabicCount(c.pressed, AR_ELEMENT)} واحداً تلو الآخر`);
        if (c.formsFilled) parts.push(`وملأ ${arabicCount(c.formsFilled, AR_FORM)} (${arabicCount(c.fieldsFilled, AR_FIELD)})`);
        const sent = c.casesSent === 1 ? 'واحدة' : c.casesSent === 2 ? 'اثنتين' : String(c.casesSent);
        if (c.cases) parts.push(`وجرّب فيها ${arabicCount(c.cases, AR_VALUE)} بين خاطئة وصحيحة${c.casesSent ? `، وأرسل ${sent} منها مع النموذج ليرى ردّ الخادم` : ''}`);
        if (c.reached) parts.push(`وتحقّق من أن ${arabicCount(c.reached, AR_BUTTON)} في متناول اليد على شاشتي اللوحي والجوال`);
        if (c.jobs) parts.push(c.jobs === 1 ? 'وتأكّد أن زراً واحداً أدّى عمله بالضبط' : `وتأكّد أن كلاً من ${arabicCount(c.jobs, AR_BUTTON)} أدّى عمله بالضبط`);
        const journeys = (c.journeys || []).map(j => `${j.proven ? '✓' : '✗'} ${j.ar}`).join('، ');
        const tail = c.product && journeys ? ` ورحلات ${c.product.ar}: ${journeys}.` : '';
        return parts.length ? `جرّب جو في المتصفح: ${parts.join('، ')}.${tail}` : '';
    }
    if (c.screens) parts.push(`walked ${c.screens} screen(s)`);
    if (c.pressed) parts.push(`pressed ${c.pressed} control(s) one by one`);
    if (c.formsFilled) parts.push(`filled ${c.formsFilled} form(s) (${c.fieldsFilled} field(s))`);
    if (c.cases) parts.push(`tried ${c.cases} wrong and valid value(s) in them${c.casesSent ? `, ${c.casesSent} sent with the form to hear the server` : ''}`);
    if (c.reached) parts.push(`checked ${c.reached} control(s) within reach at tablet and phone width`);
    if (c.jobs) parts.push(`confirmed ${c.jobs} control(s) did exactly their job`);
    const journeys = (c.journeys || []).map(j => `${j.proven ? '✓' : '✗'} ${j.en}`).join(', ');
    const tail = c.product && journeys ? ` Journeys of ${c.product.en}: ${journeys}.` : '';
    return parts.length ? `In the browser Joe ${parts.join(', ')}.${tail}` : '';
}

export const CERTIFICATE_FILE = 'JOE-DELIVERY.md';

/**
 * Where the browser check keeps the landing view it saw, on a desktop and on
 * a phone. Cleared when a run starts (clearDeliveryProof), so a picture in
 * the certificate is always one this run's check took.
 */
export function deliveryProofPaths(stateDir: string): { desktop: string; phone: string } {
    const dir = path.join(stateDir, 'delivery');
    return { desktop: path.join(dir, 'desktop.jpg'), phone: path.join(dir, 'phone.jpg') };
}

/**
 * …and the last certificate goes with them: once a run starts changing the
 * project it no longer describes it, and a judge reading the project must
 * never take Joe's own earlier «✅» for evidence. A verified run writes it
 * anew; «تراجع» puts back the version it described, certificate included.
 */
export function clearDeliveryProof(projectDir: string): void {
    try { fs.rmSync(path.join(projectDir, '.joe', 'delivery'), { recursive: true, force: true }); } catch { /* nothing kept */ }
    try { fs.rmSync(path.join(projectDir, CERTIFICATE_FILE), { force: true }); } catch { /* none written */ }
}

/** The proof pictures this run's check took, relative to the project, when they exist. */
export function deliveryProof(projectDir: string): { desktop?: string; phone?: string } {
    const kept = deliveryProofPaths(path.join(projectDir, '.joe'));
    const rel = (file: string) => path.relative(projectDir, file).split(path.sep).join('/');
    return {
        ...(fs.existsSync(kept.desktop) ? { desktop: rel(kept.desktop) } : {}),
        ...(fs.existsSync(kept.phone) ? { phone: rel(kept.phone) } : {}),
    };
}

export function deliveryCertificate(input: CertificateInput): string {
    const ar = wordsFor(input.language) === INSTRUMENTS.ar;
    const words = wordsFor(input.language);
    const when = new Date(input.at ?? Date.now()).toISOString().replace('T', ' ').slice(0, 16);
    const out: string[] = [];
    if (ar) out.push('<div dir="rtl">', '');
    out.push(ar ? '# شهادة تسليم من جو' : '# Joe delivery certificate', '');
    // After a change the project is still what was first asked for: say that,
    // then each change since, this one last (2026-11-05: the certificate of
    // «أضف وضعاً ليلياً» no longer said the project was a counter page).
    const said = (text: string) => String(text || '').trim().replace(/\s*\n+\s*/g, ' ');
    const earlier = (input.earlier || []).map(said).filter(Boolean);
    const first = earlier.length ? earlier[0] : String(input.request || '').trim();
    out.push(ar ? '## ما طلبتَه' : '## What you asked for', '', `> ${first.replace(/\n+/g, '\n> ')}`, '');
    if (earlier.length) {
        const changes = [...earlier.slice(1), `**${said(input.request)}** ${ar ? '← هذا التسليم' : '← this delivery'}`];
        out.push(ar ? '## التعديلات بعده' : '## Changes since', '', ...changes.map((c, i) => `${i + 1}. ${c}`), '');
    }
    const summary = String(input.summary || '').trim();
    if (summary) out.push(ar ? '## ما بُني' : '## What was built', '', summary, '');
    out.push(ar ? '## كيف تحقّق جو منه' : '## How Joe proved it', '');
    for (const id of input.passed) {
        //  On the no-write walk no form was sent: the browser line says what was really done (H1).
        const whole = id === 'browser' && input.qaPath?.path === 'no-write' ? BROWSER_NO_WRITE[ar ? 'ar' : 'en'] : words[id]?.whole || id;
        out.push(`- ✅ **${words[id]?.short || id}**: ${whole}`);
        //  How the browser check treated his data on a change run (design v13.3 §9), right after its line.
        const how = id === 'browser' ? qaCertificateLine(input.qaPath, ar ? 'ar' : 'en') : '';
        if (how) out.push(`- 🔒 ${how}`);
        const back = id === 'browser' ? qaCertificatePutBackLine(input.qaPath, ar ? 'ar' : 'en') : '';
        if (back) out.push(`- 🔒 ${back}`);
    }
    const who = String(input.signedInAs || '').trim();
    if (who && input.passed.includes('browser')) {
        out.push(ar
            ? `- ✅ **الدخول**: سجّل جو الدخول بحساب التجربة «${who}» من نموذج الدخول نفسه، وجرّب الشاشات التي خلفه.`
            : `- ✅ **sign-in**: Joe signed in with the demo account "${who}" through the product's own sign-in form, and tested the screens behind it.`);
    }
    const tried = input.passed.includes('browser') ? qaCoverageLine(input.qaCoverage, input.language) : '';
    if (tried) out.push(`- 🔎 ${tried}`);
    if (input.passed.includes('roles') && (input.roles || []).length) {
        out.push('', ar ? 'ما يراه كل دور:' : 'What each role sees:');
        for (const r of input.roles || []) out.push(`  - **${r.role}**: ${r.screens.join(ar ? '، ' : ', ') || (ar ? 'لا شاشات' : 'no screens')}`);
    }
    out.push('');
    //  On the no-write walk, what was not tried because it saves data is not proven either (design v13.3 §9).
    const notTried = input.qaPath?.path === 'no-write' ? (input.qaPath.notTried || []).filter(Boolean) : [];
    const unproven = [...(input.unproven || []).filter(Boolean), ...notTried.map(l => `${QA_CERT_LINES[ar ? 'ar' : 'en'].notTried}: ${l}`)];
    if (unproven.length) {
        out.push(ar ? '## ما لم يثبت بعد' : '## Not proven yet', '');
        for (const u of unproven) out.push(`- ⚠️ ${u}`);
        out.push('');
    }
    const shots = input.screenshots || {};
    if (shots.desktop || shots.phone) {
        out.push(ar ? '## كما رآه جو في المتصفح' : '## As Joe saw it in the browser', '');
        if (shots.desktop) out.push(`![${ar ? 'على الحاسوب' : 'desktop'}](${shots.desktop})`, '');
        if (shots.phone) out.push(`![${ar ? 'على الجوال' : 'phone'}](${shots.phone})`, '');
    }
    const run = String(input.howToRun || '').trim();
    if (run) out.push(ar ? '## طريقة التشغيل' : '## How to run it', '', '```', run, '```', '');
    const facts = [
        input.liveUrl && (ar ? `- المعاينة الحية: ${input.liveUrl}` : `- Live preview: ${input.liveUrl}`),
        durationText(input.durationMs, input.language) && (ar ? `- المدة: ${durationText(input.durationMs, input.language)}` : `- Time: ${durationText(input.durationMs, input.language)}`),
        costText(input.costUsd) && (ar ? `- التكلفة: ${costText(input.costUsd)}` : `- Cost: ${costText(input.costUsd)}`),
        input.model && (ar ? `- النموذج: ${input.model}` : `- Model: ${input.model}`),
        ar ? `- التاريخ: ${when}` : `- Date: ${when}`,
    ].filter(Boolean) as string[];
    out.push(ar ? '## تفاصيل التشغيل' : '## Run details', '', ...facts, '');
    out.push(ar
        ? '> إن طلبتَ تعديلاً لاحقاً، يحفظ جو نسخة من المشروع قبل أن يلمسه: قل «تراجع» لتعيده كما كان.'
        : '> If you ask for a change later, Joe keeps a copy of the project before touching it: say "undo" to put it back.');
    if (ar) out.push('', '</div>');
    return out.join('\n') + '\n';
}

/** Write the certificate into the project. Never throws: the delivery stands without it. */
export function writeDeliveryCertificate(projectDir: string, input: CertificateInput): string | null {
    try {
        const file = path.join(projectDir, CERTIFICATE_FILE);
        fs.writeFileSync(file, deliveryCertificate(input), 'utf8');
        return file;
    } catch {
        return null;
    }
}
