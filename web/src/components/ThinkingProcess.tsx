import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Brain, Cpu } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ThinkingProcessProps {
    thought: {
        title?: string;
        content: string;
        active: boolean; // Is it currently streaming?
    };
}

export function ThinkingProcess({ thought }: ThinkingProcessProps) {
    const { t } = useTranslation();
    const isExpanded = true;
    const contentRef = useRef<HTMLDivElement>(null);
    const [displayedContent, setDisplayedContent] = useState('');

    // High-speed word-by-word streaming for Elite 5.0
    // High-speed word-by-word streaming for Elite 5.0
    useEffect(() => {
        if (!thought.content || !thought.active) {
            setDisplayedContent(thought.content || '');
            return;
        }

        const words = (thought.content || '').split(' ');
        let current = '';
        let i = 0;

        const interval = setInterval(() => {
            if (i >= words.length) {
                clearInterval(interval);
                setDisplayedContent(thought.content || '');
                return;
            }
            current += (i === 0 ? '' : ' ') + words[i];
            setDisplayedContent(current);
            i++;
        }, 15);

        return () => clearInterval(interval);
    }, [thought.content, thought.active]);

    // Auto-scroll to bottom of thought when active
    useEffect(() => {
        if (thought.active && contentRef.current) {
            contentRef.current.scrollTop = contentRef.current.scrollHeight;
        }
    }, [displayedContent, thought.active]);

    // Extract title
    const displayTitle = thought.title || (() => {
        const content = thought.content || '';
        const match = content.match(/\*\*([^*]+)\*\*/);
        return match ? match[1].trim() : t('thinkingDefaultTitle');
    })();

    // Remove title from content for display
    const cleanContent = thought.title
        ? displayedContent
        : (displayedContent || '').replace(/\*\*([^*]+)\*\*/, '').trim();

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="thinking-process-container"
            style={{
                margin: '4px 0',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.03)',
                background: 'rgba(255, 255, 255, 0.01)',
                overflow: 'hidden',
            }}
        >
            {/* Header (Minimalist) */}
            <div
                style={{
                    padding: '6px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'rgba(255, 255, 255, 0.02)',
                }}
            >
                <div style={{ position: 'relative', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {thought.active ? (
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                        >
                            <Cpu size={14} color="rgba(255, 215, 0, 0.6)" />
                        </motion.div>
                    ) : (
                        <Brain size={14} color="rgba(255, 215, 0, 0.4)" />
                    )}
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <span style={{
                        color: 'rgba(255, 215, 0, 0.5)',
                        fontSize: '9px',
                        fontWeight: 200,
                        letterSpacing: '0.8px',
                        fontFamily: 'monospace',
                        textTransform: 'uppercase'
                    }}>
                        {t('neuralThoughtEngine')}
                    </span>
                    <span style={{
                        color: 'rgba(255, 255, 255, 0.3)',
                        fontSize: '8px',
                        fontWeight: 200,
                        marginTop: '1px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                    }}>
                        {displayTitle}
                    </span>
                </div>

                {thought.active && (
                    <div className="neural-pulse">
                        <div className="bar" />
                        <div className="bar" />
                        <div className="bar" />
                    </div>
                )}
            </div>

            {/* Content (Ultra-Miniature Technical Trace) */}
            <div
                ref={contentRef}
                style={{
                    padding: '8px 12px',
                    maxHeight: '150px',
                    overflowY: 'auto',
                    fontSize: '7.5px',
                    fontWeight: 200,
                    lineHeight: '1.4',
                    color: 'rgba(255, 255, 255, 0.3)',
                    fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
                    whiteSpace: 'pre-wrap',
                    scrollbarWidth: 'none',
                }}
            >
                {cleanContent || (
                    <span style={{ color: 'rgba(255, 255, 255, 0.2)', fontStyle: 'italic' }}>
                        {t('thinkingInit')}
                    </span>
                )}
                {thought.active && (
                    <motion.span
                        animate={{ opacity: [0, 1, 0] }}
                        transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
                        style={{ color: 'rgba(255, 215, 0, 0.5)', marginLeft: '2px' }}
                    >
                        ▍
                    </motion.span>
                )}
            </div>

            <style>{`
                .neural-pulse {
                    display: flex;
                    gap: 2px;
                    height: 12px;
                    align-items: center;
                }
                .neural-pulse .bar {
                    width: 2px;
                    background: rgba(59, 130, 246, 0.5);
                    height: 4px;
                    animation: pulse 1s ease-in-out infinite;
                }
                .neural-pulse .bar:nth-child(2) { animation-delay: 0.1s; height: 8px; }
                .neural-pulse .bar:nth-child(3) { animation-delay: 0.2s; }
                @keyframes pulse {
                    0%, 100% { height: 4px; opacity: 0.3; }
                    50% { height: 12px; opacity: 0.7; }
                }
            `}</style>
        </motion.div>
    );
}
