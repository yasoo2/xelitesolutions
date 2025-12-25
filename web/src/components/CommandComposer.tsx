import { useEffect, useMemo, useRef, useState, lazy, Suspense, forwardRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import CodeWithPreview from './CodeWithPreview';
import VoiceVisualizer from './VoiceVisualizer';
import { useTranslation } from 'react-i18next';
import { API_URL as API, WS_URL as WS } from '../config';
import { motion, AnimatePresence } from 'framer-motion';

// Web Speech API types
interface IWindow extends Window {
  webkitSpeechRecognition: any;
  SpeechRecognition: any;
}

const { webkitSpeechRecognition, SpeechRecognition } = window as unknown as IWindow;

import { 
  Terminal, 
  FileText, 
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

const DEBUG_TOOL_UI = false;

const AgentBrowserStreamLazy = lazy(() => import('./AgentBrowserStream'));

function ToolTicker({
  isThinking,
  toolVisible,
  activeToolName,
}: {
  isThinking: boolean;
  toolVisible: boolean;
  activeToolName: string | null;
}) {
  return (
    <div className="mt-0.5">
      <AnimatePresence>
        {isThinking && toolVisible && activeToolName && (
          <motion.div
            key={activeToolName}
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.18 }}
            className="text-[10px] leading-3 font-light text-zinc-400/60"
          >
            {activeToolName}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const ChatBubble = forwardRef(({ event, isUser, onOptionClick }: { event: any, isUser: boolean, onOptionClick?: (text: string) => void }, ref: any) => {
  const { t } = useTranslation();
  
  let content = event.data.text || event.data;
  let options: any[] = [];

  if (!isUser && typeof content === 'string' && content.includes(':::options')) {
      const extractFirstJsonValue = (s: string) => {
          const start = s.search(/[\[{]/);
          if (start < 0) return null;
          const stack: string[] = [];
          const openToClose: Record<string, string> = { '{': '}', '[': ']' };
          let inStr = false;
          let esc = false;
          for (let i = start; i < s.length; i++) {
              const ch = s[i];
              if (inStr) {
                  if (esc) {
                      esc = false;
                      continue;
                  }
                  if (ch === '\\') {
                      esc = true;
                      continue;
                  }
                  if (ch === '"') inStr = false;
                  continue;
              }
              if (ch === '"') {
                  inStr = true;
                  continue;
              }
              if (ch === '{' || ch === '[') {
                  stack.push(openToClose[ch]);
                  continue;
              }
              if (ch === '}' || ch === ']') {
                  if (stack.length === 0) return null;
                  const expected = stack[stack.length - 1];
                  if (ch !== expected) return null;
                  stack.pop();
                  if (stack.length === 0) {
                      return { jsonText: s.slice(start, i + 1), rest: s.slice(i + 1) };
                  }
              }
          }
          return null;
      };

      const extracted: any[] = [];
      let cleaned = content;
      const re = /:::options\s*([\s\S]*?):::/g;
      let match: RegExpExecArray | null = null;
      let lastIndex = 0;
      const keptParts: string[] = [];
      while ((match = re.exec(content))) {
          keptParts.push(content.slice(lastIndex, match.index));
          lastIndex = re.lastIndex;
          const block = String(match[1] ?? '').trim();
          if (!block) continue;
          try {
              const parsed = JSON.parse(block);
              if (Array.isArray(parsed)) extracted.push(...parsed);
              else if (parsed) extracted.push(parsed);
          } catch {}
      }
      if (lastIndex > 0) {
          keptParts.push(content.slice(lastIndex));
          cleaned = keptParts.join('').trimEnd();
      }

      if (extracted.length === 0) {
          const idx = content.indexOf(':::options');
          const prefix = content.slice(0, idx).trimEnd();
          const after = content.slice(idx + ':::options'.length);
          const first = extractFirstJsonValue(after);
          if (first) {
              try {
                  const parsed = JSON.parse(first.jsonText);
                  if (Array.isArray(parsed)) extracted.push(...parsed);
                  else if (parsed) extracted.push(parsed);
                  cleaned = prefix;
              } catch {}
          }
      }

      if (extracted.length > 0) {
          options = extracted;
          content = cleaned;
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

export default function CommandComposer({
  sessionId,
  sessionKind = 'chat',
  browserSessionId = null,
  onSessionCreated,
  onPreviewArtifact,
  onStepsUpdate,
  onMessagesUpdate,
}: {
  sessionId?: string;
  sessionKind?: 'chat' | 'agent';
  browserSessionId?: string | null;
  onSessionCreated?: (id: string) => void;
  onPreviewArtifact?: (content: string, lang: string) => void;
  onStepsUpdate?: (steps: any[]) => void;
  onMessagesUpdate?: (msgs: any[]) => void;
}) {
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
  const [status, setStatus] = useState<'idle' | 'thinking' | 'answering'>('idle');
  const [isThinking, setIsThinking] = useState(false);
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const [toolVisible, setToolVisible] = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState<string[]>([]);
  
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis>(window.speechSynthesis);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number>();
  const endRef = useRef<HTMLDivElement>(null);
  const eventsScrollRef = useRef<HTMLDivElement>(null);
  const eventsContentRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef<boolean>(true);
  const scrollRafRef = useRef<number | null>(null);
  const stepStartTimes = useRef<{[key: string]: number}>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastLiveSeqRef = useRef<number>(0);
  const prevSessionIdRef = useRef<string | undefined>(undefined);
  const lastToolShownAtRef = useRef<number>(0);
  const toolHideTimerRef = useRef<number | null>(null);
  const isThinkingRef = useRef<boolean>(isThinking);
  const toolVisibleRef = useRef<boolean>(toolVisible);
  const activeToolNameRef = useRef<string | null>(activeToolName);

  // AI Provider State
  const [showProviders, setShowProviders] = useState(false);
  const [providers, setProviders] = useState<{ [key: string]: ProviderConfig }>({
    openai: { name: 'OpenAI', apiKey: '', isConnected: false, model: 'gpt-4o' },
    anthropic: { name: 'Anthropic', apiKey: '', isConnected: false, model: 'claude-3-opus-20240229' },
    gemini: { name: 'Google Gemini', apiKey: '', isConnected: false, model: 'gemini-pro' },
    grok: { name: 'xAI (Grok)', apiKey: '', isConnected: false, baseUrl: 'https://api.x.ai/v1', model: 'grok-beta' },
  });
  const [activeProvider, setActiveProvider] = useState('openai');
  const [showKey, setShowKey] = useState<{[key: string]: boolean}>({});
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  const derived = useMemo(() => {
    const stepsByKey = new Map<string, any>();
    const order: string[] = [];
    const logs: string[] = [];
    const artifacts: Array<{ name: string; href: string; kind?: string }> = [];
    const artifactsSeen = new Set<string>();
    const timeline: Array<{ type: string; data: any; duration?: number }> = [];

    const sorted = events
      .map((e: any, idx: number) => ({
        e,
        idx,
        seq: typeof e?.seq === 'number' ? e.seq : Number.POSITIVE_INFINITY,
        ts: typeof e?.ts === 'number' ? e.ts : idx,
      }))
      .sort((a: any, b: any) => (a.seq - b.seq) || (a.ts - b.ts) || (a.idx - b.idx));

    const ensureStep = (key: string, init: any) => {
      if (!stepsByKey.has(key)) {
        stepsByKey.set(key, { ...init, key });
        order.push(key);
      }
      return stepsByKey.get(key);
    };

    const occ = new Map<string, number>();
    const open = new Map<string, string[]>();

    for (const { e } of sorted) {
      const runId = typeof (e as any)?.runId === 'string' ? (e as any).runId : typeof e?.data?.runId === 'string' ? e.data.runId : undefined;
      if (
        e.type === 'user_input' ||
        e.type === 'text' ||
        e.type === 'step_started' ||
        e.type === 'step_progress' ||
        e.type === 'step_done' ||
        e.type === 'step_failed' ||
        e.type === 'evidence_added' ||
        e.type === 'artifact_created' ||
        e.type === 'approval_required' ||
        e.type === 'approval_result' ||
        e.type === 'run_finished' ||
        e.type === 'run_completed'
      ) {
        timeline.push({ type: e.type, data: e.data, duration: (e as any).duration });
      }

      if (e.type === 'step_started' && e.data?.name) {
        const name = String(e.data.name);
        const base = `${runId || ''}::${name}`;
        const nextOcc = (occ.get(base) || 0) + 1;
        occ.set(base, nextOcc);
        const key = `${base}::${nextOcc}`;
        const stack = open.get(base) || [];
        stack.push(key);
        open.set(base, stack);

        const s = ensureStep(key, { name, status: 'running', runId });
        s.status = 'running';
        if (typeof (e as any)?.ts === 'number') s.startedAt = (e as any).ts;
        if (e.data?.input != null && s.input == null) s.input = e.data.input;
      }

      if ((e.type === 'step_done' || e.type === 'step_failed') && e.data?.name) {
        const name = String(e.data.name);
        const base = `${runId || ''}::${name}`;
        const stack = open.get(base) || [];
        const key = stack.pop();
        if (stack.length) open.set(base, stack);
        else open.delete(base);

        const resolvedKey = key || `${base}::${(occ.get(base) || 0) + 1}`;
        if (!key) occ.set(base, Number(resolvedKey.split('::').pop()) || (occ.get(base) || 0) + 1);

        const s = ensureStep(resolvedKey, { name, status: 'running', runId });
        s.status = e.type === 'step_done' ? 'done' : 'failed';
        if (typeof (e as any).duration === 'number') s.duration = (e as any).duration;
        else if (typeof s.startedAt === 'number' && typeof (e as any)?.ts === 'number') s.duration = (e as any).ts - s.startedAt;
        if (e.data?.plan) s.plan = e.data.plan;
        if (e.data?.result) {
          s.result = e.data.result;
          if (!e.data.result.ok) s.error = e.data.result.error || e.data.result.message;
        }
        if (e.type === 'step_failed' && !s.error) s.error = e.data?.error;
      }

      if (e.type === 'evidence_added') {
        const kind = String(e.data?.kind || '');
        if (kind === 'log' && typeof e.data?.text === 'string') logs.push(e.data.text);
      }

      if (e.type === 'artifact_created') {
        const href = typeof e.data?.href === 'string' ? e.data.href : '';
        if (href && !artifactsSeen.has(href)) {
          artifactsSeen.add(href);
          artifacts.push({ name: String(e.data?.name || 'artifact'), href, kind: e.data?.kind });
        }
      }
    }

    const steps = order.map((key) => stepsByKey.get(key)).filter(Boolean);

    const formatStepName = (name: string) => {
      if (name.startsWith('thinking_step_')) {
        const n = name.replace('thinking_step_', '');
        return `Plan #${n}`;
      }
      if (name.startsWith('execute:')) return `Execute: ${name.slice('execute:'.length)}`;
      return name;
    };

    const displaySteps = steps.map((s: any) => ({ ...s, displayName: formatStepName(String(s.name || '')) }));

    return { steps: displaySteps, logs, artifacts, timeline };
  }, [events]);

  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail;
      const next = typeof detail?.text === 'string' ? detail.text : '';
      if (!next) return;
      setText((prev) => (prev ? `${prev}\n${next}` : next));
    };
    window.addEventListener('joe:prefill', handler as any);
    return () => window.removeEventListener('joe:prefill', handler as any);
  }, []);

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
      if (savedActive && providers[savedActive]) setActiveProvider(savedActive);
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

  const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
    const scroller = eventsScrollRef.current;
    if (!scroller) {
      endRef.current?.scrollIntoView({ behavior });
      return;
    }
    if (scrollRafRef.current != null) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }
    scrollRafRef.current = requestAnimationFrame(() => {
      if (behavior === 'smooth') {
        scroller.scrollTo({ top: scroller.scrollHeight, behavior });
      } else {
        scroller.scrollTop = scroller.scrollHeight;
      }
    });
  };

  const recomputeAutoScroll = () => {
    const scroller = eventsScrollRef.current;
    if (!scroller) {
      autoScrollRef.current = true;
      return;
    }
    const remaining = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    autoScrollRef.current = remaining < 120;
  };

  useEffect(() => {
    autoScrollRef.current = true;
    scrollToBottom('auto');
  }, [sessionId, sessionKind]);

  useEffect(() => {
    const el = eventsScrollRef.current;
    if (!el) return;
    const onScroll = () => recomputeAutoScroll();
    el.addEventListener('scroll', onScroll, { passive: true } as any);
    return () => el.removeEventListener('scroll', onScroll as any);
  }, []);

  useEffect(() => {
    const el = eventsContentRef.current;
    if (!el) return;
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (autoScrollRef.current) scrollToBottom('auto');
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current);
    };
  }, []);

  useEffect(() => {
    if (autoScrollRef.current) scrollToBottom('auto');
    if (onStepsUpdate) onStepsUpdate(derived.steps);
    if (onMessagesUpdate) onMessagesUpdate(events);
    
    // Auto-speak new assistant messages if voice mode is on
    if (isVoiceMode && events.length > 0) {
        const last = events[events.length - 1];
        if (last.type === 'text' && last.data.text) {
            speak(last.data.text);
        }
    }
  }, [events, derived.steps, isVoiceMode, onMessagesUpdate, onStepsUpdate, isThinking]);

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

  const clearToolTimers = () => {
    if (toolHideTimerRef.current != null) {
      window.clearTimeout(toolHideTimerRef.current);
      toolHideTimerRef.current = null;
    }
  };

  useEffect(() => {
    isThinkingRef.current = isThinking;
  }, [isThinking]);

  useEffect(() => {
    toolVisibleRef.current = toolVisible;
  }, [toolVisible]);

  useEffect(() => {
    activeToolNameRef.current = activeToolName;
  }, [activeToolName]);

  const showTool = (name: string) => {
    const next = String(name || '').trim();
    if (!next) return;
    if (toolHideTimerRef.current != null) {
      window.clearTimeout(toolHideTimerRef.current);
      toolHideTimerRef.current = null;
    }
    setStatus('thinking');
    setIsThinking(true);
    setActiveToolName(next);
    setToolVisible(true);
    lastToolShownAtRef.current = Date.now();
  };

  const hideToolSoon = () => {
    const elapsed = Date.now() - lastToolShownAtRef.current;
    const wait = Math.max(250 - elapsed, 0);
    if (toolHideTimerRef.current != null) window.clearTimeout(toolHideTimerRef.current);
    const totalDelay = wait + 250;
    toolHideTimerRef.current = window.setTimeout(() => {
      toolHideTimerRef.current = null;
      setToolVisible(false);
      window.setTimeout(() => {
        setActiveToolName(null);
        setIsThinking(false);
        setStatus('idle');
        setThinkingSteps([]);
      }, 250);
    }, wait);
    return totalDelay;
  };

  useEffect(() => {
    connectWS();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      clearToolTimers();
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

      const handleMessage = (evt: MessageEvent) => {
        try {
          const msg = JSON.parse(evt.data);
          if (typeof msg?.seq === 'number' && Number.isFinite(msg.seq)) {
            if (msg.seq > lastLiveSeqRef.current) lastLiveSeqRef.current = msg.seq;
          }
          if (typeof msg?.runId === 'string' && msg.runId.trim()) {
            setActiveRunId(msg.runId.trim());
          }
          if (msg.type === 'user_input') {
            clearToolTimers();
            setIsThinking(true);
            setActiveToolName(null);
            setToolVisible(false);
            setThinkingSteps([]);
          }

          if (msg.type === 'artifact_created') {
            const kind = msg.data?.kind;
            const href = msg.data?.href;
            const isBrowserStream =
              kind === 'browser_stream' ||
              (typeof href === 'string' && /^wss?:\/\//i.test(href) && /\/ws\//i.test(href));
            if (sessionKind === 'agent' && browserSessionId && isBrowserStream) {
              return;
            }
          }
          
          if (msg.type === 'approval_required') {
            const data = msg.data || {};
            const { id, risk, action } = data;
            const runId = typeof data?.runId === 'string' ? data.runId : typeof msg?.runId === 'string' ? msg.runId : '';
            if (id) {
                setApproval({ id, runId, risk, action });
            }
          }

          if (msg.type === 'step_started') {
            const rid = typeof msg?.runId === 'string' ? msg.runId : typeof msg?.data?.runId === 'string' ? msg.data.runId : '';
            const name = String(msg?.data?.name || '');
            if (name) stepStartTimes.current[`${rid}:${name}`] = Date.now();
            if (name === 'plan') {
              showTool('خطة');
              setThinkingSteps((prev) => [...prev, 'خطة'].slice(-4));
            } else if (name.startsWith('thinking_step_')) {
              const n = name.replace('thinking_step_', '').trim();
              const label = n ? `خطة #${n}` : 'خطة';
              showTool(label);
              setThinkingSteps((prev) => [...prev, label].slice(-4));
            } else if (name.startsWith('execute:')) {
              showTool(name.slice('execute:'.length));
            } else if (name) {
              showTool(name);
            }
          }

          if (msg.type === 'step_done' || msg.type === 'step_failed') {
            const rid = typeof msg?.runId === 'string' ? msg.runId : typeof msg?.data?.runId === 'string' ? msg.data.runId : '';
            const name = String(msg?.data?.name || '');
            const start = stepStartTimes.current[`${rid}:${name}`];
            if (start) {
              msg.duration = Date.now() - start;
              delete stepStartTimes.current[`${rid}:${name}`];
            }
            hideToolSoon();
          }

          if (msg.type === 'text') {
            const id = typeof msg?.id === 'string' ? msg.id : '';
            const isSystemPrompt = id.startsWith('system_prompt:');
            if (isSystemPrompt) return;

            const delay = isThinkingRef.current || toolVisibleRef.current || activeToolNameRef.current != null ? hideToolSoon() : 0;
            window.setTimeout(() => {
              setEvents((prev) => {
                if (id && prev.some((e: any) => typeof e?.id === 'string' && e.id === id)) return prev;
                return [...prev, msg];
              });
              try {
                let content = msg.data;
                if (typeof content === 'string' && (content.startsWith('{') || content.startsWith('['))) {
                  const p = JSON.parse(content);
                  content = p.text || p.output || content;
                }
                speak(String(content));
              } catch {}
            }, delay);
            return;
          }

          if (msg.type === 'run_finished') {
            hideToolSoon();
          }

          if (!DEBUG_TOOL_UI && ['step_started', 'step_progress', 'step_done', 'step_failed', 'evidence_added'].includes(msg.type)) return;
          if (['step_started', 'step_progress', 'step_done', 'step_failed', 'evidence_added', 'artifact_created', 'approval_required', 'approval_result', 'run_finished', 'run_completed', 'user_input'].includes(msg.type)) {
            setEvents(prev => {
              const id = typeof msg?.id === 'string' ? msg.id : '';
              if (id && prev.some((e: any) => typeof e?.id === 'string' && e.id === id)) return prev;
              return [...prev, msg];
            });
          }
        } catch (e) {
          console.error('WS parse error:', e);
        }
      };

      const attach = (ws: WebSocket, allowFallback: boolean) => {
        ws.onopen = () => {
          if (wsRef.current !== ws) return;
          setIsConnected(true);
        };

        ws.onmessage = handleMessage;

        ws.onclose = () => {
          if (wsRef.current !== ws) return;
          setIsConnected(false);

          const triedFallback = (ws as any)?.__triedFallback === true;
          if (allowFallback && !triedFallback && primaryUrl !== fallbackUrl) {
            try {
              const fws = new WebSocket(fallbackUrl);
              (fws as any).__triedFallback = true;
              wsRef.current = fws;
              attach(fws, false);
              return;
            } catch {}
          }

          reconnectTimerRef.current = window.setTimeout(() => connectWS(), 2000);
        };

        ws.onerror = () => {
          if (wsRef.current !== ws) return;
          setIsConnected(false);
        };
      };

      const ws = new WebSocket(primaryUrl);
      wsRef.current = ws;
      attach(ws, true);
    } catch (e) {
      console.error('WS connect failed:', e);
      setIsConnected(false);
    }
  }

  useEffect(() => {
    const prev = prevSessionIdRef.current;
    prevSessionIdRef.current = sessionId;

    if (!sessionId) {
      setEvents([]);
      setActiveRunId(null);
      setApproval(null);
      clearToolTimers();
      setStatus('idle');
      setActiveToolName(null);
      return;
    }

    if (prev && prev !== sessionId) {
      setEvents([]);
      setActiveRunId(null);
      setApproval(null);
      clearToolTimers();
      setStatus('idle');
      setActiveToolName(null);
      loadHistory(sessionId);
      return;
    }

    if (!prev && events.length === 0) {
      loadHistory(sessionId);
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
    clearToolTimers();
    setStatus('thinking');
    setActiveToolName(null);
    setThinkingSteps([]);

    const needsBrowserForText = (raw: string) => {
      const s = String(raw || '').trim();
      if (!s) return false;

      const hasUrl = /https?:\/\/[^\s"'<>]+/i.test(s);
      if (hasUrl) return true;

      const explicitBrowser = /(\b(browser|web)\b|متصفح|داخل المتصفح)/i.test(s);
      if (explicitBrowser) return true;

      const openKeyword = /(افتح|افتحي|افتحوا|اذهب|زيارة|open|go to|visit)/i.test(s);
      const githubKeyword = /(github|جيتهاب|كتهاب|كيتهاب)/i.test(s);
      const analysisKeyword = /(كود|code|repo|repository|مستودع|ملفات|files|اختبر|تحقق|راجع|audit|lint|build|typecheck|تحليل)/i.test(s);

      if (openKeyword && githubKeyword && analysisKeyword) return false;

      const knownSites = /(youtube|يوتيوب|google|جوجل|facebook|فيسبوك|x\.com|twitter|تويتر|instagram|انستغرام)/i.test(s);
      if (openKeyword && knownSites) return true;

      if (openKeyword && explicitBrowser) return true;

      return false;
    };

    const ensureBrowserSession = async (url?: string) => {
      return await new Promise<{ sessionId: string; wsUrl?: string }>((resolve, reject) => {
        const timeoutMs = 20000;
        const onOpened = (ev: Event) => {
          const detail = (ev as CustomEvent)?.detail || {};
          const sessionId = String(detail?.sessionId || '').trim();
          const wsUrl = typeof detail?.wsUrl === 'string' ? detail.wsUrl : undefined;
          if (!sessionId) return;
          window.removeEventListener('joe:browser_opened', onOpened as any);
          resolve({ sessionId, wsUrl });
        };

        window.addEventListener('joe:browser_opened', onOpened as any);
        window.dispatchEvent(new CustomEvent('joe:browser_open_request', { detail: { url } }));

        window.setTimeout(() => {
          window.removeEventListener('joe:browser_opened', onOpened as any);
          reject(new Error('browser_open_timeout'));
        }, timeoutMs);
      });
    };
    
    // Optimistic update
    const tempId = Date.now().toString();
    setEvents(prev => [
      ...prev,
      { type: 'user_input', data: inputText, id: tempId, ts: Date.now(), seq: lastLiveSeqRef.current + 0.1 }
    ]);
    
    if (!overrideText) {
        setText(''); 
    }
    setAttachedFiles([]); 

    const token = localStorage.getItem('token');
    try {
      let effectiveBrowserSessionId = browserSessionId;
      if (sessionKind === 'agent' && !effectiveBrowserSessionId && needsBrowserForText(inputText)) {
        const urlMatch = inputText.match(/https?:\/\/[^\s"'<>]+/i);
        const directUrl = urlMatch?.[0];
        const wantsYoutube = /youtube|يوتيوب/i.test(inputText);
        const wantsGithub = /(github|جيتهاب|كتهاب|كيتهاب)/i.test(inputText);
        const desiredUrl = directUrl || (wantsYoutube ? 'https://www.youtube.com' : wantsGithub ? 'https://github.com' : 'https://www.google.com');
        const opened = await ensureBrowserSession(desiredUrl);
        effectiveBrowserSessionId = opened.sessionId;
      }

      const res = await fetch(`${API}/runs/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ 
          text: inputText, 
          sessionId,
          sessionKind,
          ...(sessionKind === 'agent' && effectiveBrowserSessionId ? { browserSessionId: effectiveBrowserSessionId } : {}),
          fileIds: attachedFiles.map(f => f.id),
          provider: activeProvider,
          apiKey: providers[activeProvider]?.apiKey,
          baseUrl: providers[activeProvider]?.baseUrl,
          model: providers[activeProvider]?.model
        }),
      });
      const raw = await res.text();
      let data: any = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        data = null;
      }
      if (!res.ok) {
        const msg = data?.error || raw || `HTTP ${res.status}`;
        throw new Error(String(msg).slice(0, 500));
      }

      if (typeof data?.systemPrompt === 'string' && data.systemPrompt.trim() && typeof data?.systemPromptId === 'string' && data.systemPromptId.trim()) {
        const sid = data.systemPromptId.trim();
        const content = data.systemPrompt;
        setEvents(prev => {
          if (prev.some((e: any) => typeof e?.id === 'string' && e.id === sid)) return prev;
          return [...prev, { type: 'text', id: sid, data: content, ts: Date.now() }];
        });
      }

      if (typeof data?.runId === 'string' && data.runId.trim()) {
        setActiveRunId(data.runId.trim());
      }
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
      const msg = String((e as any)?.message || e || '').trim();
      const finalMsg = msg ? `${t('error')}: ${msg}` : t('error');
      setEvents(prev => [...prev, { type: 'error', data: finalMsg }]);
      if (!overrideText) setText(inputText);
      clearToolTimers();
      setStatus('idle');
      setActiveToolName(null);
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
                provider: key,
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

  const formatStepDisplayName = (name: string) => {
    if (name.startsWith('thinking_step_')) {
      const n = name.replace('thinking_step_', '');
      return `Plan #${n}`;
    }
    if (name.startsWith('execute:')) return `Execute: ${name.slice('execute:'.length)}`;
    return name;
  };

  const getToolNameFromStep = (name: string) => {
    if (!name.startsWith('execute:')) return null;
    const tool = name.slice('execute:'.length).trim();
    return tool || null;
  };

  const formatValue = (value: any, maxChars = 1600) => {
    try {
      const str =
        typeof value === 'string'
          ? value
          : value == null
            ? ''
            : JSON.stringify(value, null, 2);
      if (str.length <= maxChars) return str;
      return `${str.slice(0, maxChars)}\n…`;
    } catch {
      const str = String(value ?? '');
      if (str.length <= maxChars) return str;
      return `${str.slice(0, maxChars)}\n…`;
    }
  };

  const toolUi = (toolName: string) => {
    const t = toolName.toLowerCase();
    if (t.includes('web_search') || t.includes('knowledge_search') || t.includes('deep_research')) {
      return { label: 'بحث', Icon: Search, color: '#38bdf8', bg: 'rgba(56,189,248,0.08)', border: 'rgba(56,189,248,0.35)' };
    }
    if (t.includes('file_read') || t.includes('read_file_tree') || t === 'ls' || t.includes('grep_search')) {
      return { label: 'قراءة ملف', Icon: FileText, color: '#a78bfa', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.35)' };
    }
    if (t.includes('file_edit') || t.includes('file_write') || t.includes('scaffold_project')) {
      return { label: 'تعديل/كتابة ملف', Icon: FileCode, color: '#22c55e', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.35)' };
    }
    if (t.includes('shell_execute') || t.includes('install_dependencies') || t.includes('check_syntax')) {
      return { label: 'تنفيذ أوامر', Icon: Terminal, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.35)' };
    }
    if (t.includes('browser_')) {
      return { label: 'تصفح/معاينة', Icon: Eye, color: '#60a5fa', bg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.35)' };
    }
    if (t.includes('image_generate')) {
      return { label: 'توليد صورة', Icon: ImageIcon, color: '#eab308', bg: 'rgba(234,179,8,0.08)', border: 'rgba(234,179,8,0.35)' };
    }
    return { label: 'أداة', Icon: Cpu, color: 'var(--text-primary)', bg: 'rgba(255,255,255,0.04)', border: 'var(--border-color)' };
  };

  const [expandedRuns, setExpandedRuns] = useState<Record<string, boolean>>({});
  const [runExpandMode, setRunExpandMode] = useState<Record<string, 'auto' | 'manual'>>({});
  const [expandedStepKeys, setExpandedStepKeys] = useState<Record<string, boolean>>({});

  const getEventRunId = (e: any) => {
    const rid = typeof e?.runId === 'string' ? e.runId : typeof e?.data?.runId === 'string' ? e.data.runId : '';
    return rid && rid.trim() ? rid.trim() : 'no-run';
  };

  const sortedEvents = useMemo(() => {
    const normalized = events.map((e: any, idx: number) => {
      const ts = typeof e?.ts === 'number' ? e.ts : idx;
      const seq = typeof e?.seq === 'number' ? e.seq : undefined;
      const isSystemPrompt = typeof e?.id === 'string' && e.id.startsWith('system_prompt:');
      return { e, idx, ts, seq, isSystemPrompt };
    });

    return normalized.sort((a: any, b: any) => {
      if (a.isSystemPrompt && !b.isSystemPrompt) return -1;
      if (!a.isSystemPrompt && b.isSystemPrompt) return 1;

      const aHasSeq = typeof a.seq === 'number' && Number.isFinite(a.seq);
      const bHasSeq = typeof b.seq === 'number' && Number.isFinite(b.seq);

      if (aHasSeq && bHasSeq) return (a.seq - b.seq) || (a.ts - b.ts) || (a.idx - b.idx);
      return (a.ts - b.ts) || (a.idx - b.idx);
    });
  }, [events]);

  const stepsByRunId = useMemo(() => {
    const out = new Map<string, any[]>();
    for (const s of derived.steps || []) {
      const rid = typeof s?.runId === 'string' && s.runId.trim() ? s.runId.trim() : 'no-run';
      if (!out.has(rid)) out.set(rid, []);
      out.get(rid)!.push(s);
    }
    return out;
  }, [derived.steps]);

  const logsByRunId = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const { e } of sortedEvents) {
      if (e?.type !== 'evidence_added') continue;
      if (String(e?.data?.kind || '') !== 'log') continue;
      if (typeof e?.data?.text !== 'string') continue;
      const rid = getEventRunId(e);
      if (!out.has(rid)) out.set(rid, []);
      out.get(rid)!.push(e.data.text);
    }
    return out;
  }, [sortedEvents]);

  const terminalByRunId = useMemo(() => {
    const out = new Map<string, boolean>();
    for (const { e } of sortedEvents) {
      const type = String(e?.type || '');
      if (type !== 'run_finished' && type !== 'run_completed') continue;
      const rid = getEventRunId(e);
      out.set(rid, true);
    }
    return out;
  }, [sortedEvents]);

  const runStatusByRunId = useMemo(() => {
    const allRunIds = new Set<string>();
    for (const rid of stepsByRunId.keys()) allRunIds.add(rid);
    for (const rid of terminalByRunId.keys()) allRunIds.add(rid);

    const out = new Map<string, { status: 'idle' | 'running' | 'failed' | 'done'; terminal: boolean }>();
    for (const rid of allRunIds) {
      const steps = stepsByRunId.get(rid) || [];
      const terminal = terminalByRunId.get(rid) === true;
      const running = steps.some((s: any) => s?.status === 'running');
      const failed = steps.some((s: any) => s?.status === 'failed');
      const done = steps.length > 0 && steps.every((s: any) => s?.status !== 'running');

      const status: 'idle' | 'running' | 'failed' | 'done' = running ? 'running' : failed ? 'failed' : terminal || done ? 'done' : 'idle';
      out.set(rid, { status, terminal });
    }
    return out;
  }, [stepsByRunId, terminalByRunId]);

  useEffect(() => {
    setExpandedRuns((prev) => {
      let changed = false;
      const next = { ...prev };

      for (const [rid, st] of runStatusByRunId.entries()) {
        const mode = runExpandMode[rid] || 'auto';

        if (st.status === 'running' && mode !== 'manual') {
          if (!next[rid]) {
            next[rid] = true;
            changed = true;
          }
        }
      }

      return changed ? next : prev;
    });

    setRunExpandMode((prev) => {
      let changed = false;
      const next = { ...prev };

      for (const [rid, st] of runStatusByRunId.entries()) {
        const mode = next[rid] || 'auto';

        if (st.status === 'running' && mode !== 'manual') {
          if (next[rid] !== 'auto') {
            next[rid] = 'auto';
            changed = true;
          }
        }

        if (st.terminal && mode !== 'manual') {
          if (next[rid] !== 'auto') {
            next[rid] = 'auto';
            changed = true;
          }
        }
      }

      return changed ? next : prev;
    });
  }, [runStatusByRunId, runExpandMode]);

  const cleanAssistantText = (raw: any) => {
    let s =
      typeof raw === 'string'
        ? raw
        : raw && typeof raw === 'object' && typeof raw.text === 'string'
          ? raw.text
          : String(raw ?? '');
    s = s.replace(/\r\n/g, '\n');
    if (!s.trim()) return '';

    const lower = s.toLowerCase();
    const toolWords = [
      'file_write',
      'file_read',
      'file_edit',
      'shell_execute',
      'web_search',
      'knowledge_search',
      'grep_search',
      'read_file_tree',
      'scaffold_project',
      'install_dependencies',
      'check_syntax',
      'image_generate',
      'browser_',
    ];
    const hits = toolWords.reduce((acc, w) => acc + (lower.includes(w) ? 1 : 0), 0);
    const looksLikeTranscript =
      hits >= 2 ||
      (/(\bplan\s*#\d+\b)/i.test(s) && /\b\d+(\.\d+)?s\b/.test(s) && hits >= 1) ||
      (/\bLog\b/.test(s) && hits >= 1) ||
      (/\[20\d\d-\d\d-\d\dT/.test(s) && hits >= 1);

    if (!looksLikeTranscript) return s;

    const kept = s
      .split('\n')
      .map((line: string) => line.trimEnd())
      .filter((line: string) => {
        const t = line.trim();
        if (!t) return false;
        const tl = t.toLowerCase();
        if (toolWords.some((w) => tl.includes(w))) return false;
        if (/^\d+(\.\d+)?s\b/i.test(t)) return false;
        if (/\bplan\s*#\d+\b/i.test(t)) return false;
        if (/\bLog\b/.test(t) || /\[20\d\d-\d\d-\d\dT/.test(t)) return false;
        if (/^تم إنهاء التنفيذ\b/.test(t)) return false;
        return true;
      })
      .join('\n')
      .trim();

    return kept;
  };

  const renderItems = useMemo(() => {
    const out: Array<{ kind: string; key: string; e?: any; idx?: number; runId?: string }> = [];
    const inserted = new Set<string>();

    for (const { e, idx } of sortedEvents) {
      const type = String(e?.type || '');

      if (type === 'step_started' || type === 'step_progress' || type === 'step_done' || type === 'step_failed' || type === 'evidence_added') {
        const rid = getEventRunId(e);
        if (!inserted.has(rid)) {
          inserted.add(rid);
          out.push({ kind: 'activity', key: `activity:${rid}:${idx}`, runId: rid });
        }
        continue;
      }

      if (type === 'user_input') out.push({ kind: 'user', key: `user:${idx}`, e, idx });
      else if (type === 'text') out.push({ kind: 'text', key: `text:${idx}`, e, idx });
      else if (type === 'error') out.push({ kind: 'error', key: `error:${idx}`, e, idx });
      else if (type === 'artifact_created') out.push({ kind: 'artifact', key: `artifact:${idx}`, e, idx });
    }

    return out;
  }, [sortedEvents]);

  return (
    <div className="composer">
      <div className="events" ref={eventsScrollRef}>
        <div className="events-content" ref={eventsContentRef}>
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
        {renderItems.map((item) => {
          if (item.kind === 'activity') {
            if (!DEBUG_TOOL_UI) return null;
            const rid = item.runId || 'no-run';
            const steps = stepsByRunId.get(rid) || [];
            const logs = logsByRunId.get(rid) || [];

            const status = (() => {
              if (steps.some((s: any) => s?.status === 'running')) return 'running';
              if (steps.some((s: any) => s?.status === 'failed')) return 'failed';
              if (steps.length > 0) return 'done';
              return 'idle';
            })();

            const expanded = !!expandedRuns[rid];
            const toggleRun = () => {
              setRunExpandMode((prev) => ({ ...prev, [rid]: 'manual' }));
              setExpandedRuns((prev) => ({ ...prev, [rid]: !prev[rid] }));
            };

            const totalDuration = steps.reduce((acc: number, s: any) => acc + (typeof s?.duration === 'number' ? s.duration : 0), 0);
            const failedCount = steps.filter((s: any) => s?.status === 'failed').length;
            const doneCount = steps.filter((s: any) => s?.status === 'done').length;

            return (
              <motion.div
                key={item.key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="message-row joe"
              >
                <div
                  className="message-bubble"
                  dir="auto"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--border-color)',
                    maxWidth: 760,
                    padding: '10px 12px',
                    cursor: 'pointer',
                  }}
                  onClick={toggleRun}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <Cpu size={16} color="var(--text-secondary)" />
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-primary)', flexShrink: 0 }}>سرد الأدوات</div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {steps.length ? `${steps.length} خطوة` : 'جارٍ التحضير'}
                          </div>
                        </div>
                        {steps.length ? (
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                            {failedCount ? `فشل ${failedCount}` : doneCount ? `اكتمل ${doneCount}` : '...'} {totalDuration ? `• ${(totalDuration / 1000).toFixed(1)}s` : ''}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      {status === 'running' ? <Loader2 size={14} className="spin" /> : status === 'failed' ? <XCircle size={14} color="#ef4444" /> : status === 'done' ? <CheckCircle2 size={14} color="#22c55e" /> : null}
                      {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </div>
                  </div>

                  {expanded ? (
                    <div style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {steps.map((s: any) => {
                        const stepName = String(s?.name || '');
                        const toolName = getToolNameFromStep(stepName);
                        const meta = toolName
                          ? toolUi(toolName)
                          : { label: 'خطوة', Icon: Sparkles, color: 'var(--text-secondary)', bg: 'rgba(255,255,255,0.02)', border: 'rgba(255,255,255,0.08)' };
                        const isExpandedStep = !!expandedStepKeys[s.key];
                        const toggleStep = (ev: any) => {
                          ev.stopPropagation();
                          setExpandedStepKeys((prev) => ({ ...prev, [s.key]: !prev[s.key] }));
                        };

                        const ok = s.status === 'done';
                        const failed = s.status === 'failed';
                        const running = s.status === 'running';
                        const dur = typeof s.duration === 'number' ? s.duration : undefined;
                        const title = toolName ? toolName : s.displayName || formatStepDisplayName(stepName);
                        const input = s.input;
                        const result = s.result;
                        const output = result?.output;
                        const href = typeof output?.href === 'string' ? output.href : undefined;
                        const errorText = String(s.error || result?.error || result?.message || '');

                        const badgeBg = failed ? 'rgba(239,68,68,0.10)' : ok ? 'rgba(34,197,94,0.10)' : 'rgba(255,255,255,0.02)';
                        const badgeBorder = failed ? 'rgba(239,68,68,0.35)' : ok ? 'rgba(34,197,94,0.35)' : 'rgba(255,255,255,0.10)';

                        return (
                          <div
                            key={s.key}
                            style={{
                              border: `1px solid ${meta.border}`,
                              background: meta.bg,
                              borderRadius: 10,
                              padding: '8px 10px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                <meta.Icon size={14} color={meta.color as any} />
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {title}
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                    <div style={{ fontSize: 10.5, color: meta.color, background: 'rgba(0,0,0,0.12)', padding: '2px 6px', borderRadius: 999 }}>
                                      {meta.label}
                                    </div>
                                    <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', background: badgeBg, border: `1px solid ${badgeBorder}`, padding: '2px 6px', borderRadius: 999 }}>
                                      {running ? 'جارٍ التنفيذ' : ok ? 'اكتملت' : 'فشلت'}
                                    </div>
                                    {typeof dur === 'number' && !running ? (
                                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: 'var(--text-secondary)' }}>
                                        <Clock size={11} /> {(dur / 1000).toFixed(1)}s
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={toggleStep}
                                style={{
                                  background: 'rgba(255,255,255,0.04)',
                                  border: '1px solid var(--border-color)',
                                  color: 'var(--text-secondary)',
                                  borderRadius: 8,
                                  padding: '4px 8px',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  flexShrink: 0,
                                }}
                              >
                                {isExpandedStep ? <ChevronDown size={14} /> : <ChevronRight size={14} />} التفاصيل
                              </button>
                            </div>

                            {isExpandedStep ? (
                              <div style={{ marginTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
                                {input != null ? (
                                  <>
                                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-secondary)', marginBottom: 6 }}>المدخلات</div>
                                    <pre style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                                      {formatValue(input)}
                                    </pre>
                                  </>
                                ) : null}

                                {href ? (
                                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: input != null ? 10 : 0, marginBottom: 8 }}>
                                    <a href={href} target="_blank" rel="noopener noreferrer" className="artifact-link" onClick={(ev) => ev.stopPropagation()}>
                                      <LinkIcon size={12} /> {t('artifacts.openNewWindow')}
                                    </a>
                                  </div>
                                ) : null}

                                {output != null ? (
                                  <>
                                    <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-secondary)', marginTop: input != null ? 10 : 0, marginBottom: 6 }}>المخرجات</div>
                                    <pre style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                                      {formatValue(output)}
                                    </pre>
                                  </>
                                ) : null}

                                {errorText ? (
                                  <div style={{ marginTop: 10, fontSize: 12, color: '#f87171', whiteSpace: 'pre-wrap' }}>
                                    {errorText}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}

                      {logs.length ? (
                        <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '8px 10px', background: 'rgba(0,0,0,0.08)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <Terminal size={14} />
                            <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-primary)' }}>Log</div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{logs.length}</div>
                          </div>
                          <pre style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                            {formatValue(logs.slice(-20).join('\n'), 4000)}
                          </pre>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </motion.div>
            );
          }

          if (item.kind === 'user') return <ChatBubble key={item.key} event={item.e} isUser={true} />;

          if (item.kind === 'error') {
            return (
              <motion.div
                key={item.key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="message-row joe"
              >
                <div className="message-bubble error" dir="auto" style={{ color: '#ef4444', border: '1px solid #ef4444', background: 'rgba(239, 68, 68, 0.1)' }}>
                  ⚠️ {item.e?.data}
                </div>
              </motion.div>
            );
          }

          if (item.kind === 'text') {
            let content = item.e?.data;
            try {
              if (typeof content === 'string' && (content.startsWith('{') || content.startsWith('['))) {
                const p = JSON.parse(content);
                content = p.text || p.output || content;
              }
            } catch {}

            const cleaned = cleanAssistantText(content);
            if (!cleaned) return null;
            return <ChatBubble key={item.key} event={{ data: { text: cleaned } }} isUser={false} onOptionClick={(q) => run(q)} />;
          }

          if (item.kind === 'artifact') {
            const e = item.e;
            const kind = e?.data?.kind;
            const href = e?.data?.href;
            const isBrowserStream =
              kind === 'browser_stream' ||
              (typeof href === 'string' && /^wss?:\/\//i.test(href) && /\/ws\//i.test(href));
            if (isBrowserStream && href) {
              if (sessionKind === 'agent' && browserSessionId) return null;
              return (
                <motion.div key={item.key} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="message-row joe">
                  <div className="event-artifact" style={{ padding: 0 }}>
                    <Suspense fallback={<div style={{ padding: 12, fontSize: 12, opacity: 0.7 }}>Loading Stream...</div>}>
                      <AgentBrowserStreamLazy wsUrl={href} />
                    </Suspense>
                  </div>
                </motion.div>
              );
            }

            const isImage = /\.(png|jpg|jpeg|webp|gif)$/i.test(e?.data?.name || '') || /\.(png|jpg|jpeg|webp|gif)$/i.test(e?.data?.href || '');
            const isVideo = /\.(mp4|webm|mov)$/i.test(e?.data?.name || '') || /\.(mp4|webm|mov)$/i.test(e?.data?.href || '');

            if (isImage) {
              return (
                <motion.div key={item.key} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="message-row joe">
                  <div className="image-generation-frame">
                    <div className="scanline-overlay"></div>
                    <img src={e.data.href} alt={e.data.name} className="image-generation-img" />
                  </div>
                </motion.div>
              );
            }

            return (
              <motion.div key={item.key} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="message-row joe">
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
            <div className="px-3 py-2" dir="auto">
              <div className="text-[10px] leading-3 font-light text-zinc-400/65">يفكّر…</div>
              <ToolTicker isThinking={isThinking} toolVisible={toolVisible} activeToolName={activeToolName} />
              {thinkingSteps.length ? (
                <div className="mt-0.5 text-[10px] leading-3 font-light text-zinc-500/60">
                  {thinkingSteps.join(' › ')}
                </div>
              ) : null}
            </div>
          </motion.div>
        )}
        <div ref={endRef} />
      </div>
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
                                    {activeProvider === 'grok' && (
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
                 className="provider-btn"
                 onClick={() => setShowProviders(true)}
                 title="AI Providers"
               >
                 <Cpu size={20} />
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
