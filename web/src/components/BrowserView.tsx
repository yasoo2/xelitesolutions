import { useEffect, useMemo, useRef, useState } from 'react';
import { API_URL } from '../config';

interface BrowserViewProps {
  sessionId: string;
  wsUrl?: string | null;
  className?: string;
  onClose?: () => void;
}

export default function BrowserView({ sessionId, wsUrl, className, onClose }: BrowserViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error' | 'closed'>('connecting');
  const [error, setError] = useState('');
  const [size, setSize] = useState({ w: 1280, h: 800 });

  const cursorRef = useRef({ x: 640, y: 400 });
  const targetCursorRef = useRef({ x: 640, y: 400 });
  const didInitCursorRef = useRef(false);

  const lastFrameRef = useRef<HTMLImageElement | null>(null);
  const clickEffectRef = useRef<{ x: number; y: number; ts: number } | null>(null);
  const flashUntilRef = useRef<number>(0);

  const streamSizeRef = useRef({ w: 1280, h: 800 });
  const renderScaleRef = useRef<number>(1);
  const lastCanvasSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const needsRedrawRef = useRef<boolean>(true);
  const pendingFrameRef = useRef<string | null>(null);
  const decodingFrameRef = useRef<boolean>(false);
  const lastMoveAtRef = useRef<number>(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const connectTimeoutRef = useRef<number | null>(null);
  const connectAttemptsRef = useRef<number>(0);

  const isNarrow = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(max-width: 700px)')?.matches ?? false;
  }, []);
  const reduceData = useMemo(() => {
    const c: any = (typeof navigator !== 'undefined' ? (navigator as any).connection : null);
    return Boolean(c?.saveData);
  }, []);

  useEffect(() => {
    let animId = 0;

    const animate = () => {
      const dx = targetCursorRef.current.x - cursorRef.current.x;
      const dy = targetCursorRef.current.y - cursorRef.current.y;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        cursorRef.current.x += dx * 0.2;
        cursorRef.current.y += dy * 0.2;
        needsRedrawRef.current = true;
      } else if (cursorRef.current.x !== targetCursorRef.current.x || cursorRef.current.y !== targetCursorRef.current.y) {
        cursorRef.current.x = targetCursorRef.current.x;
        cursorRef.current.y = targetCursorRef.current.y;
        needsRedrawRef.current = true;
      }

      const now = Date.now();
      if (clickEffectRef.current && now - clickEffectRef.current.ts > 300) {
        clickEffectRef.current = null;
        needsRedrawRef.current = true;
      }
      if (flashUntilRef.current && now > flashUntilRef.current) {
        flashUntilRef.current = 0;
        needsRedrawRef.current = true;
      }

      if (needsRedrawRef.current) {
        needsRedrawRef.current = false;
        draw();
      }

      animId = requestAnimationFrame(animate);
    };

    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, []);

  function ensureCanvasSize(nextStreamSize: { w: number; h: number }) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const maxPixels = (isNarrow || reduceData) ? 1_000_000 : 2_000_000;
    const fullPixels = nextStreamSize.w * nextStreamSize.h;
    const scale = fullPixels > maxPixels ? Math.sqrt(maxPixels / fullPixels) : 1;
    renderScaleRef.current = Math.max(0.2, Math.min(1, scale));

    const cw = Math.max(1, Math.round(nextStreamSize.w * renderScaleRef.current));
    const ch = Math.max(1, Math.round(nextStreamSize.h * renderScaleRef.current));

    const last = lastCanvasSizeRef.current;
    if (last.w !== cw || last.h !== ch || canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
      lastCanvasSizeRef.current = { w: cw, h: ch };
      ctxRef.current = null;
    }
  }

  useEffect(() => {
    if (!sessionId) return;
    const token = localStorage.getItem('token');
    const baseWs = API_URL.replace(/^http/i, 'ws');
    const rawWs = (typeof wsUrl === 'string' && wsUrl.trim()) ? wsUrl.trim() : `/browser/ws/${encodeURIComponent(sessionId)}`;
    let finalWsUrl = '';
    try {
      finalWsUrl = new URL(rawWs).toString();
    } catch {
      finalWsUrl = new URL(rawWs, baseWs).toString();
    }
    try {
      const u = new URL(finalWsUrl);
      if (u.protocol === 'http:' || u.protocol === 'https:') u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
      if (u.pathname.startsWith('/browser/ws/') && token && !u.searchParams.get('token')) u.searchParams.set('token', token);
      finalWsUrl = u.toString();
    } catch {}

    const clearTimers = () => {
      if (reconnectTimerRef.current != null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (connectTimeoutRef.current != null) {
        window.clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }
    };

    let disposed = false;
    connectAttemptsRef.current = 0;
    setStatus('connecting');
    setError('');

    const decodeLatestFrame = (jpegBase64: string) => {
      pendingFrameRef.current = jpegBase64;
      if (decodingFrameRef.current) return;
      decodingFrameRef.current = true;

      void (async () => {
        try {
          while (pendingFrameRef.current && !disposed) {
            const next = pendingFrameRef.current;
            pendingFrameRef.current = null;
            await new Promise<void>((resolve) => {
              const img = new Image();
              img.onload = () => {
                lastFrameRef.current = img;
                needsRedrawRef.current = true;
                resolve();
              };
              img.onerror = () => resolve();
              img.src = 'data:image/jpeg;base64,' + next;
            });
          }
        } finally {
          decodingFrameRef.current = false;
        }
      })();
    };

    const handleTextMessage = (text: string) => {
      try {
        const msg = JSON.parse(text);
        if (msg.type === 'stream_start' || msg.type === 'state') {
          const s = msg.viewport
            ? { w: Number(msg.viewport.w ?? msg.viewport.width), h: Number(msg.viewport.h ?? msg.viewport.height) }
            : (msg.w && msg.h ? { w: Number(msg.w), h: Number(msg.h) } : null);
          if (s) {
            if (!Number.isFinite(s.w) || !Number.isFinite(s.h) || s.w <= 0 || s.h <= 0) return;
            streamSizeRef.current = { w: s.w, h: s.h };
            setSize({ w: s.w, h: s.h });
            ensureCanvasSize({ w: s.w, h: s.h });
            if (!didInitCursorRef.current) {
              didInitCursorRef.current = true;
              targetCursorRef.current = { x: s.w / 2, y: s.h / 2 };
              cursorRef.current = { x: s.w / 2, y: s.h / 2 };
              needsRedrawRef.current = true;
            }
          }
        }

        if (msg.type === 'frame' && typeof msg.jpegBase64 === 'string') {
          decodeLatestFrame(msg.jpegBase64);
        }

        if (msg.type === 'cursor_move' && Number.isFinite(msg.x) && Number.isFinite(msg.y)) {
          targetCursorRef.current = { x: msg.x, y: msg.y };
          needsRedrawRef.current = true;
        }

        if (msg.type === 'cursor_click' && Number.isFinite(msg.x) && Number.isFinite(msg.y)) {
          targetCursorRef.current = { x: msg.x, y: msg.y };
          clickEffectRef.current = { x: msg.x, y: msg.y, ts: Date.now() };
          needsRedrawRef.current = true;
        }

        if (msg.type === 'screenshot') {
          flashUntilRef.current = Date.now() + 200;
          needsRedrawRef.current = true;
        }
      } catch {}
    };

    const connect = () => {
      if (disposed) return;
      clearTimers();

      try {
        if (wsRef.current) {
          try { wsRef.current.close(); } catch {}
          wsRef.current = null;
        }

        const ws = new WebSocket(finalWsUrl);
        wsRef.current = ws;
        setStatus(connectAttemptsRef.current > 0 ? 'connecting' : 'connecting');
        setError('');

        try {
          ws.binaryType = 'arraybuffer';
        } catch {}

        connectTimeoutRef.current = window.setTimeout(() => {
          try {
            if (ws.readyState !== WebSocket.OPEN) ws.close();
          } catch {}
        }, 8000);

        ws.onopen = () => {
          clearTimers();
          if (disposed) return;
          connectAttemptsRef.current = 0;
          setStatus('connected');
          const fps = (isNarrow || reduceData) ? 3 : 5;
          const quality = (isNarrow || reduceData) ? 35 : 50;
          try {
            ws.send(JSON.stringify({ type: 'action', action: { type: 'stream.setFps', fps } }));
            ws.send(JSON.stringify({ type: 'action', action: { type: 'stream.setQuality', quality } }));
          } catch {}
        };

        ws.onclose = (ev) => {
          clearTimers();
          if (disposed) return;
          wsRef.current = null;

          if (ev.code === 1008 || ev.code === 4401) {
            setStatus('error');
            setError('Unauthorized');
            return;
          }

          const maxAttempts = 8;
          const attempt = connectAttemptsRef.current + 1;
          connectAttemptsRef.current = attempt;

          if (attempt > maxAttempts) {
            setStatus('closed');
            setError('Disconnected');
            return;
          }

          const baseDelay = Math.min(8000, 500 * Math.pow(2, attempt - 1));
          const jitter = Math.floor(Math.random() * 250);
          const delay = baseDelay + jitter;
          setStatus('connecting');
          setError('Reconnecting...');
          reconnectTimerRef.current = window.setTimeout(connect, delay);
        };

        ws.onerror = () => {
          if (disposed) return;
          setStatus('error');
          setError('Connection failed');
        };

        ws.onmessage = (ev) => {
          const d: any = (ev as any).data;
          if (typeof d === 'string') return handleTextMessage(d);
          if (d instanceof ArrayBuffer) {
            try {
              const text = new TextDecoder().decode(new Uint8Array(d));
              return handleTextMessage(text);
            } catch {
              return;
            }
          }
          if (ArrayBuffer.isView(d)) {
            try {
              const text = new TextDecoder().decode(d);
              return handleTextMessage(text);
            } catch {
              return;
            }
          }
          if (d && typeof d === 'object' && typeof d.text === 'function') {
            d.text().then((t: string) => handleTextMessage(t)).catch(() => {});
          }
        };
      } catch (e: any) {
        setStatus('error');
        setError(String(e?.message || e));
      }
    };

    connect();

    return () => {
      disposed = true;
      clearTimers();
      pendingFrameRef.current = null;
      decodingFrameRef.current = false;
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
    };
  }, [sessionId, wsUrl]);

  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = ctxRef.current || canvas.getContext('2d');
    if (!ctx) return;
    if (!ctxRef.current) ctxRef.current = ctx;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const frame = lastFrameRef.current;
    if (frame) {
      ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = '#1e1e1e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#666';
      ctx.font = '14px sans-serif';
      ctx.fillText('Waiting for stream...', 20, 30);
    }

    const scale = renderScaleRef.current || 1;
    const { x, y } = cursorRef.current;
    if (x >= 0 && y >= 0) {
      ctx.save();
      ctx.translate(x * scale, y * scale);
      
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(12, 12);
      ctx.lineTo(7, 12);
      ctx.lineTo(10, 18);
      ctx.lineTo(8, 19);
      ctx.lineTo(4, 13);
      ctx.lineTo(0, 17);
      ctx.closePath();

      ctx.fillStyle = '#ef4444';
      ctx.fill();
      
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      
      ctx.restore();

    }

    if (clickEffectRef.current) {
      const age = Date.now() - clickEffectRef.current.ts;
      if (age < 300) {
        const radius = 10 + (age / 300) * 20;
        const alpha = 1 - (age / 300);
        
        ctx.beginPath();
        ctx.arc(clickEffectRef.current.x * scale, clickEffectRef.current.y * scale, radius, 0, 2 * Math.PI);
        ctx.strokeStyle = `rgba(239, 68, 68, ${alpha})`;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }

    if (flashUntilRef.current && Date.now() <= flashUntilRef.current) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  function sendAction(action: any) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'action', action }));
    }
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) * (size.w / rect.width));
    const y = Math.round((e.clientY - rect.top) * (size.h / rect.height));
    sendAction({ type: 'click', x, y });
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!canvasRef.current) return;
    const now = Date.now();
    if (now - lastMoveAtRef.current < 50) return;
    lastMoveAtRef.current = now;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) * (size.w / rect.width));
    const y = Math.round((e.clientY - rect.top) * (size.h / rect.height));
    sendAction({ type: 'mouseMove', x, y });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') sendAction({ type: 'press', key: 'Enter' });
    else if (e.key === 'Backspace') sendAction({ type: 'press', key: 'Backspace' });
    else if (e.key.length === 1) sendAction({ type: 'type', text: e.key });
  }

  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches?.[0];
    if (!t || !canvasRef.current) return;
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.round((t.clientX - rect.left) * (size.w / rect.width));
    const y = Math.round((t.clientY - rect.top) * (size.h / rect.height));
    sendAction({ type: 'click', x, y });
  }

  function handleTouchMove(e: React.TouchEvent) {
    const t = e.touches?.[0];
    if (!t || !canvasRef.current) return;
    const now = Date.now();
    if (now - lastMoveAtRef.current < 50) return;
    lastMoveAtRef.current = now;
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.round((t.clientX - rect.left) * (size.w / rect.width));
    const y = Math.round((t.clientY - rect.top) * (size.h / rect.height));
    sendAction({ type: 'mouseMove', x, y });
  }

  return (
    <div className={`browser-view ${className || ''}`} style={{ width: '100%', height: '100%', position: 'relative', background: '#000', overflow: 'hidden' }}>
      {status !== 'connected' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: 'rgba(0,0,0,0.8)' }}>
          {status === 'connecting' ? 'Connecting...' : status === 'error' ? `Error: ${error}` : 'Disconnected'}
        </div>
      )}
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none', outline: 'none' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
