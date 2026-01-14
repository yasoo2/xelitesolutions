import { useEffect, useMemo, useRef, useState } from 'react';
import { API_URL } from '../config';

type WsEvent =
  | { type: 'stream_frame'; ts: number; jpegBase64: string; w: number; h: number }
  | { type: 'cursor_move'; ts: number; x: number; y: number }
  | { type: 'highlight_boxes'; ts: number; boxes: Array<{ x: number; y: number; width: number; height: number; label?: string }> }
  | { type: 'action_sent' | 'action_ack' | 'action_done' | 'action_error'; ts: number; actionId: string; actionType: string; summary?: string; reason?: string; error?: string }
  | { type: 'step_start'; stepId: string; name: string; ts: number }
  | { type: 'step_done'; stepId: string; name: string; ts: number; data?: any }
  | { type: 'step_error'; stepId: string; name: string; ts: number; reason: string; message: string; data?: any }
  | { type: 'goto_blocked'; stepId: string; ts: number; url: string; reason: string; message: string }
  | { type: 'final_report'; ts: number; ok: boolean; summary: string; steps: any[]; evidence: any[] }
  | { type: 'final_success'; ts: number; summary: string }
  | { type: 'final_failed'; ts: number; summary: string; reason: string }
  | { type: 'debug_snapshot'; ts: number; compiledPlanJson: any; actionsJson: any; actionCount: number; stopReason: string };

export default function ModernBrowserStream({ sessionId }: { sessionId: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorElRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [w, setW] = useState(1280);
  const [h, setH] = useState(720);
  const [boxes, setBoxes] = useState<Array<{ x: number; y: number; width: number; height: number; label?: string }>>([]);
  const [lastStep, setLastStep] = useState<string>('');
  const [final, setFinal] = useState<{ ok: boolean; summary: string } | null>(null);
  const [debug, setDebug] = useState<{ compiledPlanJson: any; actionsJson: any; actionCount: number; stopReason: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [queueLen, setQueueLen] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [actions, setActions] = useState<
    Array<{ ts: number; type: 'action_sent' | 'action_ack' | 'action_done' | 'action_error'; actionId: string; actionType: string; summary?: string; reason?: string; error?: string }>
  >([]);

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
  const cursorVisibleRef = useRef(false);
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
      viewSizeRef.current = { w: Math.max(1, rect.width), h: Math.max(1, rect.height) };
    };
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => {
      try {
        ro.disconnect();
      } catch {}
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

      const tx = targetNorm.x * view.w;
      const ty = targetNorm.y * view.h;
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
        } catch {}
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
    } catch {}
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
    } catch {}
  };

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
    const base = API_URL.replace(/^http/i, 'ws');
    const u = new URL('/ws/browser', base);
    u.searchParams.set('sessionId', sessionId);
    if (window.location.protocol === 'https:' && u.protocol === 'ws:') u.protocol = 'wss:';
    return u.toString();
  }, [sessionId]);

  useEffect(() => {
    const ws = new WebSocket(wsUrl);
    setStatus('connecting');
    ws.onopen = () => setStatus('connected');
    ws.onerror = () => setStatus('error');
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
        setW(msg.w);
        setH(msg.h);
        const img = new Image();
        img.onload = () => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          canvas.width = msg.w;
          canvas.height = msg.h;
          ctx.drawImage(img, 0, 0, msg.w, msg.h);
          const curBoxes = boxesRef.current || [];
          if (curBoxes.length) {
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
        setBoxes(msg.boxes || []);
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
      if (msg.type === 'step_start') {
        setLastStep(`${msg.stepId}: ${msg.name}`);
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
    return () => {
      try { ws.close(); } catch {}
    };
  }, [wsUrl]);

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden', background: '#0b0b0b', display: 'flex', flexDirection: 'column' }}>
      <div ref={rootRef} style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
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
        <canvas
          ref={canvasRef}
          tabIndex={0}
          onMouseDown={(e) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            try {
              canvas.focus();
            } catch {}
            const rect = canvas.getBoundingClientRect();
            const rx = (e.clientX - rect.left) / Math.max(1, rect.width);
            const ry = (e.clientY - rect.top) / Math.max(1, rect.height);
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
            if (key.length === 1) {
              e.preventDefault();
              pendingTypeRef.current += key;
              const dt = Date.now() - lastSendAtRef.current;
              const delay = dt > 700 ? 30 : 90;
              if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
              flushTimerRef.current = window.setTimeout(() => void flushType(), delay);
            }
          }}
          style={{ width: '100%', height: '100%', display: 'block', outline: 'none' }}
        />
        <div ref={cursorElRef} className="browser-cursor" aria-hidden="true">
          <svg className="browser-cursor-svg" viewBox="0 0 24 24">
            <path className="browser-cursor-path" d="M3.5 2.2 L3.5 19.6 L8.6 15.4 L11.5 22.1 L14.3 20.8 L11.3 14.0 L18.7 14.0 Z" />
          </svg>
        </div>
      </div>
      <div style={{ padding: 10, borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ color: '#fff', fontSize: 12, opacity: 0.95, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {status} · {w}×{h} {lastStep ? `· ${lastStep}` : ''} {busy ? `· busy` : ''} {queueLen ? `· queue=${queueLen}` : ''}
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
            {actions.length || final || debug ? (
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
                {detailsOpen ? 'إخفاء السجل' : 'عرض السجل'}
              </button>
            ) : null}
          </div>
        </div>
        {detailsOpen ? (
          <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'stretch', flexWrap: 'wrap' }}>
            {final ? (
              <div style={{ flex: '1 1 320px', minWidth: 260, padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: final.ok ? 'rgba(16,185,129,0.16)' : 'rgba(239,68,68,0.16)', color: '#fff', fontSize: 12, whiteSpace: 'pre-wrap' }}>
                {final.summary}
              </div>
            ) : null}
            {actions.length ? (
              <div style={{ flex: '2 1 520px', minWidth: 320, maxHeight: 220, overflow: 'auto', padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.35)', color: '#fff', fontSize: 12, lineHeight: 1.35, whiteSpace: 'pre-wrap' }}>
                {actions
                  .slice(-30)
                  .map((a) => {
                    const label = a.summary ? `${a.actionType} · ${a.summary}` : a.actionType;
                    const tail = a.type === 'action_error' ? ` · ${String(a.reason || a.error || '').slice(0, 160)}` : '';
                    return `${a.type} · ${a.actionId} · ${label}${tail}`;
                  })
                  .join('\n')}
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
