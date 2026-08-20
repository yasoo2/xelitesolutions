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
    || event?.ts
    || event?.data?.ts;
  if (id === undefined || id === null || id === '') return '';
  const sid = panelEventSessionId(event);
  const type = String(event?.type || 'event');
  return `${sid}:${type}:${String(id)}`;
}
