/**
 * «لا أريد رموزاً داخل اللوجز أو داخل دردشة جو» — the owner wants a formal,
 * grounded surface. The engine decorates its lines with pictographs (brains,
 * folders, gears); this strips emoji and dingbats at RENDER time only, so the
 * stored evidence keeps its original text for the raw receipts.
 *
 * Deliberately NOTHING else is touched: no whitespace collapsing and no
 * leading-character trimming, because the same function runs over markdown
 * with indented code blocks where every space is meaningful.
 */
const PICTOGRAPHS = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{2049}\u{203C}\u{2139}]️?[ ]?/gu;

export function stripPictographs(input: unknown): string {
    return String(input ?? '').replace(PICTOGRAPHS, '');
}
