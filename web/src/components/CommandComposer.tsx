import { useEffect, useRef, useState, lazy, Suspense, forwardRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import CodeWithPreview from './CodeWithPreview';
import VoiceVisualizer from './VoiceVisualizer';
import { useTranslation } from 'react-i18next';
import { API_URL as API, WS_URL as WS } from '../config';
import { motion, AnimatePresence } from 'framer-motion';
import { ThinkingIndicator } from './ThinkingIndicator';
import SentinelStatus from './SentinelStatus';

// Web Speech API types
interface IWindow extends Window {
  webkitSpeechRecognition: any;
  SpeechRecognition: any;
}

const { webkitSpeechRecognition, SpeechRecognition } = window as unknown as IWindow;

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
  Zap,
  ArrowUp,
  Send,
  Copy,
  RotateCcw,
  Search,
  User,
  Sparkles,
  MicOff
} from 'lucide-react';

const AgentBrowserStreamLazy = lazy(() => import('./AgentBrowserStream'));

const ChatBubble = forwardRef(({ event, isUser, onOptionClick }: { event: any, isUser: boolean, onOptionClick?: (text: string) => void }, ref: any) => {
  const { t } = useTranslation();
  
  let content = event.data.text || event.data;
  let options: any[] = [];

  // Parse options block :::options ... :::
  if (!isUser && typeof content === 'string' && content.includes(':::options')) {
      const parts = content.split(':::options');
      content = parts[0];
      try {
          const jsonStr = parts[1].replace(/:::/g, '').trim();
          options = JSON.parse(jsonStr);
      } catch (e) {
          console.error('Failed to parse options', e);
      }
  }

  return (
    <motion.div 
      ref={ref}
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={`chat-bubble-wrapper ${isUser ? 'user' : 'ai'}`}
    >
      {!isUser && (
        <div className="chat-avatar ai">
          <Sparkles size={18} />
        </div>
      )}
      <div className="chat-bubble backdrop-blur-md shadow-lg" style={{ 
        background: isUser ? 'var(--user-msg-bg)' : 'var(--joe-msg-bg)',
        color: isUser ? '#ffffff' : 'var(--text-primary)',
        backdropFilter: 'blur(12px)',
        border: '1px solid var(--border-color)'
      }}>
        <div className="chat-bubble-header">
          <span className="chat-bubble-sender">{isUser ? t('you', 'You') : 'JOE AI'}</span>
          {!isUser && (
            <div className="chat-bubble-actions">
              <button className="chat-action-btn" title={t('copy', 'Copy')} onClick={() => navigator.clipboard.writeText(content)}>
                <Copy size={14} />
              </button>
              <button className="chat-action-btn" title={t('regenerate', 'Regenerate')}>
                <RotateCcw size={14} />
              </button>
            </div>
          )}
        </div>
        <div className="chat-bubble-content">
          {isUser ? (
            <div style={{ whiteSpace: 'pre-wrap' }}>{content}</div>
          ) : (
             <>
             <ReactMarkdown
               components={{
                  h1: ({node, ...props}: any) => <h1 className="text-[var(--accent-secondary)] text-2xl mb-2 mt-2 border-b border-[var(--border-color)] pb-1" {...props} />,
                  h2: ({node, ...props}: any) => <h2 className="text-[var(--accent-primary)] text-xl mb-2 mt-4" {...props} />,
                  h3: ({node, ...props}: any) => <h3 className="text-[var(--neon-purple)] text-lg mb-2 mt-4" {...props} />,
                  ul: ({node, ...props}: any) => <ul className="list-disc pl-6 mb-4" {...props} />,
                  ol: ({node, ...props}: any) => <ol className="list-decimal pl-6 mb-4" {...props} />,
                  li: ({node, ...props}: any) => <li className="mb-1 leading-relaxed" {...props} />,
                  p: ({node, ...props}: any) => <p className="mb-4 leading-relaxed" {...props} />,
                  blockquote: ({node, ...props}: any) => (
                    <blockquote 
                      className="border-l-4 border-[var(--accent-secondary)] bg-[var(--bg-secondary)] my-4 py-2 px-4 rounded"
                      {...props} 
                    />
                  ),
                  a: ({node, ...props}: any) => (
                    <a 
                      {...props} 
                      target="_blank" 
                       rel="noopener noreferrer" 
                       className="text-[var(--accent-primary)] underline"
                     />
                   ),
                  code({node, inline, className, children, ...props}: any) {
                   const match = /language-(\w+)/.exec(className || '');
                   return !inline && match ? (
                     <CodeWithPreview
                       language={match[1]}
                       code={String(children).replace(/\n$/, '')}
                       {...props}
                     />
                   ) : (
                     <code className={className} {...props} style={!inline ? { display: 'block', padding: '10px', background: '#1e1e1e', borderRadius: '4px', overflowX: 'auto' } : { background: 'rgba(255,255,255,0.1)', padding: '2px 4px', borderRadius: '3px' }}>
                       {children}
                     </code>
                   );
                 }
               }}
             >
               {content || (typeof event.data === 'string' ? event.data : JSON.stringify(event.data))}
             </ReactMarkdown>
             
             {options.length > 0 && (
                <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap', borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
                  {options.map((opt: any, idx: number) => (
                    <button 
                      key={idx}
                      onClick={() => onOptionClick?.(opt.query)}
                      style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 20,
                        padding: '6px 14px',
                        color: 'var(--text-secondary)',
                        fontSize: 13,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex', alignItems: 'center', gap: 6
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                    >
                      <span style={{opacity:0.7}}>✨</span> {opt.label}
                    </button>
                  ))}
                </div>
             )}
             </>
          )}
        </div>
      </div>
      {isUser && (
        <div className="chat-avatar user">
          <User size={18} />
        </div>
      )}
    </motion.div>
  );
});

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

export default function CommandComposer({ sessionId, onSessionCreated, onPreviewArtifact, onStepsUpdate, onMessagesUpdate }: { sessionId?: string; onSessionCreated?: (id: string) => void; onPreviewArtifact?: (content: string, lang: string) => void; onStepsUpdate?: (steps: any[]) => void; onMessagesUpdate?: (msgs: any[]) => void }) {
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
  
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis>(window.speechSynthesis);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number>();
  const endRef = useRef<HTMLDivElement>(null);
  const stepStartTimes = useRef<{[key: string]: number}>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

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
              next[k] = { ...next[k], ...parsed[k] };
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

  // Scroll to bottom on new events
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (onStepsUpdate) onStepsUpdate(events);
    if (onMessagesUpdate) onMessagesUpdate(events);
    
    // Auto-speak new assistant messages if voice mode is on
    if (isVoiceMode && events.length > 0) {
        const last = events[events.length - 1];
        if (last.type === 'text' && last.data.text) {
            speak(last.data.text);
        }
    }
  }, [events, onStepsUpdate]);

  const speak = async (text: string) => {
    if (!isVoiceMode) return;
    stopSpeaking();
    
    setIsSpeaking(true);

    // 1. Try OpenAI TTS first
    try {
      const token = localStorage.getItem('token');
      if (token) {
         const res = await fetch(`${API}/audio/speech`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ text, voice: 'onyx' })
         });
         
         if (res.ok) {
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audio.onended = () => setIsSpeaking(false);
            audio.onerror = () => setIsSpeaking(false);
            audio.play();
            (window as any).currentAudio = audio; // Keep ref to stop it
            return;
         }
      }
    } catch (e) {
      console.warn('Backend TTS failed, falling back to browser', e);
    }

    // 2. Fallback to Browser Speech
    const utterance = new SpeechSynthesisUtterance(text);
    const isArabic = /[\u0600-\u06FF]/.test(text);
    utterance.lang = isArabic ? 'ar-SA' : 'en-US';
    const voices = window.speechSynthesis.getVoices();
    if (isArabic) {
        const arVoice = voices.find(v => v.lang.includes('ar') && v.name.includes('Google')) || voices.find(v => v.lang.includes('ar'));
        if (arVoice) utterance.voice = arVoice;
    }
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    if ((window as any).currentAudio) {
        (window as any).currentAudio.pause();
        (window as any).currentAudio = null;
    }
    setIsSpeaking(false);
  };

  useEffect(() => {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
    };
    return () => {
        stopSpeaking();
    };
  }, []);

  // Voice Recognition Init
  useEffect(() => {
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (Recognition) {
      const recognition = new Recognition();
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

  const toggleListening = () => {
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
      const primaryUrl = WS;
      const fallbackUrl = `${API.replace(/^http/, 'ws')}/ws`;
      const ws = new WebSocket(primaryUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onclose = () => {
        setIsConnected(false);
        const triedFallback = (wsRef.current as any)?.__triedFallback === true;
        if (!triedFallback && primaryUrl !== fallbackUrl) {
          try {
            const fws = new WebSocket(fallbackUrl);
            (fws as any).__triedFallback = true;
            wsRef.current = fws;
            fws.onopen = () => setIsConnected(true);
            fws.onclose = () => {
              setIsConnected(false);
              reconnectTimerRef.current = window.setTimeout(() => {
                connectWS();
              }, 2000);
            };
            fws.onmessage = ws.onmessage!;
            return;
          } catch {}
        }
        reconnectTimerRef.current = window.setTimeout(() => connectWS(), 2000);
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          
          if (msg.type === 'approval_required') {
            const data = msg.data || {};
            const { id, runId, risk, action } = data;
            if (id) {
                setApproval({ id, runId, risk, action });
            }
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

  async function run(overrideText?: string) {
    const inputText = overrideText || text;
    if (!inputText.trim()) return;
    
    // Optimistic update
    const tempId = Date.now().toString();
    setEvents(prev => [...prev, { type: 'user_input', data: inputText, id: tempId }]);
    
    if (!overrideText) {
        setText(''); 
    }
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
          text: inputText, 
          sessionId,
          fileIds: attachedFiles.map(f => f.id),
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
      if (!overrideText) setText(inputText);
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

  async function openTestBrowser() {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/tools/browser_open/execute`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ url: 'https://www.google.com' })
      });
      const data = await res.json();
      if (data.ok && data.output && data.output.wsUrl) {
         setEvents(prev => [...prev, {
             type: 'artifact_created',
             data: {
                 kind: 'browser_stream',
                 href: data.output.wsUrl,
                 name: 'Test Browser Session'
             }
         }]);
         setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      } else {
          alert('Browser open failed: ' + (data.error || 'Unknown error'));
      }
    } catch (e) {
        alert('Failed to open test browser: ' + String(e));
    }
  }

  const isThinking = (() => {
    if (!isConnected || events.length === 0) return false;
    const last = events[events.length - 1];
    if (last.type === 'user_input') return true;
    if (last.type === 'step_started') {
        // Only think if we haven't replied yet since the last user input
        for (let i = events.length - 1; i >= 0; i--) {
            if (events[i].type === 'text') return false;
            if (events[i].type === 'user_input') return true;
        }
    }
    return false;
  })();

  return (
    <div className="composer">
      <div className="events">
        {events.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-logo-ring">
              <span className="empty-state-logo-text">J</span>
            </div>
            <h2 className="empty-state-title">
              {t('welcomeTitle', 'How can I help you today?')}
            </h2>
            <div className="empty-state-suggestions">
              <button className="suggestion-card" onClick={() => setText('Write a React component for a login form')}>
                <div className="suggestion-icon"><FileCode size={20} /></div>
                <div className="suggestion-text">Create a Login Form</div>
              </button>
              <button className="suggestion-card" onClick={() => setText('Explain how useEffect works')}>
                <div className="suggestion-icon"><Zap size={20} /></div>
                <div className="suggestion-text">Explain React Hooks</div>
              </button>
              <button className="suggestion-card" onClick={() => setText('Analyze this project structure')}>
                <div className="suggestion-icon"><Search size={20} /></div>
                <div className="suggestion-text">Analyze Project</div>
              </button>
              <button className="suggestion-card" onClick={() => setText('Write a Python script to scrape a website')}>
                <div className="suggestion-icon"><Terminal size={20} /></div>
                <div className="suggestion-text">Python Scripting</div>
              </button>
            </div>
          </div>
        )}
        
        <AnimatePresence mode="popLayout">
        {events.map((e, i) => {
          if (e.type === 'user_input') {
            return <ChatBubble key={i} event={e} isUser={true} />;
          }
          if (e.type === 'error') {
            return (
              <motion.div 
                key={i} 
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }}
                className="message-row joe"
              >
                <div className="message-bubble error" dir="auto" style={{ color: '#ef4444', border: '1px solid #ef4444', background: 'rgba(239, 68, 68, 0.1)' }}>
                  ⚠️ {e.data}
                </div>
              </motion.div>
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
            return <ChatBubble key={i} event={{ data: { text: content } }} isUser={false} onOptionClick={(q) => run(q)} />;
          }
          if (e.type === 'step_started') {
            const isImage = e.data.name && e.data.name.includes('image_generate');
            const isDone = events.slice(i + 1).some(next => (next.type === 'step_done' || next.type === 'step_failed') && (next.data.name === e.data.name || next.data.name === `execute:${e.data.name}`));
            if (isImage && !isDone) {
               return (
                 <motion.div 
                   key={i} 
                   initial={{ opacity: 0, scale: 0.9 }}
                   animate={{ opacity: 1, scale: 1 }}
                   exit={{ opacity: 0, scale: 0.9 }}
                   className="message-row joe" 
                   style={{ marginBottom: 4 }}
                 >
                   <div className="image-loading-frame" style={{ width: 300, height: 300, background: 'rgba(30, 30, 30, 0.4)', backdropFilter: 'blur(10px)', borderRadius: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed var(--border-color)', position: 'relative', overflow: 'hidden' }}>
                     <Loader2 size={32} className="spin" style={{ marginBottom: 16, color: '#eab308' }} />
                     <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Generating Image...</div>
                   </div>
                 </motion.div>
               );
            }
            return null;
          }
          if (e.type === 'artifact_created') {
            const kind = e.data.kind;
            if (kind === 'browser_stream' && e.data.href) {
              return (
                <motion.div 
                  key={i} 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="message-row joe"
                >
                  <div className="event-artifact" style={{ padding: 0 }}>
                    <Suspense fallback={<div style={{ padding: 12, fontSize: 12, opacity: 0.7 }}>Loading Stream...</div>}>
                      <AgentBrowserStreamLazy wsUrl={e.data.href} />
                    </Suspense>
                  </div>
                </motion.div>
              );
            }
            const isImage = /\.(png|jpg|jpeg|webp|gif)$/i.test(e.data.name || '') || /\.(png|jpg|jpeg|webp|gif)$/i.test(e.data.href || '');
            const isVideo = /\.(mp4|webm|mov)$/i.test(e.data.name || '') || /\.(mp4|webm|mov)$/i.test(e.data.href || '');
            
            if (isImage) {
               return (
                 <motion.div 
                   key={i} 
                   initial={{ opacity: 0, scale: 0.9 }}
                   animate={{ opacity: 1, scale: 1 }}
                   className="message-row joe"
                 >
                   <div className="image-generation-frame">
                     <div className="scanline-overlay"></div>
                     <img src={e.data.href} alt={e.data.name} className="image-generation-img" />
                   </div>
                 </motion.div>
               );
            }

            return (
              <motion.div 
                key={i} 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="message-row joe"
              >
                <div className="event-artifact">
                  {isVideo ? (
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
              </motion.div>
            );
          }
          return null;
        })}
        </AnimatePresence>

        {isThinking && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="message-row joe"
          >
             <ThinkingIndicator />
          </motion.div>
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

      {/* Voice Visualizer */}
      <VoiceVisualizer isSpeaking={isSpeaking} onStop={stopSpeaking} />

      {/* AI Providers Modal */}
      {showProviders && (
        <div className="providers-modal-overlay" onClick={() => setShowProviders(false)}>
            <div className="providers-modal" onClick={e => e.stopPropagation()}>
                {/* Left Sidebar */}
                <div className="providers-left">
                    <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Cpu size={18} /> Providers
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {Object.entries(providers).map(([key, p]) => (
                            <button key={key} onClick={() => setActiveProvider(key)} style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '10px 12px', borderRadius: 8, border: 'none',
                                background: activeProvider === key ? 'var(--bg-primary, var(--bg-card))' : 'transparent',
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
                <div className="providers-right">
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

      {/* Sentinel Status Bar */}
      <SentinelStatus />

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
                 className="provider-btn"
                 onClick={() => setShowProviders(true)}
                 title="AI Providers"
               >
                 <Cpu size={20} />
               </button>
            </div>
            <button 
              className="mic-button"
              onClick={openTestBrowser}
              title="Test Browser (Live)"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              <Globe size={20} />
            </button>
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
              className={`mic-button ${isVoiceMode ? 'active' : ''}`}
              onClick={() => setIsVoiceMode(!isVoiceMode)}
              title="Voice Mode"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: isVoiceMode ? 'var(--accent-primary)' : 'inherit', position: 'relative' }}
            >
              {isVoiceMode ? <Mic size={20} /> : <MicOff size={20} />}
            </button>
            <button 
              className="send-button" 
              onClick={() => run()}
              disabled={!text.trim() || !!approval}
              title={t('send')}
            >
              <ArrowUp size={20} />
            </button>
          </div>
        </div>

        {isVoiceMode && (
             <div style={{ padding: 10, background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                 <button 
                     className={`voice-btn ${isListening ? 'listening' : ''}`}
                     onClick={toggleListening}
                     style={{ 
                         width: 50, height: 50, borderRadius: '50%', border: 'none', 
                         background: isListening ? '#ef4444' : 'var(--accent-primary)',
                         color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                         boxShadow: isListening ? '0 0 15px rgba(239, 68, 68, 0.5)' : 'none',
                         transition: 'all 0.3s'
                     }}
                 >
                     {isListening ? <Loader2 className="spin" size={24} /> : <Mic size={24} />}
                 </button>
                 <div style={{ fontSize: 14, fontWeight: 500, display: 'flex', flexDirection: 'column', gap: 4 }}>
                     <span>{isListening ? 'Listening...' : 'Tap to Speak'}</span>
                     <span style={{ fontSize: 10, opacity: 0.7 }}>Arabic (SA) / English (US)</span>
                 </div>
                 {isSpeaking && <VoiceVisualizer isSpeaking={true} onStop={stopSpeaking} />}
                 
                 <button className="icon-btn" title="Stop Speaking" onClick={stopSpeaking} disabled={!isSpeaking} style={{ marginLeft: 'auto', opacity: isSpeaking ? 1 : 0.3 }}>
                     <Volume2 size={18} />
                 </button>
             </div>
        )}
      </div>
    </div>
  );
}
