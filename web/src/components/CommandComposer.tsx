import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTranslation } from 'react-i18next';
import { API_URL as API, WS_URL as WS } from '../config';
import { 
  Terminal, 
  FileText, 
  Globe, 
  Cpu, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  FileCode,
  Link as LinkIcon,
  ChevronDown,
  ChevronRight,
  Clock,
  Image as ImageIcon,
  Video as VideoIcon,
  Mic,
  Play,
  Paperclip,
  X,
  Volume2,
  Settings,
  Power,
  Key,
  Eye,
  EyeOff,
  Trash2,
  Zap
} from 'lucide-react';

interface ProviderConfig {
  name: string;
  apiKey: string;
  isConnected: boolean;
  baseUrl?: string;
  model?: string;
  isCustom?: boolean;
  isVerifying?: boolean;
  lastError?: string;
}

export default function CommandComposer({ sessionId, onSessionCreated, onPreviewArtifact, onStepsUpdate }: { sessionId?: string; onSessionCreated?: (id: string) => void; onPreviewArtifact?: (content: string, lang: string) => void; onStepsUpdate?: (steps: any[]) => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<Array<{ id: string; name: string }>>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [events, setEvents] = useState<Array<{ type: string; data: any; duration?: number; expanded?: boolean }>>([]);
  const [approval, setApproval] = useState<{ id: string; runId: string; risk: string; action: string } | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  // AI Provider State
  const [showProviders, setShowProviders] = useState(false);
  const [providers, setProviders] = useState<{ [key: string]: ProviderConfig }>({
    llm: { name: 'Joe System (Default)', apiKey: '', isConnected: true },
    openai: { name: 'OpenAI', apiKey: '', isConnected: false, model: 'gpt-4o' },
    anthropic: { name: 'Anthropic', apiKey: '', isConnected: false, model: 'claude-3-opus-20240229' },
    gemini: { name: 'Google Gemini', apiKey: '', isConnected: false, model: 'gemini-pro' },
    grok: { name: 'xAI (Grok)', apiKey: '', isConnected: false, baseUrl: 'https://api.x.ai/v1', model: 'grok-beta' },
    custom: { name: 'Custom / Local LLM', apiKey: '', isConnected: false, baseUrl: 'http://localhost:11434/v1', model: 'llama3', isCustom: true },
  });
  const [activeProvider, setActiveProvider] = useState('llm');
  const [showKey, setShowKey] = useState<{[key: string]: boolean}>({});

  // Load providers from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ai_providers');
      if (saved) {
        const parsed = JSON.parse(saved);
        setProviders(prev => {
          const next = { ...prev };
          Object.keys(parsed).forEach(k => {
            if (next[k]) {
              // Preserve structure but update values
              next[k] = { ...next[k], ...parsed[k] };
              // Don't trust 'isConnected' from storage fully, maybe reset or keep it?
              // For now keep it but user might need to re-verify if token expired
            }
          });
          return next;
        });
      }
      const savedActive = localStorage.getItem('active_provider');
      if (savedActive) setActiveProvider(savedActive);
    } catch (e) {
      console.error('Failed to load providers settings', e);
    }
  }, []);

  // Save providers to localStorage on change
  useEffect(() => {
    localStorage.setItem('ai_providers', JSON.stringify(providers));
  }, [providers]);

  useEffect(() => {
    localStorage.setItem('active_provider', activeProvider);
  }, [activeProvider]);

  const reconnectTimerRef = useRef<number | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  const stepStartTimes = useRef<Record<string, number>>({});
  const endRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom on new events
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (onStepsUpdate) onStepsUpdate(events);
  }, [events, onStepsUpdate]);

  const speak = (text: string) => {
    if (!isVoiceMode) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const isArabic = /[\u0600-\u06FF]/.test(text);
    utterance.lang = isArabic ? 'ar-SA' : 'en-US';
    const voices = window.speechSynthesis.getVoices();
    if (isArabic) {
        const arVoice = voices.find(v => v.lang.includes('ar'));
        if (arVoice) utterance.voice = arVoice;
    }
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
    };
    return () => {
        window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    if ('webkitSpeechRecognition' in window) {
      // @ts-ignore
      const recognition = new window.webkitSpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'ar-SA';
      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setText(prev => prev + (prev ? ' ' : '') + transcript);
      };
      recognitionRef.current = recognition;
    }
  }, []);

  const toggleVoice = () => {
    if (!recognitionRef.current) {
      alert('التعرف الصوتي غير مدعوم في هذا المتصفح. يرجى استخدام Chrome.');
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
    }
  };

  useEffect(() => {
    connectWS();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
    };
  }, []);


  function connectWS() {
    try {
      if (wsRef.current) {
        if (wsRef.current.readyState === WebSocket.OPEN) return;
        try { wsRef.current.close(); } catch {}
      }
      const ws = new WebSocket(WS);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onclose = () => {
        setIsConnected(false);
        reconnectTimerRef.current = window.setTimeout(() => {
          connectWS();
        }, 2000);
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          
          if (msg.type === 'approval_required') {
            const { id, runId, risk, action } = msg.data;
            setApproval({ id, runId, risk, action });
          }

          if (msg.type === 'step_started') {
            stepStartTimes.current[msg.data.name] = Date.now();
          }

          if (msg.type === 'step_done' || msg.type === 'step_failed') {
            const start = stepStartTimes.current[msg.data.name];
            if (start) {
              msg.duration = Date.now() - start;
              delete stepStartTimes.current[msg.data.name];
            }
          }

          if (msg.type === 'text') {
             let content = msg.data;
             try {
               if (typeof content === 'string' && (content.startsWith('{') || content.startsWith('['))) {
                  const p = JSON.parse(content);
                  content = p.text || p.output || content;
               }
             } catch {}
             speak(String(content));
          }

          if (['step_started', 'step_done', 'step_failed', 'evidence_added', 'artifact_created', 'text', 'user_input'].includes(msg.type)) {
            setEvents(prev => [...prev, msg]);
          }
        } catch (e) {
          console.error('WS parse error:', e);
        }
      };
    } catch (e) {
      console.error('WS connect failed:', e);
      setIsConnected(false);
    }
  }

  useEffect(() => {
    if (sessionId) {
      setEvents([]);
      loadHistory(sessionId);
    } else {
      setEvents([]);
    }
  }, [sessionId]);

  async function loadHistory(id: string) {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/sessions/${id}/history`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.events)) {
          setEvents(data.events);
        } 
      }
    } catch (e) {
      console.error('Failed to load history', e);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    setIsUploading(true);
    
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);
      if (sessionId) formData.append('sessionId', sessionId);

      const res = await fetch(`${API}/files/upload`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setAttachedFiles(prev => [...prev, { id: data.file.id, name: data.file.originalName }]);
      } else {
        alert(t('uploadFailed') || 'Upload failed');
      }
    } catch (err) {
      console.error(err);
      alert(t('uploadError') || 'Upload error');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function run() {
    if (!text.trim()) return;
    
    // Optimistic update
    const tempId = Date.now().toString();
    setEvents(prev => [...prev, { type: 'user_input', data: text, id: tempId }]);
    const currentText = text;
    const currentFiles = [...attachedFiles];
    setText(''); 
    setAttachedFiles([]); 

    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API}/runs/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ 
          text: currentText, 
          sessionId,
          fileIds: currentFiles.map(f => f.id),
          provider: activeProvider === 'llm' ? undefined : activeProvider,
          apiKey: activeProvider === 'llm' ? undefined : providers[activeProvider]?.apiKey,
          baseUrl: activeProvider === 'llm' ? undefined : providers[activeProvider]?.baseUrl,
          model: activeProvider === 'llm' ? undefined : providers[activeProvider]?.model
        }),
      });
      const data = await res.json();
      if (data.sessionId && !sessionId && onSessionCreated) {
        onSessionCreated(data.sessionId);
      }
      if (sessionId || data.sessionId) {
        await loadHistory(sessionId || data.sessionId);
      }
      if (!isConnected && data?.result) {
         const r = data.result;
         if (r?.output) {
             const txt = typeof r.output === 'string' ? r.output : JSON.stringify(r.output);
             setEvents(prev => [...prev, { type: 'text', data: txt }]);
         }
      }
    } catch (e) {
      console.error(e);
      setEvents(prev => [...prev, { type: 'error', data: t('error') }]);
      setText(currentText);
    }
  }

  async function approve(decision: 'approved' | 'denied') {
    if (!approval) return;
    const token = localStorage.getItem('token');
    await fetch(`${API}/approvals/${approval.id}/decision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ decision }),
    });
    setApproval(null);
  }

  const checkConnection = async (key: string) => {
    const p = providers[key];
    setProviders(prev => ({ ...prev, [key]: { ...prev[key], isVerifying: true, lastError: undefined } }));
    
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API}/runs/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
                provider: key === 'llm' ? 'llm' : key,
                apiKey: p.apiKey,
                baseUrl: p.baseUrl,
                model: p.model
            })
        });
        
        const data = await res.json();
        
        if (res.ok) {
            setProviders(prev => ({ 
                ...prev, 
                [key]: { ...prev[key], isVerifying: false, isConnected: true, lastError: undefined } 
            }));
            setActiveProvider(key);
        } else {
            throw new Error(data.error || 'Connection failed');
        }
    } catch (err: any) {
        setProviders(prev => ({ 
            ...prev, 
            [key]: { ...prev[key], isVerifying: false, isConnected: false, lastError: err.message } 
        }));
    }
  };

  const deleteProviderKey = (key: string) => {
    if (confirm('Are you sure you want to remove the API key?')) {
        setProviders(prev => ({ 
            ...prev, 
            [key]: { ...prev[key], apiKey: '', isConnected: false } 
        }));
    }
  };

  const isThinking = isConnected && events.length > 0 && 
    (events[events.length - 1].type === 'user_input' || 
     events[events.length - 1].type === 'step_started');

  return (
    <div className="composer">
      <div className="events">
        {events.length === 0 && (
          <div style={{ opacity: 0.5, textAlign: 'center', marginTop: 80, fontSize: 18, color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>{t('welcomeTitle')}</div>
            {t('welcomeMsg').split('\n').map((line, i) => <div key={i}>{line}</div>)}
          </div>
        )}
        
        {events.map((e, i) => {
          if (e.type === 'user_input') {
            return (
              <div key={i} className="message-row user">
                <div className="message-bubble" dir="auto">
                  {e.data}
                </div>
              </div>
            );
          }
          if (e.type === 'error') {
            return (
              <div key={i} className="message-row joe">
                <div className="message-bubble error" dir="auto" style={{ color: '#ef4444', border: '1px solid #ef4444', background: 'rgba(239, 68, 68, 0.1)' }}>
                  ⚠️ {e.data}
                </div>
              </div>
            );
          }
          if (e.type === 'text') {
            let content = e.data;
            try {
              if (typeof content === 'string' && (content.startsWith('{') || content.startsWith('['))) {
                 const p = JSON.parse(content);
                 content = p.text || p.output || content;
              }
            } catch {}
            return (
              <div key={i} className="message-row joe">
                <div className="message-bubble markdown-content" dir="auto">
                  <ReactMarkdown
                    components={{
                      code(props) {
                        const {children, className, ...rest} = props as any;
                        const match = /language-(\w+)/.exec(className || '');
                        const lang = match ? match[1] : '';
                        const isPreviewable = ['html', 'css', 'javascript', 'js', 'react', 'jsx', 'tsx'].includes(lang);
                        return match ? (
                          <div style={{ position: 'relative' }}>
                            {isPreviewable && onPreviewArtifact && (
                               <button 
                                 onClick={() => onPreviewArtifact(String(children).replace(/\n$/, ''), lang)}
                                 style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 4, border: 'none', background: 'var(--accent-primary)', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600, opacity: 0.9 }}
                                 title="معاينة الكود"
                               >
                                 <Play size={10} fill="currentColor" /> معاينة
                               </button>
                            )}
                            <SyntaxHighlighter {...rest} PreTag="div" children={String(children).replace(/\n$/, '')} language={lang} style={vscDarkPlus} />
                          </div>
                        ) : (
                          <code {...rest} className={className}>{children}</code>
                        );
                      },
                      img(props) {
                        return <img {...props} style={{ maxWidth: '100%', borderRadius: 8, marginTop: 8, border: '1px solid var(--border-color)' }} onLoad={() => endRef.current?.scrollIntoView({ behavior: 'smooth' })} />;
                      }
                    }}
                  >
                    {String(content)}
                  </ReactMarkdown>
                  <div className="copy-icon" onClick={() => navigator.clipboard.writeText(String(content))} title={t('copy')}>
                    <svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                  </div>
                </div>
              </div>
            );
          }
          if (e.type === 'step_started') {
            const isImage = e.data.name && e.data.name.includes('image_generate');
            const isDone = events.slice(i + 1).some(next => (next.type === 'step_done' || next.type === 'step_failed') && (next.data.name === e.data.name || next.data.name === `execute:${e.data.name}`));
            if (isImage && !isDone) {
               return (
                 <div key={i} className="message-row joe" style={{ marginBottom: 4 }}>
                   <div className="image-loading-frame" style={{ width: 300, height: 300, background: 'var(--bg-secondary)', borderRadius: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--border-color)', position: 'relative', overflow: 'hidden' }}>
                     <Loader2 size={32} className="spin" style={{ marginBottom: 16, color: '#eab308' }} />
                     <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Generating Image...</div>
                   </div>
                 </div>
               );
            }
            return null;
          }
          if (e.type === 'artifact_created') {
            const isImage = /\.(png|jpg|jpeg|webp|gif)$/i.test(e.data.name || '') || /\.(png|jpg|jpeg|webp|gif)$/i.test(e.data.href || '');
            const isVideo = /\.(mp4|webm|mov)$/i.test(e.data.name || '') || /\.(mp4|webm|mov)$/i.test(e.data.href || '');
            return (
              <div key={i} className="message-row joe">
                <div className="event-artifact">
                  {isImage ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <ImageIcon size={16} className="artifact-icon" />
                        <div className="artifact-title">{t('artifacts.image')}</div>
                      </div>
                      <img src={e.data.href} alt={e.data.name} style={{ display: 'block' }} />
                    </>
                  ) : isVideo ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <VideoIcon size={16} className="artifact-icon" />
                        <div className="artifact-title">{t('artifacts.video')}</div>
                      </div>
                      <video controls src={e.data.href} style={{ width: '100%', borderRadius: 8 }} />
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <FileCode size={20} className="artifact-icon" />
                        <div className="artifact-info">
                          <div className="artifact-title">{t('artifacts.file')}</div>
                          <div className="artifact-name">{e.data.name}</div>
                        </div>
                      </div>
                    </>
                  )}
                  <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                    <a href={e.data.href} target="_blank" rel="noopener noreferrer" className="artifact-link">
                      <LinkIcon size={12} /> {t('artifacts.openNewWindow')}
                    </a>
                  </div>
                </div>
              </div>
            );
          }
          return null;
        })}

        {isThinking && (
          <div className="message-row joe">
             <div className="typing-indicator">
               <div className="typing-dot"></div>
               <div className="typing-dot"></div>
               <div className="typing-dot"></div>
             </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      
      {approval && (
        <div className="approval-modal">
          <div className="approval-content">
            <h3>{t('approvalRequired')}</h3>
            <div className="risk-badge">{approval.risk}</div>
            <p>{t('action')}: {approval.action}</p>
            <div className="approval-actions">
              <button onClick={() => approve('denied')} className="btn deny">{t('deny')}</button>
              <button onClick={() => approve('approved')} className="btn approve">{t('approve')}</button>
            </div>
          </div>
        </div>
      )}

      {/* AI Providers Modal */}
      {showProviders && (
        <div className="providers-modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center'
        }} onClick={() => setShowProviders(false)}>
            <div className="providers-modal" style={{
                width: 700, height: 500, background: 'var(--bg-primary)',
                borderRadius: 16, border: '1px solid var(--border-color)',
                boxShadow: '0 20px 50px rgba(0,0,0,0.3)', display: 'flex', overflow: 'hidden'
            }} onClick={e => e.stopPropagation()}>
                
                {/* Left Sidebar */}
                <div style={{ width: 220, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-color)', padding: 16 }}>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Cpu size={18} /> Providers
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {Object.entries(providers).map(([key, p]) => (
                            <button key={key} onClick={() => setActiveProvider(key)} style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '10px 12px', borderRadius: 8, border: 'none',
                                background: activeProvider === key ? 'var(--bg-primary)' : 'transparent',
                                color: activeProvider === key ? 'var(--text-primary)' : 'var(--text-muted)',
                                cursor: 'pointer', textAlign: 'left',
                                fontWeight: activeProvider === key ? 600 : 400,
                                transition: 'all 0.2s'
                            }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ 
                                        width: 8, height: 8, borderRadius: '50%',
                                        background: p.isConnected ? '#22c55e' : (p.apiKey ? '#eab308' : '#71717a'),
                                        boxShadow: p.isConnected ? '0 0 8px #22c55e' : 'none'
                                    }} />
                                    {p.name.split(' ')[0]}
                                </span>
                                {activeProvider === key && <ChevronRight size={14} />}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Right Content */}
                <div style={{ flex: 1, padding: 24, display: 'flex', flexDirection: 'column' }}>
                    {providers[activeProvider] && (
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: 20 }}>{providers[activeProvider].name}</h2>
                                    <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <div style={{ 
                                            padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                                            background: providers[activeProvider].isConnected ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                            color: providers[activeProvider].isConnected ? '#22c55e' : '#ef4444'
                                        }}>
                                            {providers[activeProvider].isConnected ? 'CONNECTED' : 'DISCONNECTED'}
                                        </div>
                                        {providers[activeProvider].isVerifying && <Loader2 size={12} className="spin" />}
                                    </div>
                                </div>
                                <button onClick={() => setShowProviders(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                    <X size={20} />
                                </button>
                            </div>

                            <div style={{ flex: 1 }}>
                                {activeProvider !== 'llm' && (
                                    <div style={{ marginBottom: 20 }}>
                                        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 8 }}>API Key</label>
                                        <div style={{ position: 'relative', display: 'flex', gap: 8 }}>
                                            <div style={{ position: 'relative', flex: 1 }}>
                                                <input 
                                                    type={showKey[activeProvider] ? "text" : "password"} 
                                                    value={providers[activeProvider].apiKey}
                                                    onChange={(e) => setProviders(prev => ({ ...prev, [activeProvider]: { ...prev[activeProvider], apiKey: e.target.value, isConnected: false } }))}
                                                    placeholder="sk-..."
                                                    style={{ 
                                                        width: '100%', padding: '10px 12px', borderRadius: 8, 
                                                        border: '1px solid var(--border-color)', background: 'var(--bg-secondary)',
                                                        color: 'var(--text-primary)', outline: 'none', fontSize: 14
                                                    }}
                                                />
                                                <button 
                                                    onClick={() => setShowKey(prev => ({ ...prev, [activeProvider]: !prev[activeProvider] }))}
                                                    style={{ position: 'absolute', right: 10, top: 10, background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5 }}
                                                >
                                                    {showKey[activeProvider] ? <EyeOff size={16} /> : <Eye size={16} />}
                                                </button>
                                            </div>
                                            <button 
                                                onClick={() => deleteProviderKey(activeProvider)}
                                                title="Clear Key"
                                                style={{ 
                                                    padding: '0 12px', borderRadius: 8, border: '1px solid var(--border-color)', 
                                                    background: 'var(--bg-secondary)', color: '#ef4444', cursor: 'pointer' 
                                                }}
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Model ID</label>
                                        <input 
                                            type="text" 
                                            value={providers[activeProvider].model || ''}
                                            onChange={(e) => setProviders(prev => ({ ...prev, [activeProvider]: { ...prev[activeProvider], model: e.target.value } }))}
                                            placeholder="gpt-4o"
                                            style={{ 
                                                width: '100%', padding: '10px 12px', borderRadius: 8, 
                                                border: '1px solid var(--border-color)', background: 'var(--bg-secondary)',
                                                color: 'var(--text-primary)', outline: 'none', fontSize: 14
                                            }}
                                        />
                                    </div>
                                    {(providers[activeProvider].isCustom || activeProvider === 'grok') && (
                                        <div>
                                            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Base URL</label>
                                            <input 
                                                type="text" 
                                                value={providers[activeProvider].baseUrl || ''}
                                                onChange={(e) => setProviders(prev => ({ ...prev, [activeProvider]: { ...prev[activeProvider], baseUrl: e.target.value } }))}
                                                placeholder="https://api..."
                                                style={{ 
                                                    width: '100%', padding: '10px 12px', borderRadius: 8, 
                                                    border: '1px solid var(--border-color)', background: 'var(--bg-secondary)',
                                                    color: 'var(--text-primary)', outline: 'none', fontSize: 14
                                                }}
                                            />
                                        </div>
                                    )}
                                </div>

                                {providers[activeProvider].lastError && (
                                    <div style={{ 
                                        padding: 12, borderRadius: 8, background: 'rgba(239, 68, 68, 0.1)', 
                                        border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', fontSize: 13,
                                        marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8
                                    }}>
                                        <XCircle size={16} />
                                        {providers[activeProvider].lastError}
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'flex', gap: 12, paddingTop: 20, borderTop: '1px solid var(--border-color)' }}>
                                <button 
                                    onClick={() => checkConnection(activeProvider)}
                                    disabled={providers[activeProvider].isVerifying}
                                    style={{ 
                                        flex: 1, padding: '12px', borderRadius: 8, border: 'none',
                                        background: providers[activeProvider].isConnected ? '#22c55e' : 'var(--accent-primary)',
                                        color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                        opacity: providers[activeProvider].isVerifying ? 0.7 : 1
                                    }}
                                >
                                    {providers[activeProvider].isVerifying ? (
                                        <>
                                            <Loader2 size={18} className="spin" /> Verifying...
                                        </>
                                    ) : providers[activeProvider].isConnected ? (
                                        <>
                                            <CheckCircle2 size={18} /> Verified & Active
                                        </>
                                    ) : (
                                        <>
                                            <Zap size={18} /> Connect & Activate
                                        </>
                                    )}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
      )}

      {attachedFiles.length > 0 && (
        <div className="attached-files">
          {attachedFiles.map((file, i) => (
            <div key={i} className="attached-file-chip">
              <span className="file-name">{file.name}</span>
              <button onClick={() => setAttachedFiles(prev => prev.filter((_, idx) => idx !== i))} className="remove-file-btn">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="input-area">
        <textarea 
          value={text} 
          onChange={(e) => setText(e.target.value)} 
          placeholder={t('inputPlaceholder')}
          dir="auto"
          disabled={!!approval}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              run();
            }
          }}
        />
        <div className="input-actions">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ 
                width: 8, height: 8, 
                borderRadius: '50%', 
                backgroundColor: isConnected ? '#22c55e' : '#ef4444',
                boxShadow: isConnected ? '0 0 6px #22c55e' : 'none',
                transition: 'all 0.3s'
            }} title={isConnected ? t('connected') : t('connecting')} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {isConnected ? t('connected') : t('connecting')}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
               <button
                 className="mic-button"
                 onClick={() => setShowProviders(true)}
                 title="AI Providers"
                 style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: showProviders ? 'var(--accent-primary)' : 'inherit' }}
               >
                 <Settings size={20} />
               </button>
            </div>
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <button 
              className="mic-button"
              onClick={() => fileInputRef.current?.click()}
              title={t('attachFile') || "Attach file"}
              disabled={isUploading}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', opacity: isUploading ? 0.5 : 1 }}
            >
              {isUploading ? <Loader2 size={20} className="spin" /> : <Paperclip size={20} />}
            </button>
            <button 
              className={`mic-button ${isListening ? 'listening' : ''}`}
              onClick={toggleVoice}
              title="تحدث الآن"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: isListening ? '#ef4444' : 'inherit', position: 'relative' }}
            >
              <Mic size={20} />
            </button>
            <button 
              className="send-button" 
              onClick={run}
              disabled={!text.trim() || !!approval}
            >
              {t('send')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
