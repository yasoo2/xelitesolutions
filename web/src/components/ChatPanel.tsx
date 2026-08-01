import React, { useRef, useEffect, useState } from 'react';
import { Sparkles, Send, Mic, User, Bot, Copy, Check, Rocket, UtensilsCrossed, LayoutDashboard, BriefcaseBusiness } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import NeuralThinkingIndicator from './NeuralThinkingIndicator';
import JoeMark from './JoeMark';
import { composeGreeting } from '../lib/greetings';
import { resolveIdentity } from '../lib/userIdentity';
import TaskTracker from './TaskTracker';
import TodosPanel from './TodosPanel';
import ArtifactCard from './ArtifactCard';

import { SocketService } from '../services/socket';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
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

// Quick-start chips submit a REAL prompt: CommandComposer owns the run loop,
// so the chip hands the text over via a window event it listens for.
function sendQuickPrompt(text: string) {
    window.dispatchEvent(new CustomEvent('joe:quick-prompt', { detail: text }));
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
            // Ignore updates that belong to a different session.
            if (evSid && activeSessionRef.current && evSid !== activeSessionRef.current) return;
            setThinkingPhase(phase);
        });
        return () => unsubscribe();
    }, []);

    // Switching sessions must clear any leftover indicator immediately.
    useEffect(() => {
        setThinkingPhase('idle');
    }, [sessionId]);

    // Auto scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

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
            {/* Header */}
            <div className="joe-chat-header">
                <div className="joe-chat-title">
                    <JoeMark size={19} />
                    <span>Joe</span>
                </div>
            </div>

            {/* Messages */}
            <div className="joe-chat-messages">
                {messages.length === 0 ? (
                    <div className="joe-chat-empty" style={{
                        margin: 'auto',
                        textAlign: 'center',
                        padding: '24px 20px',
                        maxWidth: 560,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 14
                    }}>
                        {/* The signature writes itself when you open a fresh chat */}
                        <JoeMark size={92} animate />

                        <h2 className="joe-empty-title" style={{ margin: 0, fontSize: 27, fontWeight: 800, letterSpacing: '-0.01em' }}>
                            {greeting.salute}
                        </h2>
                        <p style={{ margin: 0, fontSize: 16.5, color: 'var(--joe-text-secondary)', lineHeight: 1.7, maxWidth: 460 }}>
                            {greeting.question}
                        </p>
                        <div className="joe-suggest-grid">
                            {[
                                { icon: <Rocket size={17} />, label: t('heroChip1') },
                                { icon: <UtensilsCrossed size={17} />, label: t('heroChip2') },
                                { icon: <LayoutDashboard size={17} />, label: t('heroChip3') },
                                { icon: <BriefcaseBusiness size={17} />, label: t('heroChip4') },
                            ].filter(c => c.label).map((c) => (
                                <button
                                    key={c.label}
                                    type="button"
                                    onClick={() => sendQuickPrompt(c.label)}
                                    className="joe-suggest-card"
                                >
                                    <span className="joe-suggest-icon">{c.icon}</span>
                                    <span className="joe-suggest-label">{c.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    messages.map((msg) => (
                        <div key={msg.id} className={`joe-message ${msg.role}`}>
                            <div className={`joe-message-avatar ${msg.role === 'assistant' ? 'ai' : 'user'}`}>
                                {msg.role === 'assistant' ? 'J' : 'U'}
                            </div>
                            <div className="joe-message-content">
                                <div className="joe-message-bubble">
                                    <ReactMarkdown
                                        components={{
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
                                        {unescapeStoredNewlines(msg.content)}
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
                    ))
                )}
                <div ref={messagesEndRef} />

                {(isLoading || thinkingPhase !== 'idle') && (
                    <div className="joe-message assistant">
                        <div className="joe-message-avatar ai">J</div>
                        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: '8px' }}>
                            <NeuralThinkingIndicator
                                visible={isLoading || thinkingPhase !== 'idle'}
                                phase={thinkingPhase}
                                variant="bubble"
                                sessionId={sessionId}
                            />
                            <TaskTracker />
                        </div>
                    </div>
                )}
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

.joe-chat-header {
    background: transparent;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.joe-chat-header .joe-chat-title span {
    letter-spacing: 0.2px;
    font-size: 14px;
    font-weight: 650;
}

/* Welcome title: emerald gradient text */
.joe-empty-title {
    background: linear-gradient(120deg, var(--joe-text-primary) 30%, var(--joe-gold-primary) 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
}

/* Quick-start: a 2x2 grid of real suggestion cards (each submits a prompt) */
.joe-suggest-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    width: 100%;
    max-width: 520px;
    margin-top: 6px;
}
@media (max-width: 640px) {
    .joe-suggest-grid { grid-template-columns: 1fr; }
}
.joe-suggest-card {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 12px 14px;
    border-radius: 14px;
    border: 1px solid var(--joe-border);
    background: var(--joe-bg-card);
    color: var(--joe-text-secondary);
    font-family: inherit;
    font-size: 13px;
    line-height: 1.4;
    text-align: start;
    cursor: pointer;
    transition: border-color 0.18s ease, color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
}
.joe-suggest-card:hover {
    border-color: var(--joe-border-strong);
    color: var(--joe-text-primary);
    transform: translateY(-2px);
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.25);
}
.joe-suggest-icon {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 10px;
    flex: 0 0 auto;
    color: var(--joe-gold-primary);
    background: rgba(52, 196, 139, 0.10);
    border: 1px solid rgba(52, 196, 139, 0.18);
}
.joe-suggest-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
      `}</style>
        </aside>
    );
}
