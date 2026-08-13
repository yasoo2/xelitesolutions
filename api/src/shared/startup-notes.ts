/**
 * ONE LINE INSTEAD OF FIVE COMPLAINTS.
 *
 * Joe's boot printed a separate warning for every cloud provider without a
 * key — Gemini, OpenAI, Cerebras, Mistral, DeepSeek — five lines telling the
 * user the same thing about a setup he chose on purpose: Joe runs on free and
 * local intelligence. Noise like that is not information; it teaches the eye
 * to skip the startup log, which is where the real problems appear.
 *
 * The absences are collected and reported once, quietly, after boot settles.
 */
const missing = new Map<string, string>();
let scheduled = false;

export function noteMissingKey(provider: string, envVar: string): void {
    if (missing.has(provider)) return;
    missing.set(provider, envVar);
    // Test imports intentionally construct provider objects without credentials.
    // A delayed cosmetic log after Jest has closed is neither runtime evidence
    // nor a valid test result; it turned passing suites into exit code 1.
    if (process.env.NODE_ENV === 'test') return;
    if (scheduled) return;
    scheduled = true;
    // After the boot sequence, so it lands as a summary rather than in the
    // middle of the things that matter.
    const t = setTimeout(() => {
        scheduled = false;
        if (!missing.size) return;
        const names = [...missing.keys()].join('، ');
        console.log(`[providers] بلا مفتاح: ${names} — جو يعمل على الذكاء المجاني والمحلي. أضف المفاتيح في api/.env متى شئت.`);
        missing.clear();
    }, 1200);
    t.unref?.();
}

/** For a test that wants the summary now rather than in a second. */
export function pendingMissingKeys(): string[] {
    return [...missing.keys()];
}
