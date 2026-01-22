import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, ChevronDown, ChevronRight, Activity, Cpu, Sparkles } from 'lucide-react';

interface ThinkingProcessProps {
    thought: {
        title?: string;
        content: string;
        active: boolean; // Is it currently streaming?
    };
}

export function ThinkingProcess({ thought }: ThinkingProcessProps) {
    const [isExpanded, setIsExpanded] = useState(true);
    const contentRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom of thought when active and expanded
    useEffect(() => {
        if (thought.active && isExpanded && contentRef.current) {
            contentRef.current.scrollTop = contentRef.current.scrollHeight;
        }
    }, [thought.content, thought.active, isExpanded]);

    // Parse title if not explicitly provided but exists in content (e.g. **TITLE**)
    const displayTitle = thought.title || (() => {
        const match = thought.content.match(/\*\*([^*]+)\*\*/);
        return match ? match[1].trim() : 'Analyzing Request...';
    })();

    // Remove title from content for display if it was extracted
    const displayContent = thought.title
        ? thought.content
        : thought.content.replace(/\*\*([^*]+)\*\*/, '').trim();

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="thinking-process-container"
            style={{
                margin: '12px 0',
                borderRadius: '12px',
                border: '1px solid rgba(255, 215, 0, 0.2)', // Gold border
                background: 'linear-gradient(180deg, rgba(10, 10, 20, 0.9) 0%, rgba(20, 20, 35, 0.95) 100%)',
                overflow: 'hidden',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4), 0 0 15px rgba(255, 215, 0, 0.05)',
            }}
        >
            {/* Header */}
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                style={{
                    padding: '10px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                    borderBottom: isExpanded ? '1px solid rgba(255, 255, 255, 0.05)' : 'none',
                    background: 'rgba(255, 255, 255, 0.02)',
                }}
            >
                <div style={{ position: 'relative', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {thought.active ? (
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
                        >
                            <Cpu size={18} color="#FFD700" />
                        </motion.div>
                    ) : (
                        <Brain size={18} color="#FFD700" style={{ opacity: 0.8 }} />
                    )}
                    {thought.active && (
                        <motion.div
                            style={{
                                position: 'absolute',
                                inset: -4,
                                borderRadius: '50%',
                                border: '1px solid transparent',
                                borderTopColor: '#FFD700',
                                borderRightColor: 'transparent',
                            }}
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                        />
                    )}
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <span style={{
                        color: '#FFD700',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        letterSpacing: '0.5px',
                        fontFamily: 'monospace',
                        textTransform: 'uppercase'
                    }}>
                        NEURAL THOUGHT ENGINE
                    </span>
                    <span style={{
                        color: 'rgba(255, 255, 255, 0.7)',
                        fontSize: '0.8rem',
                        marginTop: '2px',
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

                <div style={{ color: 'rgba(255, 255, 255, 0.4)' }}>
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </div>
            </div>

            {/* Content */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <div
                            ref={contentRef}
                            style={{
                                padding: '16px',
                                maxHeight: '300px',
                                overflowY: 'auto',
                                fontSize: '0.9rem',
                                lineHeight: '1.6',
                                color: 'rgba(255, 255, 255, 0.8)',
                                fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
                                whiteSpace: 'pre-wrap',
                                scrollbarWidth: 'thin',
                                scrollbarColor: '#333 transparent'
                            }}
                        >
                            {displayContent || (
                                <span style={{ color: 'rgba(255, 255, 255, 0.3)', fontStyle: 'italic' }}>
                                    Thinking process initialized...
                                </span>
                            )}
                            {thought.active && (
                                <motion.span
                                    animate={{ opacity: [0, 1, 0] }}
                                    transition={{ duration: 0.8, repeat: Infinity }}
                                    style={{ color: '#FFD700', marginLeft: '4px' }}
                                >
                                    ▍
                                </motion.span>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <style>{`
        .neural-pulse {
          display: flex;
          gap: 2px;
          height: 12px;
          align-items: center;
        }
        .neural-pulse .bar {
          width: 2px;
          background: #3B82F6;
          height: 4px;
          animation: pulse 1s ease-in-out infinite;
        }
        .neural-pulse .bar:nth-child(2) { animation-delay: 0.1s; height: 8px; }
        .neural-pulse .bar:nth-child(3) { animation-delay: 0.2s; }
        @keyframes pulse {
          0%, 100% { height: 4px; opacity: 0.5; }
          50% { height: 12px; opacity: 1; background: #60A5FA; }
        }
      `}</style>
        </motion.div>
    );
}
