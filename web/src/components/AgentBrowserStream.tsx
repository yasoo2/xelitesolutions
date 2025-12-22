import { useEffect, useRef, useState } from 'react';
import { API_URL as API } from '../config';

export default function AgentBrowserStream({ wsUrl }: { wsUrl: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [size, setSize] = useState<{ w: number, h: number }>({ w: 1280, h: 800 });
  const sizeRef = useRef<{ w: number; h: number }>({ w: 1280, h: 800 });
  const [status, setStatus] = useState('connecting');
  const [wsError, setWsError] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [downloads, setDownloads] = useState<Array<{ name: string; href: string }>>([]);
  const [overlay, setOverlay] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'console' | 'network' | 'downloads'>('console');
  const [panelOpen, setPanelOpen] = useState<boolean>(false);
  const [consoleEntries, setConsoleEntries] = useState<Array<{ level: string; text: string; ts: number }>>([]);
  const [networkEntries, setNetworkEntries] = useState<Array<{ stage: 'request' | 'response'; url: string; method: string; status?: number; resourceType?: string; ts: number }>>([]);
  const [zoom, setZoom] = useState<number>(1);
  const [focusMode, setFocusMode] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [streamPaused, setStreamPaused] = useState<boolean>(false);
  const [reconnectNonce, setReconnectNonce] = useState<number>(0);
  const [extractSchema, setExtractSchema] = useState<string>('{"list":{"selector":"a[href^=\\"https\\"]:not([href*=\\"google.com\\"])","fields":{"text":{"selector":"","attr":""},"url":{"selector":"","attr":"href"}}}}');
  const [extracted, setExtracted] = useState<any>(null);
  const [uploadSelector, setUploadSelector] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [autoExtract, setAutoExtract] = useState<boolean>(true);
  const [typeText, setTypeText] = useState<string>('');
  const [selector, setSelector] = useState<string>('');
  const [highlight, setHighlight] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [role, setRole] = useState<string>('');
  const [roleName, setRoleName] = useState<string>('');
  const [autoLocate, setAutoLocate] = useState<boolean>(true);
  const [autoFocus, setAutoFocus] = useState<boolean>(true);
  const [autoTypeAfterFocus, setAutoTypeAfterFocus] = useState<boolean>(true);
  const [defaultSearchText, setDefaultSearchText] = useState<string>('أضرار التدخين');
  const lastMoveRef = useRef<number>(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const connectTimeoutRef = useRef<number | null>(null);
  const connectAttemptsRef = useRef<number>(0);

  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onChange);
    onChange();
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  function getSessionId() {
    try {
      const u = new URL(wsUrl);
      const parts = u.pathname.split('/').filter(Boolean);
      return parts[parts.length - 1];
    } catch {
      return '';
    }
  }

  function absHrefFromWs(href: string) {
    try {
      const u = new URL(href);
      if (u.protocol === 'ws:') u.protocol = 'http:';
      if (u.protocol === 'wss:') u.protocol = 'https:';
      return u.toString();
    } catch {
      try {
        const base = new URL(wsUrl);
        if (base.protocol === 'ws:') base.protocol = 'http:';
        if (base.protocol === 'wss:') base.protocol = 'https:';
        base.search = '';
        base.hash = '';
        base.pathname = '/';
        return new URL(href, base.toString()).toString();
      } catch {
        return href;
      }
    }
  }

  function normalizeUrl(raw: string) {
    const v = raw.trim();
    if (!v) return '';
    try {
      return new URL(v).toString();
    } catch {
      try {
        return new URL(`https://${v}`).toString();
      } catch {
        return v;
      }
    }
  }

  async function runActions(actions: any[]) {
    const sessionId = getSessionId();
    if (!sessionId) return;

    // Check for WS optimization
    const wsActions = ['mouseMove', 'click', 'scroll', 'type', 'press', 'goBack', 'goForward', 'reload', 'goto', 'screenshot'];
    const canUseWs = wsRef.current && 
                     wsRef.current.readyState === WebSocket.OPEN && 
                     actions.every(a => wsActions.includes(a.type));

    if (canUseWs) {
       actions.forEach(a => {
         wsRef.current?.send(JSON.stringify({ type: 'action', action: a }));
       });
       
       // UI updates
       const names = actions.map(a => a.type).join(', ');
       setOverlay(names);
       setTimeout(() => setOverlay(''), 1200);

       // Handle autoExtract triggers if needed (e.g. Enter press)
       if (autoExtract && actions.some(a => a.type === 'press' && a.key === 'Enter')) {
          setTimeout(() => doExtract(), 2000);
       }
       if (autoExtract && actions.some(a => a.type === 'reload')) {
          setTimeout(() => doExtract(), 1500);
       }
       if (actions.some(a => a.type === 'goto' || a.type === 'reload')) {
         setHighlight(null);
         if (autoLocate) {
           const extra: any[] = [];
           if (selector) extra.push({ type: 'locate', selector });
           else if (role && roleName) extra.push({ type: 'locate', role, roleName });
           if (extra.length) setTimeout(() => runActions(extra), 1000);
         }
         if (autoExtract) setTimeout(() => doExtract(), 1500);
       }
       return;
    }

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/tools/browser_run/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ sessionId, actions })
      });
      const j = await res.json();
      if (Array.isArray(j.artifacts)) {
        const items = j.artifacts.map((a: any) => ({ name: a.name || a.filename || 'download', href: a.href }));
        setDownloads(prev => [...items, ...prev].slice(0, 5));
      }
      if (j?.ok && Array.isArray(j?.output?.outputs)) {
        const loc = j.output.outputs.find((o: any) => o.type === 'locate' && o.boundingBox);
        if (loc?.boundingBox) {
          setHighlight(loc.boundingBox);
          const askedLocate = actions.some(a => a.type === 'locate');
          if (askedLocate && autoFocus) {
            const rev = [...actions].reverse();
            const locAct = rev.find(a => a.type === 'locate') || null;
            const seq: any[] = [];
            if (locAct?.selector) seq.push({ type: 'click', selector: locAct.selector });
            else if (locAct?.role && locAct?.roleName) seq.push({ type: 'click', role: locAct.role, roleName: locAct.roleName });
            else {
              const b = loc.boundingBox;
              if (b) {
                const cx = Math.round(b.x + b.width / 2);
                const cy = Math.round(b.y + b.height / 2);
                seq.push({ type: 'click', x: cx, y: cy });
              }
            }
            if (seq.length) setTimeout(() => runActions(seq), 250);
            const isGoogleSelector = Boolean(locAct?.selector && /(input|textarea)\[name=["']q["']\]/i.test(String(locAct.selector)));
            const isSearchRole = Boolean(locAct?.roleName && String(locAct.roleName).includes('بحث'));
            if (autoTypeAfterFocus && !typeText.trim() && (isGoogleSelector || isSearchRole)) {
              setTimeout(() => {
                runActions([{ type: 'waitForSelector', selector: 'input[name="q"], textarea[name="q"]', timeoutMs: 8000 }]);
                setTimeout(() => runActions([{ type: 'type', text: defaultSearchText, delay: 30 }]), 200);
                setTimeout(() => runActions([{ type: 'press', key: 'Enter' }]), 300);
              }, 400);
            }
          }
        }
      }
      const names = actions.map(a => a.type).join(', ');
      setOverlay(names);
      setTimeout(() => setOverlay(''), 1200);
      if (actions.some(a => a.type === 'goto' || a.type === 'reload')) {
        setHighlight(null);
        if (autoLocate) {
          const extra: any[] = [];
          if (selector) {
            extra.push({ type: 'locate', selector });
          } else if (role && roleName) {
            extra.push({ type: 'locate', role, roleName });
          } else {
            const g = actions.find(a => a.type === 'goto');
            try {
              const host = g?.url ? new URL(g.url).hostname : '';
              if (host && /(^|\.)(google)\./i.test(host)) {
                extra.push({ type: 'locate', selector: 'input[name="q"], textarea[name="q"]' });
              }
            } catch {}
          }
          if (extra.length) {
            setTimeout(() => runActions(extra), 1000);
          }
        }
      }
      if (autoExtract && actions.some(a => a.type === 'press' && a.key === 'Enter')) {
        setTimeout(() => {
          doExtract();
        }, 2000);
      }
      if (autoExtract && actions.some(a => a.type === 'goto' || a.type === 'reload')) {
        setTimeout(() => {
          doExtract();
        }, 1500);
      }
    } catch (e) {
    }
  }

  async function doExtract() {
    const sessionId = getSessionId();
    if (!sessionId) return;
    try {
      const token = localStorage.getItem('token');
      const schemaObj = JSON.parse(extractSchema);
      const res = await fetch(`${API}/tools/browser_extract/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ sessionId, schema: schemaObj })
      });
      const j = await res.json();
      if (j?.ok && j?.output) {
        setExtracted(j.output);
      } else {
        setExtracted(null);
      }
    } catch {
      setExtracted(null);
    }
  }

  async function doUpload() {
    const sessionId = getSessionId();
    const file = fileRef.current?.files?.[0];
    if (!sessionId || !file || !uploadSelector) return;
    try {
      const token = localStorage.getItem('token');
      const form = new FormData();
      form.append('file', file);
      form.append('sessionId', sessionId);
      const res = await fetch(`${API}/files/upload`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        } as any,
        body: form
      });
      const j = await res.json();
      if (j && j._id) {
        const rawUrl = `${API}/files/${j._id}/raw`;
        await runActions([{ type: 'uploadFile', selector: uploadSelector, fileUrl: rawUrl }]);
      }
    } catch {}
  }

  useEffect(() => {
    let disposed = false;
    connectAttemptsRef.current = 0;
    setStatus('connecting');
    setWsError('');

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

    const connect = () => {
      if (disposed) return;
      clearTimers();

      try {
        if (wsRef.current) {
          try { wsRef.current.close(); } catch {}
          wsRef.current = null;
        }

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        setStatus(connectAttemptsRef.current > 0 ? 'reconnecting' : 'connecting');

        connectTimeoutRef.current = window.setTimeout(() => {
          try {
            if (ws.readyState !== WebSocket.OPEN) ws.close();
          } catch {}
        }, 8000);

        ws.onopen = () => {
          clearTimers();
          if (disposed) return;
          connectAttemptsRef.current = 0;
          setWsError('');
          setStatus('connected');
        };

        ws.onclose = (ev) => {
          clearTimers();
          if (disposed) return;
          wsRef.current = null;

          const maxAttempts = 8;
          const attempt = connectAttemptsRef.current + 1;
          connectAttemptsRef.current = attempt;

          if (attempt > maxAttempts) {
            setStatus('error');
            const reason = ev?.reason ? ` reason=${ev.reason}` : '';
            setWsError(`WebSocket closed (code=${ev?.code ?? 'unknown'}${reason})`);
            return;
          }

          const baseDelay = Math.min(8000, 500 * Math.pow(2, attempt - 1));
          const jitter = Math.floor(Math.random() * 250);
          const delay = baseDelay + jitter;
          setStatus('reconnecting');
          const reason = ev?.reason ? ` reason=${ev.reason}` : '';
          setWsError(`WebSocket closed (code=${ev?.code ?? 'unknown'}${reason}). retrying...`);
          reconnectTimerRef.current = window.setTimeout(connect, delay);
        };

        ws.onerror = () => {
          if (disposed) return;
          setWsError('WebSocket error');
        };

        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data);
            if (msg.type === 'stream_start') {
              const next = { w: msg.w, h: msg.h };
              sizeRef.current = next;
              setSize(next);
            }
            if (msg.type === 'state') {
              if (msg.viewport?.width && msg.viewport?.height) {
                const next = { w: msg.viewport.width, h: msg.viewport.height };
                sizeRef.current = next;
                setSize(next);
              }
              if (typeof msg.url === 'string') setAddress(msg.url);
              if (Array.isArray(msg.downloads)) {
                const items = msg.downloads.map((d: any) => ({ name: d.filename || d.name || 'download', href: absHrefFromWs(d.href) }));
                setDownloads(items.slice(-10).reverse());
              }
              if (Array.isArray(msg.logs)) {
                setConsoleEntries(msg.logs.slice(-500));
              }
              if (Array.isArray(msg.network)) {
                setNetworkEntries(msg.network.slice(-500));
              }
            }
            if (msg.type === 'url' && typeof msg.url === 'string') {
              setAddress(msg.url);
            }
            if (msg.type === 'console' && msg.entry) {
              setConsoleEntries((prev) => [...prev, msg.entry].slice(-500));
            }
            if (msg.type === 'network' && msg.entry) {
              setNetworkEntries((prev) => [...prev, msg.entry].slice(-500));
            }
            if (msg.type === 'download' && msg.download) {
              const d = msg.download;
              const item = { name: d.filename || d.name || 'download', href: absHrefFromWs(d.href) };
              setDownloads((prev) => [item, ...prev].slice(0, 10));
            }
            if (msg.type === 'screenshot' && msg.href) {
              const href = absHrefFromWs(String(msg.href));
              const name = String(msg.href).split('/').pop() || 'screenshot.jpg';
              setDownloads((prev) => [{ name, href }, ...prev].slice(0, 10));
            }
            if (msg.type === 'cursor_move') {
              setCursor({ x: msg.x, y: msg.y });
            }
            if (msg.type === 'cursor_click') {
              setCursor({ x: msg.x, y: msg.y });
              const clickEl = document.createElement('div');
              const s = sizeRef.current;
              clickEl.style.cssText = `
                position: absolute;
                left: ${(msg.x / s.w) * 100}%;
                top: ${(msg.y / s.h) * 100}%;
                width: 20px; height: 20px;
                background: rgba(255, 0, 0, 0.5);
                border-radius: 50%;
                transform: translate(-50%, -50%);
                pointer-events: none;
                z-index: 100;
                transition: opacity 0.5s;
              `;
              canvasRef.current?.parentElement?.appendChild(clickEl);
              setTimeout(() => clickEl.remove(), 500);
            }
            if (msg.type === 'action_start') {
              const a = msg.action;
              let text = a.type;
              if (a.type === 'goto') text = `Opening ${new URL(a.url).hostname}...`;
              if (a.type === 'type') text = `Typing...`;
              if (a.type === 'click') text = `Clicking...`;
              if (a.type === 'scroll') text = `Scrolling...`;
              if (a.type === 'screenshot') text = `Capturing View...`;
              setOverlay(text);
            }
            if (msg.type === 'action_done') {
              setTimeout(() => setOverlay(''), 500);
            }
            if (msg.type === 'action_error') {
              setOverlay(String(msg.error || 'Action error'));
              setTimeout(() => setOverlay(''), 1500);
            }
            if (msg.type === 'frame') {
              if (streamPaused) return;
              const img = new Image();
              img.onload = () => {
                const canvas = canvasRef.current!;
                if (!canvas) return;
                const s = sizeRef.current;
                canvas.width = s.w;
                canvas.height = s.h;
                const ctx = canvas.getContext('2d')!;
                ctx.drawImage(img, 0, 0, s.w, s.h);
              };
              img.src = 'data:image/jpeg;base64,' + msg.jpegBase64;
            }
          } catch {}
        };
      } catch (e: any) {
        setStatus('error');
        setWsError(String(e?.message || e));
      }
    };

    connect();

    return () => {
      disposed = true;
      clearTimers();
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
    };
  }, [wsUrl, reconnectNonce]);

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) * (size.w / rect.width));
    const y = Math.round((e.clientY - rect.top) * (size.h / rect.height));
    runActions([{ type: 'click', x, y }]);
    setCursor({ x, y });
  }

  function handleCanvasWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const dy = Math.round(e.deltaY);
    runActions([{ type: 'scroll', deltaY: dy }]);
  }
  function handleCanvasMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const now = Date.now();
    if (now - (lastMoveRef.current || 0) < 60) return;
    lastMoveRef.current = now;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) * (size.w / rect.width));
    const y = Math.round((e.clientY - rect.top) * (size.h / rect.height));
    setCursor({ x, y });
    runActions([{ type: 'mouseMove', x, y, steps: 2 }]);
  }

  function handleCanvasTouchStart(e: React.TouchEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const touch = e.touches?.[0];
    if (!canvas || !touch) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = Math.round((touch.clientX - rect.left) * (size.w / rect.width));
    const y = Math.round((touch.clientY - rect.top) * (size.h / rect.height));
    runActions([{ type: 'click', x, y }]);
    setCursor({ x, y });
  }

  function handleCanvasTouchMove(e: React.TouchEvent<HTMLCanvasElement>) {
    const now = Date.now();
    if (now - (lastMoveRef.current || 0) < 60) return;
    lastMoveRef.current = now;
    const canvas = canvasRef.current;
    const touch = e.touches?.[0];
    if (!canvas || !touch) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = Math.round((touch.clientX - rect.left) * (size.w / rect.width));
    const y = Math.round((touch.clientY - rect.top) * (size.h / rect.height));
    setCursor({ x, y });
    runActions([{ type: 'mouseMove', x, y, steps: 2 }]);
  }
  function doType() {
    if (!typeText.trim()) return;
    runActions([{ type: 'type', text: typeText, delay: 30 }]);
    setTypeText('');
  }

  const [showControls, setShowControls] = useState(false);

  return (
    <div
      ref={rootRef}
      className="agent-browser-stream"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        position: focusMode ? 'fixed' : 'relative',
        inset: focusMode ? 12 : undefined,
        zIndex: focusMode ? 9999 : undefined,
        background: focusMode ? 'var(--bg-dark)' : undefined,
        padding: focusMode ? 12 : undefined,
        borderRadius: focusMode ? 16 : undefined,
        border: focusMode ? '1px solid var(--border-color)' : undefined,
        boxShadow: focusMode ? '0 12px 50px rgba(0,0,0,0.6)' : undefined,
      }}
    >
      <div
        className="agent-browser-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '10px 12px',
          background: 'var(--bg-secondary)',
          borderRadius: 12,
          border: '1px solid var(--border-color)',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: status === 'connected' ? 'var(--accent-success)' : (status === 'reconnecting' ? 'var(--accent-warning)' : 'var(--accent-danger)'),
              boxShadow: status === 'connected' ? '0 0 8px var(--accent-success)' : 'none'
            }}
          />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }} dir="auto">
            {status === 'connected' ? 'متصل' : status}
          </span>
          {status === 'error' ? (
            <button
              onClick={() => setReconnectNonce(v => v + 1)}
              style={{
                height: 28,
                padding: '0 10px',
                borderRadius: 8,
                border: '1px solid var(--border-color)',
                background: 'rgba(255,255,255,0.04)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
            >
              إعادة اتصال
            </button>
          ) : null}
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: '1 1 420px', minWidth: 260 }}>
          <button onClick={() => runActions([{ type: 'goBack' }])} title="Back" style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', cursor: 'pointer' }}>⟵</button>
          <button onClick={() => runActions([{ type: 'goForward' }])} title="Forward" style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', cursor: 'pointer' }}>⟶</button>
          <button onClick={() => runActions([{ type: 'reload' }])} title="Reload" style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', cursor: 'pointer' }}>⟳</button>
          <input
            type="text"
            value={address}
            onChange={e => setAddress(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                const url = normalizeUrl(address);
                if (url) runActions([{ type: 'goto', url, waitUntil: 'domcontentloaded' }]);
              }
            }}
            placeholder="https://example.com"
            dir="auto"
            style={{
              flex: 1,
              height: 32,
              padding: '0 10px',
              borderRadius: 10,
              border: '1px solid var(--border-color)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              outline: 'none',
              minWidth: 200,
            }}
          />
          <button
            onClick={() => {
              const url = normalizeUrl(address);
              if (url) runActions([{ type: 'goto', url, waitUntil: 'domcontentloaded' }]);
            }}
            style={{ height: 32, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'rgba(37, 99, 235, 0.12)', color: 'var(--text-primary)', cursor: 'pointer' }}
          >
            فتح
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => {
              const url = normalizeUrl(address);
              if (url && navigator.clipboard) navigator.clipboard.writeText(url).catch(() => {});
            }}
            title="Copy URL"
            style={{ height: 32, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', cursor: 'pointer' }}
          >
            نسخ
          </button>
          <button
            onClick={() => {
              const url = normalizeUrl(address);
              if (url) window.open(url, '_blank', 'noreferrer');
            }}
            title="Open in new tab"
            style={{ height: 32, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', cursor: 'pointer' }}
          >
            فتح خارجي
          </button>
          <button
            onClick={() => runActions([{ type: 'screenshot', fullPage: false, quality: 60 }])}
            title="Screenshot"
            style={{ height: 32, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', cursor: 'pointer' }}
          >
            لقطة
          </button>
          <button
            onClick={() => {
              const d = downloads[0];
              if (d?.href) window.open(d.href, '_blank', 'noreferrer');
            }}
            disabled={!downloads[0]?.href}
            title="Open latest download"
            style={{ height: 32, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', cursor: downloads[0]?.href ? 'pointer' : 'not-allowed', opacity: downloads[0]?.href ? 1 : 0.5 }}
          >
            تنزيل
          </button>
          <button
            onClick={() => setZoom(z => Math.max(0.5, Number((z - 0.1).toFixed(2))))}
            title="Zoom out"
            style={{ width: 32, height: 32, borderRadius: 10, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', cursor: 'pointer' }}
          >
            −
          </button>
          <button
            onClick={() => setZoom(1)}
            title="Reset zoom"
            style={{ height: 32, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', cursor: 'pointer' }}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => setZoom(z => Math.min(2, Number((z + 0.1).toFixed(2))))}
            title="Zoom in"
            style={{ width: 32, height: 32, borderRadius: 10, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', cursor: 'pointer' }}
          >
            +
          </button>
          <button
            onClick={async () => {
              try {
                if (!document.fullscreenElement) await rootRef.current?.requestFullscreen();
                else await document.exitFullscreen();
              } catch {}
            }}
            title="Fullscreen"
            style={{ height: 32, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', cursor: 'pointer' }}
          >
            {isFullscreen ? 'خروج' : 'ملء'}
          </button>
          <button
            onClick={() => setStreamPaused(v => !v)}
            title="Pause stream"
            style={{ height: 32, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border-color)', background: streamPaused ? 'rgba(37, 99, 235, 0.12)' : 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', cursor: 'pointer' }}
          >
            {streamPaused ? 'تشغيل' : 'إيقاف'}
          </button>
          <button
            onClick={() => setFocusMode(v => !v)}
            title="Focus mode"
            style={{ height: 32, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border-color)', background: focusMode ? 'rgba(37, 99, 235, 0.12)' : 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', cursor: 'pointer' }}
          >
            تركيز
          </button>
          <button
            onClick={() => setPanelOpen(v => !v)}
            title="Logs"
            style={{ height: 32, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border-color)', background: panelOpen ? 'rgba(37, 99, 235, 0.12)' : 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', cursor: 'pointer' }}
          >
            سجلات
          </button>
          <button
            onClick={() => setShowControls(!showControls)}
            style={{ height: 32, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', cursor: 'pointer' }}
          >
            {showControls ? 'أقل' : 'أكثر'}
          </button>
        </div>

        {wsError ? (
          <div style={{ width: '100%', fontSize: 12, color: 'var(--text-secondary)' }} dir="auto">
            {wsError}
          </div>
        ) : null}

        {overlay ? (
          <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
            <div style={{ padding: '4px 12px', background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: 999, color: '#60a5fa', fontSize: 12 }} dir="auto">
              {overlay}
            </div>
          </div>
        ) : null}
      </div>

      <div style={{ border: '1px solid var(--border-color)', borderRadius: 14, overflow: 'hidden', position: 'relative', background: '#000', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
        <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', position: 'relative' }}>
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            onWheel={handleCanvasWheel}
            onMouseMove={handleCanvasMove}
            onTouchStart={handleCanvasTouchStart}
            onTouchMove={handleCanvasTouchMove}
            style={{ width: '100%', height: 'auto', display: 'block', cursor: 'default', touchAction: 'none' }}
          />
          {highlight && (
            <div
              style={{
                position: 'absolute',
                left: `${(highlight.x / size.w) * 100}%`,
                top: `${(highlight.y / size.h) * 100}%`,
                width: `${(highlight.width / size.w) * 100}%`,
                height: `${(highlight.height / size.h) * 100}%`,
                border: '2px solid #eab308',
                boxShadow: '0 0 15px rgba(234, 179, 8, 0.4)',
                pointerEvents: 'none',
                borderRadius: 4,
                transition: 'all 0.2s ease'
              }}
            />
          )}

          {cursor && (
            <div
              style={{
                position: 'absolute',
                left: `${(cursor.x / size.w) * 100}%`,
                top: `${(cursor.y / size.h) * 100}%`,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
                zIndex: 50,
                transition: 'all 0.1s linear'
              }}
            >
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#eab308', border: '2px solid white', boxShadow: '0 2px 4px rgba(0,0,0,0.3)' }} />
            </div>
          )}
        </div>
      </div>

      {panelOpen ? (
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: 8, padding: 10, borderBottom: '1px solid var(--border-color)', flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => setActiveTab('console')} style={{ height: 30, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border-color)', background: activeTab === 'console' ? 'rgba(37, 99, 235, 0.12)' : 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', cursor: 'pointer' }}>Console</button>
            <button onClick={() => setActiveTab('network')} style={{ height: 30, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border-color)', background: activeTab === 'network' ? 'rgba(37, 99, 235, 0.12)' : 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', cursor: 'pointer' }}>Network</button>
            <button onClick={() => setActiveTab('downloads')} style={{ height: 30, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border-color)', background: activeTab === 'downloads' ? 'rgba(37, 99, 235, 0.12)' : 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', cursor: 'pointer' }}>Downloads</button>
            <div style={{ marginInlineStart: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={() => {
                  if (activeTab === 'console') setConsoleEntries([]);
                  if (activeTab === 'network') setNetworkEntries([]);
                  if (activeTab === 'downloads') setDownloads([]);
                }}
                style={{ height: 30, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', cursor: 'pointer' }}
              >
                Clear
              </button>
              <button onClick={() => setPanelOpen(false)} style={{ height: 30, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', cursor: 'pointer' }}>إخفاء</button>
            </div>
          </div>

          <div style={{ maxHeight: 220, overflow: 'auto', padding: 10, fontSize: 12, color: 'var(--text-primary)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace' }}>
            {activeTab === 'console' ? (
              consoleEntries.length ? consoleEntries.slice(-200).map((e, i) => (
                <div key={i} style={{ opacity: 0.95, padding: '2px 0' }} dir="auto">
                  <span style={{ color: e.level === 'error' ? 'var(--accent-danger)' : (e.level === 'warning' || e.level === 'warn' ? 'var(--accent-warning)' : 'var(--text-secondary)') }}>
                    {new Date(e.ts).toLocaleTimeString()}
                  </span>
                  {' '}
                  {e.text}
                </div>
              )) : <div style={{ color: 'var(--text-secondary)' }}>لا توجد رسائل</div>
            ) : null}

            {activeTab === 'network' ? (
              networkEntries.length ? networkEntries.slice(-200).map((e, i) => (
                <div key={i} style={{ opacity: 0.95, padding: '2px 0' }} dir="auto">
                  <span style={{ color: 'var(--text-secondary)' }}>{new Date(e.ts).toLocaleTimeString()}</span>
                  {' '}
                  <span style={{ color: e.stage === 'response' && typeof e.status === 'number' && e.status >= 400 ? 'var(--accent-danger)' : 'var(--text-primary)' }}>
                    {e.method}
                  </span>
                  {' '}
                  {e.stage === 'response' ? <span style={{ color: 'var(--text-secondary)' }}>{e.status ?? ''}</span> : <span style={{ color: 'var(--text-secondary)' }}>→</span>}
                  {' '}
                  {e.url}
                </div>
              )) : <div style={{ color: 'var(--text-secondary)' }}>لا توجد طلبات</div>
            ) : null}

            {activeTab === 'downloads' ? (
              downloads.length ? downloads.map((d, i) => (
                <div key={i} style={{ padding: '2px 0' }} dir="auto">
                  <a href={d.href} target="_blank" rel="noreferrer" style={{ color: '#3b82f6', textDecoration: 'none' }}>
                    {d.name}
                  </a>
                </div>
              )) : <div style={{ color: 'var(--text-secondary)' }}>لا توجد تنزيلات</div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Advanced Manual Controls (Hidden by Default) */}
      {showControls && (
        <div style={{ padding: 12, border: '1px solid var(--border-color)', borderRadius: 8, background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="agent-browser-controls-row" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={() => runActions([{ type: 'goBack' }])} className="btn" title="Back">⟵</button>
                <button onClick={() => runActions([{ type: 'goForward' }])} className="btn" title="Forward">⟶</button>
                <button onClick={() => runActions([{ type: 'reload' }])} className="btn" title="Reload">⟳</button>
                <input 
                  type="text" 
                  value={address} 
                  onChange={e => setAddress(e.target.value)} 
                  onKeyDown={e => { if (e.key === 'Enter' && address) runActions([{ type: 'goto', url: normalizeUrl(address), waitUntil: 'domcontentloaded' }]); }} 
                  placeholder="https://example.com"
                  style={{ flex: 1, minWidth: 220, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                />
                <button onClick={() => address && runActions([{ type: 'goto', url: normalizeUrl(address), waitUntil: 'domcontentloaded' }])} className="btn">Go</button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
                 {/* Upload */}
                 <div style={{ display: 'flex', gap: 4 }}>
                    <input type="text" placeholder="Upload Selector" value={uploadSelector} onChange={e => setUploadSelector(e.target.value)} style={{ flex: 1, padding: 4, borderRadius: 4, border: '1px solid var(--border-color)' }} />
                    <input type="file" ref={fileRef} style={{ width: 80 }} />
                    <button onClick={doUpload} className="btn">Up</button>
                 </div>
                 
                 {/* Type */}
                 <div style={{ display: 'flex', gap: 4 }}>
                    <input type="text" value={typeText} onChange={e => setTypeText(e.target.value)} placeholder="Type text..." style={{ flex: 1, padding: 4, borderRadius: 4, border: '1px solid var(--border-color)' }} />
                    <button onClick={doType} className="btn">Type</button>
                    <button onClick={() => runActions([{ type: 'press', key: 'Enter' }])} className="btn">Ent</button>
                 </div>

                 {/* Locate */}
                 <div style={{ display: 'flex', gap: 4 }}>
                    <input type="text" value={selector} onChange={e => setSelector(e.target.value)} placeholder="CSS Selector" style={{ flex: 1, padding: 4, borderRadius: 4, border: '1px solid var(--border-color)' }} />
                    <button onClick={() => selector && runActions([{ type: 'locate', selector }])} className="btn">Loc</button>
                    <button onClick={() => selector && runActions([{ type: 'click', selector }])} className="btn">Clk</button>
                 </div>
            </div>
            
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                DevTools: <label><input type="checkbox" checked={autoExtract} onChange={e => setAutoExtract(e.target.checked)} /> Auto Extract</label>
            </div>
        </div>
      )}
    </div>
  );
}
