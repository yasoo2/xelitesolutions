import { useEffect, useState } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8080';
const WS = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws';

export default function RightPanel({ active }: { active: 'LIVE' | 'BROWSER' | 'ARTIFACTS' }) {
  const [artifacts, setArtifacts] = useState<Array<{ name: string; href: string }>>([]);
  const [browser, setBrowser] = useState<{ href: string; title?: string } | null>(null);

  useEffect(() => {
    const ws = new WebSocket(WS);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data.toString());
        if (msg.type === 'artifact_created' && msg.data?.href) {
          setArtifacts(prev => [...prev, { name: msg.data.name, href: msg.data.href }]);
        }
        if (msg.type === 'step_done' && String(msg.data?.name || '').startsWith('execute:browser_snapshot')) {
          const out = msg.data?.result?.output;
          if (out?.href) setBrowser({ href: out.href, title: out.title });
        }
      } catch {}
    };
    return () => ws.close();
  }, []);

  if (active === 'BROWSER') {
    const url = browser?.href ? (API + browser.href).replace(/([^:]\/)\/+/g, '$1') : null;
    return (
      <div className="panel">
        <h4>Browser Live</h4>
        {browser && (
          <>
            <div>Title: {browser.title || '—'}</div>
            {url && <img src={url} alt="Latest snapshot" style={{ maxWidth: '100%', border: '1px solid #333' }} />}
          </>
        )}
        {!browser && <div>No browser activity yet</div>}
      </div>
    );
  }
  if (active === 'ARTIFACTS') {
    return (
      <div className="panel">
        <h4>Artifacts</h4>
        {artifacts.length === 0 && <div>No artifacts yet</div>}
        {artifacts.map((a, i) => {
          const url = (API + a.href).replace(/([^:]\/)\/+/g, '$1');
          return (
            <div key={i} className="artifact">
              <a href={url} target="_blank" rel="noreferrer">{a.name}</a>
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div className="panel">
      <h4>Live Run</h4>
      <div>Use the composer to start a run</div>
    </div>
  );
}
