import type { Page } from 'playwright';
import { broadcastBrowserEvent, setBrowserActionObserver } from './wsHub';

type RecentDiagnostic = { kind: 'pageerror' | 'console' | 'requestfailed'; message: string; ts: number };

type BrowserTelemetry = {
  sessionId: string;
  page: Page;
  timer: NodeJS.Timeout | null;
  frameTimes: number[];
  jsErrors: number;
  consoleErrors: number;
  networkErrors: number;
  actionErrors: number;
  actionsInFlight: Set<string>;
  actionStarts: Map<string, number>;
  lastActionLatencyMs: number | null;
  recent: RecentDiagnostic[];
  errorTimes: { js: number[]; network: number[]; action: number[] };
  lastQualityAt: number;
  listeners: {
    pageerror?: (error: Error) => void;
    console?: (message: any) => void;
    requestfailed?: (request: any) => void;
    framenavigated?: (frame: any) => void;
  };
};

const telemetryBySession = new Map<string, BrowserTelemetry>();

function sidOf(sessionId: string) {
  return String(sessionId || '').trim();
}

function safeMessage(value: unknown, max = 240) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max) || 'unknown';
}

function rememberDiagnostic(state: BrowserTelemetry, item: RecentDiagnostic) {
  state.recent.push(item);
  if (state.recent.length > 12) state.recent.splice(0, state.recent.length - 12);
}

function frameStats(state: BrowserTelemetry, now: number) {
  state.frameTimes = state.frameTimes.filter((at) => now - at <= 5000);
  const values = state.frameTimes;
  if (values.length < 2) return { fps: 0, jitterMs: null as number | null, frameAgeMs: values.length ? now - values[values.length - 1] : null };
  const intervals = values.slice(1).map((at, index) => at - values[index]);
  const average = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
  const variance = intervals.reduce((sum, value) => sum + Math.pow(value - average, 2), 0) / intervals.length;
  return {
    fps: Math.max(0, Math.min(120, 1000 / Math.max(1, average))),
    jitterMs: Math.sqrt(variance),
    frameAgeMs: now - values[values.length - 1],
  };
}

function recentErrorCounts(state: BrowserTelemetry, now: number) {
  const cutoff = now - 5000;
  for (const times of Object.values(state.errorTimes)) {
    while (times.length && times[0] < cutoff) times.shift();
  }
  return {
    jsErrors: state.errorTimes.js.length,
    networkErrors: state.errorTimes.network.length,
    actionErrors: state.errorTimes.action.length,
  };
}

function qualityStatus(state: BrowserTelemetry, stats: ReturnType<typeof frameStats>, url: string, errors = recentErrorCounts(state, Date.now())) {
  if (!url || url === 'about:blank') return { status: 'unknown' as const, reason: 'no_loaded_page' };
  if (errors.jsErrors > 0 || errors.networkErrors > 0 || errors.actionErrors > 0) {
    return { status: 'degraded' as const, reason: 'runtime_or_action_errors' };
  }
  if (stats.frameAgeMs !== null && stats.frameAgeMs > 5000) return { status: 'degraded' as const, reason: 'stale_stream_frame' };
  if (stats.frameAgeMs === null) return { status: 'unknown' as const, reason: 'stream_not_measured' };
  return { status: 'good' as const };
}

export type BrowserRuntimeSnapshot = {
  status: 'good' | 'degraded' | 'unknown';
  reason?: string;
  fps: number;
  frameAgeMs: number | null;
  jitterMs: number | null;
  actionsInFlight: number;
  actionErrors: number;
  jsErrors: number;
  networkErrors: number;
  lastActionLatencyMs: number | null;
  recent: RecentDiagnostic[];
};

function snapshotState(state: BrowserTelemetry): BrowserRuntimeSnapshot {
  const now = Date.now();
  const stats = frameStats(state, now);
  const errors = recentErrorCounts(state, now);
  let url = '';
  try { url = state.page.url(); } catch { }
  const quality = qualityStatus(state, stats, url, errors);
  return {
    status: quality.status,
    reason: quality.reason,
    fps: Number(stats.fps.toFixed(2)),
    frameAgeMs: stats.frameAgeMs,
    jitterMs: stats.jitterMs === null ? null : Number(stats.jitterMs.toFixed(2)),
    actionsInFlight: state.actionsInFlight.size,
    actionErrors: errors.actionErrors,
    jsErrors: errors.jsErrors,
    networkErrors: errors.networkErrors,
    lastActionLatencyMs: state.lastActionLatencyMs,
    recent: state.recent.slice(-6),
  };
}

export function getBrowserTelemetrySnapshot(sessionId: string): BrowserRuntimeSnapshot | undefined {
  const state = telemetryBySession.get(sidOf(sessionId));
  return state ? snapshotState(state) : undefined;
}

async function emitPageSnapshot(state: BrowserTelemetry) {
  const now = Date.now();
  try {
    if (state.page.isClosed()) return;
    const url = safeMessage(state.page.url(), 2000);
    const title = safeMessage(await state.page.title().catch(() => ''), 240);
    const blank = !url || url === 'about:blank' || url.startsWith('chrome://');
    let elementCount: number | undefined;
    let textLength: number | undefined;
    let hasPasswordField: boolean | undefined;
    if (!blank) {
      elementCount = await state.page.locator('*').count().catch(() => 0);
      textLength = await state.page.locator('body').innerText({ timeout: 500 }).then((text) => String(text || '').length).catch(() => 0);
      hasPasswordField = (await state.page.locator('input[type="password"]').count().catch(() => 0)) > 0;
    }
    const stateName = blank ? 'unknown' : 'ready';
    broadcastBrowserEvent(state.sessionId, {
      type: 'page_snapshot',
      ts: now,
      sessionId: state.sessionId,
      url,
      title,
      state: stateName,
      workerStatus: state.actionsInFlight.size ? 'running' : 'idle',
      elementCount,
      textLength,
      hasPasswordField,
    });
  } catch {
    broadcastBrowserEvent(state.sessionId, {
      type: 'page_snapshot',
      ts: now,
      sessionId: state.sessionId,
      url: '',
      title: '',
      state: 'error',
      workerStatus: 'error',
      blockingReason: 'page_inspection_failed',
    });
  }
}

function emitDiagnostics(state: BrowserTelemetry) {
  broadcastBrowserEvent(state.sessionId, {
    type: 'page_diagnostics',
    ts: Date.now(),
    sessionId: state.sessionId,
    jsErrors: state.jsErrors,
    consoleErrors: state.consoleErrors,
    networkErrors: state.networkErrors,
    recent: state.recent.slice(-6),
  });
}

async function emitQuality(state: BrowserTelemetry) {
  const now = Date.now();
  const snapshot = snapshotState(state);
  const quality = { status: snapshot.status, reason: snapshot.reason };
  broadcastBrowserEvent(state.sessionId, {
    type: 'browser_quality',
    ts: now,
    sessionId: state.sessionId,
    status: quality.status,
    fps: snapshot.fps,
    frameAgeMs: snapshot.frameAgeMs,
    jitterMs: snapshot.jitterMs,
    queueLength: 0,
    actionsInFlight: snapshot.actionsInFlight,
    actionErrors: snapshot.actionErrors,
    jsErrors: snapshot.jsErrors,
    networkErrors: snapshot.networkErrors,
    lastActionLatencyMs: snapshot.lastActionLatencyMs,
    windowMs: 5000,
    reason: quality.reason,
  });
  state.lastQualityAt = now;
}

export function ensureBrowserTelemetry(sessionId: string, page: Page) {
  const sid = sidOf(sessionId);
  if (!sid) return;
  const existing = telemetryBySession.get(sid);
  if (existing?.page === page) return;
  if (existing) disposeBrowserTelemetry(sid);

  const state: BrowserTelemetry = {
    sessionId: sid,
    page,
    timer: null,
    frameTimes: [],
    jsErrors: 0,
    consoleErrors: 0,
    networkErrors: 0,
    actionErrors: 0,
    actionsInFlight: new Set(),
    actionStarts: new Map(),
    lastActionLatencyMs: null,
    recent: [],
    errorTimes: { js: [], network: [], action: [] },
    lastQualityAt: 0,
    listeners: {},
  };
  state.listeners.pageerror = (error) => {
    const at = Date.now();
    state.jsErrors += 1;
    state.errorTimes.js.push(at);
    rememberDiagnostic(state, { kind: 'pageerror', message: safeMessage(error?.message || error), ts: at });
    emitDiagnostics(state);
  };
  state.listeners.console = (message) => {
    if (message.type() !== 'error' && message.type() !== 'warning') return;
    const at = Date.now();
    state.consoleErrors += message.type() === 'error' ? 1 : 0;
    if (message.type() === 'error') state.errorTimes.js.push(at);
    rememberDiagnostic(state, { kind: 'console', message: safeMessage(message.text()), ts: at });
    emitDiagnostics(state);
  };
  state.listeners.requestfailed = (request) => {
    const at = Date.now();
    state.networkErrors += 1;
    state.errorTimes.network.push(at);
    rememberDiagnostic(state, { kind: 'requestfailed', message: safeMessage(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`, 400), ts: at });
    emitDiagnostics(state);
  };
  state.listeners.framenavigated = (frame) => {
    if (frame === page.mainFrame()) void emitPageSnapshot(state);
  };
  page.on('pageerror', state.listeners.pageerror);
  page.on('console', state.listeners.console);
  page.on('requestfailed', state.listeners.requestfailed);
  page.on('framenavigated', state.listeners.framenavigated);
  state.timer = setInterval(() => {
    void emitPageSnapshot(state);
    emitDiagnostics(state);
    void emitQuality(state);
  }, 1500);
  try { state.timer.unref?.(); } catch { }
  telemetryBySession.set(sid, state);
  void emitPageSnapshot(state);
  emitDiagnostics(state);
  void emitQuality(state);
}

export function recordStreamFrame(sessionId: string) {
  const state = telemetryBySession.get(sidOf(sessionId));
  if (!state) return;
  const now = Date.now();
  state.frameTimes.push(now);
  state.frameTimes = state.frameTimes.filter((at) => now - at <= 5000);
  if (now - state.lastQualityAt >= 1200) void emitQuality(state);
}

export function recordBrowserAction(params: {
  sessionId: string;
  actionId: string;
  actionType: string;
  phase: 'sent' | 'ack' | 'done' | 'error' | 'feedback';
  ok?: boolean;
  durationMs?: number;
  summary?: string;
  reason?: string;
}) {
  const state = telemetryBySession.get(sidOf(params.sessionId));
  if (!state) return;
  const id = safeMessage(params.actionId, 120);
  const now = Date.now();
  if (params.phase === 'sent') {
    state.actionsInFlight.add(id);
    state.actionStarts.set(id, now);
  } else if (params.phase === 'done' || params.phase === 'error') {
    state.actionsInFlight.delete(id);
    const measured = params.durationMs ?? (state.actionStarts.has(id) ? now - Number(state.actionStarts.get(id)) : null);
    if (measured !== null) state.lastActionLatencyMs = Math.max(0, measured);
    state.actionStarts.delete(id);
    if (params.phase === 'error' || params.ok === false) {
      state.actionErrors += 1;
      state.errorTimes.action.push(now);
    }
  }
  // Spread first, then pin the canonical ids — params carries a raw sessionId
  // and actionId that must not overwrite the sanitised ones.
  broadcastBrowserEvent(state.sessionId, { ...params, type: 'browser_action', ts: now, sessionId: state.sessionId, actionId: id });
}

setBrowserActionObserver((sessionId, event) => {
  const phase = event.type === 'action_sent'
    ? 'sent'
    : event.type === 'action_ack'
      ? 'ack'
      : event.type === 'action_done'
        ? 'done'
        : 'error';
  recordBrowserAction({
    sessionId,
    actionId: event.actionId,
    actionType: event.actionType,
    phase,
    ok: phase === 'done' ? true : phase === 'error' ? false : undefined,
    summary: event.summary,
    reason: event.reason || event.error,
  });
});

export function disposeBrowserTelemetry(sessionId: string) {
  const sid = sidOf(sessionId);
  const state = telemetryBySession.get(sid);
  if (!state) return;
  if (state.timer) {
    try { clearInterval(state.timer); } catch { }
    state.timer = null;
  }
  try { if (state.listeners.pageerror) state.page.removeListener('pageerror', state.listeners.pageerror); } catch { }
  try { if (state.listeners.console) state.page.removeListener('console', state.listeners.console); } catch { }
  try { if (state.listeners.requestfailed) state.page.removeListener('requestfailed', state.listeners.requestfailed); } catch { }
  try { if (state.listeners.framenavigated) state.page.removeListener('framenavigated', state.listeners.framenavigated); } catch { }
  telemetryBySession.delete(sid);
}
