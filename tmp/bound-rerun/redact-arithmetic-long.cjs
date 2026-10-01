// Companion to redact-arithmetic.cjs: long-token direction (original redacted-error case).
// token=fixture-private (21 chars incl. value) -> token: [REDACTED] (17 chars) = net -4 => 596.
// Explains the preserved review-optional.json exact-600 fixture failure (got 596).
const fixture = 'token=fixture-private verification failed ' + 'x'.repeat(1000);
function boundedRepairEvidence(value, max = 6000) {
  return String(value ?? '').slice(0, max)
    .replace(/(authorization|bearer|token|password|secret|api[_ -]?key)\s*[:=]\s*[^\s,;]+/giu, '$1: [REDACTED]')
    .replace(/(gh[pousr]_[A-Za-z0-9_-]{16,})/gu, '[REDACTED]');
}
const helperOut = boundedRepairEvidence(fixture, 600);
console.log(JSON.stringify({
  helperOutLen: helperOut.length,
  postFixLen: helperOut.slice(0, 600).length,
  verdict: helperOut.length === 596 && helperOut.slice(0, 600).length === 596 ? 'MECHANISM_CONFIRMED' : 'MISMATCH'
}));
