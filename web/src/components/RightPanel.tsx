import { useEffect, useState } from 'react';
import { API_URL as API, WS_URL as WS } from '../config';

export default function RightPanel({ active, sessionId }: { active: 'LIVE' | 'BROWSER' | 'ARTIFACTS' | 'MEMORY' | 'QA'; sessionId?: string }) {
  const [artifacts, setArtifacts] = useState<Array<{ name: string; href: string }>>([]);
  const [browser, setBrowser] = useState<{ href: string; title?: string } | null>(null);
  const [summary, setSummary] = useState<string>('');

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

  async function refreshSummary() {
    if (!sessionId) return;
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/sessions/${sessionId}/summary`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const data = await res.json();
    setSummary(data?.summary?.content || '');
  }
  async function summarize() {
    if (!sessionId) return;
    const token = localStorage.getItem('token');
    const content = summary || 'No summary yet';
    await fetch(`${API}/sessions/${sessionId}/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ content }),
    });
    await refreshSummary();
  }
  async function autoSummarize() {
    if (!sessionId) return;
    const token = localStorage.getItem('token');
    await fetch(`${API}/sessions/${sessionId}/summarize/auto`, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    await refreshSummary();
  }

  if (active === 'BROWSER') {
    const url = browser?.href ? (API + browser.href).replace(/([^:]\/)\/+/g, '$1') : null;
    return (
      <div className="panel-content">
        <div className="card">
          <div style={{ marginBottom: 8, fontWeight: 500 }}>Browser View</div>
          {browser && (
            <>
              <div style={{ marginBottom: 8, fontSize: 13, color: 'var(--text-secondary)' }}>{browser.title || 'Untitled'}</div>
              {url && <img src={url} alt="Latest snapshot" style={{ maxWidth: '100%', borderRadius: 4, border: '1px solid var(--border-color)' }} />}
            </>
          )}
          {!browser && <div style={{ color: 'var(--text-muted)' }}>No active browser session</div>}
        </div>
      </div>
    );
  }
  if (active === 'ARTIFACTS') {
    return (
      <div className="panel-content">
        <div style={{ marginBottom: 16, fontWeight: 600 }}>Generated Artifacts</div>
        {artifacts.length === 0 && <div style={{ color: 'var(--text-muted)' }}>No artifacts created yet</div>}
        {artifacts.map((a, i) => {
          const url = (API + a.href).replace(/([^:]\/)\/+/g, '$1');
          return (
            <div key={i} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 500 }}>{a.name}</span>
              <a href={url} target="_blank" rel="noreferrer" className="btn" style={{ fontSize: 12 }}>Open ↗</a>
            </div>
          );
        })}
      </div>
    );
  }
  if (active === 'MEMORY') {
    return (
      <div className="panel-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontWeight: 600 }}>Session Memory</span>
          <button className="btn btn-yellow" style={{ fontSize: 12 }} onClick={autoSummarize}>Auto Summarize</button>
        </div>
        
        <div className="card">
          <textarea 
            rows={12} 
            value={summary} 
            onChange={e=>setSummary(e.target.value)} 
            placeholder="No summary available..." 
            style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--text-primary)', resize: 'vertical', outline: 'none' }} 
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={refreshSummary}>Reload</button>
          <button className="btn" onClick={summarize}>Save Changes</button>
        </div>
      </div>
    );
  }
  if ((active as any) === 'QA') {
    const [qa, setQa] = useState<{ passed: number; failed: number; results: Array<{ text: string; ok: boolean; reason?: string }> } | null>(null);
    async function runQa() {
      const res = await fetch(`${API}/runs/qa`, { method: 'POST' });
      const data = await res.json();
      setQa(data);
    }
    return (
      <div className="panel-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontWeight: 600 }}>QA Suite</span>
          <button className="btn btn-yellow" style={{ fontSize: 12 }} onClick={runQa}>Run 50 Tests</button>
        </div>
        {qa && (
          <div className="card">
            <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
              <span>Passed: <strong style={{ color: '#22c55e' }}>{qa.passed}</strong></span>
              <span>Failed: <strong style={{ color: '#ef4444' }}>{qa.failed}</strong></span>
            </div>
            {qa.failed > 0 && (
              <div>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Failures</div>
                <ul style={{ paddingLeft: 18 }}>
                  {qa.results.filter(r=>!r.ok).map((r, i) => (
                    <li key={i} style={{ marginBottom: 6 }}>
                      <span style={{ color: 'var(--text-primary)' }}>{r.text}</span>
                      <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{r.reason || 'error'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {!qa && <div style={{ color: 'var(--text-muted)' }}>Press "Run 50 Tests" to execute QA suite.</div>}
      </div>
    );
  }
  return (
    <div className="panel-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⚡️</div>
      <div style={{ fontWeight: 500 }}>التنفيذ المباشر</div>
      <p style={{ fontSize: 13, maxWidth: 200, textAlign: 'center', marginTop: 8 }}>
        ستظهر الأحداث والسجلات في اللوحة المركزية. استخدم التبويبات للتبديل بين طرق العرض.
      </p>
    </div>
  );
}
