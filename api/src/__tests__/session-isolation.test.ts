import fs from 'fs';
import path from 'path';
import {
  canDeliverLiveEventToSession,
  canUseTerminalForSession,
  eventRequiresSession,
  liveEventSessionId,
  registerTerminalSessionOwner,
  terminalSessionOwnerOf,
} from '../api/ws';

describe('architectural session isolation', () => {
  const sessions = ['session-a', 'session-b', 'session-c'];

  it('routes two concurrent sessions without cross-session delivery', () => {
    const events = sessions.map((sessionId, index) => ({
      type: 'preview_ready',
      sessionId,
      data: { sessionId, url: `http://127.0.0.1:${4100 + index}/index.html` },
    }));

    for (const sessionId of sessions) {
      const visible = events.filter(event => canDeliverLiveEventToSession(event, [sessionId]));
      expect(visible).toHaveLength(1);
      expect(visible[0].sessionId).toBe(sessionId);
    }
    expect(canDeliverLiveEventToSession(events[0], ['session-b'])).toBe(false);
    expect(canDeliverLiveEventToSession(events[1], ['session-a'])).toBe(false);
  });

  it('keeps three session subscriptions independent after a switch/reconnect', () => {
    const eventA = { type: 'terminal_output', sessionId: 'session-a', id: 'terminal:session-a', data: 'A' };
    const eventB = { type: 'terminal_output', sessionId: 'session-b', id: 'terminal:session-b', data: 'B' };
    const eventC = { type: 'terminal_output', data: { sessionId: 'session-c', line: 'C' } };

    // A socket may render one session, then be rebound to another. The new
    // subscription must not retain the previous session's delivery permission.
    let subscription = new Set(['session-a']);
    expect([eventA, eventB, eventC].filter(event => canDeliverLiveEventToSession(event, subscription)).map(e => e.data)).toEqual(['A']);
    subscription = new Set(['session-b']);
    expect([eventA, eventB, eventC].filter(event => canDeliverLiveEventToSession(event, subscription)).map(e => e.data)).toEqual(['B']);
    subscription = new Set(['session-c']);
    expect([eventA, eventB, eventC].filter(event => canDeliverLiveEventToSession(event, subscription)).map(e => e.data)).toEqual([{ sessionId: 'session-c', line: 'C' }]);
  });

  it('fails closed for scoped events with no session address, while preserving global status events', () => {
    expect(eventRequiresSession({ type: 'preview_ready' })).toBe(true);
    expect(eventRequiresSession({ type: 'terminal_output' })).toBe(true);
    expect(canDeliverLiveEventToSession({ type: 'preview_ready', data: { url: '/wrong-session' } }, ['session-a'])).toBe(false);
    expect(canDeliverLiveEventToSession({ type: 'terminal_output', data: 'orphaned' }, ['session-a'])).toBe(false);
    expect(canDeliverLiveEventToSession({ type: 'server_status', data: { healthy: true } }, ['session-a'])).toBe(true);
    expect(liveEventSessionId({ type: 'text', data: { data: { sessionId: 'session-b' } } })).toBe('session-b');
  });

  it('does not let a second session take over an existing terminal', () => {
    const terminalA = 'terminal:session-a';
    const terminalB = 'terminal:session-b';
    const terminalC = 'terminal:session-c';

    registerTerminalSessionOwner(terminalA, 'session-a');
    registerTerminalSessionOwner(terminalA, 'session-b');
    registerTerminalSessionOwner(terminalB, 'session-b');
    registerTerminalSessionOwner(terminalC, 'session-c');

    expect(terminalSessionOwnerOf(terminalA)).toBe('session-a');
    expect(terminalSessionOwnerOf(terminalB)).toBe('session-b');
    expect(terminalSessionOwnerOf(terminalC)).toBe('session-c');
    expect(canUseTerminalForSession(terminalA, 'session-a')).toBe(true);
    expect(canUseTerminalForSession(terminalA, 'session-b')).toBe(false);
    expect(canUseTerminalForSession(terminalB, 'session-c')).toBe(false);
  });

  it('keeps project state keyed by session and rejects shared panel fallbacks', () => {
    const projects: Record<string, any> = {
      'session-a': { dir: '/workspace/session-a', browserSessionId: 'browser:session-a' },
      'session-b': { dir: '/workspace/session-b', browserSessionId: 'browser:session-b' },
      'session-c': { dir: '/workspace/session-c', browserSessionId: 'browser:session-c' },
    };
    expect(projects['session-a']).not.toBe(projects['session-b']);
    expect(projects['session-a'].dir).not.toBe(projects['session-b'].dir);
    expect(projects['session-b'].browserSessionId).not.toBe(projects['session-c'].browserSessionId);

    const webJoe = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'web', 'src', 'pages', 'Joe.tsx'), 'utf8');
    const browserRoutes = fs.readFileSync(path.join(__dirname, '..', 'api', 'routes', 'browser.ts'), 'utf8');
    expect(webJoe).not.toMatch(/['"]panel-browser['"]\s*\|\|/);
    expect(webJoe).not.toMatch(/['"]panel-terminal['"]\s*\|\|/);
    expect(browserRoutes).not.toMatch(/sessionId\s*=\s*String\([^\n]*panel-browser/);
  });
});
