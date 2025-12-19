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
  const [extractSchema, setExtractSchema] = useState<string>('{"list":{"selector":"a","fields":{"text":{"selector":"","attr":""}}}}');
  const [extracted, setExtracted] = useState<any>(null);
  const [uploadSelector, setUploadSelector] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

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
      const names = actions.map(a => a.type).join(', ');
      setOverlay(names);
      setTimeout(() => setOverlay(''), 1200);
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
          style={{ width: '100%', height: 'auto', display: 'block', background: 'black', cursor: 'crosshair' }} 
        />
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
