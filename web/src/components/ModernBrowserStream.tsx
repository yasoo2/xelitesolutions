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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [w, setW] = useState(1280);
  const [h, setH] = useState(800);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [boxes, setBoxes] = useState<Array<{ x: number; y: number; width: number; height: number; label?: string }>>([]);
  const [lastStep, setLastStep] = useState<string>('');
  const [final, setFinal] = useState<{ ok: boolean; summary: string } | null>(null);
  const [debug, setDebug] = useState<{ compiledPlanJson: any; actionsJson: any; actionCount: number; stopReason: string } | null>(null);
  const [actions, setActions] = useState<
    Array<{ ts: number; type: 'action_sent' | 'action_ack' | 'action_done' | 'action_error'; actionId: string; actionType: string; summary?: string; reason?: string; error?: string }>
  >([]);

  const boxesRef = useRef(boxes);
  const cursorRef = useRef(cursor);
  const actionsRef = useRef(actions);
  const pendingTypeRef = useRef('');
  const flushTimerRef = useRef<number | null>(null);
  const lastSendAtRef = useRef(0);
  useEffect(() => {
    boxesRef.current = boxes;
  }, [boxes]);
  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);
  useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);

  const runActions = async (acts: any[]) => {
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
      });
    } catch {}
  };

  const flushType = async () => {
    if (flushTimerRef.current) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    const text = pendingTypeRef.current;
    pendingTypeRef.current = '';
    if (!text) return;
    lastSendAtRef.current = Date.now();
    await runActions([{ type: 'type', text }]);
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
            ctx.strokeStyle = 'rgba(37, 99, 235, 0.9)';
            ctx.lineWidth = 2;
            for (const b of curBoxes) {
              ctx.strokeRect(b.x, b.y, b.width, b.height);
            }
            ctx.restore();
          }
          const curCursor = cursorRef.current;
          if (curCursor) {
            ctx.save();
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.strokeStyle = 'rgba(0,0,0,0.6)';
            ctx.beginPath();
            ctx.arc(curCursor.x, curCursor.y, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }
        };
        img.src = `data:image/jpeg;base64,${msg.jpegBase64}`;
        return;
      }
      if (msg.type === 'cursor_move') {
        setCursor({ x: msg.x, y: msg.y });
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
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: '#0b0b0b' }}>
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
            void runActions([{ type: 'click', x, y }]);
          });
        }}
        onKeyDown={(e) => {
          const key = String((e as any)?.key || '');
          if (key === 'Enter') {
            e.preventDefault();
            void flushType().finally(() => {
              void runActions([{ type: 'type', text: '\n' }]);
            });
            return;
          }
          if (key === 'Tab') {
            e.preventDefault();
            void flushType().finally(() => {
              void runActions([{ type: 'type', text: '\t' }]);
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
      <div style={{ position: 'absolute', top: 10, left: 10, padding: '6px 10px', borderRadius: 10, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 12 }}>
        {status} · {w}×{h} {lastStep ? `· ${lastStep}` : ''}
      </div>
      {actions.length ? (
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 360,
            maxWidth: '48%',
            maxHeight: '55%',
            overflow: 'auto',
            padding: '8px 10px',
            borderRadius: 10,
            background: 'rgba(0,0,0,0.55)',
            color: '#fff',
            fontSize: 12,
            lineHeight: 1.35,
            whiteSpace: 'pre-wrap',
          }}
        >
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
      {final ? (
        <div style={{ position: 'absolute', bottom: 10, left: 10, padding: '8px 10px', borderRadius: 10, background: final.ok ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)', color: '#fff', fontSize: 12 }}>
          {final.summary}
        </div>
      ) : null}
      {debug ? (
        <div
          style={{
            position: 'absolute',
            bottom: 10,
            right: 10,
            width: 420,
            maxWidth: '55%',
            maxHeight: '55%',
            overflow: 'auto',
            padding: '8px 10px',
            borderRadius: 10,
            background: 'rgba(0,0,0,0.55)',
            color: '#fff',
            fontSize: 12,
            lineHeight: 1.35,
            whiteSpace: 'pre-wrap',
          }}
        >
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
  );
}
