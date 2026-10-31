export function panelEventSessionId(event: any): string {
  const value = event?.sessionId
    || event?.data?.sessionId
    || event?.data?.data?.sessionId;
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The server may fan the same session-owned event through more than one
 * envelope. `panelEventKey` deliberately ignores the stream id (`panel-terminal`)
 * because that id identifies the channel, not an individual output line.
 */
export function panelEventKey(event: any): string {
  const id = event?.eventId
    || event?.messageId
    || event?.actionId
    || event?.seq
    || event?.data?.eventId
    || event?.data?.messageId
    || event?.data?.actionId
    || event?.data?.seq
    || event?.data?.data?.eventId
    || event?.data?.data?.messageId
    || event?.data?.data?.actionId
    || event?.data?.data?.seq
    || event?.ts
    || event?.data?.ts
    || event?.data?.data?.ts;
  if (id === undefined || id === null || id === '') return '';
  const sid = panelEventSessionId(event);
  const type = String(event?.type || event?.data?.type || event?.data?.data?.type || 'event');
  return `${sid}:${type}:${String(id)}`;
}

export function acceptPanelEventOnce(
  event: any,
  seen: Map<string, Set<string>>,
  maxPerSession = 1000,
): boolean {
  const key = panelEventKey(event);
  if (!key) return true;
  const sid = panelEventSessionId(event) || '__unscoped__';
  const keys = seen.get(sid) || new Set<string>();
  if (keys.has(key)) return false;
  keys.add(key);
  if (keys.size > maxPerSession) {
    const oldest = keys.values().next().value;
    if (oldest) keys.delete(oldest);
  }
  seen.set(sid, keys);
  return true;
}
