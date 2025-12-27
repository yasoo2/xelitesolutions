type PendingToolContext = {
  runId: string;
  name: string;
  input: any;
};

const sessionSecrets = new Map<string, Map<string, string>>();
const pendingToolBySession = new Map<string, PendingToolContext>();

export function setSessionSecret(sessionId: string, key: string, value: string) {
  const sid = String(sessionId || '').trim();
  const k = String(key || '').trim();
  if (!sid || !k) return;
  let bucket = sessionSecrets.get(sid);
  if (!bucket) {
    bucket = new Map<string, string>();
    sessionSecrets.set(sid, bucket);
  }
  bucket.set(k, value);
}

export function getSessionSecret(sessionId: string, key: string): string | null {
  const sid = String(sessionId || '').trim();
  const k = String(key || '').trim();
  if (!sid || !k) return null;
  return sessionSecrets.get(sid)?.get(k) ?? null;
}

export function clearSessionSecrets(sessionId: string) {
  const sid = String(sessionId || '').trim();
  if (!sid) return;
  sessionSecrets.delete(sid);
}

export function setPendingTool(sessionId: string, ctx: PendingToolContext) {
  const sid = String(sessionId || '').trim();
  if (!sid) return;
  pendingToolBySession.set(sid, ctx);
}

export function popPendingTool(sessionId: string): PendingToolContext | null {
  const sid = String(sessionId || '').trim();
  if (!sid) return null;
  const ctx = pendingToolBySession.get(sid) || null;
  pendingToolBySession.delete(sid);
  return ctx;
}
