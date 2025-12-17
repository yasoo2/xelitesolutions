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
  Volume2
} from 'lucide-react';

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
    
    // Cancel current speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    // Detect language (simple check)
    const isArabic = /[\u0600-\u06FF]/.test(text);
    utterance.lang = isArabic ? 'ar-SA' : 'en-US';
    
    // Find a good voice if possible
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
    // Load voices eagerly
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
      recognition.lang = 'ar-SA'; // Default to Arabic

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
      setEvents([]); // Clear previous events immediately
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
    setText(''); // Clear input immediately
    setAttachedFiles([]); // Clear attached files

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
          fileIds: currentFiles.map(f => f.id)
        }),
      });
      const data = await res.json();
      if (data.sessionId && !sessionId && onSessionCreated) {
        onSessionCreated(data.sessionId);
      }
      if (sessionId || data.sessionId) {
        await loadHistory(sessionId || data.sessionId);
      }
      // Fallback for non-streaming response
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

  async function plan() {
    const token = localStorage.getItem('token');
    await fetch(`${API}/runs/plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text }),
    });
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

  const toggleExpand = (index: number) => {
    setEvents(prev => prev.map((e, i) => i === index ? { ...e, expanded: !e.expanded } : e));
  };

  const getToolIcon = (name: string) => {
    if (name.includes('shell') || name.includes('exec')) return <Terminal size={14} />;
    if (name.includes('web') || name.includes('search')) return <Globe size={14} />;
    if (name.includes('file')) return <FileText size={14} />;
    if (name.includes('plan') || name.includes('thinking')) return <Cpu size={14} />;
    return <Cpu size={14} />;
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
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
          // USER INPUT
          if (e.type === 'user_input') {
            return (
              <div key={i} className="message-row user">
                <div className="message-bubble" dir="auto">
                  {e.data}
                </div>
              </div>
            );
          }
          
          // ERROR RESPONSE
          if (e.type === 'error') {
            return (
              <div key={i} className="message-row joe">
                <div className="message-bubble error" dir="auto" style={{ color: '#ef4444', border: '1px solid #ef4444', background: 'rgba(239, 68, 68, 0.1)' }}>
                  ⚠️ {e.data}
                </div>
              </div>
            );
          }

          // JOE TEXT RESPONSE
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
                                 style={{
                                   position: 'absolute',
                                   top: 8,
                                   right: 8,
                                   zIndex: 10,
                                   display: 'flex',
                                   alignItems: 'center',
                                   gap: 4,
                                   padding: '4px 8px',
                                   borderRadius: 4,
                                   border: 'none',
                                   background: 'var(--accent-primary)',
                                   color: '#fff',
                                   cursor: 'pointer',
                                   fontSize: 11,
                                   fontWeight: 600,
                                   opacity: 0.9
                                 }}
                                 title="معاينة الكود"
                               >
                                 <Play size={10} fill="currentColor" /> معاينة
                               </button>
                            )}
                            <SyntaxHighlighter
                              {...rest}
                              PreTag="div"
                              children={String(children).replace(/\n$/, '')}
                              language={lang}
                              style={vscDarkPlus}
                            />
                          </div>
                        ) : (
                          <code {...rest} className={className}>
                            {children}
                          </code>
                        );
                      },
                      img(props) {
                        return (
                           <img 
                             {...props} 
                             style={{ maxWidth: '100%', borderRadius: 8, marginTop: 8, border: '1px solid var(--border-color)' }} 
                             onLoad={() => {
                               // Ensure scroll to bottom when image loads
                               endRef.current?.scrollIntoView({ behavior: 'smooth' });
                             }}
                           />
                        );
                      }
                    }}
                  >
                    {String(content)}
                  </ReactMarkdown>
                  
                  {/* Copy Button */}
                  <div 
                    className="copy-icon" 
                    onClick={() => navigator.clipboard.writeText(String(content))}
                    title={t('copy')}
                  >
                    <svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                  </div>
                </div>
              </div>
            );
          }

          // STEPS (Thinking)
          if (e.type === 'step_started') {
            const isImage = e.data.name && e.data.name.includes('image_generate');
            // Check if this step is already done/failed by looking ahead
            const isDone = events.slice(i + 1).some(next => 
              (next.type === 'step_done' || next.type === 'step_failed') && 
              (next.data.name === e.data.name || next.data.name === `execute:${e.data.name}`)
            );

            if (isImage && !isDone) {
               return (
                 <div key={i} className="message-row joe" style={{ marginBottom: 4 }}>
                   <div className="image-loading-frame" style={{ 
                       width: 300, 
                       height: 300, 
                       background: 'var(--bg-secondary)', 
                       borderRadius: 8, 
                       display: 'flex', 
                       flexDirection: 'column',
                       alignItems: 'center', 
                       justifyContent: 'center',
                       border: '2px dashed var(--border-color)',
                       position: 'relative',
                       overflow: 'hidden'
                   }}>
                     <Loader2 size={32} className="spin" style={{ marginBottom: 16, color: '#eab308' }} />
                     <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Generating Image...</div>
                     {/* Scan line effect */}
                     <div style={{
                       position: 'absolute',
                       top: 0,
                       left: 0,
                       right: 0,
                       height: '2px',
                       background: 'rgba(234, 179, 8, 0.5)',
                       boxShadow: '0 0 10px #eab308',
                       animation: 'scan 2s linear infinite'
                     }} />
                     <style>{`
                       @keyframes scan {
                         0% { top: 0; opacity: 0; }
                         10% { opacity: 1; }
                         90% { opacity: 1; }
                         100% { top: 100%; opacity: 0; }
                       }
                     `}</style>
                   </div>
                 </div>
               );
            }

            // Hide other steps from main chat (moved to Right Panel)
            return null;
          }

          if (e.type === 'step_done') {
            // Hide from main chat (moved to Right Panel)
            return null;
          }

          if (e.type === 'step_failed') {
            // Hide from main chat (moved to Right Panel)
            return null;
          }

          // ARTIFACTS
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

          if (e.type === 'error') {
            return (
               <div key={i} className="message-row joe">
                 <div className="message-bubble" style={{ border: '1px solid #ef4444', background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                   ⚠️ {e.data}
                 </div>
               </div>
            );
          }

          return null;
        })}

        {/* Thinking Indicator */}
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
              {isListening && (
                 <span style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, background: '#ef4444', borderRadius: '50%', animation: 'pulse 1s infinite' }} />
              )}
            </button>
            <button 
              className={`voice-mode-btn ${isVoiceMode ? 'active' : ''}`}
              onClick={() => setIsVoiceMode(!isVoiceMode)}
              title={isVoiceMode ? 'إيقاف الصوت' : 'تفعيل الصوت'}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: isVoiceMode ? '#22c55e' : 'var(--text-muted)' }}
            >
              {isSpeaking ? (
                 <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <div className="bar" style={{ width: 2, height: 10, background: '#22c55e', animation: 'eq 0.5s infinite' }} />
                    <div className="bar" style={{ width: 2, height: 14, background: '#22c55e', animation: 'eq 0.5s infinite 0.1s' }} />
                    <div className="bar" style={{ width: 2, height: 8, background: '#22c55e', animation: 'eq 0.5s infinite 0.2s' }} />
                 </div>
              ) : (
                 <Volume2 size={20} />
              )}
            </button>
            <style>{`
               @keyframes pulse { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.5); } 100% { opacity: 1; transform: scale(1); } }
               @keyframes eq { 0% { height: 4px; } 50% { height: 100%; } 100% { height: 4px; } }
            `}</style>
            <button className="run-btn" onClick={run} disabled={!text.trim() || !!approval}>
              {t('send')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
