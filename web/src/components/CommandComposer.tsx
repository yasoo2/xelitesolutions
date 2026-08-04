import { useEffect, useMemo, useRef, useState, lazy, Suspense, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

import { useTranslation } from 'react-i18next';
import i18next from 'i18next';
import { API_URL as API, WS_URL as WS } from '../config';
import { resolveIdentity } from '../lib/userIdentity';
import { SocketService } from '../services/socket';
import { motion, AnimatePresence } from 'framer-motion';

import NeuralThinkingIndicator from './NeuralThinkingIndicator';
import TaskTracker from './TaskTracker';
import TodosPanel from './TodosPanel';


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
  Github,
  Code
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

const EngineeringReport = ({ report, ts, t }: { report: any; ts?: number; t: any }) => {
  const [showRaw, setShowRaw] = useState(false);
  const md = report.engineeringReportMarkdown || '';
  
  const generateSummaryFromJson = (r: any) => {
    const ok = r.ok ? '✅ SUCCESS' : '❌ FAILED';
    const progress = `${r.completedPhases} / ${r.totalPlannedPhases || '?'}`;
    return `### Pipeline Summary\n- **Status**: ${ok}\n- **Progress**: ${progress}\n\nDetailed orchestration data available.`;
  };

  const displayMd = md || (report.engineeringReport ? generateSummaryFromJson(report.engineeringReport) : '');

  if (!displayMd) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95, y: 10 }} 
      animate={{ opacity: 1, scale: 1, y: 0 }} 
      className="engineering-report-container"
    >
      <div className="report-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ShieldCheck size={20} className="report-icon" />
          <span>Joe Engineering Report</span>
        </div>
        <button 
          onClick={() => setShowRaw(!showRaw)}
          className="debug-toggle-btn"
          title="Toggle Debug Info"
        >
          <Code size={14} />
        </button>
      </div>

      <div className="report-body">
        <ReactMarkdown
          components={{
            h1: ({ ...props }) => <h1 style={{ fontSize: '1.2rem', margin: '0 0 1rem 0', color: 'var(--accent-primary)', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }} {...props} />,
            h2: ({ ...props }) => <h2 style={{ fontSize: '1.1rem', margin: '1.5rem 0 0.8rem 0', color: 'var(--text-primary)' }} {...props} />,
            h3: ({ ...props }) => <h3 style={{ fontSize: '1rem', margin: '1.2rem 0 0.6rem 0', color: 'var(--text-secondary)' }} {...props} />,
            ul: ({ ...props }) => <ul style={{ paddingLeft: '1.5rem', marginBottom: '1rem' }} {...props} />,
            li: ({ ...props }) => <li style={{ marginBottom: '0.4rem' }} {...props} />,
            p: ({ ...props }) => <p style={{ marginBottom: '1rem', opacity: 0.9 }} {...props} />,
          }}
        >
          {displayMd}
        </ReactMarkdown>
      </div>

      {showRaw && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }} 
          animate={{ opacity: 1, height: 'auto' }}
          className="report-debug-info"
        >
          <div className="debug-header">RAW ORCHESTRATION DATA</div>
          <pre className="debug-content">
            {JSON.stringify(report.engineeringReport || report, null, 2)}
          </pre>
        </motion.div>
      )}

      <div className="report-footer">
        {new Date(ts || Date.now()).toLocaleTimeString()}
      </div>
      <style>{`
        .engineering-report-container {
          margin: 20px 0;
          padding: 24px;
          background: rgba(15, 20, 28, 0.85);
          border: 1px solid rgba(var(--accent-primary-rgb), 0.4);
          border-radius: 16px;
          box-shadow: 0 12px 40px rgba(0,0,0,0.4), inset 0 0 20px rgba(var(--accent-primary-rgb), 0.05);
          backdrop-filter: blur(12px);
          position: relative;
          overflow: hidden;
        }
        .report-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
          font-weight: 800;
          color: var(--accent-primary);
          text-transform: uppercase;
          letter-spacing: 1.5px;
          font-size: 13px;
        }
        .debug-toggle-btn {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          color: var(--text-muted);
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .debug-toggle-btn:hover {
          background: rgba(var(--accent-primary-rgb), 0.1);
          color: var(--accent-primary);
        }
        .report-debug-info {
          margin-top: 20px;
          background: rgba(0,0,0,0.3);
          border-radius: 8px;
          padding: 12px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          overflow: hidden;
        }
        .debug-header {
          font-size: 9px;
          color: var(--accent-secondary);
          margin-bottom: 8px;
          font-weight: 700;
          letter-spacing: 1px;
        }
        .debug-content {
          color: var(--text-secondary);
          white-space: pre-wrap;
          word-break: break-all;
          max-height: 300px;
          overflow-y: auto;
        }
        .report-body {
          font-size: 14px;
          line-height: 1.7;
          color: var(--text-primary);
        }
        .report-footer {
          margin-top: 20px;
          padding-top: 12px;
          border-top: 1px solid rgba(255,255,255,0.05);
          font-size: 10px;
          color: var(--text-muted);
          text-align: right;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
      `}</style>
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

    const senderLabel = bubbleVariant === 'user' ? t('you') : bubbleVariant === 'system' ? t('system') : 'Joe';
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

          <div className="chat-bubble-content" dir="auto" style={{ unicodeBidi: 'plaintext' }}>
            {files.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {files.map((f: any, i: number) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: f.preview ? 4 : '4px 8px', borderRadius: 8,
                    background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)',
                    fontSize: 11, color: 'var(--text-secondary)'
                  }}>
                    {/* An attached IMAGE shows itself, not a generic icon — the
                        composer already carries the data-URI preview it made. */}
                    {f.preview ? (
                      <img src={f.preview} alt={f.name || 'image'} style={{
                        width: 44, height: 44, objectFit: 'cover', borderRadius: 6, display: 'block'
                      }} />
                    ) : (
                      <FileText size={12} style={{ opacity: 0.7 }} />
                    )}
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
                    // Per-block dir="auto": each paragraph/heading/list-item takes its
                    // OWN base direction from its dominant script, so an Arabic reply
                    // with a stray English word/number no longer scrambles word order.
                    h1: ({ ...props }) => <h1 dir="auto" {...props} />,
                    h2: ({ ...props }) => <h2 dir="auto" {...props} />,
                    h3: ({ ...props }) => <h3 dir="auto" {...props} />,
                    ul: ({ ...props }) => <ul dir="auto" {...props} />,
                    ol: ({ ...props }) => <ol dir="auto" {...props} />,
                    li: ({ ...props }) => <li dir="auto" {...props} />,
                    p: ({ ...props }) => <p dir="auto" {...props} />,
                    blockquote: ({ ...props }) => <blockquote dir="auto" {...props} />,
                    // Isolate inline Latin runs (links) so they don't reorder the
                    // surrounding Arabic sentence.
                    a: ({ ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" style={{ unicodeBidi: 'isolate', ...(props as any).style }} />,
                    code({ className, children, ...props }: any) {
                      const { inline, ...rest } = props as any;
                      const match = /language-(\w+)/.exec(className || '');
                      return !inline && match ? (
                        <SyntaxHighlighter style={vscDarkPlus as any} language={match[1]} PreTag="div" dir="ltr" {...rest}>
                          {String(children).replace(/\n$/, '')}
                        </SyntaxHighlighter>
                      ) : (
                        // Inline code (usually English/identifiers) isolated from the
                        // Arabic text flow so it stays put visually.
                        <code className={className} style={{ unicodeBidi: 'isolate' }} {...rest}>
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
  // i18n keys: `nameKey` replaces the whole display name, `tagKey` is the short
  // descriptor shown next to the brand ("free", "paid key", ...). Brands stay
  // untranslated — only the descriptor around them changes with the language.
  nameKey?: string;
  tagKey?: string;
  apiKey: string;
  isConnected: boolean;
  baseUrl?: string;
  model?: string;
  isCustom?: boolean;
  isVerifying?: boolean;
  lastError?: string;
  isFree?: boolean;
  // REAL verification state: true ONLY after /runs/verify actually succeeded with
  // a live request. The status dot is green only when this is true — never by
  // default. Reset to false whenever the key changes.
  verified?: boolean;
}

// OpenRouter available models
const OPENROUTER_MODELS: Array<{ id: string; name: string; free: boolean; descriptionKey: string }> = [
  { id: 'moonshotai/kimi-k2:free', name: 'Kimi K2', free: true, descriptionKey: 'modelKimiDesc' },
  { id: 'meta-llama/llama-3-8b-instruct:free', name: 'Llama 3 8B', free: true, descriptionKey: 'modelLlamaDesc' },
  { id: 'google/gemma-2-9b-it:free', name: 'Gemma 2 9B', free: true, descriptionKey: 'modelGemmaDesc' },
  { id: 'minimax/minimax-m2', name: 'MiniMax M2.1 ⭐', free: false, descriptionKey: 'modelMinimaxDesc' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3', free: false, descriptionKey: 'modelDeepseekDesc' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', free: false, descriptionKey: 'modelGpt4oMiniDesc' },
  { id: 'openai/gpt-4o', name: 'GPT-4o', free: false, descriptionKey: 'modelGpt4oDesc' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', free: false, descriptionKey: 'modelSonnetDesc' },
];

const DEFAULT_PROVIDERS: { [key: string]: ProviderConfig } = {
  // Free-first: Joe relies primarily on FREE providers. "Auto" picks the best
  // available free provider automatically (see the router's free-first mesh).
  auto: { name: 'Auto', nameKey: 'provAuto', apiKey: 'auto-mode', isConnected: true, model: 'auto', isCustom: true, isFree: true },
  gemini: { name: 'Google Gemini', tagKey: 'provFree', apiKey: 'free-mode', isConnected: true, model: 'gemini-2.0-flash', isFree: true },
  // Groq (شركة Groq — مفتاحها يبدأ بـ gsk_). ضع مفتاح Groq هنا. النموذج مطابق للمفتاح.
  groq: { name: 'Groq ⚡', tagKey: 'provGroqHint', apiKey: 'free-mode', isConnected: true, baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', isFree: true },
  cerebras: { name: 'Cerebras', tagKey: 'provUltraFast', apiKey: 'free-mode', isConnected: true, baseUrl: 'https://api.cerebras.ai/v1', model: 'llama-3.3-70b', isFree: true },
  openrouter: { name: 'OpenRouter', tagKey: 'provFree', apiKey: 'free-mode', isConnected: true, baseUrl: 'https://openrouter.ai/api/v1', model: 'moonshotai/kimi-k2:free', isFree: true },
  mistral: { name: 'Mistral', tagKey: 'provFree', apiKey: 'free-mode', isConnected: true, baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-small-latest', isFree: true },
  deepseek: { name: 'DeepSeek', tagKey: 'provFree', apiKey: 'free-mode', isConnected: true, model: 'deepseek-chat', isCustom: true, isFree: true },
  openai: { name: 'OpenAI', tagKey: 'provPaidKey', apiKey: '', isConnected: false, model: 'gpt-4o' },
  anthropic: { name: 'Anthropic', tagKey: 'provPaidKey', apiKey: '', isConnected: false, model: 'claude-3-opus-20240229' },
  // ⚠️ xAI Grok — شركة إيلون ماسك (x.ai)، مختلفة تماماً عن Groq. مفتاح gsk_ لا يعمل هنا.
  grok: { name: 'xAI Grok', tagKey: 'provGrokNote', apiKey: '', isConnected: false, baseUrl: 'https://api.x.ai/v1', model: 'grok-beta' },
};

// Honest per-provider key info. `auto` is NOT listed — it is the pure keyless mesh.
//  - 'keyless'  : works with NO key at all (DeepSeek via the Pollinations proxy).
//  - 'optional' : keyless-capable but a personal key raises speed/limits (Groq).
//  - 'required' : the FREE tier still needs a FREE key to work — the earlier UI
//                 wrongly said "no key needed", which is why these felt "fake".
//  - 'paid'     : needs a paid key.
type KeyNeed = 'keyless' | 'optional' | 'required' | 'paid';
const PROVIDER_KEY_INFO: Record<string, { need: KeyNeed; getUrl?: string; getLabel?: string; placeholder?: string; placeholderKey?: string }> = {
  groq: { need: 'optional', getUrl: 'https://console.groq.com/keys', getLabel: 'console.groq.com/keys', placeholderKey: 'keyPlaceholderGroq' },
  deepseek: { need: 'keyless', getUrl: 'https://platform.deepseek.com/api_keys', getLabel: 'platform.deepseek.com', placeholderKey: 'keyPlaceholderOptional' },
  gemini: { need: 'required', getUrl: 'https://aistudio.google.com/app/apikey', getLabel: 'aistudio.google.com/app/apikey', placeholder: 'AIza...' },
  cerebras: { need: 'required', getUrl: 'https://cloud.cerebras.ai/', getLabel: 'cloud.cerebras.ai', placeholder: 'csk-...' },
  mistral: { need: 'required', getUrl: 'https://console.mistral.ai/api-keys', getLabel: 'console.mistral.ai/api-keys', placeholderKey: 'keyPlaceholderMistral' },
  openrouter: { need: 'required', getUrl: 'https://openrouter.ai/keys', getLabel: 'openrouter.ai/keys', placeholder: 'sk-or-...' },
  openai: { need: 'paid', getUrl: 'https://platform.openai.com/api-keys', getLabel: 'platform.openai.com', placeholder: 'sk-...' },
  anthropic: { need: 'paid', getUrl: 'https://console.anthropic.com/settings/keys', getLabel: 'console.anthropic.com', placeholder: 'sk-ant-...' },
  grok: { need: 'paid', getUrl: 'https://console.x.ai/', getLabel: 'console.x.ai', placeholder: 'xai-...' },
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
  hideHistory = false,
  workspaceId,
  githubConnected = false,
  onGitClick

}: {
  sessionId?: string;
  sessionKind?: 'chat' | 'agent';
  browserSessionId?: string | null;
  previewBaseUrl?: string;
  onSessionCreated?: (id: string) => void;
  onPreviewArtifact?: (content: string, lang: string) => void;
  onStepsUpdate?: (steps: any[]) => void;
  onMessagesUpdate?: (msgs: any[]) => void;
  hideHistory?: boolean;
  workspaceId?: string | null;
  githubConnected?: boolean;
  onGitClick?: () => void;

}) {
  const { t } = useTranslation();
  const showToolUi = sessionKind === 'agent' || DEBUG_TOOL_UI;
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
  // Browser agent paused for a credential / 2FA code. Shown as a card IN THE CHAT
  // (not inside the browser panel) — on submit we resume the exact live browser.
  const [browserCred, setBrowserCred] = useState<{ browserSessionId: string; chatSessionId: string; message: string; secretKey: string; url?: string } | null>(null);
  const [browserCredValue, setBrowserCredValue] = useState('');
  // When the browser asks for the login EMAIL, we collect the PASSWORD in the same
  // card (one prompt instead of two) — this holds that second field's value.
  const [browserCredPassword, setBrowserCredPassword] = useState('');
  const [browserCredBusy, setBrowserCredBusy] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  // The server answers 503 when no speech engine is configured on this
  // machine. Asking again for every single reply just delays the browser
  // fallback each time, so the answer is remembered until the page reloads.
  const serverTtsOff = useRef(false);
  const [status, setStatus] = useState<'idle' | 'thinking' | 'answering'>('idle');
  const [isThinking, setIsThinking] = useState(false);
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const [toolVisible, setToolVisible] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [draftActive, setDraftActive] = useState(false);

  // [Wakil 5.3] Neural Thinking Indicator
  const [thinkingPhase, setThinkingPhase] = useState<'analyzing' | 'synthesizing' | 'executing' | 'idle'>(
    SocketService.getThinkingPhase() as any || 'idle'
  );
  const isQuietMode = SocketService.isQuietMode();

  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis>(window.speechSynthesis);
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
  const draftTimerRef = useRef<number | null>(null);
  const lastGateSigRef = useRef<{ approval?: string; secret?: string; browserCred?: string }>({});
  const lastTextDedupRef = useRef<{ sig: string; ts: number } | null>(null);
  const pendingBrowserRetryRef = useRef<{ url: string; sessionId: string } | null>(null);
  const lastAutoOpenedHrefRef = useRef<string>('');

  /* Removed duplicate declaration */

  // GitHub Modal State


  // AI Provider State
  const [showProviders, setShowProviders] = useState(false);
  // Standing instructions are edited in Settings and read fresh at send time
  // inside run() — no component state needed here.
  const initialProviderState = useMemo(() => {
    // Display order: Auto first, then the free providers (Groq/Gemini/Cerebras/
    // Mistral/DeepSeek/OpenRouter), then the paid ones. IMPORTANT: every provider
    // in DEFAULT_PROVIDERS must be listed here — the panel renders from this state,
    // so a provider omitted here (Groq/Cerebras/Mistral used to be) never appears.
    const baseProviders: { [key: string]: ProviderConfig } = {
      auto: { ...DEFAULT_PROVIDERS.auto },
      groq: { ...DEFAULT_PROVIDERS.groq },
      gemini: { ...DEFAULT_PROVIDERS.gemini },
      cerebras: { ...DEFAULT_PROVIDERS.cerebras },
      mistral: { ...DEFAULT_PROVIDERS.mistral },
      deepseek: { ...DEFAULT_PROVIDERS.deepseek },
      openrouter: { ...DEFAULT_PROVIDERS.openrouter },
      openai: { ...DEFAULT_PROVIDERS.openai },
      anthropic: { ...DEFAULT_PROVIDERS.anthropic },
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
      // Never trust a persisted "verified/connected" flag across reloads — the dot
      // must reflect a REAL test in THIS session. Keep the saved key, but clear the
      // status so it shows grey ("not tested yet") until the user verifies again.
      Object.keys(baseProviders).forEach((k) => {
        baseProviders[k] = { ...baseProviders[k], verified: false, isConnected: false, isVerifying: false, lastError: undefined };
      });
    } catch { }

    const pickFirstKeyedProvider = () => {
      // Default to AUTO (the free-first mesh): it always works with no key and uses
      // Groq under the hood when GROQ_API_KEY is set — so the provider button verifies
      // GREEN on login instead of red (Gemini, which needs a key the user may not have).
      return 'auto';
    };

    try {
      const savedActive = localStorage.getItem('active_provider');
      console.log('[ProviderDebug] Loaded active_provider:', savedActive);

      if (savedActive && baseProviders[savedActive]) {
        return { providers: baseProviders, activeProvider: savedActive };
      }
      return { providers: baseProviders, activeProvider: pickFirstKeyedProvider() };
    } catch {
      return { providers: baseProviders, activeProvider: pickFirstKeyedProvider() };
    }
  }, []);

  const [providers, setProviders] = useState<{ [key: string]: ProviderConfig }>(initialProviderState.providers);
  // activeProvider = the one ACTUALLY used at runtime (only changes after a
  // successful Verify). selectedProvider = the one you're currently viewing/
  // configuring in the panel (changing it does NOT switch the runtime provider).
  const [activeProvider, setActiveProvider] = useState(initialProviderState.activeProvider);
  const [selectedProvider, setSelectedProvider] = useState(initialProviderState.activeProvider);
  const [showKey, setShowKey] = useState<{ [key: string]: boolean }>({});
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
        if (name === 'execute:central_answer') continue;
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
        if (name === 'execute:central_answer') continue;
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
        return t(`tools.${tool}`, tool || t('toolCategoryGeneric'));
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
      if (token && !serverTtsOff.current) {
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
        // 503 = this machine has no speech engine configured. That will not
        // change mid-session, so stop asking and go straight to the browser.
        if (res.status === 503) serverTtsOff.current = true;
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
      alert(t('speechUnsupported'));
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

  // [Wakil 6.0] Subscribe to thinking phase updates — ignore events from OTHER
  // sessions and reset when the active session changes (no cross-session leak).
  const activeSidRef = useRef(sessionId);
  useEffect(() => { activeSidRef.current = sessionId; }, [sessionId]);
  useEffect(() => {
    const unsubscribe = SocketService.subscribeThinkingPhase((phase: any, evSid?: string) => {
      if (evSid && activeSidRef.current && evSid !== activeSidRef.current) return;
      setThinkingPhase(phase);
    });
    return () => unsubscribe();
  }, []);
  useEffect(() => { setThinkingPhase('idle'); }, [sessionId]);

  const showTool = (name: string) => {
    const next = String(name || '').trim();
    if (!next) return;
    if (next === 'central_answer') return;
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
      }, 50); // SPEED OPTIMIZATION: Reduced from 250ms
    }, wait);
    return totalDelay;
  };

  // [Wakil 4.7] Refactored to use Singleton SocketService
  // Removed local WebSocket connection logic to prevent duplication
  useEffect(() => {
    // Subscribe to incoming messages
    const unsubscribeMessages = SocketService.subscribe((msg: any) => {
      // [Wakil 4.7] Centralized Handling via SocketService
      handleMessage({ data: JSON.stringify(msg) } as MessageEvent);
    });

    // Subscribe to status changes
    const unsubscribeStatus = SocketService.subscribeStatus(({ state }) => {
      setIsConnected(state === 'connected');
      if (state === 'unauthorized') handleUnauthorized();
    });

    // Initial check
    SocketService.connect();

    return () => {
      unsubscribeMessages();
      unsubscribeStatus();
      clearToolTimers();
      clearDraftTimer();
    };
  }, []);

  // Legacy handler wrapper for compatibility with existing logic
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
        return;
      }

      if (msg.type === 'run_finished' || msg.type === 'run_completed') {
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

      if (msg.type === 'browser_needs_user') {
        const data = msg.data || {};
        const browserSessionId = String(data?.browserSessionId || '').trim();
        const secretKey = String(data?.secretKey || '').trim().toUpperCase();
        if (browserSessionId && secretKey) {
          const sig = `${browserSessionId}:${secretKey}`;
          if (lastGateSigRef.current.browserCred !== sig) {
            lastGateSigRef.current.browserCred = sig;
            setBrowserCred({
              browserSessionId,
              chatSessionId: String(data?.sessionId || sessionId || '').trim(),
              secretKey,
              message: String(data?.message || t('agentNeedsCredentials')),
              url: typeof data?.url === 'string' ? data.url : undefined,
            });
            setBrowserCredValue('');
            setBrowserCredPassword('');
          }
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

        // [AUTO-SWITCH] Dispatch workspace tab switch event based on tool type
        const toolName = name.startsWith('execute:') ? name.slice('execute:'.length) : name;
        const shellTools = ['shell_execute', 'terminal_manager', 'npm_manager', 'npm_install', 'npm_build'];
        const browserTools = ['browser_open', 'browser_run', 'browser_vision', 'browser_action'];
        const previewTools = ['dev_server', 'website_full_pipeline', 'scaffold_project'];
        let targetTab: string | null = null;
        if (shellTools.includes(toolName)) targetTab = 'terminal';
        else if (browserTools.includes(toolName)) targetTab = 'browser';
        else if (previewTools.includes(toolName)) targetTab = 'preview';
        if (targetTab) {
          window.dispatchEvent(new CustomEvent('joe:workspace-tab-switch', { detail: { tab: targetTab } }));
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
          } catch (e) {
            console.error('Error in text streaming:', e);
            setIsThinking(false);
            setStatus('idle');
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
      if (['step_started', 'step_progress', 'step_done', 'step_failed', 'evidence_added', 'artifact_created', 'approval_result', 'run_finished', 'run_completed'].includes(msg.type)) {
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

  useEffect(() => {
    const prev = prevSessionIdRef.current;
    prevSessionIdRef.current = sessionId;

    if (!sessionId) {
      setEvents([]);
      setActiveRunId(null);
      setApproval(null);
      setSecretPrompt(null);
      setBrowserCred(null);
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
      setBrowserCred(null);
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
    console.log('[Attach] change event:', e.target.files?.length ?? 0, 'file(s)');
    if (!e.target.files?.length) return;
    /**
     * ONE upload path for every entry point. This handler used to duplicate
     * uploadFiles() with fewer features: files attached via the paperclip
     * BUTTON got no image preview, no size, no success state — while the same
     * file dragged in got all three. Same chip, two different behaviours,
     * depending on which door the file came through.
     */
    const selected = Array.from(e.target.files);
    await uploadFiles(selected);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // Reusable upload function for drag-drop and clipboard paste
  async function uploadFiles(files: File[]) {
    console.log('[Attach] uploading', files.length, 'file(s) to', `${API}/files/upload`);
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
      alert(t('cameraError', 'Cannot access the camera. Make sure permission is granted.'));
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
        alert(t('screenError', 'Screen capture failed.'));
      }
    }
  }

  // ChatPanel's quick-start chips submit real prompts through this event —
  // the ref keeps the listener bound once while always calling the fresh run().
  const quickRunRef = useRef<(t: string) => void>(() => { });
  quickRunRef.current = (t: string) => { void run(t); };
  useEffect(() => {
    const onQuickPrompt = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (typeof detail === 'string' && detail.trim()) quickRunRef.current(detail);
    };
    window.addEventListener('joe:quick-prompt', onQuickPrompt);
    return () => window.removeEventListener('joe:quick-prompt', onQuickPrompt);
  }, []);

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

    const normalizeForIntent = (input: string) => {
      let s = String(input || '');
      try {
        s = s.normalize('NFKC');
      } catch { }
      s = s
        .toLowerCase()
        .replace(/[\u064B-\u065F\u0670]/g, '')
        .replace(/[\u0640]/g, '')
        .replace(/[أإآٱ]/g, 'ا')
        .replace(/ؤ/g, 'و')
        .replace(/ئ/g, 'ي')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه');
      s = s.replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim();
      return s;
    };

    const needsBrowserForText = (raw: string) => {
      const s = String(raw || '').trim();
      const sNorm = normalizeForIntent(s);
      if (!s) return false;

      const hasUrl = Boolean(extractLikelyUrl(s));
      if (hasUrl) return true;

      const explicitBrowser = /(\b(browser|web|preview)\b|متصفح|داخل المتصفح|معاينه|معاينة|المعاينه|المعاينة)/i.test(sNorm);
      if (explicitBrowser) return true;

      const openKeyword = /(افتح|افتحي|افتحوا|افتحلي|افتح\s+لي|اذهب|زيارة|روح|زور|وديني|ودني|ودنا|وريني|اعرض|عرض|شوف|طلعني|طالع|open|go to|visit|browse|show)/i.test(sNorm);
      const githubKeyword = /(github|git\s*hub|جيت\s*هاب|جيتهاب|جت\s*هاب|غيت\s*هاب|كت\s*هاب|كتهاب|كيت\s*هاب|كيتهاب)/i.test(sNorm);
      const analysisKeyword = /(كود|code|repo|repository|مستودع|ملفات|files|اختبر|تحقق|راجع|audit|lint|build|typecheck|تحليل)/i.test(sNorm);

      if (openKeyword && githubKeyword && analysisKeyword) return false;

      const isFileOp = /(file|folder|directory|ملف|مجلد|مسار|path|terminal|command|امر|أمر|ترمينال)/i.test(sNorm);
      if (openKeyword && isFileOp) return false;

      if (openKeyword) return true;

      const knownSites = /(youtube|يوتيوب|google|جوجل|قوقل|facebook|فيسبوك|x\.com|twitter|تويتر|instagram|انستغرام|openai|اوبن\s*اي|yahoo|ياهو)/i.test(sNorm);
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
      // Allow auto-open in chat mode too. Skip if no sessionId yet (first message).
      if (sessionId && (sessionKind === 'agent' || sessionKind === 'chat') && !effectiveBrowserSessionId && needsBrowserForText(inputText)) {
        const inputNorm = normalizeForIntent(inputText);
        const urlMatch = inputText.match(/https?:\/\/[^\s"'<>]+/i);
        const directUrl = urlMatch?.[0];
        const extractedUrl = extractLikelyUrl(inputText);
        const wantsYoutube = /(youtube|يوتيوب)/i.test(inputNorm);
        const wantsGithub = /(github|git\s*hub|جيت\s*هاب|جيتهاب|جت\s*هاب|غيت\s*هاب|كت\s*هاب|كتهاب|كيت\s*هاب|كيتهاب)/i.test(inputNorm);
        const wantsPreview = /(preview|معاينه|معاينة|المعاينه|المعاينة|عرض\s+الموقع|show\s+site)/i.test(inputNorm);
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

      // [FIX] Allow all free providers to proceed without API key check
      const isFreeProvider = !!providerCfgToSend?.isFree;

      console.log(`[ProviderDebug] run() start. active=${activeProvider}, toSend=${providerToSend}, isFree=${isFreeProvider}`);

      if (!isFreeProvider && (!String(providerCfgToSend?.apiKey || '').trim() || !providerCfgToSend?.isConnected)) {
        console.log('[ProviderDebug] Provider invalid, falling back...');
        const valid = pickFirstValidProvider();
        providerToSend = valid;
        providerCfgToSend = providers[valid];
        console.log('[ProviderDebug] Fallback provider:', valid);
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
        baseUrl: providerCfgToSend?.baseUrl,
        workspaceId: workspaceId || undefined,
        // The language chosen in the switcher. Without it the server had no idea
        // which language to answer in and every reply came back Arabic, however
        // the interface was set.
        language: (i18next.language || 'ar').split('-')[0],
        // The signed token often carries a placeholder name ('User'), while the
        // UI resolves the real one (Google profile / stored account). Send it so
        // Joe can greet the user personally («مساء الخير يا يونس»).
        userName: resolveIdentity().name || undefined,
      };
      // Read at SEND time (not mount time) so instructions saved in Settings a
      // moment ago apply to this very run without reloading the page.
      const standingInstructions = (() => {
        try { return (localStorage.getItem('system_instructions') || '').trim(); } catch { return ''; }
      })();
      if (standingInstructions) {
        payload.systemInstructions = standingInstructions;
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
      console.log(`[JOE] /runs/start Response Status: ${res.status}`);
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

      // Always process result from HTTP response as a fallback/accelerator, 
      // even if connected, to ensure the user sees the immediate response.
      if (data?.result) {
        const r = data.result;
        if (r?.output) {
          const txt = typeof r.output === 'string' ? r.output : JSON.stringify(r.output);
          // Simple dedup: check if the last event has the same text
          setEvents(prev => {
            const last = prev[prev.length - 1];
            if (last && last.type === 'text' && last.data === txt) return prev;
            return [...prev, { type: 'text', data: txt }];
          });
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

  // The browser agent paused for a credential / 2FA code. The user answered in
  // the CHAT (not inside the browser panel). Store it and RESUME the same live
  // browser — and mirror the continuation back into THIS chat session so the
  // conversation visibly moves (chatSessionId carries the real chat id).
  const submitBrowserCred = async () => {
    if (!browserCred || browserCredBusy) return;
    const val = String(browserCredValue || '').trim();
    if (!val) return;
    const bsid = String(browserCred.browserSessionId || '').trim();
    const key = String(browserCred.secretKey || '').trim().toUpperCase();
    if (!bsid || !key) return;

    // On the login EMAIL prompt we also collect the PASSWORD in the same card, so
    // the agent won't pause again — send it as an extra secret with the resume.
    const isLoginEmail = /EMAIL/i.test(key) && !/2FA|OTP|CODE/i.test(key);
    const pwd = String(browserCredPassword || '').trim();
    const extraSecrets = (isLoginEmail && pwd) ? { JOE_LOGIN_PASSWORD: pwd } : undefined;

    setBrowserCredBusy(true);
    const isSecretLike = /PASSWORD|2FA|OTP|CODE|TOKEN|SECRET/i.test(key);
    setEvents(prev => [
      ...prev,
      { type: 'user_input', data: (isSecretLike || extraSecrets) ? t('secretSentMask', '🔐 [token sent]') : val, id: Date.now().toString(), ts: Date.now(), seq: lastLiveSeqRef.current + 0.1 }
    ]);

    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API}/browser-agent/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        // browser session to resume + the chat session that launched it (from the
        // event, falling back to the current one) so the reply lands in that chat.
        // `secrets` carries the password entered alongside the email (one prompt).
        body: JSON.stringify({ sessionId: bsid, chatSessionId: String(browserCred.chatSessionId || sessionId || '').trim(), key, value: val, ...(extraSecrets ? { secrets: extraSecrets } : {}) }),
      });
      if (res.status === 401) { handleUnauthorized(); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEvents(prev => [...prev, { type: 'text', data: `✅ ${t('secretSavedContinue', 'Token saved. Continuing execution.')}`, ts: Date.now() }]);
    } catch (e) {
      setEvents(prev => [...prev, { type: 'error', data: `تعذّر متابعة المتصفح: ${String((e as any)?.message || e)}`, ts: Date.now() }]);
    } finally {
      setBrowserCred(null);
      setBrowserCredValue('');
      setBrowserCredPassword('');
      setBrowserCredBusy(false);
      lastGateSigRef.current.browserCred = undefined;
    }
  };

  // Verify a provider by actually testing it. GREEN dot on success, RED on
  // failure, pulsing while verifying. Applies to free providers too (the free
  // mesh is what gets tested).
  // Returns TRUE when the provider really answered. `background` is used by the
  // startup auto-check: it must not steal the panel selection, and a failure on
  // an early attempt (API still booting) must not paint the button red before
  // the retries are exhausted.
  const checkConnection = async (key: string, opts?: { closeOnSuccess?: boolean; background?: boolean }): Promise<boolean> => {
    const p = providers[key];

    // Show it in the panel + start verifying — but do NOT make it the runtime
    // provider yet. It becomes active ONLY if the verify below succeeds.
    if (!opts?.background) setSelectedProvider(key);
    setProviders(prev => ({ ...prev, [key]: { ...prev[key], isVerifying: true, isConnected: false, verified: false, lastError: undefined } }));

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
          apiKey: p.apiKey || (p.isFree ? 'free-mode' : ''),
          baseUrl: p.baseUrl,
          model: p.model,
        }),
      });

      if (res.status === 401) {
        handleUnauthorized();
        throw new Error(t('unauthorized', 'Unauthorized'));
      }
      const data = await res.json().catch(() => ({ ok: false, error: 'bad_response' }));

      if (data?.ok) {
        // SUCCESS: a live request actually returned. Mark REALLY verified and make
        // it the active runtime provider.
        setActiveProvider(key);
        setProviders(prev => ({
          ...prev,
          [key]: { ...prev[key], isVerifying: false, isConnected: true, verified: true, lastError: undefined, apiKey: prev[key].apiKey || (prev[key].isFree ? 'free-mode' : prev[key].apiKey) },
        }));
        if (opts?.closeOnSuccess) setShowProviders(false); // green → switch & close
        return true;
      }
      // The live request FAILED (bad key, blocked, empty) — show it red, honestly.
      setProviders(prev => ({
        ...prev,
        [key]: { ...prev[key], isVerifying: false, isConnected: false, verified: false, lastError: opts?.background ? undefined : (data?.error || 'فشل الاتصال') },
      }));
      return false;
    } catch (err: any) {
      setProviders(prev => ({
        ...prev,
        [key]: { ...prev[key], isVerifying: false, isConnected: false, verified: false, lastError: opts?.background ? undefined : (err.message || 'فشل الاتصال') },
      }));
      return false;
    }
  };

  // Auto-verify the active provider ONCE on load, in the background, so its button
  // shows green/active immediately WITHOUT the user opening the panel and clicking
  // Verify each session. This is a REAL verification call (not a fake green): if it
  // fails, the button honestly stays red with the reason.
  const didAutoVerifyRef = useRef(false);
  useEffect(() => {
    const ap = String(activeProvider || '').trim();
    if (!ap || didAutoVerifyRef.current) return;
    let cancelled = false;
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    // Joe must open READY: the provider verifies itself the moment the panel
    // appears, with no click. The first attempt is immediate (the check itself
    // answers in ~200ms) and it retries a few times because the API is often
    // still booting when the browser opens right after start-joe — a single
    // early attempt would fail and leave the button looking dead. Failures are
    // kept silent until the last try, so no red flash while it settles.
    const attempts = [0, 800, 2000, 4000];
    (async () => {
      for (let i = 0; i < attempts.length; i++) {
        if (attempts[i] > 0) await sleep(attempts[i]);
        // The guard is claimed on SUCCESS, never at schedule time: claiming it
        // early let a StrictMode/remount cleanup cancel the only attempt while
        // the ref already read "done", so the check never ran at all.
        if (cancelled || didAutoVerifyRef.current) return;
        const isLast = i === attempts.length - 1;
        const ok = await checkConnection(ap, { closeOnSuccess: false, background: !isLast });
        if (cancelled) return;
        if (ok) { didAutoVerifyRef.current = true; return; }
      }
    })();
    return () => { cancelled = true; };
  }, [activeProvider]);

  const deleteProviderKey = (key: string) => {
    if (confirm('Are you sure you want to remove the API key?')) {
      // A free provider (e.g. Groq) must fall BACK to free mode, not be left keyless
      // and dead. Reset its key to the 'free-mode' placeholder so it keeps working.
      const isFree = !!providers[key]?.isFree;
      setProviders(prev => ({
        ...prev,
        [key]: { ...prev[key], apiKey: isFree ? 'free-mode' : '', isConnected: isFree, verified: false, lastError: undefined }
      }));
      if (!isFree) setActiveProvider('openai');
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

      const cleanUrl = url.replace(/`+/g, '').trim();
      if (cleanUrl) lines.push(`${t('browserSummaryUrlLabel')}: ${cleanUrl}`);
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
    const out: Array<{ kind: string; key: string; e?: any; idx?: number }> = [];

    for (const { e, idx } of sortedEvents) {
      const type = String(e?.type || '');

      if (type === 'step_started' || type === 'step_progress' || type === 'evidence_added') continue;

      if (type === 'step_done' || type === 'step_failed') {
        const pipeline = e?.data?.result?.output?.orchestratedPipeline;
        if (pipeline) {
          out.push({ kind: 'engineering_report', key: `report:${idx}`, e, idx });
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

  return (
    <div className={`composer ${sessionKind === 'agent' ? 'composer-agent' : ''}`}>
      {null}

      {!hideHistory && (
        <div className="events" ref={eventsScrollRef}>
          <div className="events-content" ref={eventsContentRef}>
            {events.length === 0 && (
              <div className="empty-state-hero">
                {/* One logo, not two stacked ones — the second 160px EliteLogo
                    pushed the input below the fold on laptop screens. */}
                <div className="hero-logo-container">
                  <div className="hero-logo-glow"></div>
                  <div className="hero-logo-content">
                    <EliteLogo size={72} />
                  </div>
                </div>

                <h1 className="hero-title">
                  <span className="hero-title-main">{t('heroTitleMain', 'Build faster.')}</span>
                  <span className="hero-title-sub">{t('heroTitleSub', 'Think deeper.')}</span>
                </h1>

                <p className="hero-subtitle">
                  {t('heroSubtitle', 'Describe what you want and Joe designs, builds, tests and delivers it.')}
                </p>

                {/* Real starting points: each chip submits an actual prompt. */}
                <div className="hero-chips">
                  {[t('heroChip1'), t('heroChip2'), t('heroChip3'), t('heroChip4')]
                    .filter(Boolean)
                    .map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        className="hero-chip"
                        onClick={() => run(chip)}
                      >
                        {chip}
                      </button>
                    ))}
                </div>
              </div>
            )}

            <AnimatePresence mode="popLayout">
              {renderItems.map((item) => {
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

                if (item.kind === 'engineering_report') {
                  const pipeline = item.e?.data?.result?.output?.orchestratedPipeline;
                  if (!pipeline) return null;
                  return (
                    <EngineeringReport 
                      key={item.key} 
                      report={pipeline} 
                      ts={item.e?.ts} 
                      t={t}
                    />
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

            <div ref={endRef} />
          </div>
        </div>
      )}

      {null}



      {/* AI Providers Modal */}
      {showProviders && createPortal(
        <div className="providers-modal-overlay" onClick={() => setShowProviders(false)}>
          <div className="providers-modal" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setShowProviders(false)}
              className="modal-close-btn"
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: 4,
                zIndex: 10
              }}
            >
              <X size={20} />
            </button>
            {/* Left Sidebar */}
            <div className="providers-left">
              <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Cpu size={18} /> Providers
              </h3>

              <div className="provider-section">
                <div className="section-header free">🆓 مجاني — Free</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {Object.entries(providers).filter(([, p]) => p.isFree).map(([key, p]) => (
                    <button
                      key={key}
                      className={`provider-item ${selectedProvider === key ? 'active' : ''}`}
                      onClick={() => setSelectedProvider(key)}
                      title={p.lastError ? t('providerNotWorking', { error: p.lastError }) : activeProvider === key ? t('providerInUse') : t('providerClickToView')}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className={`provider-status-dot ${p.isVerifying ? 'verifying' : p.verified ? 'connected' : p.lastError ? 'failed' : 'disconnected'}`} />
                        {p.nameKey ? t(p.nameKey) : p.name.split(' ')[0]}
                        {activeProvider === key && <span style={{ fontSize: 10, color: '#22c55e', marginInlineStart: 4 }}>{t('providerInUseBadge')}</span>}
                      </span>
                      {selectedProvider === key && <ChevronRight size={14} />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="provider-section">
                <div className="section-header paid">💳 مدفوع — Paid</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {Object.entries(providers).filter(([, p]) => !p.isFree).map(([key, p]) => (
                    <button
                      key={key}
                      className={`provider-item ${selectedProvider === key ? 'active' : ''}`}
                      onClick={() => setSelectedProvider(key)}
                      title={p.lastError ? `لا يعمل: ${p.lastError}` : activeProvider === key ? 'قيد الاستخدام الآن' : 'اضغط للعرض، أدخل المفتاح، ثم Verify للتفعيل'}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className={`provider-status-dot ${p.isVerifying ? 'verifying' : p.verified ? 'connected' : p.lastError ? 'failed' : 'disconnected'}`} />
                        {p.nameKey ? t(p.nameKey) : p.name.split(' ')[0]}
                        {activeProvider === key && <span style={{ fontSize: 10, color: '#22c55e', marginInlineStart: 4 }}>{t('providerInUseBadge')}</span>}
                      </span>
                      {selectedProvider === key && <ChevronRight size={14} />}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Content */}
            <div className="providers-right">
              {providers[selectedProvider] && (
                <>
                  {/* OpenRouter Model Selection */}
                  {selectedProvider === 'openrouter' && (
                    <div style={{ marginBottom: 20 }}>
                      <label className="section-label">اختر النموذج</label>
                      <select
                        className="model-select"
                        value={providers[selectedProvider].model || ''}
                        onChange={(e) => {
                          const selectedModel = OPENROUTER_MODELS.find(m => m.id === e.target.value);
                          const isFreeModel = selectedModel?.free ?? true;
                          setProviders(prev => ({
                            ...prev,
                            [selectedProvider]: {
                              ...prev[selectedProvider],
                              model: e.target.value,
                              isFree: isFreeModel,
                              isConnected: isFreeModel || !!prev[selectedProvider].apiKey
                            }
                          }));
                        }}
                      >
                        <optgroup label={t('modelsFree')}>
                          {OPENROUTER_MODELS.filter(m => m.free).map(m => (
                            <option key={m.id} value={m.id}>{m.name} - {t(m.descriptionKey)}</option>
                          ))}
                        </optgroup>
                        <optgroup label={t('modelsPaid')}>
                          {OPENROUTER_MODELS.filter(m => !m.free).map(m => (
                            <option key={m.id} value={m.id}>{m.name} - {t(m.descriptionKey)}</option>
                          ))}
                        </optgroup>
                      </select>
                      {/* Show selected model info */}
                      {(() => {
                        const selected = OPENROUTER_MODELS.find(m => m.id === providers[selectedProvider].model);
                        if (!selected) return null;
                        return (
                          <div style={{
                            marginTop: 8, padding: '8px 12px', borderRadius: 8,
                            background: selected.free ? 'rgba(34, 197, 94, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                            border: `1px solid ${selected.free ? 'rgba(34, 197, 94, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`,
                            fontSize: 12
                          }}>
                            {selected.free ? (
                              <span style={{ color: '#22c55e' }}>✓ هذا النموذج مجاني - لا يحتاج API Key</span>
                            ) : (
                              <span style={{ color: '#3b82f6' }}>💳 هذا النموذج مدفوع - يحتاج API Key من OpenRouter</span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Auto is the pure keyless mesh — no key. */}
                  {selectedProvider === 'auto' && (
                    <div className="info-box free">
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>✨ تلقائي — بلا مفتاح</div>
                      <div>يختار أفضل مزوّد مجاني متاح تلقائياً (محلي + مجاني). لا يحتاج أي مفتاح.</div>
                    </div>
                  )}

                  {/* Honest per-provider info box driven by PROVIDER_KEY_INFO. */}
                  {selectedProvider !== 'auto' && PROVIDER_KEY_INFO[selectedProvider] && (() => {
                    const info = PROVIDER_KEY_INFO[selectedProvider];
                    const title = info.need === 'keyless' ? '🆓 مجاني بلا مفتاح — ويقبل مفتاحك (اختياري)'
                      : info.need === 'optional' ? '⚡ مجاني — ويقبل مفتاحك الخاص (اختياري، لسرعة وحدود أعلى)'
                        : info.need === 'required' ? '🔑 مجاني — لكنه يحتاج مفتاحاً مجانياً لتفعيله'
                          : '💳 مزوّد مدفوع — يحتاج مفتاحه';
                    const body = info.need === 'required'
                      ? 'هذا المزوّد مجاني، لكنه يتطلّب مفتاح API مجانياً من موقعه. أنشئ مفتاحاً مجانياً، ألصقه بالأسفل، ثم اضغط «Connect & Activate» للتحقّق الحقيقي منه.'
                      : info.need === 'paid'
                        ? 'ألصق مفتاح المزوّد بالأسفل ثم اضغط «Connect & Activate» للتحقّق منه.'
                        : 'يعمل مجاناً مباشرة. ولمزيد من السرعة والحدود يمكنك (اختياريّاً) لصق مفتاحك الخاص بالأسفل.';
                    return (
                      <div className="info-box free">
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>{title}</div>
                        <div>{body}</div>
                        {info.getUrl && (
                          <div style={{ marginTop: 6, fontSize: 12 }}>احصل على مفتاح من <a href={info.getUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)', unicodeBidi: 'isolate' }}>{info.getLabel || info.getUrl}</a></div>
                        )}
                      </div>
                    );
                  })()}

                  {/* API Key — shown for EVERY provider that accepts a key (all except Auto). */}
                  {selectedProvider !== 'auto' && PROVIDER_KEY_INFO[selectedProvider] && (() => {
                    const info = PROVIDER_KEY_INFO[selectedProvider];
                    const keyOptional = info.need === 'keyless' || info.need === 'optional';
                    return (
                    <div style={{ marginBottom: 20 }}>
                      <label className="section-label">API Key{keyOptional ? ' (اختياري)' : ''}</label>
                      <div style={{ position: 'relative', display: 'flex', gap: 8 }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                          <input
                            type={showKey[selectedProvider] ? "text" : "password"}
                            className="api-key-input"
                            dir="ltr"
                            value={/^(free-mode|auto-mode)$/.test(String(providers[selectedProvider].apiKey || '')) ? '' : providers[selectedProvider].apiKey}
                            onChange={(e) => {
                              const newKey = e.target.value;
                              // Keyless/optional providers fall back to the free mesh when the
                              // box is empty; required/paid providers stay empty until a key.
                              const emptyVal = keyOptional ? 'free-mode' : '';
                              setProviders(prev => ({ ...prev, [selectedProvider]: { ...prev[selectedProvider], apiKey: newKey || emptyVal, isConnected: false, verified: false, lastError: undefined } }));
                              if (selectedProvider === 'openai' && newKey.trim().startsWith('sk-')) {
                                fetch(`${API}/providers/openai/key`, {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ apiKey: newKey.trim() })
                                }).catch(err => console.error('Failed to send API key to server:', err));
                              }
                            }}
                            placeholder={info.placeholderKey ? t(info.placeholderKey) : info.placeholder}
                          />
                          <button
                            onClick={() => setShowKey(prev => ({ ...prev, [selectedProvider]: !prev[selectedProvider] }))}
                            style={{ position: 'absolute', right: 10, top: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                          >
                            {showKey[selectedProvider] ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                        <button
                          onClick={() => {
                            deleteProviderKey(selectedProvider);
                            // Clear API key on server for OpenAI
                            if (selectedProvider === 'openai') {
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
                    );
                  })()}


                  {/* Model ID - Hide for Auto and OpenRouter (which has dropdown) */}
                  {selectedProvider !== 'auto' && selectedProvider !== 'openrouter' && (
                    <div style={{ display: 'grid', gridTemplateColumns: selectedProvider === 'grok' ? '1fr 1fr' : '1fr', gap: 16, marginBottom: 20 }}>
                      <div>
                        <label className="section-label">Model ID</label>
                        <input
                          type="text"
                          className="api-key-input"
                          value={providers[selectedProvider].model || ''}
                          onChange={(e) => setProviders(prev => ({ ...prev, [selectedProvider]: { ...prev[selectedProvider], model: e.target.value } }))}
                          placeholder="gpt-4o"
                        />
                      </div>
                      {selectedProvider === 'grok' && (
                        <div>
                          <label className="section-label">Base URL</label>
                          <input
                            type="text"
                            className="api-key-input"
                            value={providers[selectedProvider].baseUrl || ''}
                            onChange={(e) => setProviders(prev => ({ ...prev, [selectedProvider]: { ...prev[selectedProvider], baseUrl: e.target.value } }))}
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
                  )}



                  {providers[selectedProvider].lastError && (
                    <div style={{
                      padding: 12, borderRadius: 8, background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', fontSize: 13,
                      marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8
                    }}>
                      <XCircle size={16} />
                      {providers[selectedProvider].lastError}
                    </div>
                  )}


                  <div style={{ display: 'flex', gap: 12, paddingTop: 20, borderTop: '1px solid var(--border-color)' }}>
                    <button
                      onClick={() => checkConnection(selectedProvider, { closeOnSuccess: true })}
                      disabled={providers[selectedProvider].isVerifying}
                      style={{
                        flex: 1, padding: '12px', borderRadius: 8, border: 'none',
                        background: providers[selectedProvider].isConnected ? '#22c55e' : providers[selectedProvider].lastError ? '#ef4444' : 'var(--accent-primary)',
                        color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        opacity: providers[selectedProvider].isVerifying ? 0.7 : 1
                      }}
                    >
                      {providers[selectedProvider].isVerifying ? (
                        <>
                          <Loader2 size={18} className="spin" /> Verifying...
                        </>
                      ) : providers[selectedProvider].isConnected ? (
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
                        handleDisconnect(selectedProvider);
                      }}
                      disabled={!providers[selectedProvider].isConnected}
                      title="Disconnect Provider"
                      style={{
                        padding: '12px 16px', borderRadius: 8, border: '1px solid var(--border-color)',
                        background: 'var(--bg-secondary)',
                        color: providers[selectedProvider].isConnected ? '#ef4444' : 'var(--text-muted)',
                        fontSize: 14, fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        opacity: !providers[selectedProvider].isConnected ? 0.5 : 1
                      }}
                    >
                      <Power size={18} />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {
        secretPrompt && (
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
        )
      }

      {
        // Browser agent paused for a credential / 2FA code — answered HERE in the
        // chat (not inside the browser panel), then the same live browser resumes.
        browserCred && (
          <div className="modal" dir="rtl">
            <div className="panel" style={{ width: 420, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ padding: 10, borderRadius: 12, background: 'rgba(var(--accent-secondary-rgb), 0.1)', color: 'var(--accent-secondary)' }}>
                  <Lock size={24} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>المتصفح يحتاج بياناتك للمتابعة</h3>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    {/PASSWORD/i.test(browserCred.secretKey) ? 'كلمة المرور' : /EMAIL/i.test(browserCred.secretKey) ? 'البريد الإلكتروني' : /2FA|OTP|CODE/i.test(browserCred.secretKey) ? 'رمز التحقّق' : 'بيانات الدخول'}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 14, color: 'var(--text-primary)', marginBottom: 12, lineHeight: 1.6 }}>
                  {browserCred.message}
                </p>
                <div style={{ position: 'relative' }}>
                  <input
                    type={/PASSWORD/i.test(browserCred.secretKey) ? 'password' : 'text'}
                    autoFocus
                    dir={/EMAIL/i.test(browserCred.secretKey) ? 'ltr' : 'rtl'}
                    value={browserCredValue}
                    onChange={(e) => setBrowserCredValue(e.target.value)}
                    placeholder={/2FA|OTP|CODE/i.test(browserCred.secretKey) ? t('enter2faCode') : /EMAIL/i.test(browserCred.secretKey) ? t('enterEmail') : /PASSWORD/i.test(browserCred.secretKey) ? t('enterPassword') : t('enterRequiredValue')}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !browserCredBusy && !(/EMAIL/i.test(browserCred.secretKey) && !/2FA|OTP|CODE/i.test(browserCred.secretKey))) { void submitBrowserCred(); } }}
                    style={{
                      width: '100%', padding: '12px', paddingInlineStart: 40, borderRadius: 8,
                      background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)',
                      color: '#fff', outline: 'none', fontSize: 14,
                    }}
                  />
                  <Key size={16} style={{ position: 'absolute', insetInlineStart: 12, top: 14, color: 'var(--text-secondary)' }} />
                </div>
                {/* On the login EMAIL prompt, collect the PASSWORD in the SAME card
                    so the agent doesn't pause again to ask for it separately. */}
                {(/EMAIL/i.test(browserCred.secretKey) && !/2FA|OTP|CODE/i.test(browserCred.secretKey)) && (
                  <div style={{ position: 'relative', marginTop: 10 }}>
                    <input
                      type="password"
                      dir="ltr"
                      value={browserCredPassword}
                      onChange={(e) => setBrowserCredPassword(e.target.value)}
                      placeholder={t('passwordWithEmail')}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !browserCredBusy) { void submitBrowserCred(); } }}
                      style={{
                        width: '100%', padding: '12px', paddingInlineStart: 40, borderRadius: 8,
                        background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-color)',
                        color: '#fff', outline: 'none', fontSize: 14,
                      }}
                    />
                    <Lock size={16} style={{ position: 'absolute', insetInlineStart: 12, top: 14, color: 'var(--text-secondary)' }} />
                  </div>
                )}
                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <ShieldCheck size={12} />
                  <span>تُرسَل بأمان وتُخزَّن مشفّرة — لا تظهر في السجلّ ولا في اللقطات.</span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 8 }}>
                <button
                  onClick={() => { void submitBrowserCred(); }}
                  disabled={browserCredBusy || !browserCredValue.trim()}
                  style={{ padding: '8px 18px', borderRadius: 6, border: 0, background: (browserCredBusy || !browserCredValue.trim()) ? '#475569' : 'var(--accent-secondary, #2563eb)', color: '#fff', cursor: (browserCredBusy || !browserCredValue.trim()) ? 'default' : 'pointer', fontWeight: 600 }}
                >
                  {browserCredBusy ? t('sendingContinue') : t('sendAndContinue')}
                </button>
                <button
                  onClick={() => { setBrowserCred(null); setBrowserCredValue(''); setBrowserCredPassword(''); lastGateSigRef.current.browserCred = undefined; }}
                  disabled={browserCredBusy}
                  style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', cursor: browserCredBusy ? 'default' : 'pointer' }}
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        )
      }

      <div className={`composer-footer ${sessionKind === 'agent' ? 'composer-footer-embedded' : ''}`}>
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
                <span>{t('dropFilesHere', 'Drop the files here')}</span>
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
                        {t('uploading', 'Uploading')}
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

            {/* When history is rendered elsewhere (ChatPanel), that panel owns the
                thinking indicator — showing it here too caused the "neural thinking
                duplicated twice" the user reported. Only show it when this composer
                also owns the history. */}
            {!hideHistory && status === 'thinking' && (
              <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: '8px' }}>
                <NeuralThinkingIndicator
                  visible={true}
                  phase={thinkingPhase}
                  variant="inline"
                  sessionId={sessionId}
                />
                <TaskTracker />
              </div>
            )}

            <TodosPanel sessionId={sessionId} />


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



            {/* Actions Footer Refactored for Corner Positioning */}
            <div className="composer-actions">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>


                <input
                  type="file"
                  multiple
                  data-joe-attach
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />

                {/* Dynamic Provider Logo Helper */}
                {(() => {
                  const getProviderLogo = (key: string) => {
                    const isCon = providers[key]?.isConnected;
                    const color = isCon ? "#10b981" : "#ef4444";
                    const mutedColor = "var(--text-muted)";

                    // Brand Gradients Definition
                    const Gradients = () => (
                      <svg width="0" height="0" style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}>
                        <defs>
                          <linearGradient id="gemini-grade" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#4E75F5" />
                            <stop offset="100%" stopColor="#9D46F5" />
                          </linearGradient>
                          <linearGradient id="deepseek-grade" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#4d6bfe" />
                            <stop offset="100%" stopColor="#2c3e50" />
                          </linearGradient>
                        </defs>
                      </svg>
                    );

                    if (key === 'auto') return (
                      <div style={{ position: 'relative', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Bot size={22} color="#8b5cf6" style={{ filter: 'drop-shadow(0 0 6px rgba(139, 92, 246, 0.5))' }} />
                        {isCon && <div style={{
                          position: 'absolute', bottom: -1, right: -1, width: 8, height: 8,
                          background: '#10b981', borderRadius: '50%', border: '2px solid var(--bg-primary)',
                          boxShadow: '0 0 4px #10b981'
                        }} />}
                      </div>
                    );

                    if (key === 'openai') return (
                      // 100% Official OpenAI Blossom Logo
                      <svg viewBox="0 0 156 154" width="22" height="22" fill={isCon ? "#ffffff" : mutedColor} style={{ transition: 'fill 0.3s' }}>
                        <path d="M59.7325 56.1915V41.6219C59.7325 40.3948 60.1929 39.4741 61.266 38.8613L90.5592 21.9915C94.5469 19.6912 99.3013 18.6181 104.208 18.6181C122.612 18.6181 134.268 32.8813 134.268 48.0637C134.268 49.1369 134.268 50.364 134.114 51.5911L103.748 33.8005C101.908 32.7274 100.067 32.7274 98.2267 33.8005L59.7325 56.1915ZM128.133 112.937V78.1222C128.133 75.9745 127.212 74.441 125.372 73.3678L86.878 50.9768L99.4538 43.7682C100.527 43.1554 101.448 43.1554 102.521 43.7682L131.814 60.6381C140.25 65.5464 145.923 75.9745 145.923 86.0961C145.923 97.7512 139.023 108.487 128.133 112.935V112.937ZM50.6841 82.2638L38.1083 74.9028C37.0351 74.29 36.5748 73.3693 36.5748 72.1422V38.4025C36.5748 21.9929 49.1506 9.5696 66.1744 9.5696C72.6162 9.5696 78.5962 11.7174 83.6585 15.5511L53.4461 33.0352C51.6062 34.1084 50.6855 35.6419 50.6855 37.7897V82.2653L50.6841 82.2638ZM77.7533 97.9066L59.7325 87.785V66.3146L77.7533 56.193L95.7725 66.3146V87.785L77.7533 97.9066ZM89.3321 144.53C82.8903 144.53 76.9103 142.382 71.848 138.549L102.06 121.064C103.9 119.991 104.821 118.458 104.821 116.31V71.8343L117.551 79.1954C118.624 79.8082 119.084 80.7289 119.084 81.956V115.696C119.084 132.105 106.354 144.529 89.3321 144.529V144.53ZM52.9843 110.33L23.6911 93.4601C15.2554 88.5517 9.58181 78.1237 9.58181 68.0021C9.58181 56.193 16.6365 45.611 27.5248 41.163V76.1299C27.5248 78.2776 28.4455 79.8111 30.2854 80.8843L68.6271 103.121L56.0513 110.33C54.9781 110.943 54.0574 110.943 52.9843 110.33ZM51.2983 135.482C33.9681 135.482 21.2384 122.445 21.2384 106.342C21.2384 105.115 21.3923 103.888 21.3923 105.115C21.5448 102.661L51.7572 120.145C53.5971 121.218 55.4385 121.218 57.2784 120.145L95.7725 97.9081V112.478C95.7725 113.705 95.3122 114.625 94.239 115.238L64.9458 132.108C60.9582 134.408 56.2037 135.482 51.2969 135.482H51.2983ZM89.3321 153.731C107.889 153.731 123.378 140.542 126.907 123.058C144.083 118.61 155.126 102.507 155.126 86.0976C155.126 75.3617 150.525 64.9336 142.243 57.4186C143.01 54.1977 143.471 50.9768 143.471 47.7573C143.471 25.8267 125.68 9.41567 105.129 9.41567C100.989 9.41567 97.0011 10.0285 93.0134 11.4095C86.1112 4.66126 76.6024 0.367188 66.1744 0.367188C47.6171 0.367188 32.1282 13.5558 28.5994 31.0399C11.4232 35.4879 0.380859 51.5911 0.380859 68.0006C0.380859 78.7365 4.98133 89.1645 13.2631 96.6795C12.4963 99.9004 12.036 103.121 12.036 106.341C12.036 128.271 29.8265 144.682 50.3777 144.682C54.5178 144.682 58.5055 144.07 62.4931 142.689C69.3938 149.437 78.9026 153.731 89.3321 153.731Z" />
                      </svg>
                    );

                    if (key === 'anthropic') return (
                      // 100% Official Anthropic Symbol
                      <svg viewBox="0 0 25 25" width="22" height="22" fill={isCon ? "#D97757" : mutedColor}>
                        <path d="M11.376 24L10.776 23.544L10.44 22.8L10.776 21.312L11.16 19.392L11.472 17.856L11.76 15.96L11.928 15.336L11.904 15.288L11.784 15.312L10.344 17.28L8.16 20.232L6.432 22.056L6.024 22.224L5.304 21.864L5.376 21.192L5.784 20.616L8.16 17.568L9.6 15.672L10.536 14.592L10.512 14.448H10.464L4.128 18.576L3 18.72L2.496 18.264L2.568 17.52L2.808 17.28L4.704 15.96L9.432 13.32L9.504 13.08L9.432 12.96H9.192L8.4 12.912L5.712 12.84L3.384 12.744L1.104 12.624L0.528 12.504L0 11.784L0.048 11.424L0.528 11.112L1.224 11.16L2.736 11.28L5.016 11.424L6.672 11.52L9.12 11.784H9.504L9.552 11.616L9.432 11.52L9.336 11.424L6.96 9.84L4.416 8.16L3.072 7.176L2.352 6.672L1.992 6.216L1.848 5.208L2.496 4.488L3.384 4.56L3.6 4.608L4.488 5.304L6.384 6.768L8.88 8.616L9.24 8.904L9.408 8.808V8.736L9.24 8.472L7.896 6.024L6.456 3.528L5.808 2.496L5.64 1.872C5.576 1.656 5.544 1.416 5.544 1.152L6.288 0.144001L6.696 0L7.704 0.144001L8.112 0.504001L8.736 1.92L9.72 4.152L11.28 7.176L11.736 8.088L11.976 8.904L12.072 9.168H12.24V9.024L12.36 7.296L12.6 5.208L12.84 2.52L12.912 1.752L13.296 0.840001L14.04 0.360001L14.616 0.624001L15.096 1.32L15.024 1.752L14.76 3.6L14.184 6.504L13.824 8.472H14.04L14.28 8.208L15.264 6.912L16.92 4.848L17.64 4.032L18.504 3.12L19.056 2.688H20.088L20.832 3.816L20.496 4.992L19.44 6.336L18.552 7.464L17.28 9.168L16.512 10.536L16.584 10.632H16.752L19.608 10.008L21.168 9.744L22.992 9.432L23.832 9.816L23.928 10.2L23.592 11.016L21.624 11.496L19.32 11.952L15.888 12.768L15.84 12.792L15.888 12.864L17.424 13.008L18.096 13.056H19.728L22.752 13.272L23.544 13.8L24 14.424L23.928 14.928L22.704 15.528L21.072 15.144L17.232 14.232L15.936 13.92H15.744V14.016L16.848 15.096L18.84 16.896L21.36 19.224L21.48 19.8L21.168 20.28L20.832 20.232L18.624 18.552L17.76 17.808L15.84 16.2H15.72V16.368L16.152 17.016L18.504 20.544L18.624 21.624L18.456 21.96L17.832 22.176L17.184 22.056L15.792 20.136L14.376 17.952L13.224 16.008L13.104 16.104L12.408 23.352L12.096 23.712L11.376 24" />
                      </svg>
                    );

                    if (key === 'gemini') return (
                      // Official Google Multicolored "G" Logo
                      <svg viewBox="0 0 24 24" width="20" height="20">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill={isCon ? "#4285F4" : mutedColor} />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill={isCon ? "#34A853" : mutedColor} />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill={isCon ? "#FBBC05" : mutedColor} />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill={isCon ? "#EA4335" : mutedColor} />
                      </svg>
                    );

                    if (key === 'deepseek') return (
                      // Official DeepSeek Blue Whale Logo
                      <svg viewBox="0 0 64 64" width="22" height="22">
                        <path d="M46.7 18.2L31.3 2.8C25.4-3.1 15.6 1.4 15.6 9.8v10.9c0 1.9 1.1 3.5 2.8 4.3L32.2 32c10.3 5.1 22.3 1.9 27.5-8.4l1.6-3.1c.9-1.9.4-4.2-1.2-5.7L46.7 18.2zM21.2 25.1c-.8-.8-2.1-.8-2.9 0l-12.8 12.8c-1.6 1.6-1.6 4.2 0 5.7l1.2 1.2c.8.8 2.1.8 2.9 0L24 32.3c1.6-1.6 1.6-4.2 0-5.7l-2.8-1.5z"
                          fill={isCon ? "#4d6bfe" : mutedColor} />
                      </svg>
                    );

                    if (key === 'mistral') return (
                      // 100% Official Mistral AI "M" Icon
                      <svg viewBox="0 0 191 135" width="22" height="22" fill="none">
                        <path d="M54.3219 0H27.1528V27.0892H54.3219V0Z" fill={isCon ? "#FFD800" : mutedColor} />
                        <path d="M162.984 0H135.815V27.0892H162.984V0Z" fill={isCon ? "#FFD800" : mutedColor} />
                        <path d="M81.482 27.0913H27.1528V54.1805H81.482V27.0913Z" fill={isCon ? "#FFAF00" : mutedColor} />
                        <path d="M162.99 27.0913H108.661V54.1805H162.99V27.0913Z" fill={isCon ? "#FFAF00" : mutedColor} />
                        <path d="M162.971 54.168H27.1528V81.2572H162.971V54.168Z" fill={isCon ? "#FF8205" : mutedColor} />
                        <path d="M54.3219 81.2593H27.1528V108.349H54.3219V81.2593Z" fill={isCon ? "#FA500F" : mutedColor} />
                        <path d="M108.661 81.2593H81.4917V108.349H108.661V81.2593Z" fill={isCon ? "#FA500F" : mutedColor} />
                        <path d="M162.984 81.2593H135.815V108.349H162.984V81.2593Z" fill={isCon ? "#FA500F" : mutedColor} />
                        <path d="M81.4879 108.339H-0.00146484V135.429H81.4879V108.339Z" fill={isCon ? "#E10500" : mutedColor} />
                        <path d="M190.159 108.339H108.661V135.429H190.159V108.339Z" fill={isCon ? "#E10500" : mutedColor} />
                      </svg>
                    );

                    if (key === 'openrouter') return (
                      // 100% Official OpenRouter Logo (Circuit/Arrow)
                      <svg viewBox="0 0 512 512" width="22" height="22" fill={isCon ? "currentColor" : mutedColor}>
                        <path d="M3 248.945C18 248.945 76 236 106 219C136 202 136 202 198 158C276.497 102.293 332 120.945 423 120.945" stroke={isCon ? "#6366f1" : mutedColor} strokeWidth="90" fill="none" />
                        <path d="M511 121.5L357.25 210.268L357.25 32.7324L511 121.5Z" fill={isCon ? "#6366f1" : mutedColor} />
                        <path d="M0 249C15 249 73 261.945 103 278.945C133 295.945 133 295.945 195 339.945C273.497 395.652 329 377 420 377" stroke={isCon ? "#6366f1" : mutedColor} strokeWidth="90" fill="none" />
                        <path d="M508 376.445L354.25 287.678L354.25 465.213L508 376.445Z" fill={isCon ? "#6366f1" : mutedColor} />
                      </svg>
                    );

                    if (key === 'huggingface') return (
                      // 100% Official Hugging Face Smiley Logo
                      <svg viewBox="0 0 95 88" width="24" height="24">
                        <path fill={isCon ? "#FFD21E" : mutedColor} d="M47.21 76.5a34.75 34.75 0 1 0 0-69.5 34.75 34.75 0 0 0 0 69.5Z" />
                        <path fill={isCon ? "#FF9D0B" : mutedColor} d="M81.96 41.75a34.75 34.75 0 1 0-69.5 0 34.75 34.75 0 0 0 69.5 0Zm-73.5 0a38.75 38.75 0 1 1 77.5 0 38.75 38.75 0 0 1-77.5 0Z" />
                        <path fill={isCon ? "#3A3B45" : mutedColor} d="M58.5 32.3c1.28.44 1.78 3.06 3.07 2.38a5 5 0 1 0-6.76-2.07c.61 1.15 2.55-.72 3.7-.32ZM34.95 32.3c-1.28.44-1.79 3.06-3.07 2.38a5 5 0 1 1 6.76-2.07c-.61 1.15-2.56-.72-3.7-.32Z" />
                        <path fill={isCon ? "#FF323D" : mutedColor} d="M46.96 56.29c9.83 0 13-8.76 13-13.26 0-2.34-1.57-1.6-4.09-.36-2.33 1.15-5.46 2.74-8.9 2.74-7.19 0-13-6.88-13-2.38s3.16 13.26 13 13.26Z" />
                      </svg>
                    );

                    if (key === 'perplexity') return (
                      // 100% Official Perplexity Logo
                      <svg viewBox="0 0 30 32" width="22" height="22" fill={isCon ? "#20b2aa" : mutedColor}>
                        <path d="M15 0.124727C15.4832 0.124727 15.8748 0.516607 15.875 0.999727V8.88645L24.3809 0.380586C24.6311 0.130476 25.0081 0.0557816 25.335 0.191133C25.6618 0.326537 25.8749 0.645944 25.875 0.999727V10.1003H28.75L28.8398 10.1052C29.2809 10.1502 29.625 10.5224 29.625 10.9753V23.5007C29.6246 23.9836 29.233 24.3757 28.75 24.3757H25.875V30.9997C25.875 31.3536 25.6619 31.6729 25.335 31.8083C25.008 31.9438 24.6311 31.8691 24.3809 31.6189L15.875 23.113V30.9997C15.875 31.483 15.4832 31.8747 15 31.8747C14.5168 31.8747 14.125 31.483 14.125 30.9997V23.113L5.61914 31.6189C5.36889 31.8691 4.992 31.9438 4.66504 31.8083C4.33815 31.6729 4.125 31.3536 4.125 30.9997V24.3757H1.25C0.76699 24.3757 0.375388 23.9836 0.375 23.5007V10.9753C0.375 10.4921 0.766751 10.1003 1.25 10.1003H4.125V0.999727C4.12511 0.645944 4.33818 0.326537 4.66504 0.191133C4.99192 0.0557816 5.36892 0.130476 5.61914 0.380586L14.125 8.88645V0.999727C14.1252 0.516607 14.5168 0.124727 15 0.124727ZM5.875 20.1462V28.8864L14.125 20.6364V12.9275L5.875 20.1462ZM15.875 20.6364L24.125 28.8864V20.1462L15.875 12.9275V20.6364ZM2.125 22.6257H4.125V19.7497L4.12988 19.656C4.15334 19.4388 4.25778 19.2369 4.42383 19.0915L12.6992 11.8503H5.20312C5.13787 11.8658 5.07001 11.8747 5 11.8747C4.92999 11.8747 4.86213 11.8658 4.79688 11.8503H2.125V22.6257ZM25.5762 19.0915C25.7659 19.2576 25.8749 19.4976 25.875 19.7497V22.6257H27.875V11.8503H25.2031C25.1379 11.8658 25.07 11.8747 25 11.8747C24.93 11.8747 24.8621 11.8658 24.7969 11.8503H17.3008L25.5762 19.0915ZM5.875 10.1003H12.8623L5.875 3.11301V10.1003ZM17.1377 10.1003H24.125V3.11301L17.1377 10.1003Z" />
                      </svg>
                    );

                    if (key === 'together') return (
                      // 100% Official Together AI Logo (Dot)
                      <svg viewBox="0 0 100 30" width="30" height="22" fill={isCon ? "currentColor" : mutedColor}>
                        <path d="M88.067 14.1988C88.067 15.1664 87.2731 15.9508 86.2937 15.9508C85.3144 15.9508 84.5205 15.1664 84.5205 14.1988C84.5205 13.2312 85.3144 12.4468 86.2937 12.4468C87.2731 12.4468 88.067 13.2312 88.067 14.1988Z" fill="#0F6FFF" />
                      </svg>
                    );

                    if (key === 'provider-') return null;

                    if (key === 'grok') return (
                      // Official xAI Grok (Feb 2025 "Saturn G" Monogram)
                      <svg viewBox="0 0 88 33" width="30" height="22" fill={isCon ? "#ffffff" : mutedColor}>
                        <path d="M13.2371 21.0407L24.3186 12.8506C24.8619 12.4491 25.6384 12.6057 25.8973 13.2294C27.2597 16.5185 26.651 20.4712 23.9403 23.1851C21.2297 25.8989 17.4581 26.4941 14.0108 25.1386L10.2449 26.8843C15.6463 30.5806 22.2053 29.6665 26.304 25.5601C29.5551 22.3051 30.562 17.8683 29.6205 13.8673L29.629 13.8758C28.2637 7.99809 29.9647 5.64871 33.449 0.844576C33.5314 0.730667 33.6139 0.616757 33.6964 0.5L29.1113 5.09055V5.07631L13.2343 21.0436" />
                        <path d="M10.9503 23.0313C7.07343 19.3235 7.74185 13.5853 11.0498 10.2763C13.4959 7.82722 17.5036 6.82767 21.0021 8.2971L24.7595 6.55998C24.0826 6.07017 23.215 5.54334 22.2195 5.17313C17.7198 3.31926 12.3326 4.24192 8.67479 7.90126C5.15635 11.4239 4.0499 16.8403 5.94992 21.4622C7.36924 24.9165 5.04257 27.3598 2.69884 29.826C1.86829 30.7002 1.0349 31.5745 0.36364 32.5L10.9474 23.0341" />
                      </svg>
                    );

                    return <Cpu size={18} color={isCon ? color : 'var(--text-muted)'} />;
                  };

                  return (
                    <button
                      className={`provider-btn provider-${activeProvider} ${(() => {
                        const st = providers[activeProvider];
                        if (st?.isConnected) return 'is-connected';
                        if (st?.isVerifying) return 'is-verifying';
                        // Red ONLY for a verification that really failed. Before any
                        // test has run there is nothing to report — stay neutral.
                        return st?.lastError ? 'is-disconnected' : 'is-unknown';
                      })()}`}
                      onClick={() => setShowProviders(true)}
                      title={`${t('aiProviders', 'AI Providers')}: ${providers[activeProvider]?.name || activeProvider}`}
                    >
                      {getProviderLogo(activeProvider)}
                      <span className="provider-label" style={{ marginLeft: 6, fontSize: 12 }}>
                        {(activeProvider === 'openai' ? 'OpenAI' : activeProvider === 'deepseek' ? 'DeepSeek' : activeProvider === 'openrouter' ? 'Router' : activeProvider === 'anthropic' ? 'Claude' : activeProvider.charAt(0).toUpperCase() + activeProvider.slice(1)).slice(0, 10)}
                      </span>
                    </button>
                  );
                })()}

                <button
                  className="action-btn"
                  onClick={() => fileInputRef.current?.click()}
                  title={t('attachFile') || "Attach file"}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <Loader2 size={14} className="spin" />
                  ) : <Paperclip size={14} />}
                </button>

                <button
                  className="action-btn"
                  onClick={onGitClick}
                  title="GitHub Integration"
                >
                  <Github size={14} color={githubConnected ? "#10b981" : "#ef4444"} />
                </button>



                <button
                  className={`action-btn ${isVoiceMode ? 'active' : ''}`}
                  onClick={() => setIsVoiceMode(!isVoiceMode)}
                  title="Voice Mode"
                >
                  {isVoiceMode ? <Mic size={14} /> : <MicOff size={14} />}
                </button>
              </div>

              {/* Send Button - Pushed to right via CSS space-between */}
              <button
                className={`send-btn ${status !== 'idle' || !!approval || !!secretPrompt ? 'is-busy' : ''}`}
                onClick={() => {
                  if (status !== 'idle' || !!approval || !!secretPrompt) {
                    stopCurrentRun();
                    return;
                  }
                  if (isUploading) {
                    return;
                  }
                  try {
                    run();
                  } catch (e) {
                    console.error('run() threw synchronously:', e);
                  }
                }}
                disabled={status !== 'idle' || !!approval || !!secretPrompt ? false : (isUploading || !text.trim() || !!approval)}
                title={status !== 'idle' || !!approval || !!secretPrompt ? (t('stop') || 'Stop') : t('send')}
                style={{ position: 'relative' }}
              >
                {status !== 'idle' || !!approval || !!secretPrompt ? (
                  // «حلقة التقدّم»: the ring and arc are drawn by the button's
                  // own ::before/::after — only the stop square is content.
                  <Square size={10} fill="currentColor" />
                ) : <ArrowUp size={14} />}
              </button>
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
    </div >
  );
}
