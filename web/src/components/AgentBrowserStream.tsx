import { useEffect, useRef, useState } from 'react';
import { API_URL as API } from '../config';

export default function AgentBrowserStream({ wsUrl }: { wsUrl: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [size, setSize] = useState<{ w: number, h: number }>({ w: 1280, h: 800 });
  const [status, setStatus] = useState('connecting');
  const [address, setAddress] = useState<string>('');
  const [downloads, setDownloads] = useState<Array<{ name: string; href: string }>>([]);
  const [overlay, setOverlay] = useState<string>('');
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

  function getSessionId() {
    try {
      const u = new URL(wsUrl);
      const parts = u.pathname.split('/').filter(Boolean);
      return parts[parts.length - 1];
    } catch {
      return '';
    }
  }

  async function runActions(actions: any[]) {
    const sessionId = getSessionId();
    if (!sessionId) return;
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
            const isGoogleSelector = Boolean(locAct?.selector && /input\[name=["']q["']\]/i.test(String(locAct.selector)));
            const isSearchRole = Boolean(locAct?.roleName && String(locAct.roleName).includes('بحث'));
            if (autoTypeAfterFocus && !typeText.trim() && (isGoogleSelector || isSearchRole)) {
              setTimeout(() => {
                runActions([{ type: 'type', text: defaultSearchText, delay: 30 }]);
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
                extra.push({ type: 'locate', selector: 'input[name="q"]' });
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
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => setStatus('connected');
      ws.onclose = () => setStatus('closed');
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'stream_start') {
            setSize({ w: msg.w, h: msg.h });
          }
          if (msg.type === 'frame') {
            const img = new Image();
            img.onload = () => {
              const canvas = canvasRef.current!;
              if (!canvas) return;
              canvas.width = size.w;
              canvas.height = size.h;
              const ctx = canvas.getContext('2d')!;
              ctx.drawImage(img, 0, 0, size.w, size.h);
            };
            img.src = 'data:image/jpeg;base64,' + msg.jpegBase64;
          }
        } catch {}
      };
      return () => { try { ws.close(); } catch {} };
    } catch (e) {
      setStatus('error');
    }
  }, [wsUrl, size.w, size.h]);

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
  function doType() {
    if (!typeText.trim()) return;
    runActions([{ type: 'type', text: typeText, delay: 30 }]);
    setTypeText('');
  }

  return (
    <div className="agent-browser-stream" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={() => runActions([{ type: 'goBack' }])} className="btn" title="Back">⟵</button>
        <button onClick={() => runActions([{ type: 'goForward' }])} className="btn" title="Forward">⟶</button>
        <button onClick={() => runActions([{ type: 'reload' }])} className="btn" title="Reload">⟳</button>
        <input 
          type="text" 
          value={address} 
          onChange={e => setAddress(e.target.value)} 
          onKeyDown={e => { if (e.key === 'Enter' && address) runActions([{ type: 'goto', url: address, waitUntil: 'domcontentloaded' }]); }} 
          placeholder="https://example.com"
          style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
        />
        <button onClick={() => address && runActions([{ type: 'goto', url: address, waitUntil: 'domcontentloaded' }])} className="btn" title="Go">Go</button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <input type="checkbox" checked={autoExtract} onChange={e => setAutoExtract(e.target.checked)} />
          Auto Extract
        </label>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: status === 'connected' ? '#22c55e' : '#f59e0b' }}></div>
        <span style={{ fontSize: 12, opacity: 0.6 }}>{status}</span>
        {!!overlay && <span style={{ fontSize: 12, opacity: 0.8 }}>Joe: {overlay}</span>}
      </div>
      <div style={{ border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
        <canvas 
          ref={canvasRef} 
          onClick={handleCanvasClick} 
          onWheel={handleCanvasWheel} 
          onMouseMove={handleCanvasMove}
          style={{ width: '100%', height: 'auto', display: 'block', background: 'black', cursor: 'crosshair' }} 
        />
        {highlight && (
          <div
            style={{
              position: 'absolute',
              left: `${(highlight.x / size.w) * 100}%`,
              top: `${(highlight.y / size.h) * 100}%`,
              width: `${(highlight.width / size.w) * 100}%`,
              height: `${(highlight.height / size.h) * 100}%`,
              border: '2px solid rgba(59,130,246,0.9)',
              boxShadow: '0 0 12px rgba(59,130,246,0.6)',
              pointerEvents: 'none'
            }}
            title="Highlight"
          />
        )}
        {cursor && (
          <div
            style={{
              position: 'absolute',
              left: `${(cursor.x / size.w) * 100}%`,
              top: `${(cursor.y / size.h) * 100}%`,
              transform: 'translate(-50%, -50%)',
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: 'rgba(34,197,94,0.8)',
              boxShadow: '0 0 12px rgba(34,197,94,0.8)',
              pointerEvents: 'none'
            }}
            title="Cursor"
          />
        )}
      </div>
      {downloads.length > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {downloads.map((d, i) => (
            <a key={i} href={d.href} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--text-primary)', textDecoration: 'underline' }}>
              {d.name}
            </a>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input 
          type="text" 
          placeholder="CSS selector for file input (e.g. input[type=file])" 
          value={uploadSelector}
          onChange={e => setUploadSelector(e.target.value)}
          style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
        />
        <input type="file" ref={fileRef} />
        <button onClick={doUpload} className="btn">Upload</button>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input 
          type="text" 
          value={typeText} 
          onChange={e => setTypeText(e.target.value)} 
          placeholder="Type into focused element..."
          style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
          onKeyDown={e => { if (e.key === 'Enter') doType(); }}
        />
        <button onClick={doType} className="btn">Type</button>
        <button onClick={() => runActions([{ type: 'press', key: 'Enter' }])} className="btn">Enter</button>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="text"
          placeholder="CSS selector (مثال: input[name=q])"
          value={selector}
          onChange={e => setSelector(e.target.value)}
          style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
        />
        <button onClick={() => selector && runActions([{ type: 'locate', selector }])} className="btn">Locate</button>
        <button onClick={() => selector && runActions([{ type: 'click', selector }])} className="btn">اضغط المحدد</button>
        <button onClick={() => selector && runActions([{ type: 'scrollTo', selector }])} className="btn">Scroll إلى المحدد</button>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="text"
          placeholder="role (مثال: button)"
          value={role}
          onChange={e => setRole(e.target.value)}
          style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
        />
        <input
          type="text"
          placeholder="name (مثال: بحث)"
          value={roleName}
          onChange={e => setRoleName(e.target.value)}
          style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
        />
        <button 
          onClick={() => role && roleName && runActions([{ type: 'locate', role, roleName }])} 
          className="btn"
        >
          Locate (role/name)
        </button>
        <button 
          onClick={() => role && roleName && runActions([{ type: 'click', role, roleName }])} 
          className="btn"
        >
          اضغط (role/name)
        </button>
        <button 
          onClick={() => role && roleName && runActions([{ type: 'waitForRole', role, roleName }])} 
          className="btn"
        >
          انتظر (role/name)
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <input type="checkbox" checked={autoLocate} onChange={e => setAutoLocate(e.target.checked)} />
          Auto Locate بعد التنقل
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <input type="checkbox" checked={autoFocus} onChange={e => setAutoFocus(e.target.checked)} />
          Auto Click بعد locate
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <input type="checkbox" checked={autoTypeAfterFocus} onChange={e => setAutoTypeAfterFocus(e.target.checked)} />
          Auto Type بعد التركيز
        </label>
        <input
          type="text"
          value={defaultSearchText}
          onChange={e => setDefaultSearchText(e.target.value)}
          placeholder="نص البحث الافتراضي"
          style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <textarea 
          value={extractSchema} 
          onChange={e => setExtractSchema(e.target.value)} 
          placeholder='{"list":{"selector":"table tr","fields":{"col1":{"selector":"td:nth-child(1)"}}}}' 
          style={{ flex: 1, minHeight: 80, padding: 8, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
        />
        <button onClick={doExtract} className="btn">Extract</button>
      </div>
      {extracted && (
        <pre style={{ padding: 8, borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', maxHeight: 200, overflow: 'auto' }}>
          {JSON.stringify(extracted, null, 2)}
        </pre>
      )}
    </div>
  );
}
