import { useEffect, useState } from 'react';
import { API_URL as API, WS_URL as WS } from '../config';
import ArtifactPreview from './ArtifactPreview';
import CodeEditor from './CodeEditor';

import { Terminal, CheckCircle2, XCircle, Loader2, ChevronRight, ChevronDown, Cpu, Globe, FileText, Eye, Code, BarChart, Activity, Clock, MessageSquare, GitBranch, Share2 } from 'lucide-react';

export default function RightPanel({ active, sessionId, previewData, steps = [], onTabChange, initialTerminalState, initialBrowserState }: { active: 'LIVE' | 'BROWSER' | 'ARTIFACTS' | 'MEMORY' | 'QA' | 'PREVIEW' | 'STEPS' | 'TERMINAL' | 'ANALYTICS' | 'GRAPH'; sessionId?: string; previewData?: { content: string; language: string; } | null; steps?: any[]; onTabChange?: (tab: any) => void; initialTerminalState?: string; initialBrowserState?: any; }) {
  const [artifacts, setArtifacts] = useState<Array<{ name: string; href: string }>>([]);
  const [browser, setBrowser] = useState<{ href: string; title?: string } | null>(null);
  const [summary, setSummary] = useState<string>('');
  const [termOutput, setTermOutput] = useState<string>('Welcome to Joe Terminal\n\n');
  const [currentCmd, setCurrentCmd] = useState<string>('');
  const [previewMode, setPreviewMode] = useState<'PREVIEW' | 'CODE'>('PREVIEW');
  const [localContent, setLocalContent] = useState<string>('');
  const [analytics, setAnalytics] = useState<any>(null);
  const [graphData, setGraphData] = useState<{ nodes: any[]; links: any[] }>({ nodes: [], links: [] });
  const [isGraphLoading, setIsGraphLoading] = useState(false);

  // Initialize state from props
  useEffect(() => {
    if (initialTerminalState) setTermOutput(initialTerminalState);
    if (initialBrowserState) setBrowser(initialBrowserState);
  }, [sessionId, initialTerminalState, initialBrowserState]);

  // Auto-save state
  useEffect(() => {
    if (!sessionId) return;
    const timer = setTimeout(() => {
      fetch(`${API}/sessions/${sessionId}/state`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') ? `Bearer ${localStorage.getItem('token')}` : '' },
        body: JSON.stringify({ terminalState: termOutput, browserState: browser })
      }).catch(() => {});
    }, 2000);
    return () => clearTimeout(timer);
  }, [termOutput, browser, sessionId]);

  // Sync content when previewData changes
  useEffect(() => {
    if (previewData) {
      setLocalContent(previewData.content);
      const isPreviewable = ['html', 'javascript', 'js', 'react', 'jsx', 'tsx', 'css'].includes(previewData.language.toLowerCase());
      setPreviewMode(isPreviewable ? 'PREVIEW' : 'CODE');
    }
  }, [previewData]);

  // Auto-switch tabs based on steps
  useEffect(() => {
    if (!steps || steps.length === 0) return;
    const last = steps[steps.length - 1];
    if (last.type === 'step_started') {
       if (last.data.name === 'shell_execute' || last.data.name.includes('exec')) {
          if (onTabChange && active !== 'TERMINAL') onTabChange('TERMINAL');
          setCurrentCmd(last.data.plan?.input?.command || '');
       }
       else if (last.data.name === 'browser_snapshot' || last.data.name === 'web_search') {
          if (onTabChange && active !== 'BROWSER') onTabChange('BROWSER');
       }
       else if (onTabChange && active !== 'STEPS' && !['TERMINAL', 'BROWSER'].includes(active)) {
          // Default to STEPS for other tools (like planning, reading files)
          onTabChange('STEPS');
       }
    }
    else if (last.type === 'step_done') {
      if (last.data.name === 'shell_execute' || last.data.name.includes('exec')) {
         const out = last.data.result?.output;
         const txt = `\nuser@joe:~/workspace $ ${currentCmd}\n` + 
                     (out?.stdout ? out.stdout : '') + 
                     (out?.stderr ? `\nError:\n${out.stderr}` : '') + 
                     (out?.error ? `\nError: ${out.error}` : '');
         setTermOutput(prev => prev + txt);
         setCurrentCmd('');
      }
    }
  }, [steps]);

  useEffect(() => {
    function connectWithFallback() {
      const primaryUrl = WS;
      const fallbackUrl = `${API.replace(/^http/, 'ws')}/ws`;
      const ws = new WebSocket(primaryUrl);
      const handler = (ev: MessageEvent) => {
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
      ws.onmessage = handler;
      ws.onclose = () => {
        if (primaryUrl !== fallbackUrl) {
          try {
            const fws = new WebSocket(fallbackUrl);
            fws.onmessage = handler;
            fws.onclose = () => {
              // No further fallback; silent
            };
            return () => fws.close();
          } catch {}
        }
      };
      return () => ws.close();
    }
    const cleanup = connectWithFallback();
    return cleanup;
  }, []);

  useEffect(() => {
    if (active === 'ANALYTICS' && sessionId) {
      fetch(`${API}/sessions/${sessionId}/analytics`, {
        headers: { Authorization: localStorage.getItem('token') ? `Bearer ${localStorage.getItem('token')}` : '' }
      })
      .then(res => res.json())
      .then(data => setAnalytics(data))
      .catch(err => console.error(err));
    }
    
    if (active === 'GRAPH') {
      setIsGraphLoading(true);
      fetch(`${API}/project/graph`, {
        headers: { Authorization: localStorage.getItem('token') ? `Bearer ${localStorage.getItem('token')}` : '' }
      })
      .then(res => res.json())
      .then(data => {
        setGraphData(data);
        setIsGraphLoading(false);
      })
      .catch(err => {
        console.error(err);
        setIsGraphLoading(false);
      });
    }
  }, [active, sessionId]);

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

  if (active === 'ANALYTICS') {
    if (!analytics) return <div className="panel-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><Loader2 className="spin" /></div>;
    
    return (
        <div className="panel-content" style={{ padding: 24, overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 24px', fontSize: 18, fontWeight: 600 }}>Session Analytics</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
                <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
                        <Clock size={16} /> Duration
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 600 }}>{(analytics.duration / 1000 / 60).toFixed(1)}m</div>
                </div>
                 <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
                        <Activity size={16} /> Success Rate
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 600, color: analytics.successRate > 80 ? 'var(--accent-success)' : 'var(--accent-warning)' }}>
                        {analytics.successRate.toFixed(1)}%
                    </div>
                </div>
                <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
                        <CheckCircle2 size={16} /> Total Steps
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 600 }}>{analytics.totalSteps}</div>
                </div>
                 <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
                        <MessageSquare size={16} /> Messages
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 600 }}>{analytics.messageCount}</div>
                </div>
            </div>
            
            <h4 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Tool Usage</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {Object.entries(analytics.toolUsage || {}).map(([tool, count]: [string, any]) => (
                    <div key={tool} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-secondary)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{tool}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ height: 4, width: 60, background: 'var(--border-color)', borderRadius: 2, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${Math.min((count / analytics.totalToolCalls) * 100, 100)}%`, background: 'var(--accent-primary)' }} />
                            </div>
                            <span style={{ fontWeight: 600, minWidth: 20, textAlign: 'right' }}>{count}</span>
                        </div>
                    </div>
                ))}
                {Object.keys(analytics.toolUsage || {}).length === 0 && (
                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>No tools used yet</div>
                )}
            </div>
        </div>
    );
  }

  if (active === 'GRAPH') {
    if (isGraphLoading) return <div className="panel-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><Loader2 className="spin" /></div>;
    
    // Simple SVG Graph Visualization
    // We calculate a simple circular layout if no library, or use a simple force simulation effect if we had d3.
    // For now, let's just do a random scatter or circular layout for simplicity in this turn.
    // Ideally we'd use a library, but I'll write a tiny force simulator.
    
    const width = 600;
    const height = 600;
    
    // Pre-calculate positions (circular for now to be safe and fast)
    const nodes = graphData.nodes || [];
    const links = graphData.links || [];
    
    // Simple layout: arrange in concentric circles based on folder depth?
    // Or just random for now.
    
    return (
      <div className="panel-content" style={{ overflow: 'hidden', background: '#0d1117', color: '#c9d1d9', display: 'flex', flexDirection: 'column', height: '100%' }}>
         <div style={{ padding: 16, borderBottom: '1px solid #30363d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}><GitBranch size={16}/> Project Graph</h3>
            <span style={{ fontSize: 12, color: '#8b949e' }}>{nodes.length} files, {links.length} links</span>
         </div>
         <div style={{ flex: 1, position: 'relative', overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {nodes.length === 0 ? (
                <div style={{ color: '#8b949e' }}>No graph data available</div>
            ) : (
                <GraphVisualizer nodes={nodes} links={links} width={width} height={height} />
            )}
         </div>
      </div>
    );
  }

   if (active === 'TERMINAL') {
     return (
       <div className="panel-content" style={{ padding: 0, background: '#1e1e1e', color: '#d4d4d4', fontFamily: 'monospace', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '8px 16px', background: '#252526', fontSize: 12, borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between' }}>
             <span>TERMINAL</span>
             <span>zsh</span>
          </div>
          <div style={{ flex: 1, padding: 16, overflowY: 'auto', whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.4 }}>
             {termOutput}
             {currentCmd && (
                <div>
                   <span style={{ color: '#22c55e' }}>user@joe:~/workspace $</span> {currentCmd}
                   <span className="cursor-blink">█</span>
                </div>
             )}
             {!currentCmd && (
                <div>
                   <span style={{ color: '#22c55e' }}>user@joe:~/workspace $</span>
                   <span className="cursor-blink" style={{ opacity: 0.5 }}>_</span>
                </div>
             )}
          </div>
          <style>{`
             .cursor-blink { animation: blink 1s step-end infinite; }
             @keyframes blink { 50% { opacity: 0; } }
          `}</style>
       </div>
     );
   }

  if (active === 'BROWSER') {
    const url = browser?.href ? (API + browser.href).replace(/([^:]\/)\/+/g, '$1') : null;
    return (
      <div className="panel-content" style={{ padding: 0, display: 'flex', flexDirection: 'column', background: '#f8f9fa' }}>
        <div style={{ padding: 8, background: '#e9ecef', borderBottom: '1px solid #dee2e6', display: 'flex', alignItems: 'center', gap: 8 }}>
           <div style={{ display: 'flex', gap: 4 }}>
             <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f56' }} />
             <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ffbd2e' }} />
             <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#27c93f' }} />
           </div>
           <div style={{ flex: 1, background: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 12, color: '#666', border: '1px solid #ced4da', textAlign: 'center' }}>
             {browser?.title || 'about:blank'}
           </div>
        </div>
        <div className="card" style={{ flex: 1, margin: 0, padding: 0, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
          {browser ? (
            url ? <img src={url} alt="Latest snapshot" style={{ maxWidth: '100%', maxHeight: '100%' }} /> : <div style={{ color: 'var(--text-muted)' }}>Loading...</div>
          ) : (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center' }}>
               <Globe size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
               <div>No active browser session</div>
            </div>
          )}
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
     
     // Determine if language is previewable (HTML/React/JS)
     const isPreviewable = ['html', 'javascript', 'js', 'react', 'jsx', 'tsx', 'css'].includes(previewData.language.toLowerCase());
     
     return (
       <div className="panel-content" style={{ padding: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Toolbar */}
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: 16, alignItems: 'center', background: 'var(--bg-secondary)' }}>
             <button 
               className={`btn-icon-text ${previewMode === 'PREVIEW' ? 'active' : ''}`}
               onClick={() => setPreviewMode('PREVIEW')}
               disabled={!isPreviewable}
               style={{ opacity: isPreviewable ? 1 : 0.5, fontWeight: previewMode === 'PREVIEW' ? 600 : 400, display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', color: previewMode === 'PREVIEW' ? 'var(--accent-primary)' : 'var(--text-secondary)', cursor: isPreviewable ? 'pointer' : 'not-allowed' }}
             >
               <Eye size={16} /> Preview
             </button>
             <button 
               className={`btn-icon-text ${previewMode === 'CODE' ? 'active' : ''}`}
               onClick={() => setPreviewMode('CODE')}
               style={{ fontWeight: previewMode === 'CODE' ? 600 : 400, display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', color: previewMode === 'CODE' ? 'var(--accent-primary)' : 'var(--text-secondary)', cursor: 'pointer' }}
             >
               <Code size={16} /> Code
             </button>
             
             <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
               {previewData.language.toUpperCase()}
             </div>
          </div>
          
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {previewMode === 'PREVIEW' && isPreviewable ? (
              <ArtifactPreview content={previewData.content} language={previewData.language} />
            ) : (
              <CodeEditor 
                code={previewData.content} 
                language={previewData.language} 
                readOnly={true} // For now read-only, we can enable editing later if we wire it up to something
                theme="vs-dark"
              />
            )}
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

function GraphVisualizer({ nodes, links, width, height }: { nodes: any[], links: any[], width: number, height: number }) {
  // Simple force simulation logic (simplified)
  // We'll just render them in a circle for now to guarantee they show up without complex physics logic in this turn
  
  const radius = Math.min(width, height) / 2 - 50;
  const centerX = width / 2;
  const centerY = height / 2;
  
  const positionedNodes = nodes.map((node, i) => {
    const angle = (i / nodes.length) * 2 * Math.PI;
    return {
      ...node,
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle)
    };
  });

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} style={{ background: '#0d1117' }}>
       {/* Links */}
       {links.map((link, i) => {
          const source = positionedNodes.find(n => n.id === link.source);
          const target = positionedNodes.find(n => n.id === link.target);
          if (!source || !target) return null;
          return (
             <line 
                key={i} 
                x1={source.x} y1={source.y} 
                x2={target.x} y2={target.y} 
                stroke="#30363d" 
                strokeWidth={1} 
                opacity={0.5}
             />
          );
       })}
       
       {/* Nodes */}
       {positionedNodes.map((node, i) => (
          <g key={node.id} transform={`translate(${node.x},${node.y})`}>
             <circle r={5} fill={node.type === 'directory' ? '#d29922' : '#58a6ff'} />
             <text 
                x={8} y={4} 
                fill="#8b949e" 
                fontSize={10} 
                style={{ pointerEvents: 'none' }}
             >
                {node.name}
             </text>
             <title>{node.id}</title>
          </g>
       ))}
    </svg>
  );
}
