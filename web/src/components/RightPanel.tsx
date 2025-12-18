import { useEffect, useState, useRef } from 'react';
import { API_URL as API, WS_URL as WS } from '../config';
import ArtifactPreview from './ArtifactPreview';
import CodeEditor from './CodeEditor';
import GraphVisualizer from './GraphVisualizer';
import PlanVisualizer from './PlanVisualizer';

import Terminal from './Terminal';
import { Terminal as TerminalIcon, CheckCircle2, XCircle, Loader2, ChevronRight, ChevronDown, Cpu, Globe, FileText, Eye, Code, BarChart, Activity, Clock, MessageSquare, GitBranch, Share2, Folder, Trash2, User, Database, Workflow, Mic, Upload, Search, Plus } from 'lucide-react';

export default function RightPanel({ active, sessionId, previewData, steps = [], onTabChange, initialTerminalState, initialBrowserState, messages = [] }: { active: 'LIVE' | 'BROWSER' | 'ARTIFACTS' | 'MEMORY' | 'QA' | 'PREVIEW' | 'STEPS' | 'TERMINAL' | 'ANALYTICS' | 'GRAPH' | 'FILES' | 'PLAN' | 'KNOWLEDGE'; sessionId?: string; previewData?: { content: string; language: string; } | null; steps?: any[]; onTabChange?: (tab: any) => void; initialTerminalState?: string; initialBrowserState?: any; messages?: any[] }) {
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
  
  // File Explorer State
  const [fileTree, setFileTree] = useState<any[]>([]);
  const [selectedFile, setSelectedFile] = useState<{ path: string; name: string; content: string } | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({});
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editorContent, setEditorContent] = useState('');

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

    if (active === 'FILES') {
      setIsFileLoading(true);
      fetch(`${API}/project/tree?depth=4`, {
        headers: { Authorization: localStorage.getItem('token') ? `Bearer ${localStorage.getItem('token')}` : '' }
      })
      .then(res => res.json())
      .then(data => {
         setFileTree(data.tree || []);
         setIsFileLoading(false);
      })
      .catch(() => setIsFileLoading(false));
    }
  }, [active, sessionId]);

  const loadFileContent = async (path: string, name: string) => {
      try {
          const res = await fetch(`${API}/project/content?path=${encodeURIComponent(path)}`, {
             headers: { Authorization: localStorage.getItem('token') ? `Bearer ${localStorage.getItem('token')}` : '' }
          });
          const data = await res.json();
          setSelectedFile({ path, name, content: data.content });
          setEditorContent(data.content);
      } catch (e) {
          console.error(e);
      }
  };

  const saveFile = async () => {
      if (!selectedFile) return;
      setIsSaving(true);
      try {
          await fetch(`${API}/project/content`, {
              method: 'POST',
              headers: { 
                  'Content-Type': 'application/json',
                  Authorization: localStorage.getItem('token') ? `Bearer ${localStorage.getItem('token')}` : '' 
              },
              body: JSON.stringify({ path: selectedFile.path, content: editorContent })
          });
          // Update local state
          setSelectedFile(prev => prev ? { ...prev, content: editorContent } : null);
          alert('File saved successfully!');
      } catch (e) {
          alert('Failed to save file');
      } finally {
          setIsSaving(false);
      }
  };

  // Helper to render tree
  const renderTree = (nodes: any[], level = 0) => {
      return nodes.map((node, i) => {
          const isExpanded = expandedDirs[node.path];
          const isSelected = selectedFile?.path === node.path;
          
          return (
              <div key={node.path + i}>
                  <div 
                    className={`tree-item ${isSelected ? 'selected' : ''}`}
                    style={{ 
                        paddingLeft: level * 16 + 8, 
                        paddingRight: 8,
                        paddingTop: 4, 
                        paddingBottom: 4,
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 6,
                        cursor: 'pointer',
                        background: isSelected ? 'var(--bg-active)' : 'transparent',
                        color: isSelected ? 'var(--accent-primary)' : 'inherit',
                        fontSize: 13
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (node.type === 'directory') {
                            setExpandedDirs(prev => ({ ...prev, [node.path]: !prev[node.path] }));
                        } else {
                            loadFileContent(node.path, node.name);
                        }
                    }}
                  >
                      {node.type === 'directory' ? (
                          <span style={{ opacity: 0.7 }}>{isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                      ) : <span style={{ width: 14 }} />}
                      
                      {node.type === 'directory' ? <Folder size={14} color="#fbbf24" /> : <FileText size={14} color="#60a5fa" />}
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}</span>
                  </div>
                  {node.type === 'directory' && isExpanded && node.children && (
                      <div>{renderTree(node.children, level + 1)}</div>
                  )}
              </div>
          );
      });
  };

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

  if (active === 'FILES') {
    return (
      <div className="panel-content" style={{ padding: 0, display: 'flex', height: '100%', overflow: 'hidden' }}>
        <div style={{ width: 250, borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)' }}>
          <div style={{ padding: 12, borderBottom: '1px solid var(--border-color)', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Explorer</span>
            <button 
              onClick={() => {
                setIsFileLoading(true);
                fetch(`${API}/project/tree?depth=4`, {
                  headers: { Authorization: localStorage.getItem('token') ? `Bearer ${localStorage.getItem('token')}` : '' }
                })
                .then(res => res.json())
                .then(data => {
                  setFileTree(data.tree || []);
                  setIsFileLoading(false);
                });
              }}
              className="btn-icon"
              style={{ padding: 4 }}
            >
              <Activity size={14} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
            {isFileLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}><Loader2 className="spin" /></div>
            ) : (
              renderTree(fileTree)
            )}
          </div>
        </div>
        
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
          {selectedFile ? (
            <>
              <div style={{ height: 40, borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', background: 'var(--bg-secondary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <FileText size={14} style={{ color: 'var(--accent-primary)' }} />
                  <span style={{ fontWeight: 500 }}>{selectedFile.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', opacity: 0.7 }}>{selectedFile.path}</span>
                </div>
                <button 
                  onClick={saveFile}
                  disabled={isSaving}
                  className="btn"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', fontSize: 12 }}
                >
                  {isSaving ? <Loader2 size={12} className="spin" /> : <CheckCircle2 size={12} />}
                  Save
                </button>
              </div>
              <div style={{ flex: 1, position: 'relative' }}>
                <CodeEditor 
                  code={editorContent}
                  language={selectedFile.name.endsWith('ts') || selectedFile.name.endsWith('tsx') ? 'typescript' : 'javascript'}
                  onChange={(val) => setEditorContent(val || '')}
                  theme="vs-dark"
                />
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
              <Folder size={48} style={{ marginBottom: 16, opacity: 0.2 }} />
              <p>Select a file to edit</p>
            </div>
          )}
        </div>
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
            <GraphVisualizer data={graphData} />
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

   if (active === 'TERMINAL') {
    return <Terminal agentLogs={termOutput} />;
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
    const allItems = [
        ...assets.files.map(f => ({ ...f, _type: 'file' })),
        ...assets.artifacts.map(a => ({ ...a, _type: 'artifact' }))
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return (
      <div className="panel-content" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        
        {/* Summary Stats */}
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

  const [memories, setMemories] = useState<any[]>([]);

  useEffect(() => {
    if (active === 'MEMORY') {
      refreshSummary();
      loadMemories();
    }
  }, [active, sessionId]);

  async function loadMemories() {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/memory`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (res.ok) {
        const data = await res.json();
        setMemories(data.memories || []);
    }
  }

  async function deleteMemory(id: string) {
    if (!confirm('Are you sure you want to forget this fact?')) return;
    const token = localStorage.getItem('token');
    await fetch(`${API}/memory/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    loadMemories();
  }

  if (active === 'MEMORY') {
    return <MemoryPanel sessionId={sessionId} />;
  }

  return null;
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
                >
                    <div className="flex items-center gap-2 font-semibold">
                        <Cpu size={16} className="text-[var(--accent-primary)]" />
                        System Instructions
                    </div>
                    {showSystemPrompt ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                {showSystemPrompt && (
                    <div className="p-4 bg-[var(--bg-secondary)] border-t border-[var(--border-color)]">
                        <pre className="text-xs whitespace-pre-wrap font-mono text-[var(--text-secondary)]">
                            {data.systemPrompt}
                        </pre>
                    </div>
                )}
            </div>

            {/* Session Summary */}
            <div className="p-4 border-b border-[var(--border-color)]">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 font-semibold">
                        <MessageSquare size={16} className="text-yellow-500" />
                        Session Summary
                    </div>
                    <button 
                        onClick={() => isEditingSummary ? saveSummary() : setIsEditingSummary(true)}
                        className="text-xs px-2 py-1 rounded bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)]"
                    >
                        {isEditingSummary ? 'Save' : 'Edit'}
                    </button>
                </div>
                {isEditingSummary ? (
                    <textarea 
                        value={summaryEdit}
                        onChange={e => setSummaryEdit(e.target.value)}
                        className="w-full h-32 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded p-2 text-sm focus:outline-none focus:border-[var(--accent-primary)]"
                    />
                ) : (
                    <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                        {data.summary || <span className="italic opacity-50">No summary generated yet.</span>}
                    </div>
                )}
            </div>

            {/* Recent Context (Short Term) */}
            <div className="p-4 border-b border-[var(--border-color)]">
                <div className="flex items-center gap-2 font-semibold mb-3">
                    <Activity size={16} className="text-green-500" />
                    Short-term Context (Last 10)
                </div>
                <div className="space-y-3">
                    {data.recentMessages.map((msg, i) => (
                        <div key={i} className={`flex gap-3 ${msg.role === 'assistant' ? 'flex-row-reverse' : ''}`}>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                                msg.role === 'user' ? 'bg-blue-600' : 'bg-purple-600'
                            }`}>
                                {msg.role === 'user' ? <User size={12} /> : <Cpu size={12} />}
                            </div>
                            <div className={`flex-1 text-xs p-2 rounded ${
                                msg.role === 'user' ? 'bg-[var(--bg-secondary)]' : 'bg-[var(--bg-tertiary)]'
                            }`}>
                                <div className="font-semibold mb-1 opacity-70">{msg.role.toUpperCase()}</div>
                                <div className="whitespace-pre-wrap line-clamp-4 hover:line-clamp-none transition-all cursor-pointer">
                                    {typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Long Term Facts */}
            <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 font-semibold">
                        <Database size={16} className="text-blue-500" />
                        Learned Facts
                    </div>
                    <span className="text-xs text-[var(--text-muted)]">{data.memories.length} facts</span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                    {data.memories.map(m => (
                        <div key={m._id} className="p-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded group relative">
                            <div className="text-xs font-bold text-[var(--accent-primary)] uppercase mb-1">{m.key}</div>
                            <div className="text-sm text-[var(--text-secondary)]">{m.value}</div>
                            <button 
                                onClick={() => deleteMemory(m._id)}
                                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 text-red-500 rounded transition-all"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    ))}
                    {data.memories.length === 0 && (
                        <div className="text-center py-8 text-[var(--text-muted)] italic text-sm border border-dashed border-[var(--border-color)] rounded">
                            No facts learned yet.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function KnowledgePanel({ sessionId }: { sessionId?: string }) {
    const [documents, setDocuments] = useState<any[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const loadDocuments = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API}/knowledge/list`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            if (res.ok) {
                const data = await res.json();
                setDocuments(data);
            }
        } catch (e) {
            console.error('Failed to load documents', e);
        }
    };

    useEffect(() => {
        loadDocuments();
    }, []);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !e.target.files[0]) return;
        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', e.target.files[0]);

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API}/knowledge/upload`, {
                method: 'POST',
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                body: formData
            });

            if (res.ok) {
                await loadDocuments();
            } else {
                alert('Upload failed');
            }
        } catch (error) {
            console.error(error);
            alert('Upload error');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleSearch = async () => {
        if (!searchQuery.trim()) {
            setSearchResults([]);
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API}/knowledge/query`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}) 
                },
                body: JSON.stringify({ query: searchQuery })
            });

            if (res.ok) {
                const data = await res.json();
                setSearchResults(data.results);
            }
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div className="flex flex-col h-full bg-[var(--bg-primary)] overflow-y-auto custom-scrollbar">
            <div className="p-4 border-b border-[var(--border-color)]">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Database size={20} className="text-[var(--accent-primary)]" />
                        Knowledge Base
                    </h3>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleUpload} 
                        style={{ display: 'none' }} 
                        accept=".txt,.md,.pdf"
                    />
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="flex items-center gap-2 px-3 py-1.5 bg-[var(--accent-primary)] text-white rounded hover:opacity-90 transition-opacity text-sm font-medium"
                    >
                        {isUploading ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}
                        Upload Doc
                    </button>
                </div>

                <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input 
                        type="text" 
                        placeholder="Search knowledge base..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        className="w-full pl-9 pr-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded focus:outline-none focus:border-[var(--accent-primary)] text-sm"
                    />
                </div>
            </div>

            <div className="flex-1 p-4">
                {searchResults.length > 0 ? (
                    <div className="space-y-4">
                        <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Search Results</h4>
                        {searchResults.map((result, i) => (
                            <div key={i} className="p-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded hover:border-[var(--accent-primary)] transition-colors cursor-pointer">
                                <div className="flex items-center gap-2 mb-2">
                                    <FileText size={16} className="text-[var(--accent-primary)]" />
                                    <span className="font-medium text-sm">{result.filename}</span>
                                </div>
                                <p className="text-xs text-[var(--text-secondary)] line-clamp-3 leading-relaxed">
                                    {result.snippet}
                                </p>
                            </div>
                        ))}
                         <button 
                            onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                            className="w-full py-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                        >
                            Clear Search
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">Documents ({documents.length})</h4>
                        {documents.length === 0 ? (
                             <div className="text-center py-12 text-[var(--text-muted)] border border-dashed border-[var(--border-color)] rounded">
                                <Upload size={32} className="mx-auto mb-3 opacity-20" />
                                <p className="text-sm">No documents uploaded yet.</p>
                                <p className="text-xs opacity-70 mt-1">Upload PDF, TXT or MD files to enhance context.</p>
                             </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-2">
                                {documents.map((doc) => {
                                    if (!doc) return null;
                                    return (
                                    <div key={doc.id} className="flex items-center justify-between p-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded group">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded bg-[var(--bg-tertiary)] flex items-center justify-center text-[var(--text-muted)]">
                                                <FileText size={16} />
                                            </div>
                                            <div>
                                                <div className="text-sm font-medium">{doc.filename}</div>
                                                <div className="text-[10px] text-[var(--text-muted)]">ID: {doc.id} • {doc.size ? `${Math.round(doc.size/1024)} KB` : 'Unknown size'}</div>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => deleteDocument(doc.id)}
                                            className="p-2 text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 rounded transition-colors opacity-0 group-hover:opacity-100"
                                            title="Delete Document"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
