// Independent root-cause arithmetic check for PHASE-CHECKPOINT-BOUND-001.
// Replicates EXACTLY the candidate's boundedRepairEvidence (PhaseExecutorTool.ts:792-796):
//   String(v).slice(0,max) THEN regex redaction (which can expand).
// Fixture string matches the new short-redacted-error case verbatim.
const fixture = 'token=a1 verification failed ' + 'x'.repeat(1000);
function boundedRepairEvidence(value, max = 6000) {
  return String(value ?? '').slice(0, max)
    .replace(/(authorization|bearer|token|password|secret|api[_ -]?key)\s*[:=]\s*[^\s,;]+/giu, '$1: [REDACTED]')
    .replace(/(gh[pousr]_[A-Za-z0-9_-]{16,})/gu, '[REDACTED]');
}
const helperOut = boundedRepairEvidence(fixture, 600);
console.log(JSON.stringify({
  helperOutLen: helperOut.length,          // pre-fix persisted length; RED claimed 609
  redactedMarker: helperOut.includes('[REDACTED]'),
  secretLeaked: helperOut.includes('a1 verification') && helperOut.includes('token=a1'),
  postFixLen: helperOut.slice(0, 600).length, // post-fix persisted length; must be <=600
  verdict: helperOut.length === 609 && helperOut.slice(0, 600).length === 600 ? 'MECHANISM_CONFIRMED' : 'MISMATCH'
}));
