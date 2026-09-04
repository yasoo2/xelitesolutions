import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API_URL, WS_URL } from '../config';
import { isValidToken } from '../utils/auth';

type WsEvent =
  | { type: 'stream_frame'; ts: number; jpegBase64: string; w: number; h: number }
  | { type: 'cursor_move'; ts: number; x: number; y: number }
  | { type: 'highlight_boxes'; ts: number; boxes: Array<{ x: number; y: number; width: number; height: number; label?: string }> }
  | { type: 'action_sent' | 'action_ack' | 'action_done' | 'action_error'; ts: number; actionId: string; actionType: string; summary?: string; reason?: string; error?: string }
  | { type: 'page_snapshot'; ts: number; sessionId: string; url: string; title: string; state: string; workerStatus?: string; elementCount?: number; textLength?: number; hasPasswordField?: boolean; blockingReason?: string }
  | { type: 'page_diagnostics'; ts: number; sessionId: string; jsErrors: number; consoleErrors: number; networkErrors: number; recent?: Array<{ kind: string; message: string; ts: number }> }
  | { type: 'browser_quality'; ts: number; sessionId: string; status: 'good' | 'degraded' | 'blocked' | 'unknown'; fps: number; frameAgeMs: number | null; jitterMs: number | null; queueLength: number; actionsInFlight: number; actionErrors: number; jsErrors: number; networkErrors: number; lastActionLatencyMs: number | null; windowMs: number; reason?: string }
  | { type: 'browser_action'; ts: number; sessionId: string; actionId: string; actionType: string; phase: 'sent' | 'ack' | 'done' | 'error' | 'feedback'; ok?: boolean; durationMs?: number; summary?: string; reason?: string }
  | { type: 'step_start'; stepId: string; name: string; ts: number }
  | { type: 'step_done'; stepId: string; name: string; ts: number; data?: any }
  | { type: 'step_error'; stepId: string; name: string; ts: number; reason: string; message: string; data?: any }
  | { type: 'goto_blocked'; stepId: string; ts: number; url: string; reason: string; message: string }
  | { type: 'final_report'; ts: number; ok: boolean; summary: string; steps: any[]; evidence: any[] }
  | { type: 'final_success'; ts: number; summary: string }
  | { type: 'final_failed'; ts: number; summary: string; reason: string }
  | { type: 'debug_snapshot'; ts: number; compiledPlanJson: any; actionsJson: any; actionCount: number; stopReason: string }
  | { type: 'agent_step'; ts: number; phase: AgentPhase; step: number; url?: string; title?: string; elementCount?: number; action?: string; reason?: string; ok?: boolean; note?: string; message?: string }
  | { type: 'agent_thinking'; ts: number; step: number; delta: string; done?: boolean };

type AgentPhase = 'observe' | 'decide' | 'act' | 'result' | 'done' | 'needs_user';
type AgentStep = { ts: number; phase: AgentPhase; step: number; text: string; ok?: boolean };
type ActionFilter = 'all' | 'success' | 'failed';

type Props = { sessionId: string; showBoxes?: boolean };

export function fittedFrameRect(viewW: number, viewH: number, frameW: number, frameH: number) {
  const safeViewW = Math.max(1, viewW);
  const safeViewH = Math.max(1, viewH);
  const safeFrameW = Math.max(1, frameW);
  const safeFrameH = Math.max(1, frameH);
  const scale = Math.min(safeViewW / safeFrameW, safeViewH / safeFrameH);
  const width = safeFrameW * scale;
  const height = safeFrameH * scale;
  return { left: (safeViewW - width) / 2, top: (safeViewH - height) / 2, width, height };
}

export default function ModernBrowserStream({ sessionId, showBoxes = true }: Props) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorElRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [w, setW] = useState(1280);
  const [h, setH] = useState(720);
  const [viewSize, setViewSize] = useState({ w: 1, h: 1 });
  const [boxes, setBoxes] = useState<Array<{ x: number; y: number; width: number; height: number; label?: string }>>([]);
  const [lastStep, setLastStep] = useState<string>('');
  const [final, setFinal] = useState<{ ok: boolean; summary: string } | null>(null);
  const [debug, setDebug] = useState<{ compiledPlanJson: any; actionsJson: any; actionCount: number; stopReason: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [queueLen, setQueueLen] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [lastFrameAt, setLastFrameAt] = useState<number | null>(null);
  const [frameCount, setFrameCount] = useState(0);
  const [startPending, setStartPending] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [qualityMetrics, setQualityMetrics] = useState<Extract<WsEvent, { type: 'browser_quality' }> | null>(null);
  const [pageSnapshot, setPageSnapshot] = useState<Extract<WsEvent, { type: 'page_snapshot' }> | null>(null);
  const [diagnostics, setDiagnostics] = useState<Extract<WsEvent, { type: 'page_diagnostics' }> | null>(null);
  const [actions, setActions] = useState<
    Array<{ ts: number; type: 'action_sent' | 'action_ack' | 'action_done' | 'action_error'; actionId: string; actionType: string; summary?: string; reason?: string; error?: string; durationMs?: number }>
  >([]);
  const [browserActions, setBrowserActions] = useState<Array<Extract<WsEvent, { type: 'browser_action' }>>>([]);
  const [actionFilter, setActionFilter] = useState<ActionFilter>('all');
  const [actionQuery, setActionQuery] = useState('');
  // Agent narration (steps + live thinking) renders in JOE'S CHAT, not here —
  // the browser view stays clean. When the agent pauses for the user (missing
  // credential / 2FA code) the prompt now appears in JOE'S CHAT, not here.

  const boxesRef = useRef(boxes);
  const actionsRef = useRef(actions);
  const pendingTypeRef = useRef('');
  const flushTimerRef = useRef<number | null>(null);
  const lastSendAtRef = useRef(0);
  const sendQueueRef = useRef<any[][]>([]);
  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const cancelSeqRef = useRef(0);
  const viewSizeRef = useRef({ w: 1, h: 1 });
  const frameSizeRef = useRef({ w: 1280, h: 720 });
  const cursorTargetNormRef = useRef<{ x: number; y: number } | null>(null);
  const cursorPosPxRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRafTsRef = useRef<number>(0);
  const frameTimesRef = useRef<number[]>([]);
  const cursorVisibleRef = useRef(false);
  const scrollAccRef = useRef(0);
  const scrollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    boxesRef.current = boxes;
  }, [boxes]);
  useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);
  useEffect(() => {
    frameSizeRef.current = { w, h };
  }, [w, h]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const next = { w: Math.max(1, rect.width), h: Math.max(1, rect.height) };
      viewSizeRef.current = next;
      setViewSize(next);
    };
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => {
      try {
        ro.disconnect();
      } catch { }
    };
  }, []);

  useEffect(() => {
    const tick = (ts: number) => {
      const el = cursorElRef.current;
      const targetNorm = cursorTargetNormRef.current;
      if (!el || !targetNorm) {
        if (el && cursorVisibleRef.current) {
          el.style.opacity = '0';
          cursorVisibleRef.current = false;
        }
        rafRef.current = window.requestAnimationFrame(tick);
        return;
      }

      const dtMs = lastRafTsRef.current ? ts - lastRafTsRef.current : 16;
      lastRafTsRef.current = ts;
      const dt = Math.max(0.001, Math.min(0.06, dtMs / 1000));
      const view = viewSizeRef.current;
      const frame = frameSizeRef.current;
      const fitted = fittedFrameRect(view.w, view.h, frame.w, frame.h);

      const tx = fitted.left + targetNorm.x * fitted.width;
      const ty = fitted.top + targetNorm.y * fitted.height;
      const cur = cursorPosPxRef.current || { x: tx, y: ty };

      const follow = 1 - Math.pow(0.0001, dt);
      const nx = cur.x + (tx - cur.x) * follow;
      const ny = cur.y + (ty - cur.y) * follow;
      cursorPosPxRef.current = { x: nx, y: ny };

      el.style.transform = `translate3d(${nx}px, ${ny}px, 0) translate(-2px, -2px)`;
      if (!cursorVisibleRef.current) {
        el.style.opacity = '1';
        cursorVisibleRef.current = true;
      }

      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) {
        try {
          window.cancelAnimationFrame(rafRef.current);
        } catch { }
      }
      rafRef.current = null;
    };
  }, []);

  const sendActionsNow = async (acts: any[], signal: AbortSignal) => {
    const sid = String(sessionId || '').trim();
    if (!sid) return;
    const token = (() => {
      try {
        return localStorage.getItem('token');
      } catch {
        return null;
      }
    })();
    try {
      await fetch(`${API_URL}/tools/browser_run/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ sessionId: sid, actions: acts }),
        signal,
      });
    } catch { }
  };

  const syncQueueLen = () => {
    setQueueLen(sendQueueRef.current.length);
  };

  const cancelPending = () => {
    cancelSeqRef.current += 1;
    if (flushTimerRef.current) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    pendingTypeRef.current = '';
    sendQueueRef.current.length = 0;
    syncQueueLen();
    try {
      abortRef.current?.abort();
    } catch { }
  };

  useEffect(() => {
    const toggleDetails = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail || {};
      const open = (detail as any)?.open;
      if (typeof open === 'boolean') {
        setDetailsOpen(open);
        return;
      }
      setDetailsOpen((v) => !v);
    };
    const openDetails = () => setDetailsOpen(true);
    const closeDetails = () => setDetailsOpen(false);
    const cancel = () => cancelPending();

    window.addEventListener('browser:details_toggle', toggleDetails as any);
    window.addEventListener('browser:details_open', openDetails as any);
    window.addEventListener('browser:details_close', closeDetails as any);
    window.addEventListener('browser:cancel_pending', cancel as any);
    return () => {
      window.removeEventListener('browser:details_toggle', toggleDetails as any);
      window.removeEventListener('browser:details_open', openDetails as any);
      window.removeEventListener('browser:details_close', closeDetails as any);
      window.removeEventListener('browser:cancel_pending', cancel as any);
    };
  }, []);

  const drainQueue = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setBusy(true);
    const mySeq = cancelSeqRef.current;
    try {
      while (sendQueueRef.current.length) {
        if (cancelSeqRef.current !== mySeq) break;
        const next = sendQueueRef.current.shift();
        syncQueueLen();
        if (!next) continue;
        const controller = new AbortController();
        abortRef.current = controller;
        try {
          lastSendAtRef.current = Date.now();
          await sendActionsNow(next, controller.signal);
        } catch {
          if (controller.signal.aborted) break;
        } finally {
          if (abortRef.current === controller) abortRef.current = null;
        }
      }
    } finally {
      inFlightRef.current = false;
      setBusy(false);
      syncQueueLen();
    }
  };

  const enqueueActions = (acts: any[]) => {
    if (!Array.isArray(acts) || acts.length === 0) return;
    sendQueueRef.current.push(acts);
    syncQueueLen();
    void drainQueue();
  };

  const flushType = async () => {
    if (flushTimerRef.current) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    const text = pendingTypeRef.current;
    pendingTypeRef.current = '';
    if (!text) return;
    enqueueActions([{ type: 'type', text }]);
  };

  const wsUrl = useMemo(() => {
    const sid = String(sessionId || '').trim();
    const baseFromWs = String(WS_URL || '').trim();
    const baseFromApi = API_URL.replace(/\/api\/?$/, '').replace(/^http/i, 'ws');
    const base = baseFromWs ? baseFromWs.replace(/\/ws\/?$/, '') : baseFromApi;
    const u = new URL('/ws/browser', base);
    u.searchParams.set('sessionId', sid);
    try {
      const token = localStorage.getItem('token');
      if (token && isValidToken(token)) u.searchParams.set('token', token);
    } catch { }
    if (window.location.protocol === 'https:' && u.protocol === 'ws:') u.protocol = 'wss:';
    return u.toString();
  }, [sessionId]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let alive = true;
    const start = async () => {
      try {
        const healthRes = await fetch(`${API_URL}/health`, { cache: 'no-store' });
        const isShim = healthRes.headers.get('x-joe-api-shim') === '1';
        if (isShim) {
          setStatus('error');
          return;
        }
      } catch { }

      if (!alive) return;
      console.log('[BrowserStream] Connecting to:', wsUrl);
      ws = new WebSocket(wsUrl);
      setStatus('connecting');
      ws.onopen = () => {
        console.log('[BrowserStream] Connected');
        setStatus('connected');
      };
      ws.onerror = (err) => {
        console.error('[BrowserStream] WebSocket Error:', err);
        setStatus('error');
      };
      ws.onmessage = (ev) => {
        let msg: WsEvent | null = null;
        try {
          const parsed = JSON.parse(String(ev.data || ''));
          const candidate =
            parsed && typeof parsed === 'object'
              ? (typeof (parsed as any)?.type === 'string'
                ? parsed
                : typeof (parsed as any)?.event?.type === 'string'
                  ? (parsed as any).event
                  : typeof (parsed as any)?.data?.type === 'string'
                    ? (parsed as any).data
                    : null)
              : null;
          msg = candidate as any;
        } catch {
          msg = null;
        }
        if (!msg) return;
        if (msg.type === 'stream_frame') {
          frameSizeRef.current = { w: msg.w, h: msg.h };
          setW(msg.w);
          setH(msg.h);
          const frameNow = Date.now();
          setLastFrameAt(frameNow);
          frameTimesRef.current = frameTimesRef.current.filter((at) => frameNow - at <= 4000);
          frameTimesRef.current.push(frameNow);
          setFrameCount((count) => count + 1);
          const img = new Image();
          img.onload = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            canvas.width = msg.w;
            canvas.height = msg.h;
            ctx.drawImage(img, 0, 0, msg.w, msg.h);
            const curBoxes = showBoxes ? (boxesRef.current || []) : [];
            if (showBoxes && curBoxes.length) {
              ctx.save();
              ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
              ctx.lineWidth = 2;
              for (const b of curBoxes) {
                ctx.strokeRect(b.x, b.y, b.width, b.height);
              }
              ctx.restore();
            }
          };
          img.src = `data:image/jpeg;base64,${msg.jpegBase64}`;
          return;
        }
        if (msg.type === 'cursor_move') {
          const fs = frameSizeRef.current;
          const nx = fs.w ? msg.x / fs.w : 0;
          const ny = fs.h ? msg.y / fs.h : 0;
          cursorTargetNormRef.current = { x: Math.max(0, Math.min(1, nx)), y: Math.max(0, Math.min(1, ny)) };
          return;
        }
        if (msg.type === 'highlight_boxes') {
          setBoxes(showBoxes ? (msg.boxes || []) : []);
          return;
        }
        if (msg.type === 'action_sent' || msg.type === 'action_ack' || msg.type === 'action_done' || msg.type === 'action_error') {
          setActions((prev) => {
            const next = prev.concat([
              {
                ts: msg.ts,
                type: msg.type,
                actionId: msg.actionId,
                actionType: msg.actionType,
                summary: msg.summary,
                reason: msg.reason,
                error: msg.error,
              },
            ]);
            return next.length > 60 ? next.slice(next.length - 60) : next;
          });
          return;
        }
        if (msg.type === 'browser_action') {
          setBrowserActions((prev) => {
            const next = prev.concat(msg);
            return next.length > 60 ? next.slice(next.length - 60) : next;
          });
          return;
        }
        if (msg.type === 'page_snapshot') {
          setPageSnapshot(msg);
          try {
            window.dispatchEvent(new CustomEvent('browser:page_snapshot', { detail: msg }));
          } catch { }
          return;
        }
        if (msg.type === 'page_diagnostics') {
          setDiagnostics(msg);
          try {
            window.dispatchEvent(new CustomEvent('browser:diagnostics', { detail: msg }));
          } catch { }
          return;
        }
        if (msg.type === 'browser_quality') {
          setQualityMetrics(msg);
          try {
            window.dispatchEvent(new CustomEvent('browser:quality', { detail: msg }));
          } catch { }
          return;
        }
        if (msg.type === 'step_start') {
          setLastStep(`${msg.stepId}: ${msg.name}`);
          return;
        }
        if (msg.type === 'agent_thinking') {
          // The live thinking stream renders in JOE'S CHAT (thin, tidy) — not
          // inside the browser view. Ignored here by user preference.
          return;
        }
        if (msg.type === 'agent_step') {
          // Step narration AND the pause-for-input moments (credentials / 2FA) now
          // live entirely in JOE'S CHAT (user preference): the email/password box
          // appears in the chat screen, not as a popup over the page. Nothing to
          // render inside the browser panel here.
          return;
        }
        if (msg.type === 'final_report') {
          setFinal({ ok: msg.ok, summary: msg.summary });
          return;
        }
        if (msg.type === 'final_success') {
          setFinal({ ok: true, summary: msg.summary });
          return;
        }
        if (msg.type === 'final_failed') {
          const reason = String(msg.reason || '').trim();
          const s = reason ? `${msg.summary}\n${reason}` : msg.summary;
          setFinal({ ok: false, summary: s });
          return;
        }
        if ((msg as any).type === 'session_status') {
          try {
            const d = (msg as any);
            const det = {
              url: String(d?.url || ''),
              title: String(d?.title || ''),
              workerStatus: String(d?.workerStatus || ''),
              sessionId: String(d?.sessionId || ''),
            };
            window.dispatchEvent(new CustomEvent('browser:session_status', { detail: det }));
          } catch { }
          return;
        }
        if (msg.type === 'debug_snapshot') {
          setDebug({
            compiledPlanJson: (msg as any).compiledPlanJson,
            actionsJson: (msg as any).actionsJson,
            actionCount: Number((msg as any).actionCount || 0),
            stopReason: String((msg as any).stopReason || ''),
          });
          return;
        }
      };
    };

    void start();
    return () => {
      alive = false;
      try { ws?.close(); } catch { }
    };
  }, [wsUrl]);

  const startBrowserSession = async () => {
    const sid = String(sessionId || '').trim();
    if (!sid || startPending) return;
    setStartPending(true);
    setStartError(null);
    const token = (() => {
      try { return localStorage.getItem('token'); } catch { return null; }
    })();
    try {
      const response = await fetch(`${API_URL}/browser/actions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ sessionId: sid, actions: [{ type: 'ui_audit' }] }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(String(payload?.detail || payload?.error || `HTTP ${response.status}`));
      }
    } catch (error: any) {
      setStartError(`تعذر بدء جلسة المتصفح: ${String(error?.message || error || 'خطأ غير معروف')}`);
    } finally {
      setStartPending(false);
    }
  };

  const actionSearch = actionQuery.trim().toLowerCase();
  const matchesAction = (action: Extract<WsEvent, { type: 'browser_action' }>) => {
    const text = [action.phase, action.actionType, action.actionId, action.summary, action.reason].filter(Boolean).join(' ').toLowerCase();
    const queryOk = !actionSearch || text.includes(actionSearch);
    const filterOk = actionFilter === 'all' || (actionFilter === 'failed' ? action.phase === 'error' || action.ok === false : action.phase === 'done' || action.ok === true);
    return queryOk && filterOk;
  };
  const matchesLegacyAction = (action: (typeof actions)[number]) => {
    const text = [action.type, action.actionType, action.actionId, action.summary, action.reason, action.error].filter(Boolean).join(' ').toLowerCase();
    const queryOk = !actionSearch || text.includes(actionSearch);
    const filterOk = actionFilter === 'all' || (actionFilter === 'failed' ? action.type === 'action_error' : action.type === 'action_done');
    return queryOk && filterOk;
  };
  const filteredBrowserActions = browserActions.filter(matchesAction);
  const filteredActions = actions.filter(matchesLegacyAction);
  const browserUnavailable = status === 'error';
  const displayFrame = fittedFrameRect(viewSize.w, viewSize.h, w, h);

  return (
    <div data-testid="browser-stream-root" style={{ width: '100%', height: '100%', overflow: 'hidden', background: '#0b0b0b', display: 'flex', flexDirection: 'column' }}>
      <div ref={rootRef} className="joe-screen" style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
        <style>{`
        .browser-cursor {
          width: 26px;
          height: 26px;
          position: absolute;
          top: 0;
          left: 0;
          opacity: 0;
          pointer-events: none;
          z-index: 6;
          will-change: transform, opacity;
        }
        .browser-cursor-svg {
          width: 100%;
          height: 100%;
          display: block;
          filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.38)) drop-shadow(0 0 1px rgba(255, 255, 255, 0.22));
        }
        .browser-cursor-path {
          fill: rgba(255, 255, 255, 0.98);
          stroke: rgba(0, 0, 0, 0.9);
          stroke-width: 2.25;
          stroke-linejoin: round;
          stroke-linecap: round;
        }
      `}</style>
        {/* Agent narration AND the pause-for-input card (credentials / 2FA) both
            live in Joe's CHAT now (user preference) — nothing overlays the page. */}
        <canvas
          ref={canvasRef}
          tabIndex={0}
          onMouseDown={(e) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            try {
              canvas.focus();
            } catch { }
            const rect = canvas.getBoundingClientRect();
            const fitted = fittedFrameRect(rect.width, rect.height, w, h);
            const localX = e.clientX - rect.left;
            const localY = e.clientY - rect.top;
            if (localX < fitted.left || localX > fitted.left + fitted.width
              || localY < fitted.top || localY > fitted.top + fitted.height) return;
            const rx = (localX - fitted.left) / Math.max(1, fitted.width);
            const ry = (localY - fitted.top) / Math.max(1, fitted.height);
            const x = Math.max(0, Math.min(w - 1, Math.round(rx * w)));
            const y = Math.max(0, Math.min(h - 1, Math.round(ry * h)));
            void flushType().finally(() => {
              enqueueActions([{ type: 'click', x, y }]);
            });
          }}
          onKeyDown={(e) => {
            const key = String((e as any)?.key || '');
            if (key === 'Escape') {
              e.preventDefault();
              cancelPending();
              return;
            }
            if (key === 'Enter') {
              e.preventDefault();
              void flushType().finally(() => {
                enqueueActions([{ type: 'type', text: '\n' }]);
              });
              return;
            }
            if (key === 'Tab') {
              e.preventDefault();
              void flushType().finally(() => {
                enqueueActions([{ type: 'type', text: '\t' }]);
              });
              return;
            }
            if (key === 'Backspace') {
              e.preventDefault();
              pendingTypeRef.current += '\b';
              const dt = Date.now() - lastSendAtRef.current;
              const delay = dt > 700 ? 30 : 90;
              if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
              flushTimerRef.current = window.setTimeout(() => void flushType(), delay);
              return;
            }
            if (key === 'Delete') {
              e.preventDefault();
              pendingTypeRef.current += '\x7f';
              const dt = Date.now() - lastSendAtRef.current;
              const delay = dt > 700 ? 30 : 90;
              if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
              flushTimerRef.current = window.setTimeout(() => void flushType(), delay);
              return;
            }
            if (key.length === 1) {
              e.preventDefault();
              pendingTypeRef.current += key;
              const dt = Date.now() - lastSendAtRef.current;
              const delay = dt > 700 ? 30 : 90;
              if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
              flushTimerRef.current = window.setTimeout(() => void flushType(), delay);
            }
          }}
          onWheel={(e) => {
            // Check if we are scrolling vertically
            const dy = e.deltaY;
            if (!dy) return;

            // Accumulate delta
            scrollAccRef.current += dy;

            // Schedule flush if not scheduled
            if (!scrollTimerRef.current) {
              scrollTimerRef.current = window.setTimeout(() => {
                const total = scrollAccRef.current;
                scrollAccRef.current = 0;
                scrollTimerRef.current = null;

                if (Math.abs(total) < 20) return; // Minimum threshold
                const direction = total > 0 ? 'down' : 'up';
                // Apply a multiplier for better feel, or use raw pixels if browser matches mapping
                const amount = Math.min(2000, Math.floor(Math.abs(total)));

                enqueueActions([{ type: 'scroll', direction, amount }]);
              }, 150); // 150ms throttle window
            }
          }}
          style={{
            position: 'absolute',
            left: displayFrame.left,
            top: displayFrame.top,
            width: displayFrame.width,
            height: displayFrame.height,
            display: 'block',
            outline: 'none',
          }}
        />
        {browserUnavailable ? (
          <div
            data-testid="browser-empty-state"
            role="status"
            aria-live="polite"
            dir="rtl"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              padding: 24,
              pointerEvents: 'none',
              background: browserUnavailable ? 'rgba(11,11,11,0.58)' : 'rgba(11,11,11,0.22)',
            }}
          >
            <div style={{ maxWidth: 420, padding: '18px 20px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(18,18,18,0.86)', color: '#fff', textAlign: 'center', boxShadow: '0 14px 42px rgba(0,0,0,0.28)' }}>
              <strong style={{ display: 'block', fontSize: 14, marginBottom: 8 }}>
                تعذر الاتصال ببث المتصفح
              </strong>
              <span style={{ display: 'block', color: 'rgba(255,255,255,0.72)', fontSize: 12, lineHeight: 1.6 }}>
                تحقق من تشغيل API وWebSocket ثم أعد المحاولة.
              </span>
              {startError ? <div style={{ marginTop: 10, color: '#fca5a5', fontSize: 11, lineHeight: 1.5 }}>{startError}</div> : null}
            </div>
          </div>
        ) : null}
        <div ref={cursorElRef} className="browser-cursor" aria-hidden="true">
          <svg className="browser-cursor-svg" viewBox="0 0 24 24">
            <path className="browser-cursor-path" d="M3.5 2.2 L3.5 19.6 L8.6 15.4 L11.5 22.1 L14.3 20.8 L11.3 14.0 L18.7 14.0 Z" />
          </svg>
        </div>
      </div>
      <div style={{ padding: 10, borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ color: '#fff', fontSize: 12, opacity: 0.95, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {status} · quality={qualityMetrics?.status || 'unknown'} · {w}×{h} {pageSnapshot?.title ? `· ${pageSnapshot.title.slice(0, 48)}` : ''} {lastStep ? `· ${lastStep}` : ''} {busy ? `· busy` : ''} {queueLen ? `· queue=${queueLen}` : ''}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: '0 0 auto' }}>
            {busy || queueLen ? (
              <button
                onClick={() => cancelPending()}
                style={{
                  padding: '6px 10px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'rgba(239,68,68,0.25)',
                  color: '#fff',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                إلغاء
              </button>
            ) : null}
            {actions.length || browserActions.length || final || debug ? (
              <button
                onClick={() => setDetailsOpen((v) => !v)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: detailsOpen ? 'rgba(37, 99, 235, 0.22)' : 'rgba(255,255,255,0.06)',
                  color: '#fff',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {detailsOpen ? t('browserHideLog') : t('browserShowLog')}
              </button>
            ) : null}
          </div>
        </div>
        {detailsOpen ? (
          <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'stretch', flexWrap: 'wrap' }}>
            {pageSnapshot ? (
              <div style={{ flex: '1 1 320px', minWidth: 260, padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(59,130,246,0.12)', color: '#fff', fontSize: 12, lineHeight: 1.45 }}>
                <strong>الصفحة الحالية</strong><br />
                الحالة: {pageSnapshot.state} · العامل: {pageSnapshot.workerStatus || 'unknown'}<br />
                العنوان: {pageSnapshot.title || 'بدون عنوان'}<br />
                <span style={{ opacity: 0.78, wordBreak: 'break-all' }}>{pageSnapshot.url || 'لا يوجد URL'}</span>
              </div>
            ) : null}
            {qualityMetrics ? (
              <div style={{ flex: '1 1 260px', minWidth: 240, padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: qualityMetrics.status === 'good' ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)', color: '#fff', fontSize: 12, lineHeight: 1.45 }}>
                <strong>القياس الحي: {qualityMetrics.status}</strong><br />
                FPS: {qualityMetrics.fps.toFixed(1)} · jitter: {qualityMetrics.jitterMs == null ? '—' : `${Math.round(qualityMetrics.jitterMs)}ms`}<br />
                latency: {qualityMetrics.lastActionLatencyMs == null ? '—' : `${Math.round(qualityMetrics.lastActionLatencyMs)}ms`} · queue: {qualityMetrics.queueLength}<br />
                JS: {qualityMetrics.jsErrors} · network: {qualityMetrics.networkErrors}{qualityMetrics.reason ? ` · ${qualityMetrics.reason}` : ''}
              </div>
            ) : null}
            {diagnostics ? (
              <div style={{ flex: '1 1 260px', minWidth: 240, padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: diagnostics.jsErrors || diagnostics.networkErrors ? 'rgba(239,68,68,0.14)' : 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 12, lineHeight: 1.45 }}>
                <strong>تشخيص الصفحة</strong><br />
                JavaScript: {diagnostics.jsErrors} · console: {diagnostics.consoleErrors} · network: {diagnostics.networkErrors}
                {diagnostics.recent?.length ? <div style={{ marginTop: 4, opacity: 0.78 }}>{diagnostics.recent.slice(-3).map((item, index) => <div key={`${item.ts}-${index}`}>{item.kind}: {item.message}</div>)}</div> : null}
              </div>
            ) : null}
            {final ? (
              <div style={{ flex: '1 1 320px', minWidth: 260, padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: final.ok ? 'rgba(16,185,129,0.16)' : 'rgba(239,68,68,0.16)', color: '#fff', fontSize: 12, whiteSpace: 'pre-wrap' }}>
                {final.summary}
              </div>
            ) : null}
            {(browserActions.length || actions.length) ? (
              <div className="browser-action-filters" data-testid="browser-action-filters" dir="rtl">
                <strong>سجل الأفعال</strong>
                <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value as ActionFilter)} aria-label="تصفية سجل الأفعال">
                  <option value="all">الكل</option>
                  <option value="success">الناجحة فقط</option>
                  <option value="failed">الفاشلة فقط</option>
                </select>
                <input value={actionQuery} onChange={(event) => setActionQuery(event.target.value)} placeholder="بحث في الأفعال" aria-label="بحث في سجل الأفعال" />
                <button type="button" onClick={() => { setActionFilter('all'); setActionQuery(''); }}>مسح التصفية</button>
                <span>{filteredBrowserActions.length + filteredActions.length} نتيجة</span>
              </div>
            ) : null}
            {browserActions.length ? (
              <div style={{ flex: '2 1 520px', minWidth: 320, maxHeight: 180, overflow: 'auto', padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(37,99,235,0.10)', color: '#fff', fontSize: 12, lineHeight: 1.35, whiteSpace: 'pre-wrap' }}>
                {filteredBrowserActions.length ? filteredBrowserActions.slice(-30).map((a) => `${a.phase} · ${a.actionType} · ${a.actionId}${a.durationMs == null ? '' : ` · ${Math.round(a.durationMs)}ms`}${a.reason ? ` · ${a.reason}` : ''}`).join('\n') : 'لا توجد أفعال تطابق التصفية الحالية.'}
              </div>
            ) : null}
            {actions.length ? (
              <div style={{ flex: '2 1 520px', minWidth: 320, maxHeight: 220, overflow: 'auto', padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.35)', color: '#fff', fontSize: 12, lineHeight: 1.35, whiteSpace: 'pre-wrap' }}>
                {filteredActions.length ? filteredActions.slice(-30).map((a) => {
                  const label = a.summary ? `${a.actionType} · ${a.summary}` : a.actionType;
                  const tail = a.type === 'action_error' ? ` · ${String(a.reason || a.error || '').slice(0, 160)}` : '';
                  return `${a.type} · ${a.actionId} · ${label}${tail}`;
                }).join('\n') : 'لا توجد أحداث قديمة تطابق التصفية الحالية.'}
              </div>
            ) : null}
            {debug ? (
              <div style={{ flex: '2 1 520px', minWidth: 320, maxHeight: 220, overflow: 'auto', padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.35)', color: '#fff', fontSize: 12, lineHeight: 1.35, whiteSpace: 'pre-wrap' }}>
                {(() => {
                  const safe = (v: any) => {
                    try {
                      return JSON.stringify(v, null, 2);
                    } catch {
                      return '"[unserializable]"';
                    }
                  };
                  const parts = [
                    `stop_reason=${String(debug.stopReason || '')}`,
                    `action_count=${String(debug.actionCount || 0)}`,
                    `compiled_plan_json=${safe(debug.compiledPlanJson)}`,
                    `actions_json=${safe(debug.actionsJson)}`,
                  ];
                  return parts.join('\n');
                })()}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
