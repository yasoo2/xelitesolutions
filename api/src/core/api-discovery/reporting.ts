export function guardUnverifiedBuilderClaims(message: string, verified: boolean, isAr: boolean): string {
    if (verified) return message;
    const replacement = isAr
        ? '⚠️ اكتملت فحوص المصدر، لكن قبول التشغيل الحي لم يُثبت بعد.'
        : '⚠️ Source-level checks completed, but live acceptance has not been proven.';
    return String(message || '')
        .replace(/^✅ Acceptance accepted:.*$/gmi, replacement)
        .replace(/^✅ حكم القبول:.*$/gmi, replacement);
}
