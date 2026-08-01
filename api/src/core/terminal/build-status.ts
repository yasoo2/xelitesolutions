/**
 * Structured build-status events, derived from the REAL log lines at the
 * moment they are pushed — the same interception point that streams the
 * terminal. Nothing here invents progress: a stage is reported because the
 * line that proves it just happened. No timers, no percentages pulled from
 * thin air — if the build stalls, the strip stalls with it, which is the
 * truth.
 */

export interface BuildStatus {
    stage: string;
    /** Arabic label for the strip (the UI is Arabic-first). */
    labelAr: string;
    /** English label, for logs and non-Arabic locales. */
    label: string;
    /** The raw log line that produced this status — shown as the detail row. */
    detail: string;
    /** Audit score when the line carried one. */
    score?: number;
    /** Section counter when the line was a section event. */
    section?: { index: number; id: string };
    /** True when this stage ends the build (the preview is about to open). */
    terminal?: boolean;
}

export function statusFromLine(line: string): BuildStatus | null {
    const l = String(line || '');

    const sec = l.match(/^section (\d+) \(([^)]+)\):/);
    if (sec) {
        const index = parseInt(sec[1], 10);
        return {
            stage: 'sections', detail: l,
            section: { index, id: sec[2] },
            labelAr: `يكتب الأقسام — القسم ${index} (${sec[2]})`,
            label: `Writing sections — section ${index} (${sec[2]})`,
        };
    }
    if (/^section-wise build:/.test(l)) {
        return { stage: 'assemble', detail: l, labelAr: 'يجمّع الصفحة من أقسامها', label: 'Assembling the page' };
    }
    if (/^blueprint/.test(l)) {
        return { stage: 'planning', detail: l, labelAr: 'يخطط بنية الصفحة', label: 'Planning the page' };
    }
    if (/^reference /.test(l)) {
        return { stage: 'reference', detail: l, labelAr: 'يقرأ المرجع', label: 'Reading the reference' };
    }
    if (/^images:|^image sourcing/.test(l)) {
        return { stage: 'images', detail: l, labelAr: 'يجهّز الصور الحقيقية', label: 'Sourcing real images' };
    }
    if (/^content/.test(l)) {
        return { stage: 'content', detail: l, labelAr: 'يفحص المحتوى ويصلحه', label: 'Checking content' };
    }
    const va = l.match(/^visual audit: (\d+)\/100/);
    if (va) {
        return { stage: 'audit-visual', detail: l, score: parseInt(va[1], 10), labelAr: 'الفحص البصري في متصفح حقيقي', label: 'Visual audit in a real browser' };
    }
    if (/^visual (audit|repair)/.test(l)) {
        return { stage: 'audit-visual', detail: l, labelAr: 'الفحص البصري في متصفح حقيقي', label: 'Visual audit in a real browser' };
    }
    const ba = l.match(/^behaviour audit: (\d+)\/100/);
    if (ba) {
        return { stage: 'audit-behaviour', detail: l, score: parseInt(ba[1], 10), labelAr: 'فحص التفاعل — ضغط حقيقي على الأزرار', label: 'Behaviour audit — controls really pressed' };
    }
    if (/^behaviour (audit|repair)/.test(l)) {
        return { stage: 'audit-behaviour', detail: l, labelAr: 'فحص التفاعل — ضغط حقيقي على الأزرار', label: 'Behaviour audit — controls really pressed' };
    }
    if (/^site links/.test(l)) {
        return { stage: 'links', detail: l, labelAr: 'يفحص الروابط بين الصفحات', label: 'Checking cross-page links' };
    }
    if (/^site (build|edit)/.test(l)) {
        return { stage: 'site', detail: l, labelAr: 'يعمل على صفحات الموقع', label: 'Working through the site pages' };
    }
    if (/^web_page_builder: (wrote|edited)/.test(l)) {
        return { stage: 'written', detail: l, terminal: true, labelAr: 'كُتب الملف — يفتح المعاينة', label: 'File written — opening preview' };
    }
    return null;
}
