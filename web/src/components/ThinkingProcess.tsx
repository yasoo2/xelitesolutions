import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface ThinkingProcessProps {
    thought: {
        title?: string;
        content: string;
        active: boolean; // Is it currently streaming?
    };
}

export const ThinkingProcess = React.forwardRef<HTMLDivElement, ThinkingProcessProps>(({ thought }, ref) => {
    const { t } = useTranslation();
    const contentRef = useRef<HTMLDivElement>(null);
    const [displayedContent, setDisplayedContent] = useState('');
    const streamTimerRef = useRef<number | null>(null);
    const targetContentRef = useRef<string>('');

    useEffect(() => {
        targetContentRef.current = thought.content || '';
        if (!thought.active) setDisplayedContent(targetContentRef.current);
    }, [thought.content, thought.active]);

    useEffect(() => {
        if (!thought.active) {
            if (streamTimerRef.current != null) {
                window.clearInterval(streamTimerRef.current);
                streamTimerRef.current = null;
            }
            return;
        }

        if (streamTimerRef.current == null) {
            streamTimerRef.current = window.setInterval(() => {
                setDisplayedContent((prev) => {
                    const target = targetContentRef.current;
                    if (prev === target) return prev;
                    if (prev.length > target.length) return target;
                    const nextLen = Math.min(prev.length + 30, target.length);
                    return target.slice(0, nextLen);
                });
            }, 50);
        }

        return () => {
            if (streamTimerRef.current != null) {
                window.clearInterval(streamTimerRef.current);
                streamTimerRef.current = null;
            }
        };
    }, [thought.active]);

    // Auto-scroll to bottom of thought when active
    useEffect(() => {
        if (thought.active && contentRef.current) {
            contentRef.current.scrollTop = contentRef.current.scrollHeight;
        }
    }, [displayedContent, thought.active]);

    // Extract title (kept for internal logic but visually hidden in Ghost Mode)
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
            ref={ref}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{
                background: 'transparent',
                border: 'none',
                borderRadius: '8px',
                overflow: 'hidden',
                marginTop: '8px',
                marginBottom: '4px',
                position: 'relative'
            }}
        >
            <div
                ref={contentRef}
                style={{
                    padding: '4px 12px',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    fontSize: '11px',
                    fontWeight: 300,
                    fontStyle: 'italic',
                    lineHeight: '1.5',
                    color: 'rgba(192, 192, 192, 0.78)',
                    fontFamily: 'var(--font-sans)',
                    whiteSpace: 'pre-wrap',
                    scrollbarWidth: 'none',
                    filter: 'blur(0.15px)',
                    transition: 'all 0.3s ease'
                }}
            >
                {cleanContent}
            </div>
        </motion.div>
    );
});

ThinkingProcess.displayName = 'ThinkingProcess';
