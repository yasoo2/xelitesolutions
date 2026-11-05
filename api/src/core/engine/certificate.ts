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

export function clearDeliveryProof(projectDir: string): void {
    try { fs.rmSync(path.join(projectDir, '.joe', 'delivery'), { recursive: true, force: true }); } catch { /* nothing kept */ }
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
    out.push(ar ? '## ما طلبتَه' : '## What you asked for', '', `> ${String(input.request || '').trim().replace(/\n+/g, '\n> ')}`, '');
    const summary = String(input.summary || '').trim();
    if (summary) out.push(ar ? '## ما بُني' : '## What was built', '', summary, '');
    out.push(ar ? '## كيف تحقّق جو منه' : '## How Joe proved it', '');
    for (const id of input.passed) out.push(`- ✅ **${words[id]?.short || id}**: ${words[id]?.whole || id}`);
    out.push('');
    const unproven = (input.unproven || []).filter(Boolean);
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
