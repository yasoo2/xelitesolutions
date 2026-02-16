import React, { useRef, useEffect, useState } from 'react';
import { Sparkles, Send, Mic, User, Bot } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import NeuralThinkingIndicator from './NeuralThinkingIndicator';
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
                {(isLoading || thinkingPhase !== 'idle') && (
                    <div className="joe-message assistant">
                        <div className="joe-message-avatar ai">J</div>
                        <div className="joe-message-content">
                            <NeuralThinkingIndicator
                                visible={isLoading || thinkingPhase !== 'idle'}
                                phase={thinkingPhase}
                                variant="bubble"
                            />
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
    background: radial-gradient(circle at 50% 0%, rgba(240, 193, 75, 0.03) 0%, transparent 70%), var(--joe-bg-panel);
}

.joe-chat-header {
    background: rgba(255, 255, 255, 0.02);
    border-bottom: 1px solid rgba(240, 193, 75, 0.1);
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
