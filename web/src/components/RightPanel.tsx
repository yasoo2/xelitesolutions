import { useEffect, useState } from 'react';
import { API_URL as API, WS_URL as WS } from '../config';
import ArtifactPreview from './ArtifactPreview';

import { Terminal, CheckCircle2, XCircle, Loader2, ChevronRight, ChevronDown, Cpu, Globe, FileText } from 'lucide-react';

export default function RightPanel({ active, sessionId, previewData, steps = [] }: { active: 'LIVE' | 'BROWSER' | 'ARTIFACTS' | 'MEMORY' | 'QA' | 'PREVIEW' | 'STEPS'; sessionId?: string; previewData?: { content: string; language: string; } | null; steps?: any[] }) {
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

  if (active === 'PREVIEW') {
     if (!previewData) {
       return (
         <div className="panel-content">
           <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: 40 }}>
             لا يوجد معاينة متاحة حالياً.
             <br/>
             اضغط على زر "معاينة" في كود البرمجة.
           </div>
         </div>
       );
     }
     return (
       <div className="panel-content" style={{ padding: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
          <ArtifactPreview content={previewData.content} language={previewData.language} />
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
  if (active === 'STEPS') {
    const getIcon = (name: string) => {
      if (name.includes('shell') || name.includes('exec')) return <Terminal size={14} />;
      if (name.includes('web') || name.includes('search')) return <Globe size={14} />;
      if (name.includes('file')) return <FileText size={14} />;
      return <Cpu size={14} />;
    };

    // Filter and process steps to avoid duplicates (start/done pairs)
    // We want to show a clean timeline.
    // Let's group by tool execution.
    const timeline: any[] = [];
    const openSteps: Record<string, any> = {};

    steps.forEach((e) => {
      if (e.type === 'step_started') {
        const item = { type: 'step', name: e.data.name, status: 'running', logs: [], expanded: false };
        timeline.push(item);
        openSteps[e.data.name] = item;
      }
      else if (e.type === 'step_done') {
        const name = e.data.name || e.data.plan?.name;
        // Try to find the open step
        let item = openSteps[name] || openSteps[`execute:${name}`];
        // If not found (maybe mismatched name), try to find last running step
        if (!item) {
           item = timeline.slice().reverse().find(t => t.status === 'running' && (t.name === name || t.name === `execute:${name}`));
        }
        
        if (item) {
          item.status = 'done';
          item.result = e.data.result;
          item.duration = e.duration;
          item.plan = e.data.plan;
        } else {
          timeline.push({ type: 'step', name, status: 'done', result: e.data.result, duration: e.duration, plan: e.data.plan });
        }
      }
      else if (e.type === 'step_failed') {
        const item = openSteps[e.data.name] || timeline.slice().reverse().find(t => t.status === 'running' && t.name === e.data.name);
        if (item) {
          item.status = 'failed';
          item.error = e.data.reason;
        } else {
          timeline.push({ type: 'step', name: e.data.name, status: 'failed', error: e.data.reason });
        }
      }
      else if (e.type === 'user_input') {
        timeline.push({ type: 'user', content: e.data });
      }
      else if (e.type === 'text') {
        // Optional: show text output in timeline? Maybe too noisy if it duplicates chat.
        // Let's skip for now or show as "Assistant Message"
      }
    });

    return (
      <div className="panel-content" style={{ padding: 0 }}>
        <div style={{ padding: 16, borderBottom: '1px solid var(--border-color)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Cpu size={16} color="var(--accent-primary)" />
          سجل العمليات (Execution Log)
        </div>
        <div className="timeline" style={{ padding: 16 }}>
          {timeline.length === 0 && <div style={{ color: 'var(--text-muted)', textAlign: 'center' }}>بانتظار الأوامر...</div>}
          
          {timeline.map((item, i) => (
            <div key={i} className={`timeline-item ${item.status}`} style={{ marginBottom: 16, position: 'relative', paddingLeft: 24 }}>
              {/* Vertical Line */}
              {i < timeline.length - 1 && (
                <div style={{ 
                  position: 'absolute', left: 7, top: 24, bottom: -16, width: 2, 
                  background: 'var(--border-color)' 
                }} />
              )}
              
              {/* Icon */}
              <div style={{ 
                position: 'absolute', left: 0, top: 2, width: 16, height: 16, borderRadius: '50%', 
                background: item.status === 'running' ? '#eab308' : item.status === 'failed' ? '#ef4444' : item.status === 'done' ? '#22c55e' : 'var(--bg-tertiary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2,
                boxShadow: item.status === 'running' ? '0 0 8px #eab308' : 'none'
              }}>
                {item.type === 'user' ? <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} /> :
                 item.status === 'running' ? <Loader2 size={10} className="spin" color="#fff" /> :
                 item.status === 'done' ? <CheckCircle2 size={10} color="#fff" /> :
                 item.status === 'failed' ? <XCircle size={10} color="#fff" /> : null
                }
              </div>

              {/* Content */}
              {item.type === 'user' ? (
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                  {item.content}
                </div>
              ) : (
                <div className="step-card" style={{ 
                  background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 8, padding: 8 
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    {getIcon(item.name)}
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{item.name}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
                      {item.duration ? `${(item.duration/1000).toFixed(1)}s` : item.status}
                    </span>
                  </div>
                  
                  {item.plan && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, fontFamily: 'monospace', background: 'var(--bg-tertiary)', padding: 4, borderRadius: 4 }}>
                      Input: {JSON.stringify(item.plan.input).slice(0, 100)}...
                    </div>
                  )}

                  {item.status === 'failed' && (
                    <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>
                      Error: {item.error}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {/* Dummy element to scroll to */}
          <div id="timeline-end" />
        </div>
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

  return null;
}
