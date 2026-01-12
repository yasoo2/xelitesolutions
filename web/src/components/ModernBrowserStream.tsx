import { useEffect, useMemo, useRef, useState } from 'react';
import { API_URL } from '../config';

type WsEvent =
  | { type: 'stream_frame'; ts: number; jpegBase64: string; w: number; h: number }
  | { type: 'cursor_move'; ts: number; x: number; y: number }
  | { type: 'highlight_boxes'; ts: number; boxes: Array<{ x: number; y: number; width: number; height: number; label?: string }> }
  | { type: 'step_start'; stepId: string; name: string; ts: number }
  | { type: 'step_done'; stepId: string; name: string; ts: number; data?: any }
  | { type: 'step_error'; stepId: string; name: string; ts: number; reason: string; message: string; data?: any }
  | { type: 'goto_blocked'; stepId: string; ts: number; url: string; reason: string; message: string }
  | { type: 'final_report'; ts: number; ok: boolean; summary: string; steps: any[]; evidence: any[] };

export default function ModernBrowserStream({ sessionId }: { sessionId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [w, setW] = useState(1280);
  const [h, setH] = useState(800);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [boxes, setBoxes] = useState<Array<{ x: number; y: number; width: number; height: number; label?: string }>>([]);
  const [lastStep, setLastStep] = useState<string>('');
  const [final, setFinal] = useState<{ ok: boolean; summary: string } | null>(null);

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
        msg = JSON.parse(String(ev.data || ''));
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
          if (boxes.length) {
            ctx.save();
            ctx.strokeStyle = 'rgba(37, 99, 235, 0.9)';
            ctx.lineWidth = 2;
            for (const b of boxes) {
              ctx.strokeRect(b.x, b.y, b.width, b.height);
            }
            ctx.restore();
          }
          if (cursor) {
            ctx.save();
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.strokeStyle = 'rgba(0,0,0,0.6)';
            ctx.beginPath();
            ctx.arc(cursor.x, cursor.y, 5, 0, Math.PI * 2);
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
      if (msg.type === 'step_start') {
        setLastStep(`${msg.stepId}: ${msg.name}`);
        return;
      }
      if (msg.type === 'final_report') {
        setFinal({ ok: msg.ok, summary: msg.summary });
        return;
      }
    };
    return () => {
      try { ws.close(); } catch {}
    };
  }, [wsUrl, boxes, cursor]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: '#0b0b0b' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      <div style={{ position: 'absolute', top: 10, left: 10, padding: '6px 10px', borderRadius: 10, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 12 }}>
        {status} · {w}×{h} {lastStep ? `· ${lastStep}` : ''}
      </div>
      {final ? (
        <div style={{ position: 'absolute', bottom: 10, left: 10, padding: '8px 10px', borderRadius: 10, background: final.ok ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)', color: '#fff', fontSize: 12 }}>
          {final.summary}
        </div>
      ) : null}
    </div>
  );
}

