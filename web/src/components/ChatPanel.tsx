import { stripPictographs } from '../lib/plainText';
import React, { useRef, useEffect, useState } from 'react';
import { Sparkles, Send, Mic, User, Bot, Copy, Check, Paperclip } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import NeuralThinkingIndicator from './NeuralThinkingIndicator';
import { NeuralTraceReceipt } from './NeuralTraceView';
import { attachTraces, loadTraces, type NeuralTrace } from '../lib/neuralTrace';
import JoeMark from './JoeMark';
import { composeGreeting } from '../lib/greetings';
import { resolveIdentity } from '../lib/userIdentity';
import TodosPanel from './TodosPanel';
import ArtifactCard from './ArtifactCard';
import { isEngineeringReport, summarizeEngineeringReport } from '../lib/engineeringReportSummary';

import { SocketService } from '../services/socket';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    /** Attachment meta the user sent with this message (id/name/type/size). */
    files?: Array<{ id?: string; name?: string; mimeType?: string; size?: number }>;
    timestamp?: Date;
}

// Old sessions stored system messages with literally escaped newlines ("\n\n"
// rendered as text). The source strings are fixed, but persisted history still
// carries them — unescape outside code fences so old chats read correctly too.
function unescapeStoredNewlines(text: string): string {
    if (!text.includes('\\n')) return text;
    return text
        .split('```')
        .map((seg, i) => (i % 2 === 0 ? seg.replace(/\\n/g, '\n') : seg))
        .join('```');
}

interface ChatPanelProps {
    messages: Message[];
    inputValue: string;
    onInputChange: (value: string) => void;
    onSend: () => void;
    isLoading?: boolean;
    placeholder?: string;
    children?: React.ReactNode; // For CommandComposer
    isCollapsed?: boolean;
    sessionId?: string;
}

export default function ChatPanel({
    messages,
    inputValue,
    onInputChange,
    onSend,
    isLoading = false,
    placeholder = 'Ask Joe or type a command...',
    children,
    isCollapsed = false,
    sessionId
}: ChatPanelProps) {
    const { t, i18n } = useTranslation();
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // «مساء الخير يا يونس — ما الذي سنصنعه الليلة؟»: the welcome greets the user
    // by name and matches the actual time of day, rotating its phrasing daily.
    const greeting = React.useMemo(
        () => composeGreeting(i18n.language, resolveIdentity().name),
        [i18n.language]
    );

    // [Wakil 6.0] Subscribe to thinking phase
    const [thinkingPhase, setThinkingPhase] = useState<'analyzing' | 'synthesizing' | 'executing' | 'idle'>('idle');
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const handleCopy = (id: string, text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    // Track the active session so thinking events from OTHER sessions never show
    // here (previously session 1's indicator leaked into session 2).
    const activeSessionRef = useRef(sessionId);
    useEffect(() => { activeSessionRef.current = sessionId; }, [sessionId]);

    useEffect(() => {
        const unsubscribe = SocketService.subscribeThinkingPhase((phase: any, evSid?: string) => {
            // The transport is session-filtered; retain this check as a local
            // boundary while a session switch is being committed.
            if (evSid && activeSessionRef.current && evSid !== activeSessionRef.current) return;
            setThinkingPhase(phase);
        }, sessionId);
        return () => unsubscribe();
    }, [sessionId]);

    // Switching sessions must clear any leftover indicator immediately.
    useEffect(() => {
        setThinkingPhase('idle');
    }, [sessionId]);

    // THE RECEIPT. Every run Joe finished in this session left a sealed trace
    // behind; this pairs each one with the reply it produced, so the work stays
    // in the chat after the live card is gone — including after a reload.
    const [traces, setTraces] = useState<NeuralTrace[]>(() => loadTraces(sessionId));
    useEffect(() => { setTraces(loadTraces(sessionId)); }, [sessionId]);
    useEffect(() => {
        const unsub = SocketService.subscribeTraceSealed((trace) => {
            if (activeSessionRef.current && trace.sessionId !== activeSessionRef.current) return;
            setTraces(loadTraces(activeSessionRef.current));
        }, sessionId);
        return () => unsub();
    }, [sessionId]);
    const traceFor = React.useMemo(() => attachTraces(messages, traces), [messages, traces]);

    // Auto scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Keep the live activity at the end of this same conversation stream when
    // it changes, without covering the messages above or the composer below.
    useEffect(() => {
        if (isLoading) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [isLoading, thinkingPhase]);

    // Handle Enter key
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (inputValue.trim() && !isLoading) {
                onSend();
            }
        }
    };

    // Auto-resize textarea
    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const target = e.target;
        target.style.height = 'auto';
        target.style.height = Math.min(target.scrollHeight, 120) + 'px';
        onInputChange(target.value);
    };

    return (
        <aside className={`joe-chat-panel ${isCollapsed ? 'collapsed' : ''}`}>
            {/* Messages — the panel needs no header of its own: the app header
                above it already carries the brand, and a second small "Joe"
                right under it was pure repetition (removed at the owner's
                request). */}
            <div className="joe-chat-messages">
                {messages.length === 0 ? (
                    /**
                     * The welcome screen. Two measured defects fixed here:
                     *
                     * - It was CRUSHED on short screens: this is a child of a
                     *   flex column, and its default flex-shrink squeezed the
                     *   box while the 92px mark kept its size — the logo's top
                     *   was cut off (the user photographed exactly that). Now
                     *   it never shrinks (flex-shrink:0) and every size inside
                     *   is fluid (clamp on the mark, title, text and gaps), so
                     *   it fits any screen and scrolls as a whole if it must.
                     * - All styling lives in the stylesheet below, where media
                     *   queries can actually reach it.
                     */
                    <div className="joe-chat-empty">
                        {/* The signature writes itself when you open a fresh chat */}
                        <span className="joe-empty-mark"><JoeMark size={92} animate /></span>

                        <h2 className="joe-empty-title">{greeting.salute}</h2>
                        <p className="joe-empty-question">{greeting.question}</p>
                    </div>
                ) : (
                    <>
                        {/**
                          * The greeting does not vanish when the conversation
                          * starts — the user asked for it to STAY in the chat:
                          * «لن لا تختفي وتبقى في الدردشة». It becomes the first
                          * entry of the conversation, compact, and scrolls with
                          * the history like any other part of the chat.
                          */}
                        <div className="joe-chat-hello" dir="auto">
                            <JoeMark size={20} />
                            <span className="joe-chat-hello-salute">{greeting.salute}</span>
                            <span className="joe-chat-hello-q">{greeting.question}</span>
                        </div>
                        {messages.map((msg) => {
                        const storedContent = unescapeStoredNewlines(msg.content);
                        const displayedContent = msg.role === 'assistant' && isEngineeringReport(storedContent)
                            ? summarizeEngineeringReport(storedContent, i18n.language)
                            : storedContent;
                        const isDeliverySummary = msg.role === 'assistant' && isEngineeringReport(storedContent);
                        return (
                        <div key={msg.id} className={`joe-message ${msg.role}${isDeliverySummary ? ' is-delivery-summary' : ''}`}>
                            <div className={`joe-message-avatar ${msg.role === 'assistant' ? 'ai' : 'user'}`}>
                                {msg.role === 'assistant' ? <JoeMark size={24} /> : 'U'}
                            </div>
                            <div className="joe-message-content">
                                {/* What Joe did before he answered — collapsed to one
                                    line, and kept. It sits ABOVE the reply because
                                    that is the order it happened in. */}
                                {msg.role === 'assistant' && traceFor.has(msg.id) && (
                                    <NeuralTraceReceipt trace={traceFor.get(msg.id)!} />
                                )}
                                {/* dir="auto" + per-block auto direction below: a Latin
                                    name («Younes») inside an Arabic sentence scrambled
                                    the visual word order (BiDi), field-reported. Each
                                    block resolves its direction from its own first
                                    strong character, so mixed-script lines read right. */}
                                <div className="joe-message-bubble" dir="auto">
                                    {/* The attachments the user sent WITH this message.
                                        This renderer never showed them — the user
                                        attached an image, pressed Enter, and the chat
                                        showed text only. Images render as REAL
                                        thumbnails served by the API (so they survive
                                        reloads); other files show name chips. */}
                                    {Array.isArray(msg.files) && msg.files.length > 0 && (
                                        <div className="joe-msg-files">
                                            {msg.files.map((f, i) => {
                                                const isImage = /^image\//i.test(f.mimeType || '');
                                                const token = (() => { try { return localStorage.getItem('token') || ''; } catch { return ''; } })();
                                                const rawUrl = f.id ? `/api/files/${encodeURIComponent(f.id)}/raw?token=${encodeURIComponent(token)}` : '';
                                                return isImage && rawUrl ? (
                                                    <a key={i} href={rawUrl} target="_blank" rel="noopener noreferrer" className="joe-msg-file is-image" title={f.name || ''}>
                                                        <img src={rawUrl} alt={f.name || 'image'} loading="lazy" />
                                                    </a>
                                                ) : (
                                                    <span key={i} className="joe-msg-file" title={f.name || ''}>
                                                        <Paperclip size={12} />
                                                        <span className="joe-msg-file-name">{f.name || 'ملف'}</span>
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    )}
                                    <ReactMarkdown
                                        // A single newline IS a line break here.
                                        //
                                        // Measured on the owner's screen, from the DOM and not from the source:
                                        // Joe's delivery message arrived as ONE <p> of 2107 characters carrying
                                        // 39 newline characters and 0 <br> elements, with computed white-space
                                        // 'normal' -- so every break collapsed to a space and a night of honest
                                        // reporting reached him as a wall.
                                        //
                                        // Nothing was broken on either side. The producer writes chat text where
                                        // a newline ends a line; the renderer applies CommonMark, where a single
                                        // newline is a soft break and means a space. Two parties that must agree,
                                        // maintained separately, with nothing forcing them -- so this is the line
                                        // that forces them, and it is applied at EVERY renderer, because fixing
                                        // the one that was seen and leaving the rest is how the same defect comes
                                        // back through a second emitter.
                                        //
                                        // remark-breaks@4 measured through this exact renderer before adoption:
                                        // 3 newlines -> 0 <br> without it, 3 <br> with it; code fences keep 0 <br>
                                        // and their text intact; blank-line-separated paragraphs stay 2 <p>.
                                        remarkPlugins={[remarkBreaks]}
                                        components={{
                                            // Each paragraph/heading/list-item decides its own
                                            // direction — the BiDi fix above, block by block.
                                            h1: ({ ...props }) => <h1 dir="auto" {...props} />,
                                            h2: ({ ...props }) => <h2 dir="auto" {...props} />,
                                            h3: ({ ...props }) => <h3 dir="auto" {...props} />,
                                            ul: ({ ...props }) => <ul dir="auto" {...props} />,
                                            ol: ({ ...props }) => <ol dir="auto" {...props} />,
                                            li: ({ ...props }) => <li dir="auto" {...props} />,
                                            p: ({ ...props }) => <p dir="auto" {...props} />,
                                            blockquote: ({ ...props }) => <blockquote dir="auto" {...props} />,
                                            code({ className, children, ...props }: any) {
                                                // [ARTIFACT] A ```joe-artifact <json>``` block renders an elegant
                                                // artifact card (file + open-preview/download) instead of raw JSON.
                                                if (/language-joe-artifact/.test(className || '')) {
                                                    try {
                                                        const meta = JSON.parse(String(children).trim());
                                                        return <ArtifactCard meta={meta} isArabic />;
                                                    } catch { return null; }
                                                }

                                                const match = /language-(\w+)/.exec(className || '');

                                                // Detection for custom Code Citation format: language-ts:10:20:src/index.ts
                                                // Actually, marked might just pass the whole string after the backticks as the class name.
                                                // e.g. ```typescript:10:20:src/index.ts -> className: "language-typescript:10:20:src/index.ts"
                                                const citationMatch = className?.match(/language-([a-zA-Z0-9]+):(\d+):(\d+):(.+)/);

                                                if (citationMatch) {
                                                    const [_, lang, startLine, endLine, filepath] = citationMatch;
                                                    return (
                                                        <div className="joe-code-citation group" style={{
                                                            background: 'rgba(20,25,32,0.8)',
                                                            border: '1px solid rgba(52, 196, 139, 0.3)',
                                                            borderRadius: '12px',
                                                            overflow: 'hidden',
                                                            marginTop: '8px',
                                                            marginBottom: '8px',
                                                            transition: 'all 0.2s ease',
                                                            cursor: 'pointer'
                                                        }}
                                                            onClick={() => {
                                                                // TODO: Trigger AutoOpenManager or Workspace Service to open the file.
                                                                void 0;
                                                            }}
                                                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--joe-gold-primary)'; e.currentTarget.style.boxShadow = '0 0 15px rgba(52, 196, 139,0.15)'; }}
                                                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(52, 196, 139, 0.3)'; e.currentTarget.style.boxShadow = 'none'; }}
                                                        >
                                                            <div className="joe-citation-header" style={{
                                                                background: 'rgba(0,0,0,0.4)',
                                                                padding: '6px 12px',
                                                                display: 'flex',
                                                                justifyContent: 'space-between',
                                                                alignItems: 'center',
                                                                fontSize: '12px',
                                                                borderBottom: '1px solid rgba(255,255,255,0.05)'
                                                            }}>
                                                                <span style={{ color: 'var(--joe-gold-primary)', fontWeight: 600 }}>{filepath}</span>
                                                                <span style={{ color: 'var(--joe-text-muted)' }}>Lines {startLine}-{endLine}</span>
                                                            </div>
                                                            <div className="joe-citation-body" style={{ opacity: 0.9 }}>
                                                                <SyntaxHighlighter
                                                                    style={vscDarkPlus as any}
                                                                    language={lang}
                                                                    PreTag="div"
                                                                    customStyle={{ margin: 0, padding: '12px', background: 'transparent' }}
                                                                    {...props}
                                                                >
                                                                    {String(children).replace(/\n$/, '')}
                                                                </SyntaxHighlighter>
                                                            </div>
                                                        </div>
                                                    );
                                                }

                                                return match ? (
                                                    <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                        <SyntaxHighlighter
                                                            style={vscDarkPlus as any}
                                                            language={match[1]}
                                                            PreTag="div"
                                                            customStyle={{ margin: 0 }}
                                                            {...props}
                                                        >
                                                            {String(children).replace(/\n$/, '')}
                                                        </SyntaxHighlighter>
                                                    </div>
                                                ) : (
                                                    <code className={className} {...props} style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', color: 'var(--joe-gold-primary)' }}>
                                                        {children}
                                                    </code>
                                                );
                                            }
                                        }}
                                    >
                                        {msg.role === 'assistant' ? stripPictographs(displayedContent) : displayedContent}
                                    </ReactMarkdown>
                                </div>
                                {msg.role === 'assistant' && (
                                    <div className="joe-msg-actions" style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '6px' }}>
                                        <button
                                            onClick={() => handleCopy(msg.id, msg.content)}
                                            title="انسخ الرد"
                                            style={{
                                                background: 'transparent', border: 'none', color: 'var(--joe-text-muted)',
                                                cursor: 'pointer', padding: '4px 8px', borderRadius: '4px', display: 'flex',
                                                alignItems: 'center', gap: '6px', fontSize: '12px', transition: 'all 0.2s'
                                            }}
                                            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--joe-text)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--joe-text-muted)'; e.currentTarget.style.background = 'transparent'; }}
                                        >
                                            {copiedId === msg.id ? <Check size={14} color="var(--joe-success, #4CAF50)" /> : <Copy size={14} />}
                                            {copiedId === msg.id ? 'تم النسخ' : 'نسخ النص'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                        );
                        })}
                    </>
                )}
                {/* Live activity is a real assistant row in the conversation,
                    not a second panel. It remains above the composer because it
                    belongs to the scroll stream and the composer follows it. */}
                {isLoading && (
                    <div className="joe-live-dock" role="status" aria-live="polite">
                        <div className="joe-message assistant">
                            <div className="joe-message-avatar ai"><JoeMark size={24} /></div>
                            <div className="joe-message-content joe-live-content">
                                <NeuralThinkingIndicator
                                    visible={isLoading}
                                    phase={thinkingPhase}
                                    variant="bubble"
                                    sessionId={sessionId}
                                />
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />

            </div>

            {/* Input Area - Use children if provided (for CommandComposer) */}
            {children ? (
                <div className="joe-chat-input-area">
                    {children}
                </div>
            ) : (
                <div className="joe-chat-input-area" style={{ position: 'relative' }}>
                    <div className="joe-chat-input-wrapper" style={{ position: 'relative' }}>
                        <div style={{ position: 'absolute', bottom: 'calc(100% + 12px)', right: 0, zIndex: 100 }}>
                            <TodosPanel />
                        </div>
                        <textarea
                            ref={inputRef}
                            value={inputValue}
                            onChange={handleInput}
                            onKeyDown={handleKeyDown}
                            placeholder={placeholder}
                            className="joe-chat-input"
                            rows={1}
                            disabled={isLoading}
                        />
                        <button
                            className="joe-send-btn"
                            onClick={onSend}
                            disabled={!inputValue.trim() || isLoading}
                            title="Send message"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </div>
            )}

            <style>{`
        .typing-dot {
          animation: typingPulse 1s infinite;
          color: var(--joe-gold-primary);
        }
/* ========== Typing Animation - Premium Gold Glow ========== */
.joe-message-bubble.typing {
    padding: 10px 16px;
    display: flex;
    gap: 6px;
    align-items: center;
}

.typing-dot {
    width: 6px;
    height: 6px;
    background-color: var(--joe-gold-primary);
    border-radius: 50%;
    animation: premiumTyping 1.4s infinite ease-in-out;
    box-shadow: 0 0 10px var(--joe-gold-glow);
}

@keyframes premiumTyping {
    0%, 80%, 100% { 
        transform: scale(0.6);
        opacity: 0.4;
    }
    40% { 
        transform: scale(1.1);
        opacity: 1;
        box-shadow: 0 0 15px var(--joe-gold-primary);
    }
}

.joe-chat-panel {
    background: var(--joe-bg-panel);
}

/* ========== Welcome screen — fits EVERY screen, never crushed ========== */
/* This is a child of a flex column: without flex-shrink:0 the column squeezed
   it on short screens while the fixed-size mark kept its height, and the top
   of the logo was cut off (photographed by the user at ~570px). It must never
   shrink; if the screen is truly tiny it scrolls as a whole instead. */
.joe-chat-empty {
    margin: auto;
    flex-shrink: 0;
    text-align: center;
    padding: clamp(10px, 3vh, 24px) 16px;
    max-width: min(560px, 100%);
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: clamp(8px, 1.8vh, 14px);
    animation: joeWelcomeIn 0.5s cubic-bezier(0.2, 0.8, 0.3, 1) both;
}
@keyframes joeWelcomeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
    .joe-chat-empty { animation: none; }
}
/* The mark scales with the viewport height instead of demanding 92px. */
.joe-empty-mark { display: inline-flex; }
.joe-empty-mark .joe-mark {
    width: clamp(48px, 12vh, 92px);
    height: auto;
}
/* Welcome title: emerald gradient text, fluid size */
.joe-empty-title {
    margin: 0;
    font-size: clamp(18px, 1.2vw + 1.6vh, 27px);
    font-weight: 800;
    letter-spacing: -0.01em;
    line-height: 1.35;
    overflow-wrap: break-word;
    max-width: 100%;
    background: linear-gradient(120deg, var(--joe-text-primary) 30%, var(--joe-gold-primary) 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
}
.joe-empty-question {
    margin: 0;
    font-size: clamp(13.5px, 0.5vw + 1.2vh, 16.5px);
    color: var(--joe-text-secondary);
    line-height: 1.7;
    max-width: 460px;
}
/* Short screens: tighten what remains so the composer stays reachable. */
@media (max-height: 620px) {
    .joe-chat-empty { gap: 7px; padding-top: 8px; padding-bottom: 8px; }
}

/* ========== Attachments inside a sent message ========== */
.joe-msg-files {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 8px;
}
.joe-msg-file {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 8px;
    border: 1px solid var(--joe-border);
    background: var(--joe-bg-card);
    color: var(--joe-text-secondary);
    font-size: 11.5px;
    max-width: 220px;
}
.joe-msg-file-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    direction: ltr;
    unicode-bidi: plaintext;
}
.joe-msg-file.is-image {
    padding: 0;
    overflow: hidden;
    border-radius: 10px;
    line-height: 0;
}
.joe-msg-file.is-image img {
    display: block;
    width: 132px;
    height: 132px;
    object-fit: cover;
}

/* ========== The greeting STAYS in the chat once the conversation starts ==== */
/* «لن لا تختفي وتبقى في الدردشة» — it becomes the conversation's first entry:
   compact, quiet, and it scrolls with the history like any message. */
.joe-chat-hello {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    flex-shrink: 0;
    gap: 8px;
    padding: 9px 16px;
    margin: 2px auto 6px;
    max-width: 100%;
    border: 1px solid var(--joe-border);
    border-radius: 999px;
    background: var(--joe-bg-card);
    color: var(--joe-text-secondary);
    font-size: 12.5px;
    line-height: 1.5;
    text-align: center;
}
.joe-chat-hello .joe-mark { flex: 0 0 auto; color: var(--joe-gold-primary); }
.joe-chat-hello-salute {
    font-weight: 700;
    color: var(--joe-text-primary);
    background: linear-gradient(120deg, var(--joe-text-primary) 30%, var(--joe-gold-primary) 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
}
.joe-chat-hello-q { opacity: 0.85; }
.joe-chat-hello-q::before { content: '·'; margin-inline-end: 8px; opacity: 0.5; }
@media (max-width: 480px) {
    .joe-chat-hello-q { display: none; } /* the salute alone carries it on a phone */
}

      `}</style>
        </aside>
    );
}
