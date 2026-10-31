import { words, normalise } from '../language/arabic';
import { stripArabicDiacritics } from '../orchestrator/promptNormalizer';

/** Opt-in classification budget; larger requests retain normal planning without truncation. */
export const CAPTURE_INQUIRY_CLASSIFICATION_LIMIT = 4000;

/** Classify a question about saved capture metadata, never execute or grant access. */
export function isCaptureResultInquiry(value: unknown): boolean {
    if (typeof value !== 'string' || !value.trim() || value.length > CAPTURE_INQUIRY_CLASSIFICATION_LIMIT) return false;
    const boundary = value.search(/\n+\[(?:ATTACHED FILES|STANDING USER INSTRUCTIONS|RESPONSE LANGUAGE|ENGINEERING DISCIPLINE)/i);
    const request = stripArabicDiacritics((boundary >= 0 ? value.slice(0, boundary) : value).normalize('NFKC'))
        .replace(/```[\s\S]*?```|```[\s\S]*$|`[^`]*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|“[^”\n]*”|‘[^’\n]*’|«[^»\n]*»/g, ' ');
    if (/https?:\/\//i.test(request)) return false;
    const capture = /\bscreenshot\b|captured[ -]image|(?:لقطة|لقطات)\s+(?:شاشة|الشاشة)|الصورة\s+المحفوظة/i.test(request);
    const reference = /\b(?:preceding|previous|saved|result)\b|last\s+capture|السابق|المحفوظ|نتيج/i.test(request);
    const fact = /\b(?:filename|file\s*name|dimensions|pixels|exist|exists|available|is\s+there|do\s+we\s+have)\b|اسم\s+(?:الملف|ملف)|أبعاد|ابعاد|بكسل|هل\s+(?:توجد|يوجد|هناك)|متاح/i.test(request);
    const arabicInquiryWords = new Set(['ما', 'هل', 'اذكر', 'أخبرني', 'أعطني'].map(normalise));
    const inquiry = /\b(?:what|which|whether|is\s+there|do\s+we\s+have|report|tell)\b/i.test(request)
        || words(request).some(word => arabicInquiryWords.has(word));
    if (!capture || !reference || !fact || !inquiry) return false;
    // An affirmative action anywhere keeps the normal action/planning route.
    // Explicit negative clauses do not become commands from their tool nouns.
    const clauses = request.split(/[.!?؟;\n،,]+|(?<![\p{L}\p{N}_])(?:ولكن|لكن|but|however|then|and|ثم)(?![\p{L}\p{N}_])/iu);
    return !clauses.some(clause => {
        const text = clause.trim().replace(/^(?:و|and\s+)/i, '').trim();
        if (/^(?:لا\s|لاتفتح|(?:دون|بدون)\s|do\s+not\b|don't\b|never\b|without\b)/i.test(text)) return false;
        const politeAction = /(?:can|could|would|will)\s+you\s+(?:open|capture|take|use|run)|هل\s+(?:يمكنك|تستطيع|تقدر)\s+(?:أن\s+)?(?:فتح|التقاط|استخدام|تشغيل)/i.test(text);
        if (!politeAction && /^(?:(?:بالعربية|بالإنجليزية)\s+فقط:\s*)?(?:what|which|whether|is\s+there|do\s+we\s+have|هل|ما)(?:\s|$)/i.test(text)) return false;
        return /\b(?:take|capture|open|navigate|create|write|edit|modify|delete|run|install|build|use|invoke|call|execute|recreate|repeat|refresh|generate|save|download|upload|browse)\b|(?:^|[\s:])(?:استخدم|استعمل|أعد|اعد|احفظ|ارفع|استدع|ابن|ابني|طور|التقط|التقاط|خذ|افتح|فتح|أنشئ|انشئ|اكتب|عدّل|عدل|احذف|شغّل|شغل|نفّذ|نفذ)(?:[\s؟]|$)/i.test(text);
    });
}
