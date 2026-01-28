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

    // High-speed word-by-word streaming for Elite 6.0 (Ghost Mode)
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
        }, 5); // HYPER-SPEED: 5ms for Ghost/Whisper effect

        return () => clearInterval(interval);
    }, [thought.content, thought.active]);

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
                    maxHeight: '120px',
                    overflowY: 'auto',
                    fontSize: '11px',
                    fontWeight: 300,
                    fontStyle: 'italic',
                    lineHeight: '1.5',
                    color: 'rgba(255, 255, 255, 0.45)', // Ghostly white
                    fontFamily: 'var(--font-sans)',
                    whiteSpace: 'pre-wrap',
                    scrollbarWidth: 'none',
                    filter: 'blur(0.4px)', // The Phantom Blur
                    transition: 'all 0.3s ease'
                }}
            >
                {cleanContent}
            </div>
        </motion.div>
    );
});

ThinkingProcess.displayName = 'ThinkingProcess';
