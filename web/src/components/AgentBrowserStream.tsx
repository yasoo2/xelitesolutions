import { useEffect, useMemo, useRef, useState } from 'react';
import { API_URL as API } from '../config';

export default function AgentBrowserStream({ wsUrl, minimal }: { wsUrl: string; minimal?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);
  const fallbackActiveRef = useRef(false);
  const fallbackPollDelayRef = useRef<number>(1500);
  const fallbackPollFailuresRef = useRef<number>(0);
  const effectiveWsUrl = useMemo(() => {
    let abs = String(wsUrl || '').trim();
    if (!abs) return abs;
    try {
      if (!/^wss?:\/\//i.test(abs)) {
        const base = API.replace(/^http/i, 'ws');
        abs = new URL(abs, base).toString();
      }
    } catch {}
    try {
      const u = new URL(abs);
      if (u.pathname.startsWith('/ws/')) {
        const sessionId = u.pathname.split('/').filter(Boolean).pop() || '';
        const base = API.replace(/^http/i, 'ws');
        abs = new URL(`/browser/ws/${encodeURIComponent(sessionId)}`, base).toString();
      }
    } catch {}
    try {
      const u = new URL(abs);
      if (u.pathname.startsWith('/browser/ws/') && !u.searchParams.get('token')) {
        const token = localStorage.getItem('token');
        if (token) u.searchParams.set('token', token);
      }
      if (window.location.protocol === 'https:' && u.protocol === 'ws:') {
        u.protocol = 'wss:';
      }
      abs = u.toString();
    } catch {}
    return abs;
  }, [wsUrl]);
  const [size, setSize] = useState<{ w: number, h: number }>({ w: 1280, h: 800 });
  const sizeRef = useRef<{ w: number; h: number }>({ w: 1280, h: 800 });
  const [status, setStatus] = useState('connecting');
  const [wsError, setWsError] = useState<string>('');
  const [fallbackActive, setFallbackActive] = useState(false);
  const [fallbackError, setFallbackError] = useState('');
  const [framesSeen, setFramesSeen] = useState<number>(0);
  const [lastFrameAt, setLastFrameAt] = useState<number>(0);
  const [noFramesHint, setNoFramesHint] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [tabs, setTabs] = useState<Array<{ id: string; title?: string; url?: string; createdAt?: number }>>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const activeTabIdRef = useRef<string>('');
  const [downloads, setDownloads] = useState<Array<{ name: string; href: string }>>([]);
  const [overlay, setOverlay] = useState<string>('');
  const [zoom, setZoom] = useState<number>(1);
  const [focusMode, setFocusMode] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [streamPaused, setStreamPaused] = useState<boolean>(false);
  const [streamFps, setStreamFps] = useState<number>(5);
  const [streamQuality, setStreamQuality] = useState<number>(50);
  const [redactionEnabled, setRedactionEnabled] = useState<boolean>(true);
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
  const cursorRafRef = useRef<number | null>(null);
  const pendingCursorRef = useRef<{ x: number; y: number } | null>(null);
  const highlightRafRef = useRef<number | null>(null);
  const pendingHighlightRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const connectTimeoutRef = useRef<number | null>(null);
  const connectAttemptsRef = useRef<number>(0);
  const [controlEnabled, setControlEnabled] = useState<boolean>(false);
  const [canvasFocused, setCanvasFocused] = useState<boolean>(false);
  const [pickerMode, setPickerMode] = useState<boolean>(false);
  const [picked, setPicked] = useState<any>(null);
  const [loginMode, setLoginMode] = useState<boolean>(false);
  const [timelineEnabled, setTimelineEnabled] = useState<boolean>(false);
  const [timeline, setTimeline] = useState<Array<{ ts: number; jpegBase64: string }>>([]);
  const [timelineEvents, setTimelineEvents] = useState<Array<{ ts: number; kind: 'action' | 'error' | 'click' | 'url'; text: string }>>([]);
  const [replayMode, setReplayMode] = useState<boolean>(false);
  const [replayIndex, setReplayIndex] = useState<number>(0);
  const [replayPlaying, setReplayPlaying] = useState<boolean>(false);
  const lastTimelinePushAtRef = useRef<number>(0);
  const prevStreamPausedRef = useRef<boolean>(false);
  const pendingFrameRef = useRef<string | null>(null);
  const decodingFrameRef = useRef<boolean>(false);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const lastCanvasSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const MAX_TIMELINE_FRAMES = 90;
  const MAX_TIMELINE_EVENTS = 140;

  const [quickSearchQuery, setQuickSearchQuery] = useState<string>('');
  const [quickClickText, setQuickClickText] = useState<string>('');

  useEffect(() => {
    if (!minimal) return;

    setFocusMode(false);
    setZoom(1);
    setStreamPaused(false);
  }, [minimal]);

  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

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
      const u = new URL(effectiveWsUrl);
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
        const base = new URL(effectiveWsUrl);
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
    const wsActions = ['goto', 'mouseMove', 'click', 'clickText', 'fillByLabel', 'searchGoogle', 'scroll', 'type', 'press', 'goBack', 'goForward', 'reload', 'screenshot', 'tab.new', 'tab.switch', 'tab.close', 'tabs.list', 'pick', 'stream.setFps', 'stream.setQuality', 'redaction.set'];
    const canUseWs = wsRef.current && 
                     wsRef.current.readyState === WebSocket.OPEN && 
                     actions.every(a => wsActions.includes(a.type));

    if (canUseWs) {
       const gotoUrl = actions.find((a: any) => a && a.type === 'goto' && typeof a.url === 'string')?.url;
       if (typeof gotoUrl === 'string' && gotoUrl.trim()) setAddress(gotoUrl.trim());
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
      const gotoUrl = actions.find((a: any) => a && a.type === 'goto' && typeof a.url === 'string')?.url;
      if (typeof gotoUrl === 'string' && gotoUrl.trim()) setAddress(gotoUrl.trim());
      const actionNames = actions.map(a => a.type).join(', ');
      if (actionNames) {
        setOverlay(actionNames);
        setTimeout(() => setOverlay(''), 1200);
      }
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/tools/browser_run/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ sessionId, actions })
      });
      if (res.status === 401) {
        localStorage.removeItem('token');
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        setWsError('غير مصرح');
        setOverlay('غير مصرح');
        setTimeout(() => setOverlay(''), 2000);
        return;
      }
      const j = await res.json();
      if (Array.isArray(j.artifacts)) {
        const items = j.artifacts.map((a: any) => ({ name: a.name || a.filename || 'download', href: a.href }));
        setDownloads(prev => [...items, ...prev].slice(0, 5));
      }
      if (j?.ok && Array.isArray(j?.output?.outputs)) {
        const outs = j.output.outputs;
        const blocked = outs.find((o: any) => o && o.type === 'goto_blocked');
        if (blocked?.url) {
          const msg = `تم حظر فتح هذا الرابط: ${String(blocked.url)}`;
          setWsError(msg);
          setOverlay(msg);
          setTimeout(() => setOverlay(''), 2500);
        }
        const err = outs.find((o: any) => o && o.type === 'error' && (o.message || o.action));
        if (err?.message) {
          const msg = String(err.message);
          setWsError(msg);
          setOverlay(msg);
          setTimeout(() => setOverlay(''), 2500);
        }
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
                runActions([{ type: 'waitForSelector', selector: 'textarea[name="q"], input[name="q"]:not([type="hidden"])', timeoutMs: 8000 }]);
                setTimeout(() => runActions([{ type: 'type', text: defaultSearchText, delay: 30 }]), 200);
                setTimeout(() => runActions([{ type: 'press', key: 'Enter' }]), 300);
              }, 400);
            }
          }
        }
      }
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
                extra.push({ type: 'locate', selector: 'textarea[name="q"], input[name="q"]:not([type="hidden"])' });
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
      if (res.status === 401) {
        localStorage.removeItem('token');
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        setOverlay('غير مصرح');
        setTimeout(() => setOverlay(''), 2000);
        setExtracted(null);
        return;
      }
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
      if (res.status === 401) {
        localStorage.removeItem('token');
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        setOverlay('غير مصرح');
        setTimeout(() => setOverlay(''), 2000);
        return;
      }
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
    setFramesSeen(0);
    setLastFrameAt(0);
    setNoFramesHint('');

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

        const ws = new WebSocket(effectiveWsUrl);
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
          setNoFramesHint('');
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
              if (Array.isArray(msg.tabs)) setTabs(msg.tabs);
              if (typeof msg.activeTabId === 'string') setActiveTabId(msg.activeTabId);
              if (msg.stream?.fps) setStreamFps(Number(msg.stream.fps) || 5);
              if (msg.stream?.quality) setStreamQuality(Number(msg.stream.quality) || 50);
              if (typeof msg.redactionEnabled === 'boolean') setRedactionEnabled(Boolean(msg.redactionEnabled));
              if (Array.isArray(msg.downloads)) {
                const items = msg.downloads.map((d: any) => ({ name: d.filename || d.name || 'download', href: absHrefFromWs(d.href) }));
                setDownloads(items.slice(-10).reverse());
              }

            }
            if (msg.type === 'tabs') {
              if (Array.isArray(msg.tabs)) setTabs(msg.tabs);
              if (typeof msg.activeTabId === 'string') setActiveTabId(msg.activeTabId);
            }
            if (msg.type === 'stream') {
              if (typeof msg.fps === 'number') setStreamFps(msg.fps);
              if (typeof msg.quality === 'number') setStreamQuality(msg.quality);
            }
            if (msg.type === 'redaction') {
              if (typeof msg.enabled === 'boolean') setRedactionEnabled(Boolean(msg.enabled));
            }
            if (msg.type === 'url' && typeof msg.url === 'string') {
              if (!msg.tabId || String(msg.tabId) === String(activeTabIdRef.current)) setAddress(msg.url);
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
              pendingCursorRef.current = { x: msg.x, y: msg.y };
              if (cursorRafRef.current == null) {
                cursorRafRef.current = requestAnimationFrame(() => {
                  cursorRafRef.current = null;
                  if (pendingCursorRef.current) setCursor(pendingCursorRef.current);
                });
              }
            }
            if (msg.type === 'cursor_click') {
              setCursor({ x: msg.x, y: msg.y });
              if (timelineEnabled && !replayMode) {
                const now = Date.now();
                setTimelineEvents(prev => [...prev, { ts: now, kind: 'click' as const, text: `${Math.round(msg.x)},${Math.round(msg.y)}` }].slice(-MAX_TIMELINE_EVENTS));
              }
              const clickEl = document.createElement('div');
              const s = sizeRef.current;
              clickEl.style.cssText = `
                position: absolute;
                left: ${(msg.x / s.w) * 100}%;
                top: ${(msg.y / s.h) * 100}%;
                width: 20px; height: 20px;
                background: rgba(var(--accent-secondary-rgb), 0.45);
                border-radius: 50%;
                transform: translate(-50%, -50%);
                pointer-events: none;
                z-index: 100;
                transition: opacity 0.5s;
              `;
              canvasRef.current?.parentElement?.appendChild(clickEl);
              setTimeout(() => clickEl.remove(), 500);
            }
            if (msg.type === 'highlight' && msg.boundingBox) {
              const b = msg.boundingBox;
              if (
                typeof b?.x === 'number' &&
                typeof b?.y === 'number' &&
                typeof b?.width === 'number' &&
                typeof b?.height === 'number'
              ) {
                pendingHighlightRef.current = { x: b.x, y: b.y, width: b.width, height: b.height };
                if (highlightRafRef.current == null) {
                  highlightRafRef.current = requestAnimationFrame(() => {
                    highlightRafRef.current = null;
                    if (pendingHighlightRef.current) setHighlight(pendingHighlightRef.current);
                  });
                }
              }
            }
            if (msg.type === 'action_start') {
              const a = msg.action;
              let text = a.type;
              if (a.type === 'goto') text = `Opening ${new URL(a.url).hostname}...`;
              if (a.type === 'type') text = `Typing...`;
              if (a.type === 'click') text = `Clicking...`;
              if (a.type === 'clickText') text = `Clicking text...`;
              if (a.type === 'fillByLabel') text = `Filling field...`;
              if (a.type === 'searchGoogle') text = `Searching Google...`;
              if (a.type === 'scroll') text = `Scrolling...`;
              if (a.type === 'screenshot') text = `Capturing View...`;
              setOverlay(text);
              if (timelineEnabled && !replayMode) {
                const now = Date.now();
                setTimelineEvents(prev => [...prev, { ts: now, kind: 'action' as const, text: String(text) }].slice(-MAX_TIMELINE_EVENTS));
              }
            }
            if (msg.type === 'action_done') {
              setTimeout(() => setOverlay(''), 500);
            }
            if (msg.type === 'action_error') {
              setOverlay(String(msg.error || 'Action error'));
              setTimeout(() => setOverlay(''), 1500);
              if (timelineEnabled && !replayMode) {
                const now = Date.now();
                setTimelineEvents(prev => [...prev, { ts: now, kind: 'error' as const, text: String(msg.error || 'Action error') }].slice(-MAX_TIMELINE_EVENTS));
              }
            }
            if (msg.type === 'url' && typeof msg.url === 'string') {
              if (timelineEnabled && !replayMode) {
                const now = Date.now();
                let host = msg.url;
                try { host = new URL(msg.url).hostname; } catch {}
                setTimelineEvents(prev => [...prev, { ts: now, kind: 'url' as const, text: host }].slice(-MAX_TIMELINE_EVENTS));
              }
            }
            if (msg.type === 'frame') {
              const now = Date.now();
              setLastFrameAt(now);
              setFramesSeen((c) => c + 1);
              setNoFramesHint('');
              if (timelineEnabled && !replayMode && typeof msg.jpegBase64 === 'string') {
                const now = Date.now();
                if (now - lastTimelinePushAtRef.current >= 800) {
                  lastTimelinePushAtRef.current = now;
                  setTimeline(prev => {
                    const next = [...prev, { ts: Number(msg.ts || now), jpegBase64: msg.jpegBase64 }].slice(-MAX_TIMELINE_FRAMES);
                    return next;
                  });
                }
              }
              if (streamPaused || replayMode) return;
              if (typeof msg.jpegBase64 === 'string') enqueueJpegFrame(msg.jpegBase64);
            }
            if (msg.type === 'pick' && msg.element) {
              setPicked(msg.element);
              if (msg.element?.selector) setSelector(String(msg.element.selector));
              if (msg.element?.boundingBox) setHighlight(msg.element.boundingBox);
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
      if (fallbackTimerRef.current != null) {
        window.clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      fallbackActiveRef.current = false;
      setFallbackActive(false);
      setFallbackError('');
      if (cursorRafRef.current != null) cancelAnimationFrame(cursorRafRef.current);
      cursorRafRef.current = null;
      pendingCursorRef.current = null;
      pendingFrameRef.current = null;
      decodingFrameRef.current = false;
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
    };
  }, [wsUrl, reconnectNonce]);

  useEffect(() => {
    const sessionId = getSessionId();
    if (!sessionId) return;
    if (framesSeen > 0) {
      if (fallbackTimerRef.current != null) {
        window.clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      fallbackActiveRef.current = false;
      setFallbackActive(false);
      setFallbackError('');
      return;
    }

    const shouldTryFallback = status === 'error' || (status === 'connected' && framesSeen === 0);
    if (!shouldTryFallback) return;
    if (fallbackActiveRef.current) return;

    const token = localStorage.getItem('token') || '';
    let stopped = false;

    const poll = async () => {
      if (stopped) return;
      try {
        const res = await fetch(`${API}/sessions/${encodeURIComponent(sessionId)}/browser/snapshot`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          } as any,
          body: JSON.stringify({}),
        });

        if (res.status === 401) {
          localStorage.removeItem('token');
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
          setFallbackError('غير مصرح');
          return;
        }

        if (!res.ok) {
          const t = await res.text().catch(() => '');
          setFallbackError(t ? `Snapshot error: ${t.slice(0, 140)}` : 'Snapshot error');
          fallbackPollFailuresRef.current += 1;
          fallbackPollDelayRef.current = Math.min(6000, 1500 + fallbackPollFailuresRef.current * 900);
        } else {
          const j: any = await res.json().catch(() => null);
          setFallbackError('');
          if (j?.viewport?.width && j?.viewport?.height) {
            const next = { w: j.viewport.width, h: j.viewport.height };
            sizeRef.current = next;
            setSize(next);
          }
          if (typeof j?.url === 'string' && j.url) setAddress(j.url);
          if (typeof j?.jpegBase64 === 'string' && j.jpegBase64) {
            const now = Date.now();
            setLastFrameAt(now);
            setFramesSeen((c) => c + 1);
            setNoFramesHint('');
            if (!streamPaused && !replayMode) enqueueJpegFrame(j.jpegBase64);
            fallbackPollFailuresRef.current = 0;
            fallbackPollDelayRef.current = 1500;
          } else {
            fallbackPollFailuresRef.current += 1;
            fallbackPollDelayRef.current = Math.min(6000, 1500 + fallbackPollFailuresRef.current * 900);
          }
        }
      } catch (e: any) {
        setFallbackError(String(e?.message || e || 'Snapshot error'));
        fallbackPollFailuresRef.current += 1;
        fallbackPollDelayRef.current = Math.min(6000, 1500 + fallbackPollFailuresRef.current * 900);
      }

      fallbackTimerRef.current = window.setTimeout(poll, fallbackPollDelayRef.current);
    };

    fallbackActiveRef.current = true;
    setFallbackActive(true);
    setFallbackError('');
    fallbackPollFailuresRef.current = 0;
    fallbackPollDelayRef.current = 1500;
    const delay = status === 'connected' ? 3200 : 0;
    fallbackTimerRef.current = window.setTimeout(() => {
      if (stopped) return;
      poll();
    }, delay);

    return () => {
      stopped = true;
    };
  }, [status, framesSeen, streamPaused, replayMode, effectiveWsUrl]);

  useEffect(() => {
    if (status !== 'connected') {
      setNoFramesHint('');
      return;
    }
    if (framesSeen > 0) {
      setNoFramesHint('');
      return;
    }
    const t = window.setTimeout(() => {
      if (framesSeen === 0 && status === 'connected') {
        setNoFramesHint('تم الاتصال ولكن لم تصل أي صورة بعد. غالبًا بث WebSocket محجوب أو خدمة المتصفح متوقفة.');
      }
    }, 3000);
    return () => window.clearTimeout(t);
  }, [status, framesSeen]);

  useEffect(() => {
    if (!replayMode) return;
    if (!replayPlaying) return;
    if (timeline.length <= 1) return;
    const timer = window.setInterval(() => {
      setReplayIndex((i) => {
        const last = Math.max(0, timeline.length - 1);
        if (i >= last) {
          setReplayPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 800);
    return () => window.clearInterval(timer);
  }, [replayMode, replayPlaying, timeline.length]);

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!controlEnabled) setControlEnabled(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    try { canvas.focus(); } catch {}
    const rect = canvas.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) * (size.w / rect.width));
    const y = Math.round((e.clientY - rect.top) * (size.h / rect.height));
    if (pickerMode) runActions([{ type: 'pick', x, y }]);
    else runActions([{ type: 'click', x, y }]);
    setCursor({ x, y });
  }

  function handleCanvasWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    if (!controlEnabled) return;
    e.preventDefault();
    const dy = Math.round(e.deltaY);
    runActions([{ type: 'scroll', deltaY: dy }]);
  }
  function handleCanvasMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!controlEnabled) return;
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
    if (!controlEnabled) return;
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
    if (!controlEnabled) return;
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
    runActions([{ type: 'type', text: typeText, delay: 30, sensitive: loginMode }]);
    setTypeText('');
  }



  function handleCanvasKeyDown(e: React.KeyboardEvent<HTMLCanvasElement>) {
    if (!controlEnabled) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      runActions([{ type: 'press', key: 'Enter' }]);
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      runActions([{ type: 'press', key: 'Backspace' }]);
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      runActions([{ type: 'press', key: 'Tab' }]);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      runActions([{ type: 'press', key: 'Escape' }]);
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      runActions([{ type: 'press', key: e.key }]);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key && e.key.length === 1) {
      e.preventDefault();
      runActions([{ type: 'type', text: e.key, delay: 0, sensitive: loginMode }]);
    }
  }

  function ensureCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const s = sizeRef.current;
    const last = lastCanvasSizeRef.current;
    if (canvas.width !== s.w || canvas.height !== s.h || last.w !== s.w || last.h !== s.h) {
      canvas.width = s.w;
      canvas.height = s.h;
      lastCanvasSizeRef.current = { w: s.w, h: s.h };
      ctxRef.current = null;
    }
    if (!ctxRef.current) ctxRef.current = canvas.getContext('2d');
    return ctxRef.current;
  }

  async function decodeAndDraw(jpegBase64: string) {
    const ctx = ensureCanvas();
    if (!ctx) return;
    const s = sizeRef.current;
    const toBytes = (b64: string) => {
      const bin = atob(b64);
      const len = bin.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    };

    if (typeof (window as any).createImageBitmap === 'function') {
      try {
        const bytes = toBytes(jpegBase64);
        const blob = new Blob([bytes], { type: 'image/jpeg' });
        const bmp = await createImageBitmap(blob);
        ctx.drawImage(bmp as any, 0, 0, s.w, s.h);
        try { (bmp as any).close?.(); } catch {}
        return;
      } catch {}
    }

    await new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, s.w, s.h);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = 'data:image/jpeg;base64,' + jpegBase64;
    });
  }

  function enqueueJpegFrame(jpegBase64: string) {
    pendingFrameRef.current = jpegBase64;
    if (decodingFrameRef.current) return;
    decodingFrameRef.current = true;
    void (async () => {
      try {
        while (pendingFrameRef.current) {
          const next = pendingFrameRef.current;
          pendingFrameRef.current = null;
          await decodeAndDraw(next);
        }
      } finally {
        decodingFrameRef.current = false;
      }
    })();
  }

  useEffect(() => {
    if (!replayMode) return;
    const f = timeline[replayIndex];
    if (!f?.jpegBase64) return;
    enqueueJpegFrame(f.jpegBase64);
  }, [replayMode, replayIndex, timeline]);

  useEffect(() => {
    if (!replayMode) return;
    setReplayIndex(i => Math.max(0, Math.min(i, Math.max(0, timeline.length - 1))));
  }, [replayMode, timeline.length]);

  const CompactHeader = (
    <div
      className="browser-chrome-ui"
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-card)',
        borderBottom: '1px solid var(--border-color)',
        fontFamily: 'Segoe UI, Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      {/* Tabs Bar */}
      <div 
        className="browser-tabs-bar"
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          padding: '8px 8px 0 8px',
          gap: 6,
          background: 'var(--bg-card)',
          overflowX: 'auto',
          height: 38,
        }}
      >
        {tabs.map((t) => {
          const isActive = String(t.id) === String(activeTabId);
          let label = t.title && t.title.trim() ? t.title : (t.url ? (() => { try { return new URL(String(t.url)).hostname; } catch { return String(t.url); } })() : 'New Tab');
          label = String(label).slice(0, 25);
          return (
            <div 
              key={t.id} 
              onClick={() => runActions([{ type: 'tab.switch', tabId: t.id }])}
              className="browser-tab"
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 8,
                padding: '0 12px',
                height: 30,
                background: isActive ? 'rgba(var(--accent-primary-rgb), 0.12)' : 'transparent',
                color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                borderRadius: '8px 8px 0 0',
                fontSize: 12,
                cursor: 'pointer',
                maxWidth: 200,
                minWidth: 120,
                position: 'relative',
                transition: 'background 0.2s, color 0.2s',
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)'; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
              <button
                onClick={(e) => { e.stopPropagation(); runActions([{ type: 'tab.close', tabId: t.id }]); }}
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 14, opacity: 0.7, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: '50%' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
              >
                ×
              </button>
            </div>
          );
        })}
        <button
          onClick={() => runActions([{ type: 'tab.new', url: 'about:blank', waitUntil: 'domcontentloaded' }])}
          style={{ width: 28, height: 28, borderRadius: '50%', background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          +
        </button>
      </div>

      {/* Address Bar Toolbar */}
      <div 
        className="browser-toolbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 12px',
          height: 52,
          background: 'var(--bg-card)',
        }}
      >
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => runActions([{ type: 'goBack' }])}
            style={{ width: 32, height: 32, borderRadius: '50%', background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
          >
            ←
          </button>
          <button
            onClick={() => runActions([{ type: 'goForward' }])}
            style={{ width: 32, height: 32, borderRadius: '50%', background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
          >
            →
          </button>
          <button
            onClick={() => runActions([{ type: 'reload' }])}
            style={{ width: 32, height: 32, borderRadius: '50%', background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
          >
            ↻
          </button>
        </div>

        <div 
          style={{
            flex: 1,
            background: 'var(--bg-input)',
            borderRadius: 24,
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            height: 36,
            border: '1px solid transparent',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            transition: 'border-color 0.2s, background 0.2s',
          }}
          onFocus={(e) => { e.currentTarget.style.background = 'var(--bg-input)'; e.currentTarget.style.border = '1px solid var(--border-light)'; }}
          onBlur={(e) => { e.currentTarget.style.background = 'var(--bg-input)'; e.currentTarget.style.border = '1px solid transparent'; }}
        >
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
            placeholder="Search or enter website name"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              outline: 'none',
              fontSize: 14,
            }}
          />
        </div>
        
        <button
          onClick={() => {
            const url = normalizeUrl(address);
            if (url) runActions([{ type: 'goto', url, waitUntil: 'domcontentloaded' }]);
          }}
          style={{
             background: 'none',
             color: 'var(--accent-primary)',
             border: 'none',
             padding: '0 8px',
             fontSize: 14,
             cursor: 'pointer',
             height: 36,
             fontWeight: 500,
             transition: 'opacity 0.2s'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
        >
          Go
        </button>
      </div>
    </div>
  );

  return (
    <div
      ref={rootRef}
      className="agent-browser-stream"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        position: focusMode ? 'fixed' : 'relative',
        inset: focusMode ? 12 : undefined,
        zIndex: focusMode ? 9999 : undefined,
        background: focusMode ? 'var(--bg-dark)' : undefined,
        padding: focusMode ? 0 : undefined,
        borderRadius: focusMode ? 12 : undefined,
        border: focusMode ? '1px solid var(--border-light)' : undefined,
        boxShadow: focusMode ? '0 12px 50px rgba(0,0,0,0.6)' : undefined,
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {CompactHeader}





      <div className="agent-browser-canvas-frame" style={{ border: minimal ? 'none' : undefined, borderRadius: 0, overflow: 'hidden', position: 'relative', background: 'var(--bg-dark)', boxShadow: minimal ? 'none' : undefined, flex: minimal ? 1 : undefined }}>
        <div style={{ transform: minimal ? 'none' : `scale(${zoom})`, transformOrigin: 'top left', position: 'relative' }}>
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            onWheel={handleCanvasWheel}
            onMouseMove={handleCanvasMove}
            onTouchStart={handleCanvasTouchStart}
            onTouchMove={handleCanvasTouchMove}
            tabIndex={0}
            onFocus={() => setCanvasFocused(true)}
            onBlur={() => setCanvasFocused(false)}
            onKeyDown={handleCanvasKeyDown}
            style={{ width: '100%', height: 'auto', display: 'block', cursor: controlEnabled ? 'crosshair' : 'pointer', touchAction: 'none', outline: 'none' }}
          />
          {(status !== 'connected' || wsError || noFramesHint || fallbackActive || fallbackError) ? (
            <div
              style={{
                position: 'absolute',
                left: 12,
                top: 12,
                zIndex: 80,
                maxWidth: 'min(520px, calc(100% - 24px))',
                padding: '10px 12px',
                borderRadius: 12,
                background: 'rgba(0,0,0,0.60)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.92)',
                fontSize: 12,
                lineHeight: 1.35,
                backdropFilter: 'blur(8px)',
              }}
              dir="auto"
            >
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                {status === 'connected' ? 'متصل' : status === 'reconnecting' ? 'يعيد الاتصال...' : status === 'error' ? 'خطأ اتصال' : 'جاري الاتصال...'}
                {fallbackActive ? ' • وضع بديل (HTTP)' : ''}
              </div>
              {wsError ? <div style={{ color: 'var(--accent-danger)', marginBottom: 6 }}>{wsError}</div> : null}
              {fallbackError ? <div style={{ color: 'var(--accent-secondary)', marginBottom: 6 }}>{fallbackError}</div> : null}
              {noFramesHint ? <div style={{ color: 'rgba(255,255,255,0.85)', marginBottom: 8 }}>{noFramesHint}</div> : null}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setReconnectNonce((n) => n + 1)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 10,
                    border: '1px solid rgba(255,255,255,0.18)',
                    background: 'rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.92)',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  إعادة الاتصال
                </button>
                <div style={{ opacity: 0.75 }}>
                  {framesSeen > 0 ? `Frames: ${framesSeen}` : lastFrameAt ? `Last frame: ${new Date(lastFrameAt).toLocaleTimeString()}` : `Frames: 0`}
                </div>
              </div>
            </div>
          ) : null}
          {minimal && controlEnabled && !canvasFocused ? (
            <div
              style={{
                position: 'absolute',
                left: 12,
                bottom: 12,
                zIndex: 70,
                padding: '6px 10px',
                borderRadius: 12,
                background: 'rgba(0,0,0,0.55)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.85)',
                fontSize: 12,
                backdropFilter: 'blur(8px)',
              }}
              dir="auto"
            >
              اضغط داخل المتصفح لتفعيل لوحة المفاتيح
            </div>
          ) : null}
          {highlight && (
            <div
              style={{
                position: 'absolute',
                left: `${(highlight.x / size.w) * 100}%`,
                top: `${(highlight.y / size.h) * 100}%`,
                width: `${(highlight.width / size.w) * 100}%`,
                height: `${(highlight.height / size.h) * 100}%`,
                border: '2px solid var(--accent-secondary)',
                boxShadow: '0 0 15px rgba(var(--accent-secondary-rgb), 0.4)',
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
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--accent-secondary)', border: '2px solid white', boxShadow: '0 2px 4px rgba(0,0,0,0.3)' }} />
            </div>
          )}
        </div>
      </div>


    </div>
  );
}
