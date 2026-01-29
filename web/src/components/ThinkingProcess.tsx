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
            className="mt-2 mb-1 rounded-lg overflow-hidden"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
        >
            <div
                ref={contentRef}
                className="px-3 py-2 max-h-52 overflow-auto text-[11px] leading-5 whitespace-pre-wrap"
                style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-sans)' }}
            >
                {cleanContent}
            </div>
        </motion.div>
    );
});

ThinkingProcess.displayName = 'ThinkingProcess';
