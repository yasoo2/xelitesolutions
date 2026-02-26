import React, { useRef, useEffect, useState } from 'react';
import { Sparkles, Send, Mic, User, Bot, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import NeuralThinkingIndicator from './NeuralThinkingIndicator';
import TaskTracker from './TaskTracker';

import { SocketService } from '../services/socket';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp?: Date;
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
}

export default function ChatPanel({
    messages,
    inputValue,
    onInputChange,
    onSend,
    isLoading = false,
    placeholder = 'Ask Joe or type a command...',
    children,
    isCollapsed = false
}: ChatPanelProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // [Wakil 6.0] Subscribe to thinking phase
    const [thinkingPhase, setThinkingPhase] = useState<'analyzing' | 'synthesizing' | 'executing' | 'idle'>('idle');
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const handleCopy = (id: string, text: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    useEffect(() => {
        const unsubscribe = SocketService.subscribeThinkingPhase((phase: any) => {
            setThinkingPhase(phase);
        });
        return () => unsubscribe();
    }, []);

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
                    <Sparkles size={18} className="joe-chat-title-icon" />
                    <span>AI Chat</span>
                </div>
                <span style={{ fontSize: 12, color: 'var(--joe-text-muted)' }}>
                    {messages.length} messages
                </span>
            </div>

            {/* Messages */}
            <div className="joe-chat-messages">
                {messages.length === 0 ? (
                    <div style={{
                        textAlign: 'center',
                        padding: '40px 20px',
                        color: 'var(--joe-text-muted)'
                    }}>
                        <Sparkles size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
                        <p style={{ fontSize: 14 }}>How can I help you with your code today?</p>
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
                                                            border: '1px solid rgba(240, 193, 75, 0.3)',
                                                            borderRadius: '12px',
                                                            overflow: 'hidden',
                                                            marginTop: '8px',
                                                            marginBottom: '8px',
                                                            transition: 'all 0.2s ease',
                                                            cursor: 'pointer'
                                                        }}
                                                            onClick={() => {
                                                                // TODO: Trigger AutoOpenManager or Workspace Service to open the file.
                                                                // For now, it's just a visual UI improvement. 
                                                                console.log(`Open file: ${filepath} at lines ${startLine}-${endLine}`);
                                                            }}
                                                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--joe-gold-primary)'; e.currentTarget.style.boxShadow = '0 0 15px rgba(240,193,75,0.15)'; }}
                                                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(240, 193, 75, 0.3)'; e.currentTarget.style.boxShadow = 'none'; }}
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
                                        {msg.content}
                                    </ReactMarkdown>
                                </div>
                                {msg.role === 'assistant' && (
                                    <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '6px', opacity: 0.6 }}>
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
                <div className="joe-chat-input-area">
                    <div className="joe-chat-input-wrapper">
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
    letter-spacing: 0.5px;
    text-transform: uppercase;
    font-size: 13px;
    opacity: 0.9;
}
      `}</style>
        </aside>
    );
}
