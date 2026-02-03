import React, { useRef, useEffect } from 'react';
import { Sparkles, Send, Mic, User, Bot } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

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
}

export default function ChatPanel({
    messages,
    inputValue,
    onInputChange,
    onSend,
    isLoading = false,
    placeholder = 'Ask Joe or type a command...',
    children
}: ChatPanelProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

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
        <aside className="joe-chat-panel">
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
                            <div className={`joe-message-avatar ${msg.role === 'assistant' ? 'ai' : ''}`}>
                                {msg.role === 'assistant' ? 'J' : (
                                    <div style={{
                                        width: '100%', height: '100%', borderRadius: 8,
                                        background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                                        color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 12, fontWeight: 700
                                    }}>
                                        U
                                    </div>
                                )}
                            </div>
                            <div className="joe-message-content">
                                <div className="joe-message-bubble">
                                    <ReactMarkdown
                                        components={{
                                            code({ className, children, ...props }: any) {
                                                const match = /language-(\w+)/.exec(className || '');
                                                return match ? (
                                                    <SyntaxHighlighter
                                                        style={vscDarkPlus as any}
                                                        language={match[1]}
                                                        PreTag="div"
                                                        {...props}
                                                    >
                                                        {String(children).replace(/\n$/, '')}
                                                    </SyntaxHighlighter>
                                                ) : (
                                                    <code className={className} {...props}>
                                                        {children}
                                                    </code>
                                                );
                                            }
                                        }}
                                    >
                                        {msg.content}
                                    </ReactMarkdown>
                                </div>
                            </div>
                        </div>
                    ))
                )}
                {isLoading && (
                    <div className="joe-message assistant">
                        <div className="joe-message-avatar ai">J</div>
                        <div className="joe-message-content">
                            <div className="joe-message-bubble" style={{ display: 'flex', gap: 4 }}>
                                <span className="typing-dot" style={{ animationDelay: '0ms' }}>●</span>
                                <span className="typing-dot" style={{ animationDelay: '150ms' }}>●</span>
                                <span className="typing-dot" style={{ animationDelay: '300ms' }}>●</span>
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
        @keyframes typingPulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>
        </aside>
    );
}
