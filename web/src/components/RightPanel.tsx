import { useEffect, useState, useRef } from 'react';
import { API_URL as API, WS_URL as WS } from '../config';
import ArtifactPreview from './ArtifactPreview';
import CodeEditor from './CodeEditor';
import GraphVisualizer from './GraphVisualizer';
import PlanVisualizer from './PlanVisualizer';
import Terminal from './Terminal';
import FileExplorer from './FileExplorer';
import DatabaseViewer from './DatabaseViewer';
import ProcessManager from './ProcessManager';
import NetworkInspector from './NetworkInspector';
import HealingPanel from './HealingPanel';
import { DocumentationViewer } from './DocumentationViewer';
import { ApiPlayground } from './ApiPlayground';
import { CodeQuality } from './CodeQuality';
import { AppsDashboard } from './AppsDashboard';
import { 
  Terminal as TerminalIcon, CheckCircle2, XCircle, Loader2, ChevronRight, ChevronDown, 
  Cpu, Globe, FileText, Eye, Code, BarChart, Activity, Clock, MessageSquare, 
  GitBranch, Share2, Folder, Trash2, User, Database, Workflow, Mic, Upload, 
  Search, Plus, List, Map, BookOpen, Package, Network, BarChart2, ShieldAlert, Server,
  Book, Play, Zap, LayoutGrid, ArrowLeft
} from 'lucide-react';

import { LiveInteractionPanel } from './LiveInteractionPanel';

export default function RightPanel({ 
  active, 
  sessionId, 
  previewData, 
  steps = [], 
  onTabChange, 
  initialTerminalState, 
  initialBrowserState, 
  messages = [], 
  onClose 
}: { 
  active: 'LIVE' | 'BROWSER' | 'ARTIFACTS' | 'MEMORY' | 'QA' | 'PREVIEW' | 'STEPS' | 'TERMINAL' | 'ANALYTICS' | 'GRAPH' | 'FILES' | 'PLAN' | 'KNOWLEDGE' | 'DATABASE' | 'SYSTEM' | 'NETWORK' | 'HEALING' | 'DOCS' | 'PLAYGROUND' | 'QUALITY' | 'APPS'; 
  sessionId?: string; 
  previewData?: { content: string; language: string; } | null; 
  steps?: any[];  
  onTabChange?: (tab: any) => void; 
  initialTerminalState?: string; 
  initialBrowserState?: any; 
  messages?: any[]; 
  onClose?: () => void 
}) {
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

  const [assets, setAssets] = useState<{ files: any[], artifacts: any[] }>({ files: [], artifacts: [] });

  // Fetch assets when ARTIFACTS tab is active
  useEffect(() => {
    if (active === 'ARTIFACTS' && sessionId) {
      fetch(`${API}/assets?sessionId=${sessionId}`, {
        headers: { Authorization: localStorage.getItem('token') ? `Bearer ${localStorage.getItem('token')}` : '' }
      })
      .then(res => res.json())
      .then(data => {
        if (data.files || data.artifacts) {
          setAssets({
            files: data.files || [],
            artifacts: data.artifacts || []
          });
        }
      })
      .catch(err => console.error('Failed to load assets', err));
    }
  }, [active, sessionId]);

  // Fetch graph data when GRAPH tab is active
    useEffect(() => {
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
        console.error('Failed to load graph', err);
        setIsGraphLoading(false);
      });
    }
  }, [active]);

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
  }, [active, sessionId]);

  // Auto-switch tabs based on steps (Smart Viewport)
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
       else if (last.data.name === 'knowledge_search' || last.data.name === 'knowledge_add') {
          if (onTabChange && active !== 'KNOWLEDGE') onTabChange('KNOWLEDGE');
       }
       else if (last.data.name === 'read_file' || last.data.name === 'edit_file') {
          if (onTabChange && active !== 'FILES') onTabChange('FILES');
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
      else if (last.data.name === 'read_file') {
         if (onTabChange && active !== 'FILES') onTabChange('FILES');
      }
      else if (last.data.name === 'edit_file') {
         if (onTabChange && active !== 'FILES') onTabChange('FILES');
      }
    }
  }, [steps]);

  async function refreshSummary() {
    if (!sessionId) return;
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/sessions/${sessionId}/summary`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const data = await res.json();
    setSummary(data?.summary?.content || '');
  }

  // TABS Configuration
  const TABS = [
     { id: 'APPS', icon: LayoutGrid, label: 'Apps' },
     { id: 'TERMINAL', icon: TerminalIcon, label: 'Terminal' },
     { id: 'BROWSER', icon: Globe, label: 'Browser' },
     { id: 'FILES', icon: Folder, label: 'Files' },
     { id: 'PREVIEW', icon: Eye, label: 'Preview' },
  ];

  const renderContent = () => {
    if (active === 'APPS') {
        return <AppsDashboard onAppSelect={(id) => onTabChange && onTabChange(id)} />;
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

    if (active === 'FILES') {
        return (
          <div className="panel-content" style={{ padding: 0, display: 'flex', height: '100%', overflow: 'hidden' }}>
            <FileExplorer sessionId={sessionId} />
          </div>
        );
    }

    if (active === 'GRAPH') {
        return (
          <div className="panel-content" style={{ padding: 0, height: '100%', overflow: 'hidden' }}>
            {isGraphLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                    <Loader2 className="spin" /> Loading Graph...
                </div>
            ) : (
                <GraphVisualizer nodes={graphData.nodes} links={graphData.links} />
            )}
          </div>
        );
    }

    if (active === 'PLAN') {
        return (
          <div className="panel-content" style={{ padding: 0, height: '100%', overflow: 'hidden' }}>
            <PlanVisualizer messages={messages} />
          </div>
        );
    }

    if (active === 'KNOWLEDGE') {
        return <KnowledgePanel sessionId={sessionId} />;
    }

    if (active === 'DATABASE') {
        return (
          <div className="panel-content" style={{ padding: 0, height: '100%', overflow: 'hidden' }}>
            <DatabaseViewer sessionId={sessionId} />
          </div>
        );
    }

    if (active === 'SYSTEM') {
        return (
          <div className="panel-content" style={{ padding: 0, height: '100%', overflow: 'hidden' }}>
            <ProcessManager />
          </div>
        );
    }

    if (active === 'NETWORK') {
        return (
          <div className="panel-content" style={{ padding: 0, height: '100%', overflow: 'hidden' }}>
            <NetworkInspector />
          </div>
        );
    }

    if (active === 'HEALING') {
        return (
          <div className="panel-content" style={{ padding: 0, height: '100%', overflow: 'hidden' }}>
            <HealingPanel />
          </div>
        );
    }

    if (active === 'DOCS') {
        return (
          <div className="panel-content" style={{ padding: 0, height: '100%', overflow: 'hidden' }}>
            <DocumentationViewer />
          </div>
        );
    }

    if (active === 'PLAYGROUND') {
        return (
          <div className="panel-content" style={{ padding: 0, height: '100%', overflow: 'hidden' }}>
            <ApiPlayground />
          </div>
        );
    }

    if (active === 'QUALITY') {
        return (
          <div className="panel-content" style={{ padding: 0, height: '100%', overflow: 'hidden' }}>
            <CodeQuality />
          </div>
        );
    }


    if (active === 'TERMINAL') {
        return <Terminal agentLogs={termOutput} />;
    }

    if (active === 'BROWSER') {
        const url = browser?.href ? (API + browser.href).replace(/([^:]\/)\/+/g, '$1') : null;
        return (
          <div className="panel-content" style={{ padding: 0, display: 'flex', flexDirection: 'column', background: '#f8f9fa', height: '100%' }}>
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
                url ? <img src={url} alt="Latest snapshot" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : <div style={{ color: 'var(--text-muted)' }}>Loading...</div>
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
         
         const isPreviewable = ['html', 'javascript', 'js', 'react', 'jsx', 'tsx', 'css'].includes(previewData.language.toLowerCase());
         
         return (
           <div className="panel-content" style={{ padding: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
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
                    readOnly={true} 
                    theme="vs-dark"
                  />
                )}
              </div>
           </div>
         );
    }

    if (active === 'ARTIFACTS') {
        const allItems = [
            ...assets.files.map(f => ({ ...f, _type: 'file' })),
            ...assets.artifacts.map(a => ({ ...a, _type: 'artifact' }))
        ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return (
          <div className="panel-content" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="card" style={{ padding: 12, textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent-primary)' }}>{assets.files.length}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Uploaded Files</div>
                </div>
                <div className="card" style={{ padding: 12, textAlign: 'center' }}>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#22c55e' }}>{assets.artifacts.length}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Generated Artifacts</div>
                </div>
            </div>

            <div>
                <div style={{ marginBottom: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Folder size={16} /> All Project Assets
                </div>
                
                {allItems.length === 0 && (
                    <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', borderRadius: 8 }}>
                        No assets found in this session.
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {allItems.map((item, i) => {
                        const isFile = item._type === 'file';
                        const url = isFile ? `${API}/files/${item.id}/raw` : (API + item.url).replace(/([^:]\/)\/+/g, '$1');
                        
                        return (
                            <div key={i} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12 }}>
                                <div style={{ 
                                    width: 36, height: 36, borderRadius: 8, 
                                    background: isFile ? 'rgba(59, 130, 246, 0.1)' : 'rgba(34, 197, 94, 0.1)', 
                                    color: isFile ? '#3b82f6' : '#22c55e',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    {isFile ? <FileText size={18} /> : <Code size={18} />}
                                </div>
                                
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {item.name}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 8 }}>
                                        <span>{new Date(item.createdAt).toLocaleTimeString()}</span>
                                        <span>•</span>
                                        <span>{isFile ? (item.size / 1024).toFixed(1) + ' KB' : 'Generated'}</span>
                                    </div>
                                </div>

                                <a 
                                    href={url} 
                                    target="_blank" 
                                    rel="noreferrer" 
                                    className="btn-icon" 
                                    title="Download / Open"
                                    style={{ color: 'var(--text-secondary)' }}
                                >
                                    <Share2 size={16} />
                                </a>
                            </div>
                        );
                    })}
                </div>
            </div>
          </div>
        );
    }

    if (active === 'STEPS') {
        const getIcon = (name: string) => {
          if (name.includes('shell') || name.includes('exec')) return <TerminalIcon size={14} />;
          if (name.includes('web') || name.includes('search')) return <Globe size={14} />;
          if (name.includes('file')) return <FileText size={14} />;
          return <Cpu size={14} />;
        };

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
            let item = openSteps[name] || openSteps[`execute:${name}`];
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
                  {i < timeline.length - 1 && (
                    <div style={{ 
                      position: 'absolute', left: 7, top: 24, bottom: -16, width: 2, 
                      background: 'var(--border-color)' 
                    }} />
                  )}
                  
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
            </div>
          </div>
        );
    }

    if (active === 'MEMORY') {
        return <MemoryPanel sessionId={sessionId} />;
    }

    return null;
  };

  const currentStatus = steps.length > 0 
      ? (steps[steps.length - 1].status === 'running' || steps[steps.length - 1].type === 'step_started' ? 'running' : 
         steps[steps.length - 1].status === 'failed' ? 'error' : 'idle')
      : 'idle';

  // Live Panel Handlers (Placeholders for now)
  const handlePause = () => { console.log('Pause requested'); alert('Pause functionality coming soon!'); };
  const handleResume = () => { console.log('Resume requested'); alert('Resume functionality coming soon!'); };
  const handleStop = () => { console.log('Stop requested'); alert('Stop functionality coming soon!'); };

  const isAppActive = active !== 'APPS' && active !== 'TERMINAL' && active !== 'BROWSER' && active !== 'FILES' && active !== 'PREVIEW';

  return (
    <div className="flex flex-col h-full bg-[var(--bg-primary)] border-l border-[var(--border-color)]">
       {/* Header */}
       <div className="flex items-center gap-1 p-2 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] overflow-x-auto no-scrollbar" style={{ whiteSpace: 'nowrap' }}>
          {isAppActive && (
              <button
                  onClick={() => onTabChange && onTabChange('APPS')}
                  className="p-2 rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] mr-2 flex items-center gap-2"
                  title="Back to Apps"
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                  <ArrowLeft size={18} />
              </button>
          )}

          {TABS.map(tab => (
            <button
               key={tab.id}
               onClick={() => onTabChange && onTabChange(tab.id)}
               className={`p-2 rounded-md transition-colors ${active === tab.id || (tab.id === 'APPS' && isAppActive) ? 'bg-[var(--bg-active)] text-[var(--accent-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`}
               title={tab.label}
               style={{ 
                 background: active === tab.id || (tab.id === 'APPS' && isAppActive) ? 'var(--bg-active)' : 'transparent',
                 color: active === tab.id || (tab.id === 'APPS' && isAppActive) ? 'var(--accent-primary)' : 'var(--text-secondary)',
                 border: 'none',
                 cursor: 'pointer',
                 display: 'inline-flex',
                 alignItems: 'center',
                 justifyContent: 'center',
                 minWidth: 32,
                 minHeight: 32
               }}
            >
              <tab.icon size={18} />
            </button>
          ))}
          <div className="flex-1" />
          {onClose && (
            <button 
              onClick={onClose} 
              className="p-2 text-[var(--text-secondary)] hover:text-red-500 transition-colors"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
               <XCircle size={18} />
            </button>
          )}
       </div>

       {/* Content */}
       <div className="flex-1 overflow-hidden relative" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
         {renderContent()}
       </div>

       {/* Spacer removed as flex-grow on content handles it, but ensuring LivePanel is at bottom */}
       
       {/* Live Panel - Flex Item */}
       <div style={{ marginTop: 'auto' }}>
           <LiveInteractionPanel 
              steps={steps}
              logs={termOutput.split('\n')}
              messages={messages || []}
              status={currentStatus}
              onPause={handlePause}
              onResume={handleResume}
              onStop={handleStop}
           />
       </div>
    </div>
  );
}

function MemoryPanel({ sessionId }: { sessionId?: string }) {
    const [data, setData] = useState<{
        systemPrompt: string;
        summary: string;
        recentMessages: any[];
        memories: any[];
    } | null>(null);
    const [loading, setLoading] = useState(false);
    const [summaryEdit, setSummaryEdit] = useState('');
    const [isEditingSummary, setIsEditingSummary] = useState(false);
    const [showSystemPrompt, setShowSystemPrompt] = useState(false);

    const loadContext = async () => {
        if (!sessionId) return;
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API}/sessions/${sessionId}/context`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            if (res.ok) {
                const json = await res.json();
                setData(json);
                setSummaryEdit(json.summary || '');
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadContext();
    }, [sessionId]);

    const saveSummary = async () => {
        if (!sessionId) return;
        const token = localStorage.getItem('token');
        await fetch(`${API}/sessions/${sessionId}/summarize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
            body: JSON.stringify({ content: summaryEdit })
        });
        setIsEditingSummary(false);
        loadContext();
    };

    const deleteMemory = async (id: string) => {
        if (!confirm('Are you sure?')) return;
        const token = localStorage.getItem('token');
        await fetch(`${API}/memory/${id}`, {
            method: 'DELETE',
            headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        loadContext();
    };

    if (loading && !data) return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin" /></div>;
    if (!data) return <div className="p-4 text-[var(--text-muted)]">No context loaded</div>;

    return (
        <div className="flex flex-col h-full bg-[var(--bg-primary)] overflow-y-auto custom-scrollbar">
            {/* System Prompt Section */}
            <div className="border-b border-[var(--border-color)]">
                <button 
                    onClick={() => setShowSystemPrompt(!showSystemPrompt)}
                    className="w-full flex items-center justify-between p-4 hover:bg-[var(--bg-secondary)] transition-colors"
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 16, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
                >
                    <div className="flex items-center gap-2 font-semibold" style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                        <Cpu size={16} className="text-[var(--accent-primary)]" style={{ color: 'var(--accent-primary)' }} />
                        System Instructions
                    </div>
                    {showSystemPrompt ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                {showSystemPrompt && (
                    <div className="p-4 bg-[var(--bg-secondary)] border-t border-[var(--border-color)]" style={{ padding: 16, background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-color)' }}>
                        <pre className="text-xs whitespace-pre-wrap font-mono text-[var(--text-secondary)]" style={{ fontSize: 12, whiteSpace: 'pre-wrap', fontFamily: 'monospace', color: 'var(--text-secondary)', margin: 0 }}>
                            {data.systemPrompt}
                        </pre>
                    </div>
                )}
            </div>

            {/* Session Summary */}
            <div className="p-4 border-b border-[var(--border-color)]" style={{ padding: 16, borderBottom: '1px solid var(--border-color)' }}>
                <div className="flex items-center justify-between mb-2" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <h3 className="font-semibold text-sm" style={{ fontWeight: 600, fontSize: 14, margin: 0 }}>Session Summary</h3>
                    <button 
                        onClick={() => setIsEditingSummary(!isEditingSummary)}
                        className="text-xs text-[var(--accent-primary)] hover:underline"
                        style={{ fontSize: 12, color: 'var(--accent-primary)', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                        {isEditingSummary ? 'Cancel' : 'Edit'}
                    </button>
                </div>
                {isEditingSummary ? (
                    <div className="flex flex-col gap-2" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <textarea 
                            value={summaryEdit}
                            onChange={(e) => setSummaryEdit(e.target.value)}
                            className="w-full p-2 text-sm bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded"
                            rows={4}
                            style={{ width: '100%', padding: 8, fontSize: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 4 }}
                        />
                        <button 
                            onClick={saveSummary}
                            className="self-end px-3 py-1 text-xs bg-[var(--accent-primary)] text-white rounded hover:opacity-90"
                            style={{ alignSelf: 'flex-end', padding: '4px 12px', fontSize: 12, background: 'var(--accent-primary)', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                        >
                            Save Changes
                        </button>
                    </div>
                ) : (
                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed" style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                        {data.summary || 'No summary available.'}
                    </p>
                )}
            </div>

            {/* Memories */}
            <div className="p-4" style={{ padding: 16 }}>
                <h3 className="font-semibold text-sm mb-4" style={{ fontWeight: 600, fontSize: 14, marginBottom: 16, margin: 0 }}>Short-term Memory</h3>
                <div className="space-y-3" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {data.memories.map((m: any) => (
                        <div key={m.id} className="p-3 bg-[var(--bg-secondary)] rounded border border-[var(--border-color)] group relative" style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 4, border: '1px solid var(--border-color)', position: 'relative' }}>
                            <p className="text-sm pr-6" style={{ fontSize: 14, paddingRight: 24, margin: 0 }}>{m.content}</p>
                            <button 
                                onClick={() => deleteMemory(m.id)}
                                className="absolute top-2 right-2 text-[var(--text-muted)] hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                style={{ position: 'absolute', top: 8, right: 8, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                    {data.memories.length === 0 && (
                        <div className="text-center text-xs text-[var(--text-muted)] italic" style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            No active memories.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function KnowledgePanel({ sessionId }: { sessionId?: string }) {
    const [documents, setDocuments] = useState<Array<{ id: string; filename: string; size: number }>>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [query, setQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Array<{ id: string; filename: string; snippet: string }> | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchDocuments = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`${API}/knowledge/list`, {
                headers: { Authorization: localStorage.getItem('token') ? `Bearer ${localStorage.getItem('token')}` : '' }
            });
            if (res.ok) {
                const data = await res.json();
                setDocuments(data);
            }
        } catch (error) {
            console.error('Failed to fetch documents', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchDocuments();
    }, []);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        
        const file = e.target.files[0];
        const formData = new FormData();
        formData.append('file', file);

        setIsUploading(true);
        try {
            const res = await fetch(`${API}/knowledge/upload`, {
                method: 'POST',
                headers: { Authorization: localStorage.getItem('token') ? `Bearer ${localStorage.getItem('token')}` : '' },
                body: formData
            });
            
            if (res.ok) {
                await fetchDocuments();
                if (fileInputRef.current) fileInputRef.current.value = '';
            } else {
                alert('Upload failed');
            }
        } catch (error) {
            console.error('Upload error', error);
            alert('Upload error');
        } finally {
            setIsUploading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this document?')) return;
        
        try {
            const res = await fetch(`${API}/knowledge/${id}`, {
                method: 'DELETE',
                headers: { Authorization: localStorage.getItem('token') ? `Bearer ${localStorage.getItem('token')}` : '' }
            });
            
            if (res.ok) {
                setDocuments(prev => prev.filter(d => d.id !== id));
            }
        } catch (error) {
            console.error('Delete error', error);
        }
    };

    const handleSearch = async () => {
        if (!query.trim()) {
            setSearchResults(null);
            return;
        }

        try {
            const res = await fetch(`${API}/knowledge/query`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    Authorization: localStorage.getItem('token') ? `Bearer ${localStorage.getItem('token')}` : '' 
                },
                body: JSON.stringify({ query })
            });
            
            if (res.ok) {
                const data = await res.json();
                setSearchResults(data.results);
            }
        } catch (error) {
            console.error('Search error', error);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-primary)' }}>
            <div style={{ padding: 16, borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Knowledge Base</h3>
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="btn-primary"
                        style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '6px 12px' }}
                    >
                        {isUploading ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
                        Upload Document
                    </button>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                        style={{ display: 'none' }} 
                        accept=".txt,.md,.pdf,.json"
                    />
                </div>
                
                <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                        <input 
                            type="text" 
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            placeholder="Search knowledge base..."
                            style={{ 
                                width: '100%', 
                                padding: '8px 12px 8px 32px', 
                                background: 'var(--bg-primary)', 
                                border: '1px solid var(--border-color)', 
                                borderRadius: 4,
                                fontSize: 13,
                                color: 'var(--text-primary)'
                            }}
                        />
                    </div>
                    <button 
                        onClick={handleSearch}
                        className="btn"
                        style={{ padding: '0 12px' }}
                    >
                        Search
                    </button>
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                {searchResults ? (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                                Search Results ({searchResults.length})
                            </h4>
                            <button 
                                onClick={() => { setSearchResults(null); setQuery(''); }}
                                style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: 12, cursor: 'pointer' }}
                            >
                                Clear Search
                            </button>
                        </div>
                        {searchResults.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
                                No results found for "{query}"
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {searchResults.map((result, i) => (
                                    <div key={i} style={{ padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 6 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                            <FileText size={14} color="var(--accent-primary)" />
                                            <span style={{ fontWeight: 500, fontSize: 13 }}>{result.filename}</span>
                                        </div>
                                        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                            ...{result.snippet}...
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div>
                         <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                            Documents ({documents.length})
                        </h4>
                        {isLoading ? (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
                                <Loader2 className="spin" size={20} />
                            </div>
                        ) : documents.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: 40, border: '1px dashed var(--border-color)', borderRadius: 8 }}>
                                <BookOpen size={32} style={{ opacity: 0.2, marginBottom: 12, color: 'var(--text-primary)' }} />
                                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                                    No documents uploaded yet.
                                </p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {documents.map(doc => (
                                    <div key={doc.id} className="group" style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'space-between', 
                                        padding: 12, 
                                        background: 'var(--bg-secondary)', 
                                        border: '1px solid var(--border-color)', 
                                        borderRadius: 6 
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div style={{ width: 32, height: 32, borderRadius: 4, background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <FileText size={16} color="var(--accent-primary)" />
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 13, fontWeight: 500 }}>{doc.filename}</div>
                                                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                                    {(doc.size / 1024).toFixed(1)} KB
                                                </div>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => handleDelete(doc.id)}
                                            className="btn-icon"
                                            style={{ color: 'var(--text-muted)', padding: 6 }}
                                            title="Delete document"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
