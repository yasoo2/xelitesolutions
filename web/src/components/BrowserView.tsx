import { useEffect, useRef, useState } from 'react';
import { API_URL } from '../config';

interface BrowserViewProps {
  sessionId: string;
  className?: string;
  onClose?: () => void;
}

export default function BrowserView({ sessionId, className, onClose }: BrowserViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error' | 'closed'>('connecting');
  const [error, setError] = useState('');
  const [size, setSize] = useState({ w: 1280, h: 800 });
  const cursorRef = useRef({ x: 640, y: 400 });
  const targetCursorRef = useRef({ x: 640, y: 400 });

  const [lastFrame, setLastFrame] = useState<HTMLImageElement | null>(null);
  const [clickEffect, setClickEffect] = useState<{ x: number, y: number, ts: number } | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let animId = 0;

    // Wake up cursor visual on mount
    setTimeout(() => {
      targetCursorRef.current = { x: 640, y: 400 };
      cursorRef.current = { x: 640, y: 400 };
    }, 100);

    function animate() {
      // Interpolate cursor
      const dx = targetCursorRef.current.x - cursorRef.current.x;
      const dy = targetCursorRef.current.y - cursorRef.current.y;
      
      // Smooth follow
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        cursorRef.current.x += dx * 0.2;
        cursorRef.current.y += dy * 0.2;
      } else {
        cursorRef.current.x = targetCursorRef.current.x;
        cursorRef.current.y = targetCursorRef.current.y;
      }

      draw();
      animId = requestAnimationFrame(animate);
    }
    
    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, [lastFrame, clickEffect, size, flash]);

  useEffect(() => {
    if (!sessionId) return;
    // Construct WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = API_URL.replace(/^https?:\/\//, '');
    const token = localStorage.getItem('token');
    const wsUrl = `${protocol}//${host}/browser/ws/${sessionId}?token=${token}`;

    console.log('BrowserView: Connecting to', wsUrl);
    setStatus('connecting');
    setError('');

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('BrowserView: Connected');
      setStatus('connected');
    };

    ws.onclose = (ev) => {
      console.log('BrowserView: Closed', ev.code, ev.reason);
      setStatus('closed');
      wsRef.current = null;
    };

    ws.onerror = () => {
      console.error('BrowserView: Error');
      setStatus('error');
      setError('Connection failed');
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        
        if (msg.type === 'stream_start' || msg.type === 'state') {
          const s = msg.viewport || (msg.w && msg.h ? { w: msg.w, h: msg.h } : null);
          if (s) {
            setSize({ w: s.w, h: s.h });
            // Initialize cursor to center
            if (targetCursorRef.current.x === 0 && targetCursorRef.current.y === 0) {
              targetCursorRef.current = { x: s.w / 2, y: s.h / 2 };
              cursorRef.current = { x: s.w / 2, y: s.h / 2 };
            }
            if (canvasRef.current) {
              canvasRef.current.width = s.w;
              canvasRef.current.height = s.h;
            }
          }
        }

        if (msg.type === 'frame' && msg.jpegBase64) {
          const img = new Image();
          img.onload = () => {
            setLastFrame(img);
          };
          img.src = 'data:image/jpeg;base64,' + msg.jpegBase64;
        }

        if (msg.type === 'cursor_move') {
          targetCursorRef.current = { x: msg.x, y: msg.y };
        }

        if (msg.type === 'cursor_click') {
          targetCursorRef.current = { x: msg.x, y: msg.y };
          setClickEffect({ x: msg.x, y: msg.y, ts: Date.now() });
          setTimeout(() => setClickEffect(null), 300);
        }

        if (msg.type === 'screenshot') {
          setFlash(true);
          setTimeout(() => setFlash(false), 200);
        }
      } catch (e) {
        console.error('BrowserView: Parse error', e);
      }
    };

    return () => {
      ws.close();
    };
  }, [sessionId]);

  // Redraw loop handles updates
  
  function draw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Frame
    if (lastFrame) {
      ctx.drawImage(lastFrame, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = '#1e1e1e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#666';
      ctx.font = '14px sans-serif';
      ctx.fillText('Waiting for stream...', 20, 30);
    }

    // Draw Cursor
    const { x, y } = cursorRef.current;
    if (x >= 0 && y >= 0) {
      // Draw Mouse Arrow
      ctx.save();
      ctx.translate(x, y);
      
      // Shadow
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;

      // Arrow shape
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(12, 12);
      ctx.lineTo(7, 12); // indentation
      ctx.lineTo(10, 18); // tail part 1
      ctx.lineTo(8, 19); // tail part 2
      ctx.lineTo(4, 13); // back to body
      ctx.lineTo(0, 17); // bottom left
      ctx.closePath();

      ctx.fillStyle = '#ef4444'; // Red-500
      ctx.fill();
      
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      
      ctx.restore();

      // Click Ripple (if active)
      if (clickEffect) {
         // ... drawn below
      }
    }

    // Draw Click Effect
    if (clickEffect) {
      const age = Date.now() - clickEffect.ts;
      if (age < 300) {
        const radius = 10 + (age / 300) * 20;
        const alpha = 1 - (age / 300);
        
        ctx.beginPath();
        ctx.arc(clickEffect.x, clickEffect.y, radius, 0, 2 * Math.PI);
        ctx.strokeStyle = `rgba(239, 68, 68, ${alpha})`;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }

    // Flash Effect
    if (flash) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  function sendAction(action: any) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'action', action }));
    }
  }

  // Input handlers
  function handleMouseDown(e: React.MouseEvent) {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) * (size.w / rect.width));
    const y = Math.round((e.clientY - rect.top) * (size.h / rect.height));
    sendAction({ type: 'click', x, y });
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) * (size.w / rect.width));
    const y = Math.round((e.clientY - rect.top) * (size.h / rect.height));
    // Throttle?
    sendAction({ type: 'mouseMove', x, y });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') sendAction({ type: 'press', key: 'Enter' });
    else if (e.key === 'Backspace') sendAction({ type: 'press', key: 'Backspace' });
    else if (e.key.length === 1) sendAction({ type: 'type', text: e.key });
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
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
