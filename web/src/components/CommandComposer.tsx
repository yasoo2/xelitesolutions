import { useEffect, useMemo, useRef, useState, lazy, Suspense, forwardRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

import { useTranslation } from 'react-i18next';
import { API_URL as API, WS_URL as WS } from '../config';
import { motion, AnimatePresence } from 'framer-motion';
import { AgentActivity } from './AgentActivity';
import { GitHubConnectModal } from './GitHubConnectModal';

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
  Square,
  Send,
  Copy,
  RotateCcw,
  Search,
  Sparkles,
  MicOff,
  Lock,
  ShieldCheck,
  Bot,
  User,
  Camera,
  Monitor,
  Github
} from 'lucide-react';

const DEBUG_TOOL_UI = false;

const EliteLogo = ({ size = 120, className = "" }: { size?: number; className?: string }) => {
  return (
    <motion.div
      className={`elite-bold-masterpiece-wrapper ${className}`}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
      style={{ width: size, height: size, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {/* Polished Glass Backdrop with Depth */}
      <div className="elite-glass-base" />

      <svg
        viewBox="0 0 100 100"
        className="elite-master-svg"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="shimmer-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <motion.stop
              offset="0%"
              stopColor="var(--accent-primary)"
              animate={{ stopColor: ["var(--accent-primary)", "var(--text-primary)", "var(--accent-primary)"] }}
              transition={{ duration: 4, repeat: Infinity }}
            />
            <stop offset="50%" stopColor="var(--text-primary)" stopOpacity="0.8" />
            <motion.stop
              offset="100%"
              stopColor="var(--accent-primary)"
              animate={{ stopColor: ["var(--accent-primary)", "var(--text-primary)", "var(--accent-primary)"] }}
              transition={{ duration: 4, repeat: Infinity, delay: 1 }}
            />
          </linearGradient>

          <filter id="elite-master-glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* The Bold Masterpiece 'J' */}
        <motion.path
          d="M65 25V65C65 80 45 80 35 70"
          stroke="url(#shimmer-grad)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          filter="url(#elite-master-glow)"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.5, ease: "easeOut" }}
        />

        {/* Highlight tracing for extra beauty */}
        <motion.path
          d="M65 25V65C65 80 45 80 35 70"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{
            pathLength: [0, 1, 0],
            opacity: [0, 0.4, 0]
          }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          style={{ opacity: 0.3 }}
        />
      </svg>
    </motion.div>
  );
};

const ChatBubble = forwardRef(
  (
    {
      event,
      isUser,
      variant,
      tone,
      ts,
      onOptionClick,
      isTyping,
      userPicture,
    }: {
      event: any;
      isUser: boolean;
      variant?: 'user' | 'ai' | 'system';
      tone?: 'normal' | 'danger' | 'success' | 'info';
      ts?: number;
      onOptionClick?: (text: string) => void;
      isTyping?: boolean;
      userPicture?: string;
    },
    ref: any
  ) => {
    const { t } = useTranslation();
    let content = event.data.text || event.data;
    let options: any[] = [];
    const [copied, setCopied] = useState(false);
    const copyTimerRef = useRef<number | null>(null);
    const bubbleVariant: 'user' | 'ai' | 'system' = variant || (isUser ? 'user' : 'ai');

    useEffect(() => {
      return () => {
        if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current);
      };
    }, []);

    const files = event.data?.files || [];
    const fmtTime = (t?: number) => {
      const d = new Date(typeof t === 'number' ? t : Date.now());
      try {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch {
        return '';
      }
    };

    const senderLabel = bubbleVariant === 'user' ? 'أنت' : bubbleVariant === 'system' ? 'النظام' : 'Joe';
    const SenderIcon = bubbleVariant === 'user' ? User : bubbleVariant === 'system' ? ShieldCheck : Bot;
    const showHeader = false; // ELITE REFINEMENT: Remove headers (Joe/You)
    const showAvatar = bubbleVariant !== 'user' || (bubbleVariant === 'user' && !!userPicture);
    const showCopy = bubbleVariant !== 'user';

    const rawText =
      typeof content === 'string' ? content : content && typeof content === 'object' ? JSON.stringify(content) : String(content ?? '');
    const canCopy = Boolean(rawText && rawText.trim());
    const doCopy = async () => {
      if (!canCopy) return;
      try {
        await navigator.clipboard.writeText(rawText);
        setCopied(true);
        if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current);
        copyTimerRef.current = window.setTimeout(() => setCopied(false), 1200);
      } catch { }
    };

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
              return { start, jsonText: s.slice(start, i + 1), rest: s.slice(i + 1) };
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
        } catch { }
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
          } catch { }
        }
      }

      if (extracted.length > 0) {
        options = extracted;
        content = cleaned;
      }
    }

    if (!isUser) {
      const looksLikeBrowserSummary = (v: any) => {
        if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
        if (typeof (v as any).site !== 'string') return false;
        const hasAnyField =
          typeof (v as any).url === 'string' ||
          typeof (v as any).title === 'string' ||
          typeof (v as any).pageType === 'string' ||
          typeof (v as any).hasScreenshot === 'boolean' ||
          typeof (v as any).redactionEnabled === 'boolean' ||
          typeof (v as any).domLength === 'number';
        return hasAnyField;
      };

      const formatBrowserSummary = (v: any) => {
        const site = typeof v.site === 'string' && v.site.trim() ? v.site.trim() : t('browserSummaryUnknownSite');
        const title = typeof v.title === 'string' && v.title.trim() ? v.title.trim() : '';
        const url = typeof v.url === 'string' && v.url.trim() ? v.url.trim() : '';
        const pageType = typeof v.pageType === 'string' ? v.pageType.trim().toLowerCase() : '';
        const isLogin = pageType === 'login';
        const hasScreenshot = Boolean(v.hasScreenshot);
        const redactionEnabled = typeof v.redactionEnabled === 'boolean' ? v.redactionEnabled : undefined;

        const lines: string[] = [];
        let header = `${t('browserSummaryPrefix')}: ${site}`;
        if (title) header += ` — ${title}`;
        if (isLogin) header += ` (${t('browserSummaryPageTypeLogin')})`;
        lines.push(header);

        if (url) lines.push(`${t('browserSummaryUrlLabel')}: ${url.replace(/`+/g, '').trim()}`);
        if (hasScreenshot) lines.push(t('browserSummaryScreenshotTaken'));
        if (typeof redactionEnabled === 'boolean') {
          lines.push(`${t('browserSummaryRedactionLabel')}: ${redactionEnabled ? t('yes') : t('no')}`);
        }

        return lines.join('\n');
      };

      const extractFirstJsonObject = (s: string) => {
        const start = s.indexOf('{');
        if (start < 0) return null;
        const stack: string[] = [];
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
          if (ch === '{') {
            stack.push('}');
            continue;
          }
          if (ch === '}') {
            if (!stack.length) return null;
            stack.pop();
            if (!stack.length) {
              return { start, jsonText: s.slice(start, i + 1), end: i + 1 };
            }
          }
        }
        return null;
      };

      const humanizeBrowserSummaryInText = (text: string) => {
        const m = extractFirstJsonObject(text);
        if (!m) return text;
        try {
          const parsed = JSON.parse(m.jsonText);
          if (!looksLikeBrowserSummary(parsed)) return text;
          const formatted = formatBrowserSummary(parsed);
          const before = text.slice(0, m.start);
          const after = text.slice(m.end);
          const combined = `${before}${formatted}${after}`;
          return combined.replace(/\n{3,}/g, '\n\n').trim();
        } catch {
          return text;
        }
      };

      if (typeof content === 'string') content = humanizeBrowserSummaryInText(content);
      else if (looksLikeBrowserSummary(content)) content = formatBrowserSummary(content);
    }

    const [displayedContent, setDisplayedContent] = useState(isUser || !isTyping ? rawText : '');
    const streamingRef = useRef(false);

    useEffect(() => {
      if (isUser || !isTyping || streamingRef.current || displayedContent === rawText) return;

      streamingRef.current = true;
      const words = rawText.split(' ');
      let current = '';
      let i = 0;

      const interval = setInterval(() => {
        if (i >= words.length) {
          clearInterval(interval);
          streamingRef.current = false;
          setDisplayedContent(rawText);
          return;
        }
        current += (i === 0 ? '' : ' ') + words[i];
        setDisplayedContent(current);
        i++;
      }, 30);

      return () => clearInterval(interval);
    }, [rawText, isUser, isTyping, displayedContent]);

    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
        className={`chat-bubble-wrapper ${bubbleVariant}`}
      >
        {showAvatar ? (
          <div className={`chat-avatar ${bubbleVariant}`} aria-hidden="true">
            {bubbleVariant === 'user' && userPicture ? (
              <img src={userPicture} alt="User" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
            ) : bubbleVariant === 'user' ? (
              <SenderIcon size={16} />
            ) : (
              <div className="chat-avatar-joe">
                <EliteLogo size={32} className="avatar-scaled" />
              </div>
            )}

          </div>
        ) : null}
        <div className={`chat-bubble ${bubbleVariant}${tone ? ` tone-${tone}` : ''}`}>
          {showHeader ? (
            <div className="chat-bubble-header">
              <div className="chat-bubble-sender">{senderLabel}</div>
              <div className="chat-bubble-actions">
                <div className="chat-bubble-time">
                  <Clock size={14} />
                  <span>{fmtTime(ts)}</span>
                </div>
                {showCopy ? (
                  <button className="chat-action-btn" onClick={doCopy} disabled={!canCopy} title="Copy">
                    {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="chat-bubble-content" dir="auto">
            {files.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {files.map((f: any, i: number) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 8px', borderRadius: 6,
                    background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)',
                    fontSize: 11, color: 'var(--text-secondary)'
                  }}>
                    <FileText size={12} style={{ opacity: 0.7 }} />
                    <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.name || 'File'}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {bubbleVariant === 'user' ? (
              <div>{displayedContent}</div>
            ) : (
              <>
                <ReactMarkdown
                  components={{
                    h1: ({ ...props }) => <h1 {...props} />,
                    h2: ({ ...props }) => <h2 {...props} />,
                    h3: ({ ...props }) => <h3 {...props} />,
                    ul: ({ ...props }) => <ul {...props} />,
                    ol: ({ ...props }) => <ol {...props} />,
                    li: ({ ...props }) => <li {...props} />,
                    p: ({ ...props }) => <p {...props} />,
                    blockquote: ({ ...props }) => <blockquote {...props} />,
                    a: ({ ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
                    code({ className, children, ...props }: any) {
                      const { inline, ...rest } = props as any;
                      const match = /language-(\w+)/.exec(className || '');
                      return !inline && match ? (
                        <SyntaxHighlighter style={vscDarkPlus as any} language={match[1]} PreTag="div" dir="ltr" {...rest}>
                          {String(children).replace(/\n$/, '')}
                        </SyntaxHighlighter>
                      ) : (
                        <code className={className} {...rest}>
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {displayedContent || (typeof event.data === 'string' ? event.data : JSON.stringify(event.data))}
                </ReactMarkdown>

                {options.length > 0 && (
                  <div className="options-container">
                    {options.map((opt: any, idx: number) => (
                      <button key={idx} onClick={() => onOptionClick?.(opt.query)} className="option-btn">
                        <span className="option-icon">✨</span> {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {isTyping && !streamingRef.current ? (
              <div className="typing-dots" aria-label="Typing">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            ) : null}
          </div>

          {!showHeader ? (
            <div className="chat-bubble-footer" aria-hidden="true">
              <span className="chat-bubble-time-inline">{fmtTime(ts)}</span>
            </div>
          ) : null}
        </div>
      </motion.div>
    );
  }
);

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

const DEFAULT_PROVIDERS: { [key: string]: ProviderConfig } = {
  openrouter: { name: 'OpenRouter', apiKey: '', isConnected: false, baseUrl: 'https://openrouter.ai/api/v1', model: 'google/gemma-2-9b-it:free' },
  auto: { name: 'Auto (Intelligent)', apiKey: 'auto-mode', isConnected: true, model: 'auto', isCustom: true },
  openai: { name: 'OpenAI', apiKey: '', isConnected: false, model: 'gpt-4o' },
  anthropic: { name: 'Anthropic', apiKey: '', isConnected: false, model: 'claude-3-opus-20240229' },
  gemini: { name: 'Google Gemini', apiKey: '', isConnected: false, model: 'gemini-1.5-flash' },
  grok: { name: 'xAI (Grok)', apiKey: '', isConnected: false, baseUrl: 'https://api.x.ai/v1', model: 'grok-beta' },
};

export default function CommandComposer({
  sessionId,
  sessionKind = 'chat',
  browserSessionId = null,
  previewBaseUrl,
  onSessionCreated,
  onPreviewArtifact,
  onStepsUpdate,
  onMessagesUpdate,

}: {
  sessionId?: string;
  sessionKind?: 'chat' | 'agent';
  browserSessionId?: string | null;
  previewBaseUrl?: string;
  onSessionCreated?: (id: string) => void;
  onPreviewArtifact?: (content: string, lang: string) => void;
  onStepsUpdate?: (steps: any[]) => void;
  onMessagesUpdate?: (msgs: any[]) => void;

}) {
  const { t } = useTranslation();
  const showToolUi = sessionKind === 'agent' || sessionKind === 'chat' || DEBUG_TOOL_UI;
  const showFloatingTaskbar = false;
  const handleUnauthorized = () => {
    localStorage.removeItem('token');
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  };
  const [text, setText] = useState('');
  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed === '/* ... */' || trimmed === '/* ... */.') {
      setText('');
    }
  }, [text]);

  const [taskBarByRunId, setTaskBarByRunId] = useState<
    Record<
      string,
      {
        visible: boolean;
        analyzing: boolean;
        items: Array<{ id: string; tool: string; label: string; status: 'pending' | 'running' | 'done' | 'failed' }>;
      }
    >
  >({});
  const [attachedFiles, setAttachedFiles] = useState<Array<{
    id: string;
    name: string;
    size?: number;
    type?: string;
    preview?: string;
    uploadSuccess?: boolean;
  }>>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [events, setEvents] = useState<Array<{ type: string; data: any; duration?: number; expanded?: boolean }>>([]);
  const [userName, setUserName] = useState<string>('');
  const [userPicture, setUserPicture] = useState<string>('');

  useEffect(() => {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const name = payload.name || payload.email?.split('@')[0] || 'User';
        const pic = payload.picture || '';
        setUserName(name);
        if (pic) setUserPicture(pic);

        // Initial Welcome Message
        if (events.length === 0) {
          setEvents([{
            type: 'text',
            data: { text: `👋 Welcome back, **${name}**! How can I help you today?` },
            duration: 0
          }]);
        }
      }
    } catch (e) { }
  }, []);

  const [approval, setApproval] = useState<{ id: string; runId: string; risk: string; action: string } | null>(null);
  const [secretPrompt, setSecretPrompt] = useState<{ sessionId: string; runId?: string; provider?: string; key: string; label?: string; reason?: string } | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [status, setStatus] = useState<'idle' | 'thinking' | 'answering'>('idle');
  const [isThinking, setIsThinking] = useState(false);
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const [toolVisible, setToolVisible] = useState(false);
  const [thinkingGlimpse, setThinkingGlimpse] = useState('');
  const [draftText, setDraftText] = useState('');
  const [draftActive, setDraftActive] = useState(false);

  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis>(window.speechSynthesis);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number>();
  const endRef = useRef<HTMLDivElement>(null);
  const eventsScrollRef = useRef<HTMLDivElement>(null);
  const eventsContentRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef<boolean>(true);
  const lastJoeAutoScrollKeyRef = useRef<string>('');
  const scrollRafRef = useRef<number | null>(null);
  const stepStartTimes = useRef<{ [key: string]: number }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastLiveSeqRef = useRef<number>(0);
  const prevSessionIdRef = useRef<string | undefined>(undefined);
  const lastToolShownAtRef = useRef<number>(0);
  const toolHideTimerRef = useRef<number | null>(null);
  const toolFinalizeTimerRef = useRef<number | null>(null);
  const isThinkingRef = useRef<boolean>(isThinking);
  const toolVisibleRef = useRef<boolean>(toolVisible);
  const activeToolNameRef = useRef<string | null>(activeToolName);
  const statusRef = useRef<typeof status>(status);
  const thinkingGlimpseTimerRef = useRef<number | null>(null);
  const thinkingGlimpseIndexRef = useRef<number>(0);
  const draftTimerRef = useRef<number | null>(null);
  const lastGateSigRef = useRef<{ approval?: string; secret?: string }>({});
  const lastExecTaskIdRef = useRef<Record<string, Record<string, string>>>({});
  const lastTextDedupRef = useRef<{ sig: string; ts: number } | null>(null);
  const pendingBrowserRetryRef = useRef<{ url: string; sessionId: string } | null>(null);
  const lastAutoOpenedHrefRef = useRef<string>('');

  /* Removed duplicate declaration */

  // GitHub Modal State
  const [showGithubModal, setShowGithubModal] = useState(false);

  // AI Provider State
  const [showProviders, setShowProviders] = useState(false);
  const [systemInstructions, setSystemInstructions] = useState<string>(() => {
    try {
      return localStorage.getItem('system_instructions') || '';
    } catch {
      return '';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('system_instructions', systemInstructions);
    } catch { }
  }, [systemInstructions]);
  const initialProviderState = useMemo(() => {
    // Reorder providers: Auto first, then OpenRouter, then paid providers, then Joe (Free)
    const baseProviders: { [key: string]: ProviderConfig } = {
      auto: { ...DEFAULT_PROVIDERS.auto },
      openrouter: { ...DEFAULT_PROVIDERS.openrouter },
      openai: { ...DEFAULT_PROVIDERS.openai },
      anthropic: { ...DEFAULT_PROVIDERS.anthropic },
      gemini: { ...DEFAULT_PROVIDERS.gemini },
      grok: { ...DEFAULT_PROVIDERS.grok },
    };

    try {
      const saved = localStorage.getItem('ai_providers');
      if (saved) {
        const parsed = JSON.parse(saved);
        Object.keys(parsed).forEach((k) => {
          if (baseProviders[k]) baseProviders[k] = { ...baseProviders[k], ...parsed[k] };
        });
      }
    } catch { }

    const pickFirstKeyedProvider = () => {
      // PRIORITY: Use Auto by default
      return 'auto';

      // Use specific providers if keys exist
      if (String(baseProviders.openai?.apiKey || '').trim()) return 'openai';
      if (String(baseProviders.anthropic?.apiKey || '').trim()) return 'anthropic';
    };

    try {
      const savedActive = localStorage.getItem('active_provider');
      if (savedActive && baseProviders[savedActive]) {
        return { providers: baseProviders, activeProvider: savedActive };
      }
      return { providers: baseProviders, activeProvider: pickFirstKeyedProvider() };
    } catch {
      return { providers: baseProviders, activeProvider: pickFirstKeyedProvider() };
    }
  }, []);

  const [providers, setProviders] = useState<{ [key: string]: ProviderConfig }>(initialProviderState.providers);
  const [activeProvider, setActiveProvider] = useState(initialProviderState.activeProvider);
  const [showKey, setShowKey] = useState<{ [key: string]: boolean }>({});
  const [activeRunId, setActiveRunId] = useState<string | null>(null);


  const getToolLabel = (tool: string, input: any) => {
    const tname = String(tool || '').trim();
    const lower = tname.toLowerCase();

    if (tname === 'github_create_repo') {
      const name = typeof input?.name === 'string' ? input.name.trim() : '';
      return name ? `إنشاء مستودع على GitHub: ${name}` : 'إنشاء مستودع على GitHub';
    }
    if (lower.startsWith('browser_')) return 'تشغيل مهام داخل المتصفح';
    if (tname === 'file_write') {
      const filename = typeof input?.filename === 'string' ? input.filename.trim() : '';
      return filename ? `إنشاء/تعديل ملف: ${filename}` : 'إنشاء/تعديل ملف';
    }
    if (tname === 'file_edit') return 'تعديل ملف';
    if (tname === 'file_read') return 'قراءة ملف';
    if (tname === 'read_file_tree') return 'استعراض ملفات المشروع';
    if (tname === 'grep_search') return 'بحث داخل الملفات';
    if (tname === 'shell_execute') return 'تنفيذ أوامر';
    if (tname === 'git_ops') return 'عمليات Git';
    if (tname === 'http_fetch') return 'جلب بيانات من الإنترنت';
    if (tname === 'quality_run') return 'تشغيل فحوصات الجودة';

    return tname ? `تنفيذ: ${tname}` : 'تنفيذ مهمة';
  };

  const getTaskId = (rid: string, tool: string, input: any) => {
    const normalizedTool = String(tool || '').trim();
    const label = getToolLabel(normalizedTool, input);
    const stable = `${normalizedTool}::${label}`;
    return { id: `${rid}::${stable}`, tool: normalizedTool, label };
  };

  const ensureTaskBar = (rid: string, patch: Partial<{ visible: boolean; analyzing: boolean }>) => {
    if (!showFloatingTaskbar) return;
    setTaskBarByRunId((prev) => {
      const cur = prev[rid];
      const next = cur
        ? { ...cur, ...patch }
        : { visible: true, analyzing: true, items: [], ...patch };
      return { ...prev, [rid]: next };
    });
  };

  const setTaskStatusByExecuteEvent = (
    rid: string,
    tool: string,
    kind: 'start' | 'done' | 'failed',
    input?: any
  ) => {
    if (!showFloatingTaskbar) return;
    const normalized = String(tool || '').trim();
    if (!normalized) return;

    setTaskBarByRunId((prev) => {
      const cur = prev[rid];
      if (!cur) return prev;

      const items = [...cur.items];
      const byId = (id: string) => items.findIndex((t) => t.id === id);
      const byToolStatus = (status: 'pending' | 'running') => items.findIndex((t) => t.tool === normalized && t.status === status);

      const derivedId = input != null ? getTaskId(rid, normalized, input).id : '';
      if (kind === 'start') {
        const id = derivedId || (lastExecTaskIdRef.current[rid]?.[normalized] ?? '');
        const idx = id ? byId(id) : byToolStatus('pending');
        const taskId = idx >= 0 ? items[idx].id : derivedId || getTaskId(rid, normalized, null).id;
        if (!lastExecTaskIdRef.current[rid]) lastExecTaskIdRef.current[rid] = {};
        lastExecTaskIdRef.current[rid][normalized] = taskId;

        const i2 = byId(taskId);
        if (i2 >= 0) {
          items[i2] = { ...items[i2], status: 'running' };
        } else {
          const created = getTaskId(rid, normalized, input ?? null);
          items.push({ id: created.id, tool: created.tool, label: created.label, status: 'running' });
        }
        return { ...prev, [rid]: { ...cur, visible: true, analyzing: false, items } };
      }

      const remembered = lastExecTaskIdRef.current[rid]?.[normalized] ?? '';
      const idx = remembered ? byId(remembered) : byToolStatus('running');
      if (idx < 0) return prev;

      const nextStatus = kind === 'done' ? 'done' : 'failed';
      items[idx] = { ...items[idx], status: nextStatus as any };
      return { ...prev, [rid]: { ...cur, items } };
    });
  };

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
      if (name === 'plan') return t('tools.plan');
      if (name.startsWith('planning_step_')) {
        const n = name.replace('planning_step_', '');
        return t('planNumber', { n });
      }
      if (name.startsWith('execute:')) {
        const tool = name.slice('execute:'.length).trim();
        return t('executePrefix', { tool: tool || t('toolCategoryGeneric') });
      }
      return name;
    };

    const displaySteps = steps.map((s: any) => ({ ...s, displayName: formatStepName(String(s.name || '')) }));

    return { steps: displaySteps, logs, artifacts, timeline };
  }, [events, t]);

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
      // If ref is missing, try endRef with smooth behavior if requested
      endRef.current?.scrollIntoView({ behavior });
      return;
    }

    // For 'auto' (instant) scrolling, skip RAF to ensure it happens in the same frame as render/paint
    // This is critical for preventing jitter during high-frequency streaming updates
    if (behavior === 'auto') {
      scroller.scrollTop = scroller.scrollHeight;
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
      return;
    }

    if (scrollRafRef.current != null) {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = null;
    }
    scrollRafRef.current = requestAnimationFrame(() => {
      scroller.scrollTo({ top: scroller.scrollHeight, behavior });
    });
  };

  const recomputeAutoScroll = () => {
    const scroller = eventsScrollRef.current;
    if (!scroller) {
      autoScrollRef.current = true;
      return;
    }
    // Tolerance of 120px
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
    const last = events.length ? (events[events.length - 1] as any) : null;
    const lastType = String(last?.type || '');
    const shouldForceScroll =
      lastType === 'text' || lastType === 'artifact_created' || lastType === 'error';

    if (shouldForceScroll) {
      const id = typeof last?.id === 'string' ? last.id : '';
      const ts = typeof last?.ts === 'number' ? String(last.ts) : '';
      const key = id || `${lastType}:${ts}:${events.length}`;
      if (lastJoeAutoScrollKeyRef.current !== key) {
        lastJoeAutoScrollKeyRef.current = key;
        autoScrollRef.current = true;
        scrollToBottom('auto');
      }
    } else if (autoScrollRef.current) {
      scrollToBottom('auto');
    }
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

        if (res.status === 401) {
          handleUnauthorized();
          setIsSpeaking(false);
          return;
        }
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
    if (toolFinalizeTimerRef.current != null) {
      window.clearTimeout(toolFinalizeTimerRef.current);
      toolFinalizeTimerRef.current = null;
    }
  };

  const clearDraftTimer = () => {
    if (draftTimerRef.current != null) {
      window.clearInterval(draftTimerRef.current);
      draftTimerRef.current = null;
    }
  };

  const stopDraft = () => {
    clearDraftTimer();
    setDraftActive(false);
    setDraftText('');
  };

  useEffect(() => {
    isThinkingRef.current = isThinking;
  }, [isThinking]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    toolVisibleRef.current = toolVisible;
  }, [toolVisible]);

  useEffect(() => {
    activeToolNameRef.current = activeToolName;
  }, [activeToolName]);

  useEffect(() => {
    if (!isThinking && status !== 'answering') {
      if (thinkingGlimpseTimerRef.current != null) {
        window.clearInterval(thinkingGlimpseTimerRef.current);
        thinkingGlimpseTimerRef.current = null;
      }
      thinkingGlimpseIndexRef.current = 0;
      setThinkingGlimpse('');
      return;
    }

    const compute = () => {
      if (status === 'answering') {
        return t('thinkingDraftIntro', 'جاري تجهيز الرد…');
      }
      if (toolVisible && activeToolName) {
        const toolKey = String(activeToolName).trim();
        return t('thinkingGlimpseTool', { tool: toolKey });
      }
      return t('thinkingGlimpseUnderstand', 'جاري التنفيذ…');
    };

    setThinkingGlimpse(compute());

    if (thinkingGlimpseTimerRef.current != null) {
      window.clearInterval(thinkingGlimpseTimerRef.current);
      thinkingGlimpseTimerRef.current = null;
    }
    thinkingGlimpseTimerRef.current = window.setInterval(() => setThinkingGlimpse(compute()), 1100);

    return () => {
      if (thinkingGlimpseTimerRef.current != null) {
        window.clearInterval(thinkingGlimpseTimerRef.current);
        thinkingGlimpseTimerRef.current = null;
      }
    };
  }, [activeToolName, isThinking, status, t, toolVisible]);

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
    if (toolFinalizeTimerRef.current != null) window.clearTimeout(toolFinalizeTimerRef.current);
    const totalDelay = wait + 250;
    toolHideTimerRef.current = window.setTimeout(() => {
      toolHideTimerRef.current = null;
      setToolVisible(false);
      toolFinalizeTimerRef.current = window.setTimeout(() => {
        toolFinalizeTimerRef.current = null;
        setActiveToolName(null);
        setIsThinking(false);
        setStatus('idle');
        setThinkingGlimpse('');
      }, 50); // SPEED OPTIMIZATION: Reduced from 250ms
    }, wait);
    return totalDelay;
  };

  useEffect(() => {
    connectWS();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      clearToolTimers();
      clearDraftTimer();
    };
  }, []);

  function connectWS() {
    try {
      if (wsRef.current) {
        if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) return;
        try { wsRef.current.close(); } catch { }
      }
      const token = (() => {
        try {
          return localStorage.getItem('token');
        } catch {
          return null;
        }
      })();
      const withToken = (url: string) => {
        if (!token) return url;
        const hasQuery = url.includes('?');
        const sep = hasQuery ? '&' : '?';
        return `${url}${sep}token=${encodeURIComponent(token)}`;
      };
      const primaryUrl = withToken(WS);
      const fallbackUrl = withToken(`${API.replace(/^http/, 'ws')}/ws`);

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
            setStatus('thinking');
            setIsThinking(true);
            setActiveToolName(null);
            setToolVisible(false);
          }

          if ((msg.type === 'step_started' || msg.type === 'step_done' || msg.type === 'step_failed') && typeof msg?.data?.name === 'string') {
            const name = String(msg.data.name);
            const rid = typeof msg?.runId === 'string' ? msg.runId.trim() : '';
            if (rid && name.startsWith('execute:')) {
              const tool = name.slice('execute:'.length).trim();
              if (msg.type === 'step_started') {
                setTaskStatusByExecuteEvent(rid, tool, 'start', msg?.data?.input);
              }
              else if (msg.type === 'step_done') {
                setTaskStatusByExecuteEvent(rid, tool, 'done');
              }
              else setTaskStatusByExecuteEvent(rid, tool, 'failed');
            }
          }

          if (msg.type === 'run_finished' || msg.type === 'run_completed') {
            const rid = typeof msg?.runId === 'string' ? msg.runId.trim() : '';
            if (rid) {
              if (showFloatingTaskbar) {
                setTaskBarByRunId((prev) => {
                  const cur = prev[rid];
                  if (!cur) return prev;
                  if (!cur.items.length) {
                    return { ...prev, [rid]: { ...cur, visible: false, analyzing: false } };
                  }
                  return prev;
                });
              }
            }
            window.dispatchEvent(new CustomEvent('sessions:refresh'));
          }

          if (msg.type === 'artifact_created') {
            const kind = msg.data?.kind;
            const href = msg.data?.href;
            if (typeof href === 'string' && /^https?:\/\//i.test(href)) {
              const name = String(msg.data?.name || '').trim();
              const lowerName = name.toLowerCase();
              const lowerKind = String(kind || '').toLowerCase();
              const looksLikeAsset = /\.(png|jpg|jpeg|webp|gif|svg|mp4|webm|pdf|zip|tar|gz)(\?|#|$)/i.test(href);

              let shouldAutoOpen = false;
              if (!looksLikeAsset) {
                try {
                  const u = new URL(href);
                  const host = u.hostname.toLowerCase();
                  const looksLocal = host === 'localhost' || host === '127.0.0.1';
                  const looksPreviewHost =
                    host.endsWith('.vercel.app') ||
                    host.endsWith('.netlify.app') ||
                    host.endsWith('.pages.dev') ||
                    host.endsWith('.web.app');
                  if (looksLocal || looksPreviewHost) shouldAutoOpen = true;
                } catch { }

                if (!shouldAutoOpen) {
                  if (lowerKind.includes('deploy') || lowerKind.includes('preview')) shouldAutoOpen = true;
                  else if (/(preview|deploy|site|demo|app)/i.test(lowerName)) shouldAutoOpen = true;
                }
              }

              if (shouldAutoOpen && lastAutoOpenedHrefRef.current !== href) {
                lastAutoOpenedHrefRef.current = href;
                try {
                  window.open(href, '_blank', 'noopener,noreferrer');
                } catch { }
              }
            }
          }

          if (msg.type === 'approval_required') {
            const data = msg.data || {};
            const { id, risk, action } = data;
            const runId = typeof data?.runId === 'string' ? data.runId : typeof msg?.runId === 'string' ? msg.runId : '';
            if (id) {
              const sig = `${String(id)}:${String(runId || '')}`;
              if (lastGateSigRef.current.approval === sig) return;
              lastGateSigRef.current.approval = sig;
              setApproval({ id, runId, risk, action });
              const actionText = String(action || '').trim();
              const riskText = String(risk || '').trim();
              const lines = [
                t('approvalGateTitle', 'Approval is required before continuing.'),
                actionText ? `- ${t('action', 'Action')}: ${actionText}` : '',
                riskText ? `- ${t('risk', 'Risk')}: ${riskText}` : '',
                '',
                t('approvalGateInstruction', 'Type "approve" to continue or "deny" to cancel.'),
              ].filter(Boolean);
              setEvents(prev => [...prev, { type: 'text', data: lines.join('\n'), ts: Date.now() }]);
            }
          }

          if (msg.type === 'secret_required') {
            const data = msg.data || {};
            const sid = String(data?.sessionId || sessionId || '').trim();
            const key = String(data?.key || '').trim();
            if (sid && key) {
              const runId = typeof data?.runId === 'string' ? data.runId : typeof msg?.runId === 'string' ? msg.runId : '';
              const sig = `${sid}:${key}:${runId}`;
              if (lastGateSigRef.current.secret === sig) return;
              lastGateSigRef.current.secret = sig;
              setSecretPrompt({
                sessionId: sid,
                runId: typeof data?.runId === 'string' ? data.runId : typeof msg?.runId === 'string' ? msg.runId : undefined,
                provider: typeof data?.provider === 'string' ? data.provider : undefined,
                key,
                label: typeof data?.label === 'string' ? data.label : undefined,
                reason: typeof data?.reason === 'string' ? data.reason : undefined,
              });
              const label = typeof data?.label === 'string' && data.label.trim() ? data.label.trim() : key;
              const reason = typeof data?.reason === 'string' && data.reason.trim() ? data.reason.trim() : '';
              const lines = [
                t('secretGateTitle', 'A token/key is required to continue.'),
                `- ${t('secretGateRequired', 'Required')}: ${label}`,
                reason ? `- ${t('secretGateReason', 'Reason')}: ${reason}` : '',
                '',
                t('secretGateInstruction', 'Paste the token here and send it as a single message.'),
                t('secretGatePrivacy', 'The token will not be shown after sending.'),
              ].filter(Boolean);
              setEvents(prev => [...prev, { type: 'text', data: lines.join('\n'), ts: Date.now() }]);
            }
          }

          if (msg.type === 'step_started') {
            const rid = typeof msg?.runId === 'string' ? msg.runId : typeof msg?.data?.runId === 'string' ? msg.data.runId : '';
            const name = String(msg?.data?.name || '');
            if (name) stepStartTimes.current[`${rid}:${name}`] = Date.now();
            if (name === 'plan') {
              showTool('plan');
            } else if (name.startsWith('planning_step_')) {
              showTool('plan');
            } else if (name.startsWith('execute:')) {
              showTool(name.slice('execute:'.length));
            } else if (name) {
              showTool(name);
            }
          }

          if (msg.type === 'step_done') {
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

            const rid = typeof msg?.runId === 'string' ? msg.runId : '';
            const rawSigPart =
              typeof msg?.data === 'string'
                ? msg.data
                : msg?.data != null
                  ? (() => {
                    try { return JSON.stringify(msg.data); } catch { return String(msg.data); }
                  })()
                  : '';

            // Strict deduplication: Ignore runId, focus on content. 
            // If the exact same text arrives within 10 seconds, ignore it.
            const sig = rawSigPart.trim();
            const now = Date.now();
            if (lastTextDedupRef.current && lastTextDedupRef.current.sig === sig && now - lastTextDedupRef.current.ts < 10000) return;
            lastTextDedupRef.current = { sig, ts: now };

            const hadTool = toolVisibleRef.current || activeToolNameRef.current != null;
            clearToolTimers();
            clearDraftTimer();
            if (hadTool) {
              setToolVisible(false);
              setActiveToolName(null);
            }
            setStatus('answering');
            setIsThinking(true);

            const delay = 0; // SPEED OPTIMIZATION: Instant UI update
            window.setTimeout(() => {
              try {
                let content: any = msg.data;
                try {
                  if (typeof content === 'string' && (content.startsWith('{') || content.startsWith('['))) {
                    const p = JSON.parse(content);
                    content = p.text || p.output || content;
                  }
                } catch { }

                const cleaned = cleanAssistantText(content);
                const finalText = String(cleaned || content || '').trimEnd();

                if (!finalText) {
                  setEvents((prev) => {
                    if (id && prev.some((e: any) => typeof e?.id === 'string' && e.id === id)) return prev;
                    // Double check against last message content
                    const last = prev[prev.length - 1];
                    if (last && last.type === 'text' && String(last.data || '').trim() === String(msg.data || '').trim()) return prev;
                    return [...prev, msg];
                  });
                  setIsThinking(false);
                  setStatus('idle');
                  setThinkingGlimpse('');
                  stopDraft();
                  return;
                }

                stopDraft();

                const normalizedMsg = {
                  ...msg,
                  data: msg?.data != null && typeof msg.data === 'object' ? { ...(msg.data as any), text: finalText } : { text: finalText },
                };

                setEvents((prev) => {
                  if (id && prev.some((e: any) => typeof e?.id === 'string' && e.id === id)) return prev;
                  const last = prev[prev.length - 1];
                  const lastText =
                    last && last.type === 'text'
                      ? typeof last.data === 'string'
                        ? last.data
                        : last?.data?.text
                      : '';
                  if (last && last.type === 'text' && String(lastText || '').trim() === finalText.trim()) return prev;
                  return [...prev, normalizedMsg];
                });

                setIsThinking(false);
                setStatus('idle');
                setThinkingGlimpse('');
              } catch (e) {
                console.error('Error in text streaming:', e);
                setIsThinking(false);
                setStatus('idle');
                setThinkingGlimpse('');
                stopDraft();
                setEvents((prev) => {
                  if (id && prev.some((e: any) => typeof e?.id === 'string' && e.id === id)) return prev;
                  // Double check against last message content
                  const last = prev[prev.length - 1];
                  if (last && last.type === 'text' && String(last.data || '').trim() === String(msg.data || '').trim()) return prev;
                  return [...prev, msg];
                });
              }
            }, delay);
            return;
          }

          if (msg.type === 'run_finished') {
            if (statusRef.current !== 'answering') hideToolSoon();
          }

          if (!showToolUi && ['step_started', 'step_progress', 'step_done', 'step_failed', 'evidence_added'].includes(msg.type)) return;
          if (['step_started', 'step_progress', 'step_done', 'step_failed', 'evidence_added', 'artifact_created', 'approval_result', 'run_finished', 'run_completed', 'user_input'].includes(msg.type)) {
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

          // Reset thinking state on disconnect to avoid stuck UI
          if (isThinkingRef.current || statusRef.current !== 'idle') {
            setStatus('idle');
            setIsThinking(false);
            setActiveToolName(null);
            setToolVisible(false);
            setThinkingGlimpse('');
            clearToolTimers();
            clearDraftTimer();
          }

          const triedFallback = (ws as any)?.__triedFallback === true;
          if (allowFallback && !triedFallback && primaryUrl !== fallbackUrl) {
            try {
              const fws = new WebSocket(fallbackUrl);
              (fws as any).__triedFallback = true;
              wsRef.current = fws;
              attach(fws, false);
              return;
            } catch { }
          }

          reconnectTimerRef.current = window.setTimeout(() => connectWS(), 2000);
        };

        ws.onerror = () => {
          if (wsRef.current !== ws) return;
          setIsConnected(false);

          if (isThinkingRef.current || statusRef.current !== 'idle') {
            setStatus('idle');
            setIsThinking(false);
            setActiveToolName(null);
            setToolVisible(false);
            setThinkingGlimpse('');
            clearToolTimers();
            clearDraftTimer();
          }
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
      setSecretPrompt(null);
      lastGateSigRef.current = {};
      clearToolTimers();
      setStatus('idle');
      setActiveToolName(null);
      return;
    }

    if (prev && prev !== sessionId) {
      setEvents([]);
      setActiveRunId(null);
      setApproval(null);
      setSecretPrompt(null);
      lastGateSigRef.current = {};
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
    if (!id) return;
    try {
      setStatus('thinking');
      setIsThinking(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/sessions/${id}/history`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.events)) {
          setEvents(data.events);
        }
      }
    } catch (e) {
      console.error('Failed to load history', e);
    } finally {
      setStatus('idle');
      setIsThinking(false);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return;
    const selectedFiles = Array.from(e.target.files);

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const token = localStorage.getItem('token');

      // Upload sequentially to show progress for each
      for (const file of selectedFiles) {
        setUploadProgress(0); // Reset for next file

        const formData = new FormData();
        formData.append('file', file);
        if (sessionId) formData.append('sessionId', sessionId);

        await new Promise<void>((resolve) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', `${API}/files/upload`);

          if (token) {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          }

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const percentComplete = Math.round((event.loaded / event.total) * 100);
              setUploadProgress(percentComplete);
            }
          };

          xhr.onload = () => {
            if (xhr.status === 401) {
              handleUnauthorized();
              resolve();
              return;
            }

            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const data = JSON.parse(xhr.responseText);

                const fileData =
                  data && typeof data === 'object' && data.file && typeof data.file === 'object'
                    ? data.file
                    : data;

                const idRaw = (fileData as any)?.id ?? (fileData as any)?._id;
                if (!idRaw) {
                  console.error('Invalid file upload response:', data);
                  alert(t('uploadFailed') || `Upload failed for ${file.name}: No data returned`);
                  resolve();
                  return;
                }

                const id = String(idRaw);
                const displayName = String(
                  (fileData as any)?.originalName ??
                  (fileData as any)?.name ??
                  file.name
                );

                setAttachedFiles((prev) => {
                  if (prev.some((f) => f.id === id)) return prev;
                  return [...prev, { id, name: displayName }];
                });
                resolve();
              } catch (err) {
                console.error('Error parsing response:', err);
                alert(t('uploadFailed') || `Upload failed for ${file.name}`);
                resolve();
              }
            } else {
              alert(t('uploadFailed') || `Upload failed for ${file.name}`);
              resolve();
            }
          };

          xhr.onerror = () => {
            console.error('Network error during upload');
            alert(t('uploadError') || `Network error uploading ${file.name}`);
            // We resolve instead of reject to allow other files to try uploading
            resolve();
          };

          xhr.send(formData);
        });
      }

    } catch (err) {
      console.error(err);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // Reusable upload function for drag-drop and clipboard paste
  async function uploadFiles(files: File[]) {
    if (!files.length) return;
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const token = localStorage.getItem('token');

      for (const file of files) {
        setUploadProgress(0);

        const formData = new FormData();
        formData.append('file', file);
        if (sessionId) formData.append('sessionId', sessionId);

        await new Promise<void>((resolve) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', `${API}/files/upload`);

          if (token) {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          }

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const percentComplete = Math.round((event.loaded / event.total) * 100);
              setUploadProgress(percentComplete);
            }
          };

          xhr.onload = () => {
            if (xhr.status === 401) {
              handleUnauthorized();
              resolve();
              return;
            }

            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const data = JSON.parse(xhr.responseText);
                const fileData = data?.file || data;
                const idRaw = fileData?.id ?? fileData?._id;
                if (!idRaw) {
                  resolve();
                  return;
                }

                const id = String(idRaw);
                const displayName = String(fileData?.originalName ?? fileData?.name ?? file.name);

                // Generate preview for images
                const generatePreview = (): Promise<string | undefined> => {
                  return new Promise((resolvePreview) => {
                    if (file.type.startsWith('image/')) {
                      const reader = new FileReader();
                      reader.onload = (e) => resolvePreview(e.target?.result as string);
                      reader.onerror = () => resolvePreview(undefined);
                      reader.readAsDataURL(file);
                    } else {
                      resolvePreview(undefined);
                    }
                  });
                };

                generatePreview().then((preview) => {
                  setAttachedFiles((prev) => {
                    if (prev.some((f) => f.id === id)) return prev;
                    return [...prev, {
                      id,
                      name: displayName,
                      size: file.size,
                      type: file.type,
                      preview,
                      uploadSuccess: true
                    }];
                  });
                });
                resolve();
              } catch {
                resolve();
              }
            } else {
              resolve();
            }
          };

          xhr.onerror = () => resolve();
          xhr.send(formData);
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }

  // Drag & Drop handlers
  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if leaving the container entirely
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x <= rect.left || x >= rect.right || y <= rect.top || y >= rect.bottom) {
      setIsDragging(false);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      uploadFiles(files);
    }
  }

  // Clipboard Paste handler
  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;

    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }

    if (files.length > 0) {
      e.preventDefault();
      uploadFiles(files);
    }
  }

  // Camera Capture handler
  async function captureFromCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.playsInline = true;

      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => {
          video.play();
          resolve();
        };
      });

      // Wait a moment for camera to focus
      await new Promise((r) => setTimeout(r, 300));

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0);

      stream.getTracks().forEach((track) => track.stop());

      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
          uploadFiles([file]);
        }
      }, 'image/jpeg', 0.9);
    } catch (err: any) {
      console.error('Camera capture failed:', err);
      alert(t('cameraError', 'لا يمكن الوصول للكاميرا. تأكد من منح الإذن.'));
    }
  }

  // Screen Capture handler
  async function captureScreen() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;

      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => {
          video.play();
          resolve();
        };
      });

      // ait for frame
      await new Promise((r) => setTimeout(r, 100));

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0);

      stream.getTracks().forEach((track) => track.stop());

      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `screenshot-${Date.now()}.png`, { type: 'image/png' });
          uploadFiles([file]);
        }
      }, 'image/png');
    } catch (err: any) {
      console.error('Screen capture failed:', err);
      // User cancelled - don't show error
      if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
        alert(t('screenError', 'فشل في التقاط الشاشة.'));
      }
    }
  }

  async function run(overrideText?: string) {
    const inputText = overrideText || text;

    // ALLOW empty text if files are attached
    if (!inputText.trim() && attachedFiles.length === 0) return;

    if (isUploading) {
      alert(t('waitUpload', 'Please wait for files to finish uploading...'));
      return;
    }

    const normalizeDecision = (raw: string) =>
      String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/[\u064B-\u065F\u0670]/g, '')
        .replace(/ـ/g, '')
        .replace(/[أإآ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ؤ/g, 'و')
        .replace(/ئ/g, 'ي')
        .replace(/ة/g, 'ه');

    const isApproveText = (raw: string) => {
      const s = normalizeDecision(raw);
      return (
        s === 'موافق' ||
        s === 'موافقه' ||
        s === 'نعم' ||
        s === 'اوافق' ||
        s === 'موافقه علي' ||
        s === 'yes' ||
        s === 'y' ||
        s === 'ok' ||
        s === 'approve' ||
        s.includes('موافق')
      );
    };

    const isDenyText = (raw: string) => {
      const s = normalizeDecision(raw);
      return (
        s === 'رفض' ||
        s === 'ارفض' ||
        s === 'لا' ||
        s === 'no' ||
        s === 'n' ||
        s === 'deny' ||
        s.includes('رفض')
      );
    };

    if (secretPrompt) {
      const sid = String(secretPrompt.sessionId || '').trim();
      const key = String(secretPrompt.key || '').trim();
      const val = String(inputText || '').trim();
      if (!sid || !key || !val) return;

      setEvents(prev => [
        ...prev,
        { type: 'user_input', data: t('secretSentMask', '🔐 [token sent]'), id: Date.now().toString(), ts: Date.now(), seq: lastLiveSeqRef.current + 0.1 }
      ]);

      if (!overrideText) setText('');
      setAttachedFiles([]);

      const token = localStorage.getItem('token');
      try {
        const res = await fetch(`${API}/sessions/${encodeURIComponent(sid)}/secrets`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ key, value: val }),
        });
        if (res.status === 401) {
          handleUnauthorized();
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setSecretPrompt(null);
        lastGateSigRef.current.secret = undefined;
        setEvents(prev => [...prev, { type: 'text', data: `✅ ${t('secretSavedContinue', 'Token saved. Continuing execution.')}`, ts: Date.now() }]);
      } catch (e) {
        setEvents(prev => [...prev, { type: 'error', data: `حدث خطأ أثناء حفظ التوكن: ${String((e as any)?.message || e)}`, ts: Date.now() }]);
      }
      return;
    }

    if (approval) {
      const decision = isApproveText(inputText) ? 'approved' : isDenyText(inputText) ? 'denied' : null;
      setEvents(prev => [
        ...prev,
        { type: 'user_input', data: inputText, id: Date.now().toString(), ts: Date.now(), seq: lastLiveSeqRef.current + 0.1 }
      ]);
      if (!overrideText) setText('');
      setAttachedFiles([]);
      if (!decision) {
        setEvents(prev => [...prev, { type: 'text', data: t('approvalGateOnlyHint', 'Please type only "approve" or "deny".'), ts: Date.now() }]);
        return;
      }
      try {
        await approve(decision);
        lastGateSigRef.current.approval = undefined;
      } catch (e) {
        setEvents(prev => [...prev, { type: 'error', data: `حدث خطأ أثناء إرسال قرار الموافقة: ${String((e as any)?.message || e)}`, ts: Date.now() }]);
      }
      return;
    }

    clearToolTimers();
    setStatus('thinking');
    setIsThinking(true);
    setActiveToolName(null);
    setToolVisible(false);

    // Optimistic User Message with Files
    setEvents(prev => [
      ...prev,
      {
        type: 'user_input',
        data: { text: inputText, files: [...attachedFiles] },
        id: Date.now().toString(),
        ts: Date.now(),
        seq: lastLiveSeqRef.current + 0.1
      }
    ]);
    if (!overrideText) setText('');
    // setAttachedFiles([]) moved to after payload construction

    const isLikelyCodeFile = (v: string) => {
      const t = v.toLowerCase();
      return /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|json|md|yml|yaml|py|go|java|cs|cpp|c|h|hpp|rs|swift|kt|php|rb|sh|sql|toml|lock)(?:$|\?|\#)/i.test(t);
    };

    const extractLikelyUrl = (text: string) => {
      const t = String(text || '');
      const direct = t.match(/https?:\/\/[^\s"'<>]+/i)?.[0];
      if (direct) return direct;

      const local = t.match(/\b(?:localhost|127\.0\.0\.1)(?::\d{2,5})?(?:\/[^\s"'<>]*)?/i)?.[0];
      if (local) return local.startsWith('http://') || local.startsWith('https://') ? local : `http://${local}`;

      const www = t.match(/\bwww\.[^\s"'<>]+\b/i)?.[0];
      if (www) return `https://${www}`;

      const m = t.match(/\b[a-z0-9][a-z0-9-]{0,62}(?:\.[a-z0-9-]{1,63})+\b(?:\/[^\s"'<>]*)?/i);
      if (!m) return null;

      const candidate = m[0];
      if (isLikelyCodeFile(candidate)) return null;

      const idx = typeof (m as any).index === 'number' ? (m as any).index : -1;
      if (idx > 0) {
        const prev = t[idx - 1];
        if (prev === '/' || prev === '\\' || prev === '.' || prev === '_') return null;
      }

      const host = candidate.split('/')[0].split(':')[0];
      const tld = (host.split('.').pop() || '').toLowerCase();
      if (['ts', 'tsx', 'js', 'jsx', 'json', 'md', 'yml', 'yaml', 'py', 'go', 'java', 'cs', 'rs', 'php', 'rb', 'sh', 'sql', 'toml', 'lock'].includes(tld)) return null;

      return `https://${candidate}`;
    };

    const needsBrowserForText = (raw: string) => {
      const s = String(raw || '').trim();
      if (!s) return false;

      const hasUrl = Boolean(extractLikelyUrl(s));
      if (hasUrl) return true;

      const explicitBrowser = /(\b(browser|web|preview)\b|متصفح|داخل المتصفح|معاينة|المعاينة)/i.test(s);
      if (explicitBrowser) return true;

      const openKeyword = /(افتح|افتحي|افتحوا|اذهب|زيارة|open|go to|visit)/i.test(s);
      const githubKeyword = /(github|جيتهاب|كتهاب|كيتهاب)/i.test(s);
      const analysisKeyword = /(كود|code|repo|repository|مستودع|ملفات|files|اختبر|تحقق|راجع|audit|lint|build|typecheck|تحليل)/i.test(s);

      if (openKeyword && githubKeyword && analysisKeyword) return false;

      const isFileOp = /(file|folder|directory|ملف|مجلد|مسار|path|terminal|command|أمر|ترمينال)/i.test(s);
      if (openKeyword && isFileOp) return false;

      if (openKeyword) return true;

      const knownSites = /(youtube|يوتيوب|google|جوجل|facebook|فيسبوك|x\.com|twitter|تويتر|instagram|انستغرام)/i.test(s);
      if (knownSites) return true;

      return false;
    };

    const ensureBrowserSession = async () => {
      const sid = String(sessionId || '').trim();
      if (!sid) throw new Error('sessionId_required');
      const b = String(browserSessionId || '').trim();
      if (b) return { sessionId: b };
      return { sessionId: `browser:${sid}` };
    };

    // Optimistic update removed (duplicate)

    const token = localStorage.getItem('token');
    try {
      let effectiveBrowserSessionId = browserSessionId;
      // Allow auto-open in chat mode too
      if ((sessionKind === 'agent' || sessionKind === 'chat') && !effectiveBrowserSessionId && needsBrowserForText(inputText)) {
        const urlMatch = inputText.match(/https?:\/\/[^\s"'<>]+/i);
        const directUrl = urlMatch?.[0];
        const extractedUrl = extractLikelyUrl(inputText);
        const wantsYoutube = /youtube|يوتيوب/i.test(inputText);
        const wantsGithub = /(github|جيتهاب|كتهاب|كيتهاب)/i.test(inputText);
        const wantsPreview = /(preview|معاينة|المعاينة|عرض الموقع|show site)/i.test(inputText);
        const normalizePreviewUrl = (u: string) => {
          try {
            const parsed = new URL(u);
            const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
            const appIsLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            if (wantsPreview && isLocal && !appIsLocal) {
              const base = new URL(window.location.origin);
              parsed.protocol = base.protocol;
              parsed.host = base.host;
              return parsed.toString();
            }
          } catch { }
          return u;
        };

        let previewCandidate =
          typeof previewBaseUrl === 'string' && previewBaseUrl.trim()
            ? previewBaseUrl.trim()
            : window.location.origin;
        try {
          previewCandidate = new URL(previewCandidate).toString();
        } catch {
          previewCandidate = window.location.origin;
        }

        const desiredUrl = normalizePreviewUrl(
          directUrl ||
          extractedUrl ||
          (wantsPreview ? previewCandidate : wantsYoutube ? 'https://www.youtube.com' : wantsGithub ? 'https://github.com' : 'https://www.google.com')
        );
        try {
          const opened = await ensureBrowserSession();
          effectiveBrowserSessionId = opened.sessionId;

          const token2 = localStorage.getItem('token');
          await fetch(`${API}/browser/run`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token2 ? { Authorization: `Bearer ${token2}` } : {}),
            },
            body: JSON.stringify({ sessionId: opened.sessionId, instructionText: `افتح ${desiredUrl}`, mode: 'execute' }),
          }).catch(() => null);
        } catch (e: any) {
          const msg = String(e?.message || e || 'فشل فتح المتصفح');
          setEvents(prev => [...prev, { type: 'error', data: msg, ts: Date.now() }]);
          const sid = String(sessionId || '').trim();
          const looksLikeUnauthorizedWorker = /worker_error=401\b|unauthorized\b|غير مصرح/i.test(msg);
          const looksLikeUnreachableWorker = /worker_unhealthy\b|ECONNREFUSED\b|fetch failed\b/i.test(msg);
          if (sid && (looksLikeUnauthorizedWorker || looksLikeUnreachableWorker)) {
            pendingBrowserRetryRef.current = { url: desiredUrl, sessionId: sid };
            if (looksLikeUnreachableWorker) {
              // Legacy prompt removed
            } else {
              // Legacy prompt removed
            }
          }
        }
      }

      const pickFirstValidProvider = () => {
        for (const [k, p] of Object.entries(providers)) {
          if (String(p?.apiKey || '').trim() && p?.isConnected) return k;
        }
        return 'openai';
      };

      let providerToSend = activeProvider;
      let providerCfgToSend = providers[providerToSend];
      if (!String(providerCfgToSend?.apiKey || '').trim() || !providerCfgToSend?.isConnected) {
        const valid = pickFirstValidProvider();
        providerToSend = valid;
        providerCfgToSend = providers[valid];
      }

      const payload: any = {
        type: 'run_start',
        text: inputText,
        sessionId,
        browserSessionId: effectiveBrowserSessionId || undefined,
        fileIds: attachedFiles.map(f => f.id),
        provider: providerToSend,
        model: providerCfgToSend?.model,
        apiKey: providerCfgToSend?.apiKey,
        baseUrl: providerCfgToSend?.baseUrl
      };
      if (systemInstructions && systemInstructions.trim()) {
        payload.systemInstructions = systemInstructions.trim();
      }
      console.log('[DEBUG-SEND] attachedFiles:', attachedFiles);
      console.log('[DEBUG-SEND] payload.fileIds:', payload.fileIds);

      const res = await fetch(`${API}/runs/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      const raw = await res.text();
      let data: any = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        data = null;
      }
      if (res.status === 401) {
        handleUnauthorized();
        throw new Error(t('unauthorized', 'Unauthorized'));
      }
      if (!res.ok) {
        const rawText = String(raw || '');
        const isBadGateway =
          res.status === 502 ||
          /<title>\s*502\b/i.test(rawText) ||
          /\b502\b[\s\S]{0,40}bad gateway/i.test(rawText) ||
          /\bbad gateway\b/i.test(rawText);
        const msg = isBadGateway
          ? `${t('httpBadGateway', 'Server temporarily unavailable (502 Bad Gateway).')}\n${t('httpBadGatewayHint', 'The backend service is unreachable behind Nginx.')}`
          : String(data?.error || rawText || t('httpRequestFailed', { status: res.status }) || `HTTP ${res.status}`);
        throw new Error(String(msg).slice(0, 700));
      }

      if (typeof data?.runId === 'string' && data.runId.trim()) {
        const rid = data.runId.trim();
        setActiveRunId(rid);
        ensureTaskBar(rid, { visible: true, analyzing: true });
      }
      if (data?.sessionId && !sessionId && onSessionCreated) {
        onSessionCreated(data.sessionId);
      }

      if (data?.blocked && data?.secretRequired && data?.sessionId && data?.secret?.key) {
        const sid = String(data.sessionId || '').trim();
        const key = String(data.secret.key || '').trim();
        if (sid && key) {
          const runId = typeof data?.runId === 'string' ? data.runId : '';
          const sig = `${sid}:${key}:${runId}`;
          if (lastGateSigRef.current.secret === sig) return;
          lastGateSigRef.current.secret = sig;
          setSecretPrompt({
            sessionId: sid,
            runId: typeof data?.runId === 'string' ? data.runId : undefined,
            provider: typeof data?.secret?.provider === 'string' ? data.secret.provider : undefined,
            key,
            label: typeof data?.secret?.label === 'string' ? data.secret.label : undefined,
          });
          const label = typeof data?.secret?.label === 'string' && data.secret.label.trim() ? data.secret.label.trim() : key;
          const lines = [
            t('secretGateTitle', 'A token/key is required to continue.'),
            `- ${t('secretGateRequired', 'Required')}: ${label}`,
            '',
            t('secretGateInstruction', 'Paste the token here and send it as a single message.'),
            t('secretGatePrivacy', 'The token will not be shown after sending.'),
          ];
          setEvents(prev => [...prev, { type: 'text', data: lines.join('\n'), ts: Date.now() }]);
        }
      }

      if (!isConnected && data?.result) {
        const r = data.result;
        if (r?.output) {
          const txt = typeof r.output === 'string' ? r.output : JSON.stringify(r.output);
          setEvents(prev => [...prev, { type: 'text', data: txt }]);
        }
      }
      setAttachedFiles([]);
    } catch (e) {
      console.error(e);
      const msg = String((e as any)?.message || e || '').trim();
      const finalMsg = msg ? `${t('error')}: ${msg}` : t('error');
      setEvents(prev => [...prev, { type: 'error', data: finalMsg }]);
      if (!overrideText) setText(inputText);
      clearToolTimers();
      clearDraftTimer();
      setDraftActive(false);
      setDraftText('');
      setAttachedFiles([]);
      setStatus('idle');
      setIsThinking(false);
      setActiveToolName(null);
      setToolVisible(false);
      setThinkingGlimpse('');
    }
  }

  async function stopCurrentRun() {
    const token = (() => {
      try {
        return localStorage.getItem('token');
      } catch {
        return null;
      }
    })();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const rid = String(activeRunId || '').trim();
    const sid = String(sessionId || '').trim();
    const bid = String(browserSessionId || '').trim();
    const pendingBid = String(pendingBrowserRetryRef.current?.sessionId || '').trim();

    const reqs: Array<Promise<any>> = [];
    if (rid) {
      reqs.push(
        fetch(`${API}/runs/stop`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ runId: rid, ...(sid ? { sessionId: sid } : {}) }),
        }).catch(() => null),
      );
    }
    if (bid) {
      reqs.push(
        fetch(`${API}/browser/stop`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ sessionId: bid }),
        }).catch(() => null),
      );
    } else if (pendingBid) {
      reqs.push(
        fetch(`${API}/browser/stop`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ sessionId: pendingBid }),
        }).catch(() => null),
      );
    }

    if (reqs.length) {
      try {
        await Promise.allSettled(reqs);
      } catch { }
    }

    pendingBrowserRetryRef.current = null;
    setApproval(null);
    setSecretPrompt(null);
    clearToolTimers();
    clearDraftTimer();
    setDraftActive(false);
    setDraftText('');
    stopDraft();
    setStatus('idle');
    setIsThinking(false);
    setActiveToolName(null);
    setToolVisible(false);
    setThinkingGlimpse('');
  }

  async function approve(decision: 'approved' | 'denied') {
    if (!approval) return;
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/approvals/${approval.id}/decision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ decision }),
    });
    if (res.status === 401) {
      handleUnauthorized();
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
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

      if (res.status === 401) {
        handleUnauthorized();
        throw new Error(t('unauthorized', 'Unauthorized'));
      }
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
      setActiveProvider('openai');
    }
  };

  const handleDisconnect = async (key: string) => {
    if (!confirm('Are you sure you want to disconnect?')) return;

    setProviders(prev => ({
      ...prev,
      [key]: { ...prev[key], isConnected: false, isVerifying: false }
    }));

    try {
      const token = localStorage.getItem('token');
      await fetch(`${API}/providers/clear`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        }
      });
    } catch (e) {
      console.error('Failed to clear provider on backend', e);
    }
  };

  const formatStepDisplayName = (name: string) => {
    if (name === 'plan') return t('tools.plan');
    if (name.startsWith('planning_step_')) {
      const n = name.replace('planning_step_', '');
      return t('planNumber', { n });
    }
    if (name.startsWith('execute:')) {
      const tool = name.slice('execute:'.length).trim();
      return t('executePrefix', { tool: tool || t('toolCategoryGeneric') });
    }
    return name;
  };

  const getToolNameFromStep = (name: string) => {
    if (!name.startsWith('execute:')) return null;
    const tool = name.slice('execute:'.length).trim();
    return tool || null;
  };

  const formatValue = (value: any, maxChars = 1600, opts?: { technical?: boolean }) => {
    const truncate = (str: string) => {
      if (str.length <= maxChars) return str;
      return `${str.slice(0, maxChars)}\n…`;
    };

    const looksLikeBrowserSummary = (v: any) => {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
      if (typeof (v as any).site !== 'string') return false;
      const hasAnyField =
        typeof (v as any).url === 'string' ||
        typeof (v as any).title === 'string' ||
        typeof (v as any).pageType === 'string' ||
        typeof (v as any).hasScreenshot === 'boolean' ||
        typeof (v as any).redactionEnabled === 'boolean' ||
        typeof (v as any).domLength === 'number';
      return hasAnyField;
    };

    const formatBrowserSummary = (v: any) => {
      const site = typeof v.site === 'string' && v.site.trim() ? v.site.trim() : t('browserSummaryUnknownSite');
      const title = typeof v.title === 'string' && v.title.trim() ? v.title.trim() : '';
      const url = typeof v.url === 'string' && v.url.trim() ? v.url.trim() : '';
      const pageType = typeof v.pageType === 'string' ? v.pageType.trim().toLowerCase() : '';
      const isLogin = pageType === 'login';
      const hasScreenshot = Boolean(v.hasScreenshot);
      const redactionEnabled = typeof v.redactionEnabled === 'boolean' ? v.redactionEnabled : undefined;

      const lines: string[] = [];
      let header = `${t('browserSummaryPrefix')}: ${site}`;
      if (title) header += ` — ${title}`;
      if (isLogin) header += ` (${t('browserSummaryPageTypeLogin')})`;
      lines.push(header);

      if (url) lines.push(`${t('browserSummaryUrlLabel')}: ${url}`);
      if (hasScreenshot) lines.push(t('browserSummaryScreenshotTaken'));
      if (typeof redactionEnabled === 'boolean') {
        lines.push(`${t('browserSummaryRedactionLabel')}: ${redactionEnabled ? t('yes') : t('no')}`);
      }

      return lines.join('\n');
    };

    const extractFirstJsonObject = (s: string) => {
      const start = s.indexOf('{');
      if (start < 0) return null;
      const stack: string[] = [];
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
        if (ch === '{') {
          stack.push('}');
          continue;
        }
        if (ch === '}') {
          if (!stack.length) return null;
          stack.pop();
          if (!stack.length) {
            return { start, jsonText: s.slice(start, i + 1), end: i + 1 };
          }
        }
      }
      return null;
    };

    try {
      const technical = opts?.technical === true;
      if (!technical && looksLikeBrowserSummary(value)) return truncate(formatBrowserSummary(value));

      const str =
        typeof value === 'string'
          ? (() => {
            if (!technical) {
              const m = extractFirstJsonObject(value);
              if (m) {
                try {
                  const parsed = JSON.parse(m.jsonText);
                  if (looksLikeBrowserSummary(parsed)) {
                    const formatted = formatBrowserSummary(parsed);
                    return `${value.slice(0, m.start)}${formatted}${value.slice(m.end)}`.trim();
                  }
                } catch { }
              }
            }
            return value;
          })()
          : value == null
            ? ''
            : JSON.stringify(value, null, 2);
      return truncate(str);
    } catch {
      const str = String(value ?? '');
      return truncate(str);
    }
  };

  const toolUi = (toolName: string) => {
    const lowerTool = toolName.toLowerCase();
    if (lowerTool.includes('web_search') || lowerTool.includes('knowledge_search') || lowerTool.includes('deep_research')) {
      return { label: t('toolCategorySearch'), Icon: Search, color: 'var(--accent-primary)', bg: 'rgba(var(--accent-primary-rgb),0.08)', border: 'rgba(var(--accent-primary-rgb),0.35)' };
    }
    if (lowerTool.includes('file_read') || lowerTool.includes('read_file_tree') || lowerTool === 'ls' || lowerTool.includes('grep_search')) {
      return { label: t('toolCategoryRead'), Icon: FileText, color: 'var(--accent-secondary)', bg: 'rgba(var(--accent-secondary-rgb),0.08)', border: 'rgba(var(--accent-secondary-rgb),0.35)' };
    }
    if (lowerTool.includes('file_edit') || lowerTool.includes('file_write') || lowerTool.includes('scaffold_project')) {
      return { label: t('toolCategoryWrite'), Icon: FileCode, color: '#22c55e', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.35)' };
    }
    if (lowerTool.includes('shell_execute') || lowerTool.includes('install_dependencies') || lowerTool.includes('check_syntax')) {
      return { label: t('toolCategoryShell'), Icon: Terminal, color: 'var(--accent-secondary)', bg: 'rgba(var(--accent-secondary-rgb),0.08)', border: 'rgba(var(--accent-secondary-rgb),0.35)' };
    }
    if (lowerTool.includes('browser_')) {
      return { label: t('toolCategoryBrowse'), Icon: Eye, color: 'var(--accent-primary)', bg: 'rgba(var(--accent-primary-rgb),0.08)', border: 'rgba(var(--accent-primary-rgb),0.35)' };
    }
    if (lowerTool.includes('image_generate')) {
      return { label: t('toolCategoryImage'), Icon: ImageIcon, color: 'var(--accent-secondary)', bg: 'rgba(var(--accent-secondary-rgb),0.08)', border: 'rgba(var(--accent-secondary-rgb),0.35)' };
    }
    return { label: t('toolCategoryGeneric'), Icon: Cpu, color: 'var(--text-primary)', bg: 'rgba(255,255,255,0.04)', border: 'var(--border-color)' };
  };

  const [expandedRuns, setExpandedRuns] = useState<Record<string, boolean>>({});
  const [runExpandMode, setRunExpandMode] = useState<Record<string, 'auto' | 'manual'>>({});
  const [expandedStepKeys, setExpandedStepKeys] = useState<Record<string, boolean>>({});
  const [showTechnicalByRunId, setShowTechnicalByRunId] = useState<Record<string, boolean>>({});

  const formatSystemLogs = (lines: string[]) => {
    const flat = Array.isArray(lines) ? lines : [];
    const last = flat.slice(Math.max(0, flat.length - 200));
    return last
      .map((x) => {
        const s = String(x ?? '');
        if (s.length <= 1400) return s;
        return `${s.slice(0, 1400)}…`;
      })
      .join('\n')
      .trim();
  };

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

  const isSystemNoticeText = (raw: any) => {
    const s = typeof raw === 'string' ? raw.trim() : String(raw ?? '').trim();
    if (!s) return false;
    if (s.length > 420) return false;
    if (/^\s*(⚠️|ℹ️|✅|🔐|🚫|⛔|🛡️)/.test(s)) return true;
    if (/^\s*(مطلوب|يلزم|تنبيه|تحذير)\b/.test(s)) return true;
    if (/token saved|secret required|authentication failed/i.test(s)) return true;
    return false;
  };

  const attachScreenshots = useMemo(() => {
    try {
      const raw = localStorage.getItem('ui.chat.attachScreenshots');
      if (raw == null) return false;
      const s = String(raw).trim().toLowerCase();
      return ['1', 'true', 'yes', 'y', 'on'].includes(s);
    } catch {
      return false;
    }
  }, []);

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
      else if (type === 'text') {
        const cleaned = cleanAssistantText(e.data?.text || e.data);
        if (cleaned) out.push({ kind: 'text', key: `text:${idx}`, e, idx });
      }
      else if (type === 'error') out.push({ kind: 'error', key: `error:${idx}`, e, idx });
      else if (type === 'artifact_created') out.push({ kind: 'artifact', key: `artifact:${idx}`, e, idx });
    }

    return out;
  }, [sortedEvents]);

  const activeTaskBar = useMemo(() => {
    if (!showFloatingTaskbar) return null;
    const rid = activeRunId ? activeRunId.trim() : '';
    if (!rid) return null;
    return taskBarByRunId[rid] || null;
  }, [activeRunId, taskBarByRunId]);

  return (
    <div className="composer">
      <div className="events" ref={eventsScrollRef}>
        <div className="events-content" ref={eventsContentRef}>
          {events.length === 0 && (
            <div className="empty-state-hero">
              <div className="hero-logo-container">
                <div className="hero-logo-glow"></div>
                <div className="hero-logo-content">
                  <div className="brand-mark brand-mark-hero" aria-hidden="true" />
                </div>
              </div>

              <h1 className="hero-title">
                <span className="hero-title-main">Build Faster.</span>
                <span className="hero-title-sub">Think Deeper.</span>
              </h1>

              <p className="hero-subtitle">
                Your elite autonomous pair programmer is ready to engineer the future.
              </p>


              {/* Joe's Refined Premium Logo */}
              <div className="hero-elite-logo-container" style={{ marginTop: 40, marginBottom: 20 }}>
                <EliteLogo size={160} />
              </div>


            </div>
          )}

          <AnimatePresence mode="popLayout">
            {renderItems.map((item) => {
              if (item.kind === 'activity') {
                if (!showToolUi) return null;
                const rid = item.runId || 'no-run';
                const visibleSteps = stepsByRunId.get(rid) || [];
                const logs = logsByRunId.get(rid) || [];

                const status = (() => {
                  if (visibleSteps.some((s: any) => s?.status === 'running')) return 'running';
                  if (visibleSteps.some((s: any) => s?.status === 'failed')) return 'failed';
                  if (visibleSteps.length > 0 || logs.length > 0) return 'done';
                  return 'idle';
                })();

                const expanded = !!expandedRuns[rid];
                const toggleRun = () => {
                  setRunExpandMode((prev) => ({ ...prev, [rid]: 'manual' }));
                  setExpandedRuns((prev) => ({ ...prev, [rid]: !prev[rid] }));
                };

                const totalDuration = visibleSteps.reduce((acc: number, s: any) => acc + (typeof s?.duration === 'number' ? s.duration : 0), 0);
                const failedCount = visibleSteps.filter((s: any) => s?.status === 'failed').length;
                const doneCount = visibleSteps.filter((s: any) => s?.status === 'done').length;

                return (
                  <AgentActivity
                    key={item.key}
                    runId={rid}
                    steps={visibleSteps}
                    status={status}
                    logs={logs}
                    expanded={expanded}
                    onToggle={toggleRun}
                    showTechnical={!!showTechnicalByRunId[rid]}
                    onToggleTechnical={() => setShowTechnicalByRunId((prev) => ({ ...prev, [rid]: !prev[rid] }))}
                  />
                );
              }

              if (item.kind === 'user') return <ChatBubble key={item.key} event={item.e} isUser={true} variant="user" ts={item.e?.ts} />;

              if (item.kind === 'error') {
                const msg = typeof item.e?.data === 'string' ? item.e.data : String(item.e?.data ?? '');
                return (
                  <ChatBubble
                    key={item.key}
                    event={{ data: { text: `⚠️ ${msg}` } }}
                    isUser={false}
                    variant="system"
                    tone="danger"
                    ts={item.e?.ts}
                  />
                );
              }

              if (item.kind === 'text') {
                let content = item.e?.data;
                try {
                  if (typeof content === 'string' && (content.startsWith('{') || content.startsWith('['))) {
                    const p = JSON.parse(content);
                    content = p.text || p.output || content;
                  }
                } catch { }

                const cleaned = cleanAssistantText(content);
                if (!cleaned) return null;
                const system = isSystemNoticeText(cleaned);
                return (
                  <ChatBubble
                    key={item.key}
                    event={{ data: { text: cleaned } }}
                    isUser={false}
                    variant={system ? 'system' : 'ai'}
                    tone={system ? 'info' : 'normal'}
                    ts={item.e?.ts}
                    onOptionClick={(q) => run(q)}
                    userPicture={userPicture}
                  />
                );
              }

              if (item.kind === 'artifact') {
                const e = item.e;
                const href = e?.data?.href;
                const nameStr = String(e?.data?.name || '');
                const hrefStr = typeof href === 'string' ? href : '';
                const looksLikeBrowserScreenshot =
                  nameStr.trim().toLowerCase() === 'screenshot' || /\/artifacts\/(browser-|health-browser-)/i.test(hrefStr);
                if (!attachScreenshots && looksLikeBrowserScreenshot) return null;
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
            {status === 'answering' && draftActive && draftText ? (
              <div data-joe-draft="1">
                <ChatBubble key="draft:typing" event={{ data: { text: draftText } }} isUser={false} variant="ai" ts={Date.now()} isTyping={true} />
              </div>
            ) : null}
          </AnimatePresence>

          {isThinking && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="message-row joe"
            >
              <div className="px-3 py-2" dir="auto">
                {/* Thinking Header with Glow */}
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent-primary)', boxShadow: '0 0 8px rgba(var(--accent-primary-rgb), 0.6)' }}></div>
                  <div className="text-[11px] font-medium tracking-wide" style={{ color: 'rgba(var(--accent-primary-rgb), 0.9)', textShadow: '0 0 10px rgba(var(--accent-primary-rgb), 0.3)' }}>
                    {thinkingGlimpse || t('thinkingGlimpseUnderstand', 'جاري التنفيذ…')}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      {null}



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
                        background: p.isConnected ? 'var(--accent-success)' : (p.apiKey ? 'var(--accent-secondary)' : '#71717a'),
                        boxShadow: p.isConnected ? '0 0 8px rgba(34, 197, 94, 0.6)' : p.apiKey ? '0 0 8px rgba(var(--accent-secondary-rgb), 0.45)' : 'none'
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
                            onChange={(e) => {
                              const newKey = e.target.value;
                              setProviders(prev => ({ ...prev, [activeProvider]: { ...prev[activeProvider], apiKey: newKey, isConnected: false } }));
                              // Send API key to server for OpenAI
                              if (activeProvider === 'openai' && newKey.trim().startsWith('sk-')) {
                                fetch(`${API}/providers/openai/key`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ apiKey: newKey.trim() })
                                }).catch(err => console.error('Failed to send API key to server:', err));
                              }
                            }}
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
                          onClick={() => {
                            deleteProviderKey(activeProvider);
                            // Clear API key on server for OpenAI
                            if (activeProvider === 'openai') {
                              fetch(`${API}/providers/clear`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' }
                              }).catch(err => console.error('Failed to clear API key on server:', err));
                            }
                          }}
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

                    <div style={{ marginBottom: 20 }}>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
                        تعليمات النظام (خاصة بوضع Auto والموديلات المجانية)
                      </label>
                      <textarea
                        value={systemInstructions}
                        onChange={(e) => setSystemInstructions(e.target.value)}
                        placeholder="مثال: رد دائماً بالعربية الفصحى، لا تستخدم أكواد خطيرة، التزم بخطوات واضحة."
                        rows={3}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-secondary)',
                          color: 'var(--text-primary)',
                          outline: 'none',
                          fontSize: 13,
                          resize: 'vertical'
                        }}
                      />
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

                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDisconnect(activeProvider);
                      }}
                      disabled={!providers[activeProvider].isConnected}
                      title="Disconnect Provider"
                      style={{
                        padding: '12px 16px', borderRadius: 8, border: '1px solid var(--border-color)',
                        background: 'var(--bg-secondary)',
                        color: providers[activeProvider].isConnected ? '#ef4444' : 'var(--text-muted)',
                        fontSize: 14, fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        opacity: !providers[activeProvider].isConnected ? 0.5 : 1
                      }}
                    >
                      <Power size={18} />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {secretPrompt && (
        <div className="modal">
          <div className="panel" style={{ width: 400, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ padding: 10, borderRadius: 12, background: 'rgba(var(--accent-secondary-rgb), 0.1)', color: 'var(--accent-secondary)' }}>
                <Lock size={24} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{t('secretGateTitle', 'Authentication Required')}</h3>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>GitHub / Service Token</div>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 14, color: 'var(--text-primary)', marginBottom: 8, lineHeight: 1.5 }}>
                {t('secretGateInstruction', 'Please enter your Personal Access Token to continue.')}
              </p>
              {secretPrompt.reason && (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', background: 'var(--bg-card)', padding: 8, borderRadius: 6, marginBottom: 12 }}>
                  {secretPrompt.reason}
                </div>
              )}
              <div style={{ position: 'relative' }}>
                <input
                  type="password"
                  autoFocus
                  placeholder="ghp_xxxxxxxxxxxx"
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter') {
                      const val = (e.target as HTMLInputElement).value;
                      if (val) {
                        const sid = secretPrompt.sessionId;
                        const key = secretPrompt.key;
                        const provider = secretPrompt.provider;
                        setSecretPrompt(null);
                        setEvents(prev => [...prev, { type: 'user_input', data: '🔐 [Token Provided]', ts: Date.now() }]);

                        const token = localStorage.getItem('token');
                        try {
                          const res = await fetch(`${API}/sessions/${encodeURIComponent(sid)}/secrets`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                            body: JSON.stringify({ key, value: val, ...(provider ? { provider } : {}) }),
                          });
                          if (res.status === 401) {
                            handleUnauthorized();
                            return;
                          }
                          if (!res.ok) throw new Error(`HTTP ${res.status}`);
                          setEvents(prev => [...prev, { type: 'text', data: '✅ Token verified. Resuming operation...', ts: Date.now() }]);
                          pendingBrowserRetryRef.current = null;
                        } catch (err) {
                          setEvents(prev => [...prev, { type: 'error', data: 'Failed to save token.', ts: Date.now() }]);
                        }
                      }
                    }
                  }}
                  style={{
                    width: '100%', padding: '12px', paddingLeft: 40, borderRadius: 8,
                    background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)',
                    color: '#fff', outline: 'none', fontSize: 14, fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
                  }}
                />
                <Key size={16} style={{ position: 'absolute', left: 12, top: 14, color: 'var(--text-secondary)' }} />
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 6, alignItems: 'center' }}>
                <ShieldCheck size={12} />
                <span>Your token is sent securely and not stored permanently.</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setSecretPrompt(null)}
                style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="composer-footer">
        <AnimatePresence>
          {showFloatingTaskbar && activeTaskBar?.visible ? (
            <motion.div
              key="taskbar-floating"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.18 }}
              className="taskbar-floating"
              dir="auto"
            >
              <div className="taskbar-title">
                {(() => {
                  const total = activeTaskBar.items.length;
                  const done = activeTaskBar.items.filter((x) => x.status === 'done').length;
                  if (total === 0) return 'عملية التفكير';
                  return `عملية التفكير ${done}/${total} done`;
                })()}
              </div>
              <div className="taskbar-items">
                {activeTaskBar.analyzing && activeTaskBar.items.length === 0 ? (
                  <div className="task-chip running">
                    <Loader2 size={14} className="spin" />
                    <span>جارٍ تحليل التعليمات…</span>
                  </div>
                ) : null}
                {activeTaskBar.items.map((it) => (
                  <div
                    key={it.id}
                    className={`task-chip ${it.status}`}
                    title={it.label}
                  >
                    {it.status === 'done' ? (
                      <CheckCircle2 size={14} />
                    ) : it.status === 'failed' ? (
                      <XCircle size={14} />
                    ) : it.status === 'running' ? (
                      <Loader2 size={14} className="spin" />
                    ) : (
                      <Clock size={14} />
                    )}
                    <span className="task-chip-text">{it.label}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
        <div
          className={`input-area ${isDragging ? 'drag-active' : ''}`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {/* Drag overlay */}
          {isDragging && (
            <div className="drop-zone-overlay">
              <div className="drop-zone-content">
                <Paperclip size={32} />
                <span>{t('dropFilesHere', 'أفلت الملفات هنا')}</span>
              </div>
            </div>
          )}
          <div className="input-container">
            {(attachedFiles.length > 0 || isUploading) && (
              <div className="attached-files">
                {attachedFiles.map((file, i) => (
                  <div
                    key={file.id || i}
                    className={`attached-file-chip ${file.uploadSuccess ? 'upload-success' : ''} ${file.preview ? 'has-preview' : ''}`}
                  >
                    {/* Image Preview or Icon */}
                    {file.preview ? (
                      <img
                        src={file.preview}
                        alt={file.name}
                        className="file-thumbnail"
                      />
                    ) : file.type?.startsWith('video/') ? (
                      <VideoIcon size={16} className="file-type-icon video" />
                    ) : file.type === 'application/pdf' ? (
                      <FileText size={16} className="file-type-icon pdf" />
                    ) : file.type?.includes('spreadsheet') || file.type?.includes('csv') || file.type?.includes('excel') ? (
                      <FileCode size={16} className="file-type-icon excel" />
                    ) : (
                      <Paperclip size={14} className="file-type-icon default" />
                    )}

                    {/* File Info */}
                    <div className="file-info">
                      <span className="file-name">{file.name}</span>
                      {file.size && (
                        <span className="file-size">
                          {file.size < 1024
                            ? `${file.size} B`
                            : file.size < 1024 * 1024
                              ? `${(file.size / 1024).toFixed(1)} KB`
                              : `${(file.size / (1024 * 1024)).toFixed(1)} MB`
                          }
                        </span>
                      )}
                    </div>

                    {/* Success indicator */}
                    {file.uploadSuccess && (
                      <CheckCircle2 size={14} className="upload-success-icon" />
                    )}

                    {/* Remove button */}
                    <button
                      type="button"
                      onClick={() => setAttachedFiles(prev => prev.filter((_, idx) => idx !== i))}
                      className="remove-file-btn"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}

                {isUploading && (
                  <div className="uploading-indicator">
                    <div className="uploading-content">
                      <Loader2 size={16} className="spin uploading-spinner" />
                      <span className="uploading-text">
                        {t('uploading', 'جاري الرفع')}
                      </span>
                      <span className="uploading-progress">{uploadProgress}%</span>
                    </div>
                    <div className="uploading-bar-container">
                      <div
                        className="uploading-bar-fill"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
            <textarea
              className="main-input"
              ref={(el) => {
                if (el) {
                  // Auto-resize logic
                  el.style.height = 'auto'; // Reset height to recalculate
                  el.style.height = Math.min(el.scrollHeight, 300) + 'px'; // Set new height capped at max
                }
              }}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                // Trigger resize
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 300) + 'px';
              }}
              rows={1}
              onPaste={handlePaste}
              placeholder={t('inputPlaceholder')}
              dir="auto"
              disabled={!!approval}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (isUploading) return;
                  if (status !== 'idle' || !!approval || !!secretPrompt) {
                    stopCurrentRun();
                    return;
                  }
                  run();
                }
              }}
            />



            <div className="input-actions">
              {/* [UI] Enhanced Status Indicator */}
              <div
                className="connection-status"
                title={isConnected ? t('connected') : t('connecting')}
              >
                <div
                  className={`status-dot ${isConnected ? 'connected' : ''}`}
                />
                <span className="status-text hide-mobile">
                  {activeProvider === 'auto' ? 'Auto' : activeProvider}
                </span>
              </div>

              <div className="right-actions">
                <GitHubConnectModal
                  isOpen={showGithubModal}
                  onClose={() => setShowGithubModal(false)}
                  onConnected={(repo) => {
                    setEvents(prev => [...prev, {
                      type: 'system',
                      data: { text: `✅ Successfully connected to **${repo}**. The workspace has been updated.` },
                      duration: 0
                    }]);
                  }}
                />
                <button
                  className={`action-btn provider-btn ${!providers[activeProvider]?.isConnected ? 'is-disconnected' : ''}`}
                  onClick={() => setShowProviders(true)}
                  title={`${t('aiProviders', 'AI Providers')}: ${providers[activeProvider]?.name || activeProvider}`}
                >
                  <Cpu size={16} />
                  <span className="provider-label">
                    {(activeProvider === 'openai' ? 'OpenAI' : activeProvider.charAt(0).toUpperCase() + activeProvider.slice(1)).slice(0, 8)}
                  </span>
                </button>
                <input
                  type="file"
                  multiple
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                <button
                  className="action-btn"
                  onClick={() => fileInputRef.current?.click()}
                  title={t('attachFile') || "Attach file"}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <div className="relative flex items-center justify-center w-5 h-5">
                      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                        <path
                          className="text-gray-400/20"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="text-blue-500 transition-all duration-200 ease-out"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="4"
                          strokeDasharray={`${uploadProgress}, 100`}
                        />
                      </svg>
                    </div>
                  ) : <Paperclip size={20} />}
                </button>
                <button
                  className="action-btn"
                  onClick={() => setShowGithubModal(true)}
                  title="Connect to GitHub Repo"
                >
                  <Github size={20} />
                </button>
                <button
                  className={`action-btn ${isVoiceMode ? 'active' : ''}`}
                  onClick={() => setIsVoiceMode(!isVoiceMode)}
                  title="Voice Mode"
                >
                  {isVoiceMode ? <Mic size={20} /> : <MicOff size={20} />}
                </button>
                <button
                  className={`send-btn ${status !== 'idle' || !!approval || !!secretPrompt ? 'is-busy' : ''}`}
                  onClick={() => {
                    if (status !== 'idle' || !!approval || !!secretPrompt) {
                      stopCurrentRun();
                      return;
                    }
                    if (isUploading) return;
                    run();
                  }}
                  disabled={status !== 'idle' || !!approval || !!secretPrompt ? false : (isUploading || !text.trim() || !!approval)}
                  title={status !== 'idle' || !!approval || !!secretPrompt ? (t('stop') || 'Stop') : t('send')}
                >
                  {status !== 'idle' || !!approval || !!secretPrompt ? <Square size={18} /> : <ArrowUp size={20} />}
                </button>
              </div>
            </div>
          </div>

          {isVoiceMode && (
            <div className="voice-controls">
              <button
                className={`voice-record-btn ${isListening ? 'listening' : ''}`}
                onClick={toggleListening}
              >
                {isListening ? <Loader2 className="spin" size={24} /> : <Mic size={24} />}
              </button>
              <div className="voice-info">
                <span className="voice-status">{isListening ? 'Listening...' : 'Tap to Speak'}</span>
                <span className="voice-lang">Arabic (SA) / English (US)</span>
              </div>

              <button className="action-btn" title="Stop Speaking" onClick={stopSpeaking} disabled={!isSpeaking} style={{ marginLeft: 'auto', opacity: isSpeaking ? 1 : 0.3 }}>
                <Volume2 size={18} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
